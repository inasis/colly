'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { getDHash, hammingDistance, getColorSignature, colorMAE } = require('../image/match');

test('동일한 픽셀과 크기 변경은 동일 dHash', async () => {
  const raw = Buffer.alloc(32 * 32 * 3);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) raw.fill(x * 8, (y * 32 + x) * 3, (y * 32 + x + 1) * 3);
  const img = await sharp(raw, { raw: { width: 32, height: 32, channels: 3 } }).png().toBuffer();
  const a = await getDHash(img);
  assert.equal(hammingDistance(a, a), 0);
  assert.equal(hammingDistance(a, await getDHash(await sharp(img).resize(64, 64).png().toBuffer())), 0);
});
test('색상 차이는 MAE로 구별', async () => {
  const red = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#ff0000' } }).png().toBuffer();
  const blue = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#0000ff' } }).png().toBuffer();
  assert.equal(hammingDistance(await getDHash(red), await getDHash(blue)), 0);
  assert.ok(colorMAE(await getColorSignature(red), await getColorSignature(blue)) > 100);
});