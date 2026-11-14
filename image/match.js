'use strict';
const sharp = require('sharp');

async function getDHash(file) {
  const { data } = await sharp(file).flatten({ background: '#ffffff' }).grayscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    bits = (bits << 1n) | BigInt(data[y * 9 + x] > data[y * 9 + x + 1] ? 1 : 0);
  }
  return bits;
}
function hammingDistance(a, b) {
  let v = a ^ b, n = 0;
  while (v) { v &= v - 1n; n++; }
  return n;
}
async function getColorSignature(file) {
  const { data } = await sharp(file).flatten({ background: '#ffffff' }).resize(16, 16, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}
function colorMAE(a, b) {
  if (a.length !== b.length) throw new Error('색상 시그니처 크기가 다릅니다.');
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}
module.exports = { getDHash, hammingDistance, getColorSignature, colorMAE };