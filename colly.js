#!/usr/bin/env node
'use strict';

const sharp = require('sharp');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const PROG = 'colly';
const OUTPUT_DIR = 'output';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.avif']);
const CROP_INPUT_EXT = new Set(['.png', '.jpg', '.jpeg']);
const WHITE_THRESHOLD = 245;
const WHITE_ROW_RATIO = 0.99;

const HELP = {
  global: `사용법: colly <command> [옵션...]

명령:
  crop     흰색 공백 기준으로 이미지를 세로 분할
  merge    이미지들을 지정한 간격으로 병합
  align    분할 이미지 파일명을 랜덤 ID로 재정렬
  angle    상품 이미지의 회전·크기·캔버스를 일괄 정렬
  stack    접두·원본·접미 이미지를 지정한 순서로 겹쳐 합성
  drop     가장자리와 연결된 흰색 배경을 투명하게 제거

공통 옵션:
  -R, --reference <폴더>   기준 프로젝트 폴더
  -D, --direct             output/ 대신 기준 프로젝트 폴더에서 직접 읽기
  -h, --help               도움말 표시

대화형 병합: colly merge magic`,

  crop: `사용법:
  colly crop [-R <폴더>] <최소공백높이>
  colly crop [-R <폴더>] -D <파일명> <최소공백높이>`,

  merge: `사용법:
  colly merge [-R <폴더>] [-D] [-P <prefix>] <gap> <번호|?파일명> [...] [-O <파일명>] [-B <픽셀>]
  colly merge [-R <폴더>] [-D] [-P <prefix>] --instant <번호|?파일명|파일명> [...] [-O <파일명>] [-B <픽셀>]
  colly merge -C <프리셋파일> <값1> [값2 ...]
  colly merge magic`,

  align: `사용법: colly align [-R <폴더>] [-D]`,

  angle: `사용법: colly angle [-R <폴더>] [-D] [옵션...]

옵션:
  --width <픽셀>           출력 너비 (기본: 1200)
  --height <픽셀>          출력 높이 (기본: 1200)
  --occupancy <0.1~1>      상품 점유 비율 (기본: 0.86)
  --orientation <방향>     horizontal 또는 vertical
  --threshold <0~441>      배경과 상품의 색상 거리 기준 (기본: 35)
  --background <값>        white, transparent, #RRGGBB
  --padding <픽셀>         회전 전 투명 여백 (기본: 40)
  --quality <1~100>        JPG/WebP/AVIF 품질 (기본: 95)
  --format <형식>          png, jpg, webp, avif, keep
  --recursive              하위 폴더까지 처리
  --dry-run                분석만 수행`,

  stack: `사용법:
  colly stack [-R <폴더>] [-D] {-P <접두사> | -S <접미사>} [-A] [--at <파일명>] [...]

-P, -S, -A, --at이 나온 순서대로 합성합니다.
-A를 생략하면 원본은 마지막에 자동 추가됩니다.`,

  drop: `사용법: colly drop [-R <폴더>] [-D] [--threshold <0~255>]

이미지 가장자리와 연결된 흰색 영역만 투명하게 만듭니다.
상품 내부의 독립된 흰색 영역은 유지합니다.
결과는 dropped/ 폴더에 PNG로 저장됩니다.

옵션:
  --threshold <0~255>      흰색 판정 최소 RGB 값 (기본: 245)`
};

function usageError(command, msg) {
  console.error(`${PROG} ${command}: error: ${msg}`);
  console.error(`Try '${PROG} ${command} --help' for more information.`);
  process.exit(2);
}
function runtimeError(command, msg) {
  console.error(`${PROG} ${command}: error: ${msg}`);
  process.exit(1);
}
function warn(command, msg) { console.error(`${PROG} ${command}: warning: ${msg}`); }
function notice(command, msg) { console.log(`${PROG} ${command}: ${msg}`); }
function pad3(n) { return String(n).padStart(3, '0'); }
function isImage(file) { return IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()); }
function hasHelpFlag(args) { return args.includes('-h') || args.includes('--help'); }
function printHelp(section, stream = console.log) { stream(HELP[section] || HELP.global); }

