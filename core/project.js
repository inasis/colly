'use strict';

const fs = require('fs');
const path = require('path');
const { OUTPUT_DIR, IMAGE_EXTENSIONS } = require('./constants');
const { usageError, runtimeError } = require('./log');
function isImage(file) { return IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase()); }
function parseProjectOptions(command, rawArgs) {
  const args = [];
  let reference = path.resolve(__dirname, '..');
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

module.exports = { isImage, parseProjectOptions };