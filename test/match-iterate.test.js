'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { cmdMatch } = require('../commands/match');

test('iterate searches increasing numbers until first match; reverse searches decreasing', async () => {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'colly-iterate-'));
 const log=console.log;
 try {
  fs.mkdirSync(path.join(dir,'cite')); fs.mkdirSync(path.join(dir,'output'));
  const make=async (kind)=>sharp({create:{width:32,height:32,channels:3,background:kind}}).png().toBuffer();
  const red=await make('#ff0000'), blue=await make('#0000ff');
  fs.writeFileSync(path.join(dir,'cite','sample.png'),red);
  for(let n=1;n<=9;n++) fs.writeFileSync(path.join(dir,'output',`C${String(n).padStart(3,'0')}.png`),n===8?red:blue);
  console.log=()=>{};
  let r=await cmdMatch(['-R',dir,'-P','C','?sample.png','R003','--iterate','--color','--color-threshold','1']);
  assert.equal(r.matched,true); assert.equal(r.attempts,2); assert.match(r.second,/C008.png$/);
  r=await cmdMatch(['-R',dir,'-P','C','?sample.png','R001','--iterate','--color','--color-threshold','1']);
  assert.equal(r.matched,false); assert.equal(r.attempts,1);
  r=await cmdMatch(['-R',dir,'-P','C','?sample.png','001','--iterate-reverse','--color','--color-threshold','1']);
  assert.equal(r.matched,false); assert.equal(r.attempts,1);
  r=await cmdMatch(['-R',dir,'-P','C','?sample.png','R001','--iterate-reverse','--color','--color-threshold','1']);
  assert.equal(r.matched,true); assert.equal(r.attempts,2); assert.match(r.second,/C008.png$/);
 } finally { console.log=log; fs.rmSync(dir,{recursive:true,force:true}); }
});