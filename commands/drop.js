'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { CROP_INPUT_EXT } = require('../core/constants');
const { usageError, runtimeError, notice, pad3 } = require('../core/log');
const { isImage, parseProjectOptions } = require('../core/project');
const { hasHelpFlag, printHelp } = require('../core/help');
const { dropFile } = require('../image/drop');

async function cmdDrop(args) {
  if(hasHelpFlag(args))return printHelp('drop'); const options=parseProjectOptions('drop',args); let threshold=245; const rest=[]; for(let i=0;i<options.args.length;i++){const arg=options.args[i]; if(arg==='--threshold'){threshold=Number(options.args[++i]); if(!Number.isInteger(threshold)||threshold<0||threshold>255)usageError('drop','--threshold는 0~255 정수여야 합니다.');}else rest.push(arg);} if(rest.length)usageError('drop',`알 수 없는 옵션: ${rest[0]}`); if(!fs.existsSync(options.inputDir))runtimeError('drop',`입력 폴더가 없습니다: ${options.inputDir}`); const files=fs.readdirSync(options.inputDir,{withFileTypes:true}).filter(e=>e.isFile()&&isImage(e.name)).map(e=>e.name); if(!files.length)runtimeError('drop','처리할 이미지가 없습니다.'); const outDir=path.join(options.referenceDir,'dropped'); fs.mkdirSync(outDir,{recursive:true}); let success=0,failed=0; for(const file of files){try{const outputName=`${path.parse(file).name}.png`;const pixels=await dropFile(path.join(options.inputDir,file),path.join(outDir,outputName),threshold);console.log(`[완료] ${file} -> ${outputName} (${pixels} px 제거)`);success++;}catch(e){console.error(`[실패] ${file}: ${e.message}`);failed++;}} notice('drop',`완료 ${success}개, 실패 ${failed}개 - ${outDir}/`); if(failed)process.exitCode=1;
}


module.exports = { cmdDrop };