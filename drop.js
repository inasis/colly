const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function fail(message) {
  console.error(`colly drop: error: ${message}`);
  process.exit(1);
}

function help() {
  console.log(`사용법: colly drop [-R <폴더>] [-D] [--threshold <0~255>]

흰색 배경 중 이미지 가장자리와 연결된 영역만 투명하게 만듭니다.
상품 내부의 흰색 영역은 가장자리와 연결되지 않은 한 유지됩니다.
결과는 dropped/ 폴더에 PNG로 저장됩니다.

옵션:
  -R, --reference <폴더>   기준 프로젝트 폴더 (기본: colly가 있는 폴더)
  -D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
  --threshold <0~255>      흰색 판정 최소 RGB 값 (기본: 245)
  -h, --help               도움말 표시

예:
  colly drop
  colly drop --threshold 240
  colly drop -R ../project
  colly drop -R ../project -D`);
}

function parseArgs(args) {
  let reference = __dirname;
  let direct = false;
  let threshold = 245;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") return { help: true };
    if (arg === "-D" || arg === "--direct") direct = true;
    else if (arg === "-R" || arg === "--reference") {
      const value = args[++i];
      if (!value) fail(`${arg} 뒤에 기준 프로젝트 폴더를 지정하세요.`);
      reference = value;
    } else if (arg === "--threshold") {
      const value = Number(args[++i]);
      if (!Number.isInteger(value) || value < 0 || value > 255) fail("--threshold는 0~255 정수여야 합니다.");
      threshold = value;
    } else fail(`알 수 없는 옵션: ${arg}`);
  }

  const referenceDir = path.resolve(reference);
  return {
    referenceDir,
    inputDir: direct ? referenceDir : path.join(referenceDir, "output"),
    outputDir: path.join(referenceDir, "dropped"),
    threshold
  };
}

function isWhite(data, i, threshold) {
  return data[i + 3] === 0 ||
    (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold);
}

async function dropFile(inputPath, outputPath, threshold) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    const i = p * channels;
    if (!isWhite(data, i, threshold)) return;
    visited[p] = 1;
    queue[tail++] = p;
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % width;
    const y = Math.floor(p / width);
    data[p * channels + 3] = 0;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  await sharp(data, { raw: info }).png().toFile(outputPath);
  return tail;
}

async function main(args) {
  const options = parseArgs(args);
  if (options.help) return help();
  if (!fs.existsSync(options.inputDir)) fail(`입력 폴더가 없습니다: ${options.inputDir}`);

  const files = fs.readdirSync(options.inputDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map(entry => entry.name);

  if (!files.length) fail("처리할 이미지가 없습니다.");
  fs.mkdirSync(options.outputDir, { recursive: true });

  let success = 0;
  let failed = 0;
  for (const file of files) {
    try {
      const outputName = `${path.parse(file).name}.png`;
      const pixels = await dropFile(
        path.join(options.inputDir, file),
        path.join(options.outputDir, outputName),
        options.threshold
      );
      console.log(`[완료] ${file} -> ${outputName} (${pixels} px 제거)`);
      success++;
    } catch (error) {
      console.error(`[실패] ${file}: ${error.message}`);
      failed++;
    }
  }

  console.log(`colly drop: 완료 ${success}개, 실패 ${failed}개 - ${options.outputDir}/`);
  if (failed) process.exitCode = 1;
}

module.exports = main;

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => fail(error.message || String(error)));
}
