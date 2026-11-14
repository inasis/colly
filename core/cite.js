'use strict';
const fs = require('fs');
const path = require('path');
const { isImage } = require('./project');

// Search each directory independently. A match in cite always wins over output.
// '?' matches exactly one filename character. Ambiguous matches are errors.
function findInDirectory(dir, pattern) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter(isImage);
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\?/g, '.');
  const re = new RegExp(`^${escaped}$`, 'i');
  const matches = files.filter(f => re.test(f));
  if (matches.length > 1) throw new Error(`${dir}에서 여러 개 파일이 일치합니다: ${matches.join(', ')}`);
  return matches.length ? path.join(dir, matches[0]) : null;
}
function resolveReference(referenceDir, inputDir, pattern) {
  if (path.basename(pattern) !== pattern || !isImage(pattern)) throw new Error(`잘못된 이미지 파일명: ${pattern}`);
  const citeDir = path.join(referenceDir, 'cite');
  const found = findInDirectory(citeDir, pattern) || findInDirectory(inputDir, pattern);
  if (!found) throw new Error(`이미지를 찾을 수 없습니다: ${pattern} (cite/ → ${inputDir}/)`);
  return found;
}
function resolveCite(referenceDir, pattern) {
  const found = findInDirectory(path.join(referenceDir, 'cite'), pattern);
  if (!found) throw new Error(`cite 파일을 찾을 수 없습니다: ${pattern}`);
  return found;
}
function isCiteName(name) { return /^C[^/\\]*\.(png|jpe?g|webp|tiff?|avif)$/i.test(name); }
module.exports = { resolveReference, resolveCite, isCiteName };