function parseProjectOptions(command, rawArgs) {
  const args = [];
  let reference = __dirname;
  let direct = false;
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (arg === '-R' || arg === '--reference') {
      const value = rawArgs[++i];
      if (!value || value.startsWith('-')) usageError(command, `${arg} 뒤에 기준 프로젝트 폴더를 지정하세요.`);
      reference = value;
    } else if (arg === '-D' || arg === '--direct') {
      direct = true;
    } else args.push(arg);
  }
  const referenceDir = path.resolve(reference);
  if (!fs.existsSync(referenceDir) || !fs.statSync(referenceDir).isDirectory()) runtimeError(command, `기준 프로젝트 폴더가 없습니다: ${referenceDir}`);
  return { args, referenceDir, inputDir: direct ? referenceDir : path.join(referenceDir, OUTPUT_DIR), outputDir: path.join(referenceDir, OUTPUT_DIR), direct };
}

function detectWhiteRows(data, width, height) {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    let white = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0 || (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD)) white++;
    }
    rows[y] = white >= width * WHITE_ROW_RATIO;
  }
  return rows;
}
function findGaps(rows, height, minGap) {
  const gaps = [];
  let start = null;
  const close = end => { if (start !== null && end - start + 1 >= minGap) gaps.push({ start, end }); start = null; };
  for (let y = 0; y < height; y++) rows[y] ? (start ??= y) : close(y - 1);
  close(height - 1);
  return gaps;
}
function findSections(gaps, height) {
  const sections = [];
  let top = 0;
  for (const gap of gaps) {
    const h = gap.start - top;
    if (h > 1) sections.push({ top, height: h });
    top = gap.end + 1;
  }
  if (top < height) sections.push({ top, height: height - top });
  return sections;
}

async function cmdCrop(args) {
  if (hasHelpFlag(args)) return printHelp('crop');
  const options = parseProjectOptions('crop', args);
  args = options.args;
  let input, minGapArg;
  if (options.direct) {
    if (args.length !== 2) usageError('crop', '-D 사용 시 파일명과 최소 공백 높이가 필요합니다.');
    [input, minGapArg] = args;
    if (path.basename(input) !== input) usageError('crop', '-D 파일명은 기준 프로젝트 폴더 안의 파일명만 지정할 수 있습니다.');
  } else {
    if (args.length !== 1) usageError('crop', '최소 흰색 공백 높이를 입력해주세요.');
    minGapArg = args[0];
  }
  const minGap = Number.parseInt(minGapArg, 10);
  if (!Number.isInteger(minGap) || minGap < 1) usageError('crop', '최소 공백 높이는 1 이상의 정수여야 합니다.');
  const candidates = fs.readdirSync(options.referenceDir).filter(file => CROP_INPUT_EXT.has(path.extname(file).toLowerCase()));
  if (options.direct) {
    if (!candidates.includes(input)) runtimeError('crop', `원본 이미지를 찾을 수 없습니다: ${input}`);
  } else {
    if (!candidates.length) runtimeError('crop', 'PNG 또는 JPG 원본 이미지가 없습니다.');
    if (candidates.length > 1) runtimeError('crop', `원본 이미지가 여러 개입니다:\n${candidates.map(f => `  - ${f}`).join('\n')}`);
    input = candidates[0];
  }
  fs.mkdirSync(options.outputDir, { recursive: true });
  fs.readdirSync(options.outputDir).filter(file => path.parse(file).name.toUpperCase().startsWith('C')).forEach(file => fs.unlinkSync(path.join(options.outputDir, file)));
  const inputPath = path.join(options.referenceDir, input);
  const image = sharp(inputPath);
  const meta = await image.metadata();
  const { data } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const gaps = findGaps(detectWhiteRows(data, meta.width, meta.height), meta.height, minGap);
  const sections = findSections(gaps, meta.height);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const filename = `C${pad3(i + 1)}#H${s.height}.png`;
    await sharp(inputPath).extract({ left: 0, top: s.top, width: meta.width, height: s.height }).png().toFile(path.join(options.outputDir, filename));
    console.log(`  ${filename}  ${meta.width}x${s.height}`);
  }
  notice('crop', `완료 - ${sections.length}개 섹션을 ${options.outputDir}/ 에 저장했습니다`);
}

