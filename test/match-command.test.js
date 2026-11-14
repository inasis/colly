'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { cmdMatch } = require('../commands/match');

test('match -P C 1 ?sample.png: 번호 prefix 및 정확한 파일명, cite 우선', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-match-'));
  try {
    fs.mkdirSync(path.join(dir, 'cite'));
    fs.mkdirSync(path.join(dir, 'output'));
    const red = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#ff0000' } }).png().toBuffer();
    const blue = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#0000ff' } }).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'cite', 'C001.png'), red);
    fs.writeFileSync(path.join(dir, 'output', 'C001.png'), blue);
    fs.writeFileSync(path.join(dir, 'output', 'sample.png'), red);
    const oldLog = console.log; console.log = () => {};
    let result;
    try { result = await cmdMatch(['-R', dir, '-P', 'C', '1', '?sample.png', '--color']); }
    finally { console.log = oldLog; }
    assert.equal(result.distance, 0);
    assert.equal(result.mae, 0);
    assert.equal(result.first, path.join(dir, 'cite', 'C001.png'));
    assert.equal(result.second, path.join(dir, 'output', 'sample.png'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});