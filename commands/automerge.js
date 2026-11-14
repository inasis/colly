'use strict';
const fs = require('fs/promises');
const path = require('path');
const { parseProjectOptions } = require('../core/project');
const { usageError, runtimeError, notice } = require('../core/log');
const { hasHelpFlag, printHelp } = require('../core/help');
const { scanPng, groupFiles, composeVertical } = require('../image/automerge');

async function cmdAutomerge(rawArgs) {
  if (hasHelpFlag(rawArgs)) return printHelp('automerge');
  const options = parseProjectOptions('automerge', rawArgs);
  let gap = 0, overwrite = false, dryRun = false;
  const positional = [];
  for (let i = 0; i < options.args.length; i++) {
    const arg = options.args[i];
    if (arg === '--gap') {
      gap = Number(options.args[++i]);
      if (!Number.isSafeInteger(gap) || gap < 0) usageError('automerge', '--gap은 0 이상의 정수여야 합니다.');
    } else if (arg === '--overwrite') overwrite = true;
    else if (arg === '--dry-run') dryRun = true;
    else if (!arg.startsWith('-')) positional.push(arg);
    else usageError('automerge', `알 수 없는 인자: ${arg}`);
  }
  const [prefix, ...suffixes] = positional;
  if (!prefix || !suffixes.length) usageError('automerge', '상품명 일부와 병합할 이미지 구분명을 순서대로 입력하세요. 예: automerge 상품명A 상단 중단 하단');
  if (new Set(suffixes).size !== suffixes.length) usageError('automerge', '이미지 구분명이 중복되었습니다.');
  try { if (!(await fs.stat(options.inputDir)).isDirectory()) throw new Error(); }
  catch { runtimeError('automerge', `입력 폴더가 없습니다: ${options.inputDir}`); }
  const groups = groupFiles(await scanPng(options.inputDir), prefix, suffixes);
  if (!groups.length) runtimeError('automerge', `"${prefix}"와 지정한 이미지 구분명에 일치하는 PNG가 없습니다.`);
  let success = 0, failed = 0, skipped = 0;
  for (const group of groups) {
    const parts = group.parts.map(list => list[0]).filter(Boolean);
    const output = path.join(options.referenceDir, `${group.model}.png`);
    try {
      if (!overwrite) {
        try { await fs.access(output); console.log(`[건너뜀] 이미 존재: ${output}`); skipped++; continue; }
        catch (e) { if (e.code !== 'ENOENT') throw e; }
      }
      console.log(`[${dryRun ? '미리보기' : '병합'}] ${group.model}: ${parts.map(p => path.relative(options.inputDir, p)).join(' + ')}`);
      if (!dryRun) await composeVertical(parts, output, gap);
      success++;
    } catch (error) { failed++; console.error(`[실패] ${group.model}: ${error.message}`); }
  }
  notice('automerge', `${dryRun ? '분석' : '완료'} ${success}개, 건너뜀 ${skipped}개, 실패 ${failed}개`);
  if (failed) process.exitCode = 1;
}
module.exports = { cmdAutomerge };