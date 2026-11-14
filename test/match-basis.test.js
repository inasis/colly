'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const {cmdMatch} = require('../commands/match');
test('basis threshold is strict and --bashs is alias; result remains silent on miss', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'colly-basis-'));
  const log = console.log, lines = [];
  try {
    fs.mkdirSync(path.join(dir, 'cite'));
    fs.mkdirSync(path.join(dir, 'output'));
    const image = await sharp({create:{width:32,height:32,channels:3,background:'#ffffff'}}).png().toBuffer();
    fs.writeFileSync(path.join(dir,'cite','sample.png'),image);
    fs.writeFileSync(path.join(dir,'output','C001.png'),image);
    console.log = (...a) => lines.push(a.join(' '));
    await cmdMatch(['-R',dir,'-P','C','?sample.png','1','--basis','99','--result']);
    assert.deepEqual(lines,['001']);
    lines.length=0;
    await cmdMatch(['-R',dir,'-P','C','?sample.png','1','--bashs','100','--result']);
    assert.deepEqual(lines,[]);
    lines.length=0;
    await cmdMatch(['-R',dir,'-P','C','?sample.png','1','--basis','99','--threshold','0','--result']);
    assert.deepEqual(lines,['001']);
  } finally { console.log=log; fs.rmSync(dir,{recursive:true,force:true}); }
});