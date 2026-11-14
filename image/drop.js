'use strict';

const sharp = require('sharp');
function isDropWhite(data, i, threshold) { return data[i + 3] === 0 || (data[i] >= threshold && data[i + 1] >= threshold && data[i + 2] >= threshold); }
async function dropFile(inputPath, outputPath, threshold) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const { width, height, channels } = info; const visited = new Uint8Array(width * height); const queue = new Int32Array(width * height); let head = 0, tail = 0;
  const push = (x,y) => { if(x<0||y<0||x>=width||y>=height)return; const p=y*width+x; if(visited[p])return; const i=p*channels; if(!isDropWhite(data,i,threshold))return; visited[p]=1; queue[tail++]=p; };
  for(let x=0;x<width;x++){push(x,0);push(x,height-1);} for(let y=1;y<height-1;y++){push(0,y);push(width-1,y);} while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);data[p*channels+3]=0;push(x-1,y);push(x+1,y);push(x,y-1);push(x,y+1);} await sharp(data,{raw:info}).png().toFile(outputPath); return tail;
}

module.exports = { isDropWhite, dropFile };