'use strict';

const path = require('path');
const { pad3 } = require('../core/log');
const { isImage } = require('../core/project');
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

module.exports = { findMergeImage, findLiteralImage };