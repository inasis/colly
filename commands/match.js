'use strict';
const fs = require('fs');
const path = require('path');
const { parseProjectOptions, isImage } = require('../core/project');
const { usageError } = require('../core/log');
const { printHelp } = require('../core/help');
const { resolveReference } = require('../core/cite');
const { resolveNumberToken, parseNumberToken, maxPrefixNumber } = require('../core/reverse');
const { findMergeImage } = require('../image/merge');
const { getDHash, hammingDistance, getColorSignature, colorMAE } = require('../image/match');

function resolveMatchImage(options, prefix, token) {
  if (token.startsWith('?')) {
    const filename = token.slice(1);
    if (!filename || filename.includes('?') || filename.includes('*') || path.basename(filename) !== filename || !isImage(filename))
      usageError('match', `? 뒤에는 정확한 이미지 파일명을 지정하세요: ${token}`);
    return resolveReference(options.referenceDir, options.inputDir, filename);
  }
  if (!parseNumberToken(token))
    usageError('match', `번호 또는 ?파일명을 입력하세요: ${token}`);
  const number = resolveNumberToken(token, prefix, [path.join(options.referenceDir, 'cite'), options.inputDir]);
  for (const dir of [...new Set([path.join(options.referenceDir, 'cite'), options.inputDir])]) {
    if (!fs.existsSync(dir)) continue;
    try {
      const found = findMergeImage(fs.readdirSync(dir), prefix, number);
      return path.join(dir, found.file);
    } catch (error) {
      if (!error.message.includes('찾을 수 없습니다')) throw error;
    }
  }
  throw new Error(`${prefix}${String(number).padStart(3, '0')} 이미지를 찾을 수 없습니다 (cite/ → ${options.inputDir}/).`);
}

async function compareImages(first, second, color, threshold, colorThreshold, basis = null) {
  const distance = hammingDistance(await getDHash(first), await getDHash(second));
  const similarity = (64 - distance) / 64 * 100;
  const mae = color ? colorMAE(await getColorSignature(first), await getColorSignature(second)) : null;
  return { first, second, distance, similarity, mae, matched: (basis === null ? distance <= threshold : similarity > basis) && (!color || mae <= colorThreshold) };
}

async function cmdMatch(rawArgs) {
  if (rawArgs.includes('--help') || rawArgs.includes('-h')) return printHelp('match');
  const options = parseProjectOptions('match', rawArgs);
  let threshold = 10, color = false, colorThreshold = 20, prefix = 'dummy', direction = 0, resultOnly = false, basis = null;
  const args = [];
  for (let i = 0; i < options.args.length; i++) {
    const arg = options.args[i];
    if (arg === '-P' || arg === '--prefix') {
      const value = options.args[++i];
      if (!value || value.startsWith('-')) usageError('match', `${arg} 뒤에 prefix가 필요합니다.`);
      prefix = value;
    } else if (arg === '--threshold' || arg === '--color-threshold') {
      const value = options.args[++i];
      const num = Number(value);
      if (value === undefined || !Number.isFinite(num)) usageError('match', `${arg} 값이 올바르지 않습니다.`);
      if (arg === '--threshold') threshold = num;
      else colorThreshold = num;
    } else if (arg === '--basis' || arg === '--bashs') {
      const value = options.args[++i];
      if (value === undefined || value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > 100) usageError('match', `${arg}는 0~100 사이의 유사도(%)여야 합니다.`);
      basis = Number(value);
    } else if (arg === '--color') color = true;
    else if (arg === '--result' || arg === 'result') resultOnly = true;
    else if (arg === '--iterate' || arg === 'iterate') {
      if (direction) usageError('match', 'iterate와 iterate-reverse는 동시에 사용할 수 없습니다.');
      direction = 1;
    } else if (arg === '--iterate-reverse' || arg === 'iterate-reverse') {
      if (direction) usageError('match', 'iterate와 iterate-reverse는 동시에 사용할 수 없습니다.');
      direction = -1;
    } else if (arg.startsWith('-')) usageError('match', `알 수 없는 옵션: ${arg}`);
    else args.push(arg);
  }
  if (args.length !== 2) usageError('match', '비교할 이미지 두 개를 입력하세요. 예: match -P C 1 R002 --iterate');
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 64) usageError('match', '--threshold는 0~64 정수여야 합니다.');
  if (colorThreshold < 0 || colorThreshold > 255) usageError('match', '--color-threshold는 0~255여야 합니다.');
  const first = resolveMatchImage(options, prefix, args[0]);
  const dirs = [path.join(options.referenceDir, 'cite'), options.inputDir];
  let numbers = [null];
  if (direction) {
    if (!parseNumberToken(args[1])) usageError('match', 'iterate에는 두 번째 이미지로 번호 또는 R번호가 필요합니다.');
    const start = resolveNumberToken(args[1], prefix, dirs);
    const max = maxPrefixNumber(dirs, prefix);
    if (max < 0) throw new Error(`${prefix} 접두사의 번호 이미지가 없습니다.`);
    numbers = [];
    for (let n = start; n >= 1 && n <= max; n += direction) numbers.push(n);
  }
  let matchedNumber = null;
  let attempts = 0;
  let result = null;
  for (const n of numbers) {
    let second;
    if (n === null) second = resolveMatchImage(options, prefix, args[1]);
    else {
      try { second = resolveMatchImage(options, prefix, String(n)); }
      catch (error) {
        if (error.message.includes('이미지를 찾을 수 없습니다')) continue;
        throw error;
      }
    }
    attempts++;
    result = await compareImages(first, second, color, threshold, colorThreshold, basis);
    if (!resultOnly) console.log(`${args[0]} (${path.relative(options.referenceDir, first)}) vs ${n === null ? args[1] : String(n).padStart(3, '0')} (${path.relative(options.referenceDir, second)})`);
    if (!resultOnly) console.log(`dHash=${result.distance}/64\t유사도=${result.similarity.toFixed(2)}%${color ? `\t색상MAE=${result.mae.toFixed(2)}` : ''}`);
    if (result.matched) {
      matchedNumber = n === null && parseNumberToken(args[1])
        ? resolveNumberToken(args[1], prefix, dirs) : n;
      break;
    }
  }
  const matched = result?.matched ?? false;
  if (resultOnly) {
    if (matched) {
      const number = matchedNumber;
      if (number !== null) console.log(String(number).padStart(3, '0'));
    }
  } else console.log(`colly match: ${matched ? '일치' : '불일치'} (비교 ${attempts}개, 기준: ${basis === null ? `dHash <= ${threshold}` : `유사도 > ${basis}%`}${color ? `, 색상MAE <= ${colorThreshold}` : ''})`);
  return { ...(result || { first, second: null, distance: null, similarity: null, mae: null }), matched, attempts };
}
module.exports = { cmdMatch, resolveMatchImage };