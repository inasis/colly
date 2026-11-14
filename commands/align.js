'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');

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


module.exports = { cmdAlign };