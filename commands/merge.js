'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');
const { resolveReference } = require('../core/cite');
const { findMergeImage, findLiteralImage } = require('../image/merge');
const { parseNumberToken, resolveNumberToken } = require('../core/reverse');

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
    if (parseNumberToken(imageArg)) return items.push({ number: imageArg, literal: null, gap: 0, referenceHeight: null });
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
    else if (parseNumberToken(imageArg)) Object.assign(item, { number: imageArg, literal: null });
    else usageError('merge', `잘못된 이미지 지정: ${imageArg}`);
    items.push(item);
  }
  if (!items.length) usageError('merge', '합칠 이미지를 하나 이상 입력해주세요.');
  return { prefix, outputFile, bottomExtra, items, instant };
}
async function cmdMerge(args) {
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
    let filePath, found;
    if (item.literal) {
      filePath = resolveReference(options.referenceDir, options.inputDir, item.literal);
      found = { file: path.basename(filePath), taggedHeight: null };
      const tag = path.parse(found.file).name.match(/#H(\d+)$/i);
      if (tag) found.taggedHeight = Number(tag[1]);
    } else {
      // Numbered images also prioritize cite/ when the same numbered image exists there.
      const citeDir = path.join(options.referenceDir, 'cite');
      const resolvedNumber = resolveNumberToken(String(item.number), parsed.prefix, [citeDir, options.inputDir]);
      let located = null;
      for (const dir of [citeDir, options.inputDir]) {
        if (!fs.existsSync(dir)) continue;
        const candidates = fs.readdirSync(dir);
        try { located = findMergeImage(candidates, parsed.prefix, resolvedNumber); }
        catch (error) { if (!error.message.includes('찾을 수 없습니다')) throw error; }
        if (located) { filePath = path.join(dir, located.file); break; }
      }
      if (!located) throw new Error(`${parsed.prefix}${pad3(resolvedNumber)} 이미지를 찾을 수 없습니다.`);
      found = located;
    }
    if (item.referenceHeight !== null && found.taggedHeight === null) throw new Error(`${found.file}: #H 태그가 없어 H보정을 사용할 수 없습니다.`);
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


module.exports = { cmdMerge };