'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveCite } = require('../core/cite');
test('cite exact and single-character wildcard', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-cite-'));
  try {
    fs.mkdirSync(path.join(root, 'cite'));
    fs.writeFileSync(path.join(root, 'cite', 'C1sample.png'), '');
    assert.equal(path.basename(resolveCite(root, 'C1sample.png')), 'C1sample.png');
    assert.equal(path.basename(resolveCite(root, 'C?sample.png')), 'C1sample.png');
    fs.writeFileSync(path.join(root, 'cite', 'C2sample.png'), '');
    assert.throws(() => resolveCite(root, 'C?sample.png'), /여러 개/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
const { resolveReference } = require('../core/cite');
test('cite takes priority, then falls back to output', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-priority-'));
  const cite = path.join(root, 'cite'), output = path.join(root, 'output');
  try {
    fs.mkdirSync(cite); fs.mkdirSync(output);
    fs.writeFileSync(path.join(output, 'sample.png'), 'output');
    assert.equal(resolveReference(root, output, 'sample.png'), path.join(output, 'sample.png'));
    fs.writeFileSync(path.join(cite, 'sample.png'), 'cite');
    assert.equal(resolveReference(root, output, 'sample.png'), path.join(cite, 'sample.png'));
    fs.writeFileSync(path.join(output, 'C1sample.png'), 'output');
    assert.equal(resolveReference(root, output, 'C?sample.png'), path.join(output, 'C1sample.png'));
    fs.writeFileSync(path.join(cite, 'C2sample.png'), 'cite');
    assert.equal(resolveReference(root, output, 'C?sample.png'), path.join(cite, 'C2sample.png'));
  } finally { fs.rmSync(root, {recursive:true, force:true}); }
});