'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveNumberToken } = require('../core/reverse');
const { resolveMatchImage } = require('../commands/match');
test('R002 resolves to 008 when max is 009, across cite and output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-reverse-'));
  try {
    const cite = path.join(root, 'cite'); const output = path.join(root, 'output');
    fs.mkdirSync(cite); fs.mkdirSync(output);
    for (let i = 1; i <= 9; i++) fs.writeFileSync(path.join(output, `C${String(i).padStart(3,'0')}.png`), '');
    fs.writeFileSync(path.join(cite, 'C008.png'), '');
    assert.equal(resolveNumberToken('R002', 'C', [cite, output]), 8);
    assert.equal(resolveMatchImage({referenceDir:root,inputDir:output}, 'C', 'R002'), path.join(cite, 'C008.png'));
    assert.equal(resolveNumberToken('R001', 'C', [cite, output]), 9);
    assert.equal(resolveNumberToken('3', 'C', [cite, output]), 3);
    assert.throws(() => resolveNumberToken('R011', 'C', [cite, output]));
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
});
test('R uses maximum numeric suffix, not number of files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-reverse-sparse-'));
  try {
    fs.writeFileSync(path.join(root, 'C003.png'), '');
    fs.writeFileSync(path.join(root, 'C009#H200.png'), '');
    assert.equal(resolveNumberToken('R002', 'C', [root]), 8);
    assert.equal(resolveNumberToken('R001', 'C', [root]), 9);
  } finally { fs.rmSync(root, {recursive:true,force:true}); }
});