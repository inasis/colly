'use strict';

const sharp = require('sharp');
const fsp = require('fs/promises');
const path = require('path');
const { IMAGE_EXTENSIONS } = require('../core/constants');
async function listAngleImages(root, recursive, current = root) {
  const entries = await fsp.readdir(current, { withFileTypes: true }); const files = [];
  for (const e of entries) { const full = path.join(current, e.name); if (e.isDirectory() && recursive) files.push(...await listAngleImages(root, recursive, full)); else if (e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase())) files.push(full); }
  return files.sort();
}
function cornerBackground(data, info) {
  const { width, height, channels } = info; const size = Math.max(1, Math.min(12, Math.floor(Math.min(width, height) / 20))); const sums = [0, 0, 0]; let count = 0;
  for (const [bx, by] of [[0,0],[width-size,0],[0,height-size],[width-size,height-size]]) for (let y = by; y < by + size; y++) for (let x = bx; x < bx + size; x++) { const i = (y * width + x) * channels; if (channels === 4 && data[i + 3] < 32) continue; sums[0]+=data[i]; sums[1]+=data[i+1]; sums[2]+=data[i+2]; count++; }
  return count ? sums.map(v => v / count) : [255,255,255];
}
async function analyzeProduct(image, threshold, alphaOnly = false) {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const bg = cornerBackground(data, info); const points = []; let minX=info.width,minY=info.height,maxX=-1,maxY=-1; const stride=Math.max(1,Math.floor(Math.max(info.width,info.height)/1000)); const t2=threshold*threshold;
  for (let y=0;y<info.height;y+=stride) for (let x=0;x<info.width;x+=stride) { const i=(y*info.width+x)*4,a=data[i+3],dr=data[i]-bg[0],dg=data[i+1]-bg[1],db=data[i+2]-bg[2]; const fg=a>20&&(alphaOnly?a>80:(a<245||dr*dr+dg*dg+db*db>t2)); if(!fg)continue; points.push([x,y]); minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y); }
  if(points.length<20) throw new Error('상품을 감지하지 못했습니다. --threshold를 낮춰보세요.');
  let mx=0,my=0; for(const [x,y] of points){mx+=x;my+=y;} mx/=points.length;my/=points.length; let xx=0,yy=0,xy=0; for(const [x,y] of points){const dx=x-mx,dy=y-my;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
  return { angle:0.5*Math.atan2(2*xy,xx-yy)*180/Math.PI, bbox:{left:minX,top:minY,width:maxX-minX+1,height:maxY-minY+1} };
}
function parseBackground(value) {
  if(value==='transparent')return{r:0,g:0,b:0,alpha:0}; if(value==='white')return{r:255,g:255,b:255,alpha:1}; if(/^#[0-9a-f]{6}$/i.test(value))return{r:parseInt(value.slice(1,3),16),g:parseInt(value.slice(3,5),16),b:parseInt(value.slice(5,7),16),alpha:1}; throw new Error('background는 white, transparent, #RRGGBB 중 하나여야 합니다.');
}
async function encodeAngle(image, format, quality, sourceExt) { const f=(format==='keep'?sourceExt.slice(1):format).toLowerCase(); if(f==='jpg'||f==='jpeg')return image.jpeg({quality,chromaSubsampling:'4:4:4'}); if(f==='webp')return image.webp({quality}); if(f==='avif')return image.avif({quality}); return image.png({compressionLevel:9}); }
async function processAngle(file, opts) {
  const base=sharp(file,{failOn:'error'}).rotate().ensureAlpha(); const initial=await analyzeProduct(base,opts.threshold); let target=opts.orientation==='horizontal'?0:90,rotation=target-initial.angle; while(rotation>90)rotation-=180;while(rotation<-90)rotation+=180;
  const rotated=base.extend({top:opts.padding,bottom:opts.padding,left:opts.padding,right:opts.padding,background:{r:0,g:0,b:0,alpha:0}}).rotate(rotation,{background:{r:0,g:0,b:0,alpha:0}}); const buf=await rotated.png().toBuffer(); const measured=await analyzeProduct(sharp(buf),opts.threshold,true); const fitted=await sharp(buf).extract(measured.bbox).resize(Math.round(opts.width*opts.occupancy),Math.round(opts.height*opts.occupancy),{fit:'inside',withoutEnlargement:false}).png().toBuffer(); const meta=await sharp(fitted).metadata(); const canvas=sharp({create:{width:opts.width,height:opts.height,channels:4,background:parseBackground(opts.background)}}).composite([{input:fitted,left:Math.floor((opts.width-meta.width)/2),top:Math.floor((opts.height-meta.height)/2)}]);
  const rel=path.relative(opts.input,file); const ext=(opts.format==='keep'?path.extname(file).slice(1):opts.format).replace('jpeg','jpg'); const out=path.join(opts.output,path.dirname(rel),`${path.basename(file,path.extname(file))}.${ext}`); if(!opts.dryRun){await fsp.mkdir(path.dirname(out),{recursive:true}); await (await encodeAngle(canvas,opts.format,opts.quality,path.extname(file))).toFile(out);} return {rel,angle:initial.angle,rotation};
}

module.exports = { listAngleImages, cornerBackground, analyzeProduct, parseBackground, encodeAngle, processAngle };