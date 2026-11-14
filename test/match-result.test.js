'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { cmdMatch } = require('../commands/match');

test('result prints only matched absolute number; no match prints nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-result-'));
  const original = console.log;
  const lines = [];
  try {
    fs.mkdirSync(path.join(dir, 'cite'));
    fs.mkdirSync(path.join(dir, 'output'));
    const red = await sharp({create:{width:32,height:32,channels:3,background:'#ff0000'}}).png().toBuffer();
    const blue = await sharp({create:{width:32,height:32,channels:3,background:'#0000ff'}}).png().toBuffer();
    fs.writeFileSync(path.join(dir, 'cite', 'sample.png'), red);
    for (let n = 1; n <= 9; n++) fs.writeFileSync(path.join(dir, 'output', `C${String(n).padStart(3,'0')}.png`), n === 8 ? red : blue);
    console.log = (...args) => lines.push(args.join(' '));
    await cmdMatch(['-R', dir, '-P', 'C', '?sample.png', 'R001', '--iterate-reverse', '--color', '--color-threshold', '1', '--result']);
    assert.deepEqual(lines, ['008']);
    lines.length = 0;
    await cmdMatch(['-R', dir, '-P', 'C', '?sample.png', 'R001', '--iterate', '--color', '--color-threshold', '1', '--result']);
    assert.deepEqual(lines, []);
    await cmdMatch(['-R', dir, '-P', 'C', '?sample.png', 'R002', '--color', '--color-threshold', '1', '--result']);
    assert.deepEqual(lines, ['008']);
  } finally {
    console.log = original;
    fs.rmSync(dir, {recursive:true,force:true});
  }
});