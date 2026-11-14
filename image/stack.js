'use strict';

const sharp = require('sharp');
function findCaseInsensitive(files, wanted) { const low = wanted.toLocaleLowerCase(); return files.find(f => f.toLocaleLowerCase() === low); }
async function overlayLayers(layerPaths, outputPath) {
  const metas = await Promise.all(layerPaths.map(async file => ({ file, ...(await sharp(file).metadata()) })));
  if (metas.some(m => m.width !== metas[0].width || m.height !== metas[0].height)) throw new Error('이미지 크기가 서로 다릅니다.');
  await sharp(layerPaths[0]).composite(layerPaths.slice(1).map(input => ({ input, blend: 'over' }))).png().toFile(outputPath);
}

module.exports = { findCaseInsensitive, overlayLayers };