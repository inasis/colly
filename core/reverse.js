'use strict';
const fs = require('fs');
const path = require('path');
const { isImage } = require('./project');

function parseNumberToken(token) {
  if (/^R\d+$/i.test(token)) return { reverse: true, value: Number(token.slice(1)) };
  if (/^\d+$/.test(token)) return { reverse: false, value: Number(token) };
  return null;
}
function maxPrefixNumber(dirs, prefix) {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^${escaped}_?(\\d{3,})(?:#H\\d+)?$`, 'i');
  let max = -1;
  for (const dir of new Set(dirs)) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!isImage(file)) continue;
      const match = path.parse(file).name.match(re);
      if (match) max = Math.max(max, Number(match[1]));
    }
  }
  return max;
}
function resolveNumberToken(token, prefix, dirs) {
  const parsed = parseNumberToken(token);
  if (!parsed || !Number.isSafeInteger(parsed.value) || parsed.value < (parsed.reverse ? 1 : 0))
    throw new Error(`잘못된 이미지 번호: ${token}`);
  if (!parsed.reverse) return parsed.value;
  const max = maxPrefixNumber(dirs, prefix);
  if (max < 0) throw new Error(`${prefix} 접두사의 번호 이미지가 없습니다.`);
  const number = max - parsed.value + 1;
  if (number < 0) throw new Error(`${token}: 최대 번호 ${max}의 범위를 벗어났습니다.`);
  return number;
}
module.exports = { parseNumberToken, maxPrefixNumber, resolveNumberToken };