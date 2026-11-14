'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');
const { findCaseInsensitive, overlayLayers } = require('../image/stack');

async function cmdStack(args) {
  if (hasHelpFlag(args)) return printHelp('stack');
  const options = parseProjectOptions('stack', args); args = options.args;
  let prefix, suffix; const order = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-A') { if (order.includes('dest')) usageError('stack', '-A는 한 번만 사용할 수 있습니다.'); order.push('dest'); }
    else if (arg === '--at') { const value = args[++i]; if (!value) usageError('stack', '--at 뒤에 파일명이 필요합니다.'); order.push({ type: 'at', file: value }); }
    else if (['-P', '--prefix', '-S', '--suffix'].includes(arg)) {
      const value = args[++i]; if (!value) usageError('stack', `${arg} 뒤에 값이 필요합니다.`);
      if (arg === '-P' || arg === '--prefix') { if (prefix !== undefined) usageError('stack', 'prefix는 한 번만 지정할 수 있습니다.'); prefix = value; order.push('pre'); }
      else { if (suffix !== undefined) usageError('stack', 'suffix는 한 번만 지정할 수 있습니다.'); suffix = value; order.push('post'); }
    } else usageError('stack', `알 수 없는 옵션: ${arg}`);
  }
  if (prefix === undefined && suffix === undefined) usageError('stack', 'prefix 또는 suffix가 하나 이상 필요합니다.');
  if (!order.includes('dest')) order.push('dest');
  if (!fs.existsSync(options.inputDir)) runtimeError('stack', `${options.inputDir}/ 폴더가 없습니다.`);
  const files = fs.readdirSync(options.inputDir).filter(f => f.toLowerCase().endsWith('.png'));
  for (const layer of order) if (typeof layer !== 'string') { layer.resolvedFile = findCaseInsensitive(files, layer.file); if (!layer.resolvedFile) runtimeError('stack', `고정 파일 ${layer.file}이 없습니다.`); }
  const candidates = new Set();
  if (prefix !== undefined) for (const file of files) if (file.toLowerCase().startsWith(prefix.toLowerCase())) candidates.add(file.slice(prefix.length));
  if (suffix !== undefined) { const ending = `${suffix}.png`.toLowerCase(); for (const file of files) if (file.toLowerCase().endsWith(ending)) candidates.add(`${file.slice(0, -ending.length)}.png`); }
  const outDir = path.join(options.referenceDir, 'stacked'); fs.mkdirSync(outDir, { recursive: true });
  let success = 0, failed = 0;
  for (const outputName of [...candidates].sort()) {
    try {
      const base = findCaseInsensitive(files, outputName); if (!base) throw new Error(`기준 파일 ${outputName}가 없습니다.`);
      const roles = { dest: base };
      if (prefix !== undefined) { roles.pre = findCaseInsensitive(files, `${prefix}${outputName}`); if (!roles.pre) throw new Error('prefix 파일이 없습니다.'); }
      if (suffix !== undefined) { roles.post = findCaseInsensitive(files, `${outputName.slice(0, -4)}${suffix}.png`); if (!roles.post) throw new Error('suffix 파일이 없습니다.'); }
      const names = order.map(layer => typeof layer === 'string' ? roles[layer] : layer.resolvedFile);
      await overlayLayers(names.map(n => path.join(options.inputDir, n)), path.join(outDir, outputName)); success++;
    } catch (e) { console.error(`[실패] ${outputName}: ${e.message}`); failed++; }
  }
  notice('stack', `완료 ${success}개, 실패 ${failed}개 - ${outDir}/`);
  if (failed) process.exitCode = 1;
}


module.exports = { cmdStack };