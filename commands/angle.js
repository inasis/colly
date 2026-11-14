'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');
const { listAngleImages, parseBackground, processAngle } = require('../image/angle');

function parseAngleArgs(args) {
  const opts = { width: 1200, height: 1200, occupancy: 0.86, orientation: 'horizontal', threshold: 35, background: 'white', padding: 40, quality: 95, format: 'png', recursive: false, dryRun: false };
  const numeric = new Set(['width', 'height', 'occupancy', 'threshold', 'padding', 'quality']);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--recursive') { opts.recursive = true; continue; }
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (!arg.startsWith('--')) usageError('angle', `알 수 없는 옵션: ${arg}`);
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!(key in opts) || typeof opts[key] === 'boolean') usageError('angle', `알 수 없는 옵션: ${arg}`);
    const value = args[++i]; if (value == null) usageError('angle', `${arg} 뒤에 값이 필요합니다.`);
    opts[key] = numeric.has(key) ? Number(value) : value.toLowerCase();
  }
  if (!Number.isInteger(opts.width) || opts.width < 1 || !Number.isInteger(opts.height) || opts.height < 1) usageError('angle', 'width/height는 양의 정수여야 합니다.');
  if (!(opts.occupancy > 0.1 && opts.occupancy <= 1)) usageError('angle', 'occupancy는 0.1 초과 1 이하여야 합니다.');
  if (!['horizontal', 'vertical'].includes(opts.orientation)) usageError('angle', 'orientation은 horizontal 또는 vertical이어야 합니다.');
  if (!(opts.threshold >= 0 && opts.threshold <= 441)) usageError('angle', 'threshold는 0~441이어야 합니다.');
  if (!['png', 'jpg', 'jpeg', 'webp', 'avif', 'keep'].includes(opts.format)) usageError('angle', '지원하지 않는 format입니다.');
  return opts;
}
async function cmdAngle(args) {
  if(hasHelpFlag(args))return printHelp('angle'); const options=parseProjectOptions('angle',args); if(!fs.existsSync(options.inputDir))runtimeError('angle',`${options.inputDir}/ 폴더가 없습니다.`); const opts={...parseAngleArgs(options.args),input:options.inputDir,output:path.join(options.referenceDir,'angled')}; parseBackground(opts.background); const files=await listAngleImages(opts.input,opts.recursive); if(!files.length)runtimeError('angle','처리할 이미지가 없습니다.'); let failed=0; for(const [i,file] of files.entries()){try{const r=await processAngle(file,opts);console.log(`[${i+1}/${files.length}] ${r.rel} angle=${r.angle.toFixed(2)}° correction=${r.rotation.toFixed(2)}°`);}catch(e){failed++;console.error(`[${i+1}/${files.length}] FAILED ${path.relative(opts.input,file)}: ${e.message}`);}} notice('angle',`${opts.dryRun?'분석':'완료'} ${files.length-failed}개, 실패 ${failed}개 - ${opts.output}/`); if(failed)process.exitCode=1;
}


module.exports = { cmdAngle };