function normalizeMergePrefixArgs(rawArgs) {
  const args = [...rawArgs];
  if (['-P', '--prefix'].includes(args[0])) {
    if (!args[1] || args[1].startsWith('-')) usageError('merge', '-P / --prefix 뒤에 prefix를 지정하세요.');
    return args;
  }
  if (args.some(a => ['-P', '--prefix'].includes(a))) usageError('merge', '-P / --prefix는 merge의 최초 인자로 사용해야 합니다.');
  return ['--prefix', 'dummy', ...args];
}
function parseMergeArgs(rawArgs) {
  const normalized = normalizeMergePrefixArgs(rawArgs);
  const prefix = normalized[1];
  const args = normalized.slice(2);
  const instant = args.some(a => a === '--instant' || a === '-I');
  const parseArgs = args.filter(a => a !== '--instant' && a !== '-I');
  let outputFile = 'merge.png', bottomExtra = 0;
  const items = [];
  const pushImage = imageArg => {
    if (imageArg.startsWith('?')) return items.push({ number: null, literal: imageArg.slice(1), gap: 0, referenceHeight: null });
    if (/^\d+$/.test(imageArg)) return items.push({ number: Number(imageArg), literal: null, gap: 0, referenceHeight: null });
    if (instant && isImage(imageArg)) return items.push({ number: null, literal: imageArg, gap: 0, referenceHeight: null });
    usageError('merge', `잘못된 이미지 지정: ${imageArg}`);
  };
  for (let i = 0; i < parseArgs.length; i++) {
    const arg = parseArgs[i];
    if (arg === '-O' || arg === '--output') {
      outputFile = parseArgs[++i]; if (!outputFile) usageError('merge', '출력 파일명이 필요합니다.'); if (!path.extname(outputFile)) outputFile += '.png'; continue;
    }
    if (arg === '-B' || arg === '--bottom') {
      bottomExtra = Number(parseArgs[++i]); if (!Number.isFinite(bottomExtra) || bottomExtra < 0) usageError('merge', '-B 값은 0 이상의 숫자여야 합니다.'); continue;
    }
    if (instant) { pushImage(arg); continue; }
    const gapMatch = arg.match(/^(\d+(?:\.\d+)?)(?:H(\d+))?$/i);
    const imageArg = parseArgs[++i];
    if (!gapMatch || imageArg === undefined) usageError('merge', `${arg} 뒤에 이미지 번호 또는 ?파일명이 필요합니다.`);
    const item = { gap: Number(gapMatch[1]), referenceHeight: gapMatch[2] ? Number(gapMatch[2]) : null };
    if (imageArg.startsWith('?')) Object.assign(item, { number: null, literal: imageArg.slice(1) });
    else if (/^\d+$/.test(imageArg)) Object.assign(item, { number: Number(imageArg), literal: null });
    else usageError('merge', `잘못된 이미지 지정: ${imageArg}`);
    items.push(item);
  }
  if (!items.length) usageError('merge', '합칠 이미지를 하나 이상 입력해주세요.');
  return { prefix, outputFile, bottomExtra, items, instant };
}
function findMergeImage(files, prefix, number) {
  const padded = pad3(number);
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}_?${padded}(?:#H(\\d+))?$`, 'i');
  const matches = files.filter(isImage).map(file => ({ file, match: path.parse(file).name.match(re) })).filter(x => x.match);
  if (matches.length !== 1) throw new Error(matches.length ? `${prefix}${padded} 이미지가 여러 개 있습니다.` : `${prefix}${padded} 이미지를 찾을 수 없습니다.`);
  return { file: matches[0].file, taggedHeight: matches[0].match[1] ? Number(matches[0].match[1]) : null };
}
function findLiteralImage(files, filename, inputDir) {
  if (!files.includes(filename) || !isImage(filename)) throw new Error(`${filename} 파일을 ${inputDir}/ 에서 찾을 수 없습니다.`);
  const match = path.parse(filename).name.match(/#H(\d+)$/i);
  return { file: filename, taggedHeight: match ? Number(match[1]) : null };
}

async function cmdMerge(args) {
  if (args[0] === 'magic') return require('./magic.js').runMagic();
  if (hasHelpFlag(args)) return printHelp('merge');
  const options = parseProjectOptions('merge', args);
  args = options.args;
  if (['-C', '--command-file'].includes(args[0])) {
    const [, file, ...values] = args;
    if (!file) usageError('merge', '-C 뒤에 파일명을 지정하세요.');
    let text; try { text = fs.readFileSync(file, 'utf8').trim(); } catch { runtimeError('merge', `파일을 읽을 수 없습니다: ${file}`); }
    args = text.split(/\s+/).map(token => token.replace(/\$(\d+)/g, (_, n) => values[n - 1] ?? usageError('merge', `${file}: $${n} 값이 없습니다.`)));
  }
  const parsed = parseMergeArgs(args);
  if (!fs.existsSync(options.inputDir)) runtimeError('merge', `${options.inputDir}/ 폴더가 없습니다.`);
  const files = fs.readdirSync(options.inputDir);
  const images = [];
  for (const item of parsed.items) {
    const found = item.literal ? findLiteralImage(files, item.literal, options.inputDir) : findMergeImage(files, parsed.prefix, item.number);
    if (item.referenceHeight !== null && found.taggedHeight === null) throw new Error(`${found.file}: #H 태그가 없어 H보정을 사용할 수 없습니다.`);
    const filePath = path.join(options.inputDir, found.file);
    const meta = await sharp(filePath).metadata();
    let gap = item.gap;
    if (item.referenceHeight !== null) gap = Math.max(0, gap + item.referenceHeight - found.taggedHeight);
    images.push({ file: found.file, path: filePath, width: meta.width, height: meta.height, gap });
  }
  const width = images[0].width;
  if (images.some(x => x.width !== width)) throw new Error('병합할 이미지의 너비가 서로 다릅니다.');
  const composites = [];
  let top = 0;
  for (const img of images) { top += img.gap; composites.push({ input: img.path, left: 0, top: Math.round(top) }); top += img.height; }
  const outputPath = path.isAbsolute(parsed.outputFile) ? parsed.outputFile : path.join(options.referenceDir, parsed.outputFile);
  await sharp({ create: { width, height: Math.ceil(top + parsed.bottomExtra), channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite(composites).png().toFile(outputPath);
  notice('merge', `완료 - ${outputPath}`);
}

function generateRandomId(files, length = 4) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id; do { id = Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (files.some(f => f.startsWith(`${id}_`)));
  return id;
}
async function cmdAlign(args) {
  if (hasHelpFlag(args)) return printHelp('align');
  const options = parseProjectOptions('align', args);
  if (options.args.length) usageError('align', `알 수 없는 인자: ${options.args[0]}`);
  if (!fs.existsSync(options.inputDir)) runtimeError('align', `${options.inputDir}/ 폴더가 없습니다.`);
  const all = fs.readdirSync(options.inputDir);
  const images = all.map(file => {
    if (!isImage(file)) return null;
    const m = path.parse(file).name.match(/^C(\d{3})#H(\d+)$/i);
    return m ? { file, ext: path.extname(file), number: Number(m[1]), height: Number(m[2]) } : null;
  }).filter(Boolean).sort((a, b) => a.number - b.number);
  if (!images.length) return notice('align', '정렬할 C000#H숫자 형식 이미지가 없습니다.');
  const id = generateRandomId(all);
  const temps = images.map((img, i) => { const temp = `.__colly_${process.pid}_${i}${img.ext}`; fs.renameSync(path.join(options.inputDir, img.file), path.join(options.inputDir, temp)); return { ...img, temp }; });
  temps.forEach((img, i) => { const name = `${id}_${pad3(i + 1)}#H${img.height}${img.ext}`; fs.renameSync(path.join(options.inputDir, img.temp), path.join(options.inputDir, name)); console.log(`  ${img.file} -> ${name}`); });
  notice('align', `완료 - ${images.length}개, prefix=${id}`);
}

function findCaseInsensitive(files, wanted) { const low = wanted.toLocaleLowerCase(); return files.find(f => f.toLocaleLowerCase() === low); }
async function overlayLayers(layerPaths, outputPath) {
  const metas = await Promise.all(layerPaths.map(async file => ({ file, ...(await sharp(file).metadata()) })));
  if (metas.some(m => m.width !== metas[0].width || m.height !== metas[0].height)) throw new Error('이미지 크기가 서로 다릅니다.');
  await sharp(layerPaths[0]).composite(layerPaths.slice(1).map(input => ({ input, blend: 'over' }))).png().toFile(outputPath);
}
async function cmdStack(args) {
  if (hasHelpFlag(args)) return printHelp('stack');
  const options = parseProjectOptions('stack', args); args = options.args;
  let prefix, suffix; const order = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-A') { if (order.includes('dest')) usageError('stack', '-A는 한 번만 사용할 수 있습니다.'); order.push('dest'); }
    else if (arg === '--at') { const value = args[++i]; if (!value) usageError('stack', '--at 뒤에 파일명이 필요합니다.'); order.push({ type: 'at', file: value }); }
    else if (['-P', '--prefix', '-S', '--suffix'].includes(arg)) {
      const value = args[++i]; if (!value) usageError('stack', `${arg} 뒤에 값이 필요합니다.`);
      if (arg === '-P' || arg === '--prefix') { if (prefix !== undefined) usageError('stack', 'prefix는 한 번만 지정할 수 있습니다.'); prefix = value; order.push('pre'); }
      else { if (suffix !== undefined) usageError('stack', 'suffix는 한 번만 지정할 수 있습니다.'); suffix = value; order.push('post'); }
    } else usageError('stack', `알 수 없는 옵션: ${arg}`);
  }
  if (prefix === undefined && suffix === undefined) usageError('stack', 'prefix 또는 suffix가 하나 이상 필요합니다.');
  if (!order.includes('dest')) order.push('dest');
  if (!fs.existsSync(options.inputDir)) runtimeError('stack', `${options.inputDir}/ 폴더가 없습니다.`);
  const files = fs.readdirSync(options.inputDir).filter(f => f.toLowerCase().endsWith('.png'));
  for (const layer of order) if (typeof layer !== 'string') { layer.resolvedFile = findCaseInsensitive(files, layer.file); if (!layer.resolvedFile) runtimeError('stack', `고정 파일 ${layer.file}이 없습니다.`); }
  const candidates = new Set();
  if (prefix !== undefined) for (const file of files) if (file.toLowerCase().startsWith(prefix.toLowerCase())) candidates.add(file.slice(prefix.length));
  if (suffix !== undefined) { const ending = `${suffix}.png`.toLowerCase(); for (const file of files) if (file.toLowerCase().endsWith(ending)) candidates.add(`${file.slice(0, -ending.length)}.png`); }
  const outDir = path.join(options.referenceDir, 'stacked'); fs.mkdirSync(outDir, { recursive: true });
  let success = 0, failed = 0;
  for (const outputName of [...candidates].sort()) {
    try {
      const base = findCaseInsensitive(files, outputName); if (!base) throw new Error(`기준 파일 ${outputName}가 없습니다.`);
      const roles = { dest: base };
      if (prefix !== undefined) { roles.pre = findCaseInsensitive(files, `${prefix}${outputName}`); if (!roles.pre) throw new Error('prefix 파일이 없습니다.'); }
      if (suffix !== undefined) { roles.post = findCaseInsensitive(files, `${outputName.slice(0, -4)}${suffix}.png`); if (!roles.post) throw new Error('suffix 파일이 없습니다.'); }
      const names = order.map(layer => typeof layer === 'string' ? roles[layer] : layer.resolvedFile);
      await overlayLayers(names.map(n => path.join(options.inputDir, n)), path.join(outDir, outputName)); success++;
    } catch (e) { console.error(`[실패] ${outputName}: ${e.message}`); failed++; }
  }
  notice('stack', `완료 ${success}개, 실패 ${failed}개 - ${outDir}/`);
  if (failed) process.exitCode = 1;
}

function parseAngleArgs(args) {
  const opts = { width: 1200, height: 1200, occupancy: 0.86, orientation: 'horizontal', threshold: 35, background: 'white', padding: 40, quality: 95, format: 'png', recursive: false, dryRun: false };
  const numeric = new Set(['width', 'height', 'occupancy', 'threshold', 'padding', 'quality']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--recursive') { opts.recursive = true; continue; }
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (!arg.startsWith('--')) usageError('angle', `알 수 없는 옵션: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in opts) || typeof opts[key] === 'boolean') usageError('angle', `알 수 없는 옵션: ${arg}`);
    const value = args[++i]; if (value == null) usageError('angle', `${arg} 뒤에 값이 필요합니다.`);
    opts[key] = numeric.has(key) ? Number(value) : value.toLowerCase();
  }
  if (!Number.isInteger(opts.width) || opts.width < 1 || !Number.isInteger(opts.height) || opts.height < 1) usageError('angle', 'width/height는 양의 정수여야 합니다.');
  if (!(opts.occupancy > 0.1 && opts.occupancy <= 1)) usageError('angle', 'occupancy는 0.1 초과 1 이하여야 합니다.');
  if (!['horizontal', 'vertical'].includes(opts.orientation)) usageError('angle', 'orientation은 horizontal 또는 vertical이어야 합니다.');
  if (!(opts.threshold >= 0 && opts.threshold <= 441)) usageError('angle', 'threshold는 0~441이어야 합니다.');
  if (!['png', 'jpg', 'jpeg', 'webp', 'avif', 'keep'].includes(opts.format)) usageError('angle', '지원하지 않는 format입니다.');
  return opts;
}
async function listAngleImages(root, recursive, current = root) {
  const entries = await fsp.readdir(current, { withFileTypes: true }); const files = [];
  for (const e of entries) { const full = path.join(current, e.name); if (e.isDirectory() && recursive) files.push(...await listAngleImages(root, recursive, full)); else if (e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) files.push(full); }
  return files.sort();
}
function cornerBackground(data, info) {
  const { width, height, channels } = info; const size = Math.max(1, Math.min(12, Math.floor(Math.min(width, height) / 20))); const sums = [0, 0, 0]; let count = 0;
  for (const [bx, by] of [[0,0],[width-size,0],[0,height-size],[width-size,height-size]]) for (let y = by; y < by + size; y++) for (let x = bx; x < bx + size; x++) { const i = (y * width + x) * channels; if (channels === 4 && data[i + 3] < 32) continue; sums[0]+=data[i]; sums[1]+=data[i+1]; sums[2]+=data[i+2]; count++; }
  return count ? sums.map(v => v / count) : [255,255,255];
}
async function analyzeProduct(image, threshold, alphaOnly = false) {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const bg = cornerBackground(data, info); const points = []; let minX=info.width,minY=info.height,maxX=-1,maxY=-1; const stride=Math.max(1,Math.floor(Math.max(info.width,info.height)/1000)); const t2=threshold*threshold;
  for (let y=0;y<info.height;y+=stride) for (let x=0;x<info.width;x+=stride) { const i=(y*info.width+x)*4,a=data[i+3],dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2]; const fg=a>20&&(alphaOnly?a>80:(a<245||dr*dr+dg*dg+db*db>t2)); if(!fg)continue; points.push([x,y]); minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y); }
  if(points.length<20) throw new Error('상품을 감지하지 못했습니다. --threshold를 낮춰보세요.');
  let mx=0,my=0; for(const [x,y] of points){mx+=x;my+=y;} mx/=points.length;my/=points.length; let xx=0,yy=0,xy=0; for(const [x,y] of points){const dx=x-mx,dy=y-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
  return { angle:0.5*Math.atan2(2*xy,xx-yy)*180/Math.PI, bbox:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1} };
}
function parseBackground(value) {
  if(value==='transparent')return{r:0,g:0,b:0,alpha:0}; if(value==='white')return{r:255,g:255,b:255,alpha:1}; if(/^#[0-9a-f]{6}$/i.test(value))return{r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),b:parseInt(value.slice(5,7),16),alpha:1}; throw new Error('background는 white, transparent, #RRGGBB 중 하나여야 합니다.');
}
async function encodeAngle(image, format, quality, sourceExt) { const f=(format==='keep'?sourceExt.slice(1):format).toLowerCase(); if(f==='jpg'||f==='jpeg')return image.jpeg({quality,chromaSubsampling:'4:4:4'}); if(f==='webp')return image.webp({quality}); if(f==='avif')return image.avif({quality}); return image.png({compressionLevel:9}); }
async function processAngle(file, opts) {
  const base=sharp(file,{failOn:'error'}).rotate().ensureAlpha(); const initial=await analyzeProduct(base,opts.threshold); let target=opts.orientation==='horizontal'?0:90,rotation=target-initial.angle; while(rotation>90)rotation-=180;while(rotation<-90)rotation+=180;
  const rotated=base.extend({top:opts.padding,bottom:opts.padding,left:opts.padding,right:opts.padding,background:{r:0,g:0,b:0,alpha:0}}).rotate(rotation,{background:{r:0,g:0,b:0,alpha:0}}); const buf=await rotated.png().toBuffer(); const measured=await analyzeProduct(sharp(buf),opts.threshold,true); const fitted=await sharp(buf).extract(measured.bbox).resize(Math.round(opts.width*opts.occupancy),Math.round(opts.height*opts.occupancy),{fit:'inside',withoutEnlargement:false}).png().toBuffer(); const meta=await sharp(fitted).metadata(); const canvas=sharp({create:{width:opts.width,height:opts.height,channels:4,background:parseBackground(opts.background)}}).composite([{input:fitted,left:Math.floor((opts.width-meta.width)/2),top:Math.floor((opts.height-meta.height)/2)}]);
  const rel=path.relative(opts.input,file); const ext=(opts.format==='keep'?path.extname(file).slice(1):opts.format).replace('jpeg','jpg'); const out=path.join(opts.output,path.dirname(rel),`${path.basename(file,path.extname(file))}.${ext}`); if(!opts.dryRun){await fsp.mkdir(path.dirname(out),{recursive:true}); await (await encodeAngle(canvas,opts.format,opts.quality,path.extname(file))).toFile(out);} return {rel,angle:initial.angle,rotation};
}
async function cmdAngle(args) {
  if(hasHelpFlag(args))return printHelp('angle'); const options=parseProjectOptions('angle',args); if(!fs.existsSync(options.inputDir))runtimeError('angle',`${options.inputDir}/ 폴더가 없습니다.`); const opts={...parseAngleArgs(options.args),input:options.inputDir,output:path.join(options.referenceDir,'angled')}; parseBackground(opts.background); const files=await listAngleImages(opts.input,opts.recursive); if(!files.length)runtimeError('angle','처리할 이미지가 없습니다.'); let failed=0; for(const [i,file] of files.entries()){try{const r=await processAngle(file,opts);console.log(`[${i+1}/${files.length}] ${r.rel} angle=${r.angle.toFixed(2)}° correction=${r.rotation.toFixed(2)}°`);}catch(e){failed++;console.error(`[${i+1}/${files.length}] FAILED ${path.relative(opts.input,file)}: ${e.message}`);}} notice('angle',`${opts.dryRun?'분석':'완료'} ${files.length-failed}개, 실패 ${failed}개 - ${opts.output}/`); if(failed)process.exitCode=1;
}

function isDropWhite(data, i, threshold) { return data[i + 3] === 0 || (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold); }
async function dropFile(inputPath, outputPath, threshold) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const { width, height, channels } = info; const visited = new Uint8Array(width * height); const queue = new Int32Array(width * height); let head = 0, tail = 0;
  const push = (x,y) => { if(x<0||y<0||x>=width||y>=height)return; const p=y*width+x; if(visited[p])return; const i=p*channels; if(!isDropWhite(data,i,threshold))return; visited[p]=1; queue[tail++]=p; };
  for(let x=0;x<width;x++){push(x,0);push(x,height-1);} for(let y=1;y<height-1;y++){push(0,y);push(width-1,y);} while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);data[p*channels+3]=0;push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);} await sharp(data,{raw:info}).png().toFile(outputPath); return tail;
}
async function cmdDrop(args) {
  if(hasHelpFlag(args))return printHelp('drop'); const options=parseProjectOptions('drop',args); let threshold=245; const rest=[]; for(let i=0;i<options.args.length;i++){const arg=options.args[i]; if(arg==='--threshold'){threshold=Number(options.args[++i]); if(!Number.isInteger(threshold)||threshold<0||threshold>255)usageError('drop','--threshold는 0~255 정수여야 합니다.');}else rest.push(arg);} if(rest.length)usageError('drop',`알 수 없는 옵션: ${rest[0]}`); if(!fs.existsSync(options.inputDir))runtimeError('drop',`입력 폴더가 없습니다: ${options.inputDir}`); const files=fs.readdirSync(options.inputDir,{withFileTypes:true}).filter(e=>e.isFile()&&isImage(e.name)).map(e=>e.name); if(!files.length)runtimeError('drop','처리할 이미지가 없습니다.'); const outDir=path.join(options.referenceDir,'dropped'); fs.mkdirSync(outDir,{recursive:true}); let success=0,failed=0; for(const file of files){try{const outputName=`${path.parse(file).name}.png`;const pixels=await dropFile(path.join(options.inputDir,file),path.join(outDir,outputName),threshold);console.log(`[완료] ${file} -> ${outputName} (${pixels} px 제거)`);success++;}catch(e){console.error(`[실패] ${file}: ${e.message}`);failed++;}} notice('drop',`완료 ${success}개, 실패 ${failed}개 - ${outDir}/`); if(failed)process.exitCode=1;
}

const commands = { crop: cmdCrop, merge: cmdMerge, align: cmdAlign, angle: cmdAngle, stack: cmdStack, drop: cmdDrop };
const argv = process.argv.slice(2);
if (!argv.length) { printHelp('global', console.error); process.exit(2); }
if (argv[0] === '-h' || argv[0] === '--help') { printHelp('global'); process.exit(0); }
const [command, ...rest] = argv;
if (!commands[command]) { console.error(`${PROG}: error: '${command}'는 알 수 없는 명령입니다.`); console.error(`Try '${PROG} --help' for more information.`); process.exit(2); }
Promise.resolve(commands[command](rest)).catch(error => runtimeError(command, error.message || String(error)));
