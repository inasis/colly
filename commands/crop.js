'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');
const { detectWhiteRows, findGaps, findSections } = require('../image/crop');

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

module.exports = { cmdCrop };