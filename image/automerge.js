'use strict';
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

async function scanPng(root) {
  const found = [];
  async function walk(dir) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name, 'ko'));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.png') found.push(full);
    }
  }
  await walk(root);
  return found;
}

// The caller supplies the ordered suffixes. No product-part labels are hardcoded.
function groupFiles(files, prefix, suffixes = ['상단', '중단', '하단']) {
  if (!prefix || !suffixes.length || suffixes.some(s => !s)) throw new Error('상품명 일부와 이미지 구분명을 지정하세요.');
  if (new Set(suffixes).size !== suffixes.length) throw new Error('이미지 구분명이 중복되었습니다.');
  const groups = new Map();
  for (const file of files) {
    const name = path.basename(file, path.extname(file));
    for (let i = 0; i < suffixes.length; i++) {
      const suffix = suffixes[i];
      if (!name.endsWith(suffix) || name.length <= suffix.length) continue;
      const model = name.slice(0, -suffix.length);
      if (!model.startsWith(prefix)) continue;
      if (!groups.has(model)) groups.set(model, { model, parts: suffixes.map(() => []) });
      groups.get(model).parts[i].push(file);
      break;
    }
  }
  return [...groups.values()].sort((a,b) => a.model.localeCompare(b.model, 'ko'));
}

async function composeVertical(files, outputPath, gap = 0) {
  const metas = await Promise.all(files.map(async file => ({ file, ...(await sharp(file).metadata()) })));
  if (!metas.length) throw new Error('병합할 이미지가 없습니다.');
  const width = metas[0].width;
  if (metas.some(m => m.width !== width)) throw new Error('이미지 너비가 서로 다릅니다.');
  const height = metas.reduce((sum,m) => sum + m.height, 0) + gap * (metas.length - 1);
  const layers = []; let top = 0;
  for (const meta of metas) { layers.push({ input: meta.file, left: 0, top }); top += meta.height + gap; }
  await sharp({ create: { width, height, channels: 4, background: '#ffffff' } }).composite(layers).png().toFile(outputPath);
  return { width, height };
}
module.exports = { scanPng, groupFiles, composeVertical };