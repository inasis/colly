#!/usr/bin/env node
'use strict';

/**
 * Product image batch aligner (Node.js + Sharp)
 *
 * Install: npm install sharp
 * Example: node product-align.js ./input ./aligned --width 1200 --height 1200
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.avif']);

function help() {
  console.log(`
Usage:
  node product-align.js <input-dir> <output-dir> [options]

Options:
  --width <px>             Output canvas width (default: 1200)
  --height <px>            Output canvas height (default: 1200)
  --occupancy <0.1..1>     Maximum product area ratio (default: 0.86)
  --orientation <value>    horizontal or vertical (default: horizontal)
  --threshold <0..441>     Background color distance (default: 35)
  --background <value>     white, transparent, or #RRGGBB (default: white)
  --padding <px>           Extra transparent padding before rotation (default: 40)
  --quality <1..100>       JPEG/WebP/AVIF output quality (default: 95)
  --format <value>         png, jpg, webp, avif, or keep (default: png)
  --recursive              Include subdirectories
  --dry-run                Analyze only; do not write images
  -h, --help               Show this help

The detector uses existing alpha when available. For opaque images it estimates
the background color from the four corners. Use --threshold to tune separation.
`);
}

function parseArgs(argv) {
  const positional = [];
  const opts = {
    width: 1200, height: 1200, occupancy: 0.86, orientation: 'horizontal',
    threshold: 35, background: 'white', padding: 40, quality: 95,
    format: 'png', recursive: false, dryRun: false,
  };
  const numeric = new Set(['width', 'height', 'occupancy', 'threshold', 'padding', 'quality']);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') return { help: true };
    if (arg === '--recursive') { opts.recursive = true; continue; }
    if (arg === '--dry-run') { opts.dryRun = true; continue; }
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!(key in opts) || typeof opts[key] === 'boolean') throw new Error(`Unknown option: ${arg}`);
      const value = argv[++i];
      if (value == null) throw new Error(`${arg} requires a value.`);
      opts[key] = numeric.has(key) ? Number(value) : value.toLowerCase();
      continue;
    }
    positional.push(arg);
  }
  if (positional.length !== 2) throw new Error('Specify input-dir and output-dir.');
  if (!Number.isInteger(opts.width) || opts.width < 1 || !Number.isInteger(opts.height) || opts.height < 1) throw new Error('width and height must be positive integers.');
  if (!(opts.occupancy > 0.1 && opts.occupancy <= 1)) throw new Error('occupancy must be greater than 0.1 and at most 1.');
  if (!['horizontal', 'vertical'].includes(opts.orientation)) throw new Error('orientation must be horizontal or vertical.');
  if (!(opts.threshold >= 0 && opts.threshold <= 441)) throw new Error('threshold must be between 0 and 441.');
  if (!['png', 'jpg', 'jpeg', 'webp', 'avif', 'keep'].includes(opts.format)) throw new Error('Unsupported output format.');
  return { input: path.resolve(positional[0]), output: path.resolve(positional[1]), ...opts };
}

async function listImages(root, recursive, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory() && recursive) files.push(...await listImages(root, recursive, full));
    else if (entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function cornerBackground(data, info) {
  const { width, height, channels } = info;
  const size = Math.max(1, Math.min(12, Math.floor(Math.min(width, height) / 20)));
  const sums = [0, 0, 0];
  let count = 0;
  const boxes = [[0, 0], [width - size, 0], [0, height - size], [width - size, height - size]];
  for (const [bx, by] of boxes) for (let y = by; y < by + size; y++) for (let x = bx; x < bx + size; x++) {
    const i = (y * width + x) * channels;
    if (channels === 4 && data[i + 3] < 32) continue;
    sums[0] += data[i]; sums[1] += data[i + 1]; sums[2] += data[i + 2]; count++;
  }
  return count ? sums.map(v => v / count) : [255, 255, 255];
}

async function analyze(image, threshold, alphaOnly = false) {
  const { data, info } = await image.clone().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bg = cornerBackground(data, info);
  const points = [];
  let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
  const stride = Math.max(1, Math.floor(Math.max(info.width, info.height) / 1000));
  const threshold2 = threshold * threshold;
  for (let y = 0; y < info.height; y += stride) for (let x = 0; x < info.width; x += stride) {
    const i = (y * info.width + x) * 4;
    const alpha = data[i + 3];
    const dr = data[i] - bg[0], dg = data[i + 1] - bg[1], db = data[i + 2] - bg[2];
    const foreground = alpha > 20 && (alphaOnly ? alpha > 80 : (alpha < 245 || dr * dr + dg * dg + db * db > threshold2));
    if (!foreground) continue;
    points.push([x, y]);
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (points.length < 20) throw new Error('Could not detect a product. Try lowering --threshold or use a transparent background.');
  let mx = 0, my = 0;
  for (const [x, y] of points) { mx += x; my += y; }
  mx /= points.length; my /= points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const [x, y] of points) { const dx = x - mx, dy = y - my; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy) * 180 / Math.PI;
  return { angle, bbox: { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

function parseBackground(value) {
  if (value === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  if (value === 'white') return { r: 255, g: 255, b: 255, alpha: 1 };
  if (/^#[0-9a-f]{6}$/i.test(value)) return {
    r: parseInt(value.slice(1, 3), 16), g: parseInt(value.slice(3, 5), 16), b: parseInt(value.slice(5, 7), 16), alpha: 1,
  };
  throw new Error('background must be white, transparent, or #RRGGBB.');
}

function outputName(file, opts) {
  const ext = opts.format === 'keep' ? path.extname(file).slice(1).toLowerCase().replace('jpeg', 'jpg') : opts.format.replace('jpeg', 'jpg');
  return `${path.basename(file, path.extname(file))}.${ext}`;
}

async function encode(image, format, quality, sourceExt) {
  const resolved = format === 'keep' ? sourceExt.slice(1).toLowerCase() : format;
  if (resolved === 'jpg' || resolved === 'jpeg') return image.jpeg({ quality, chromaSubsampling: '4:4:4' });
  if (resolved === 'webp') return image.webp({ quality });
  if (resolved === 'avif') return image.avif({ quality });
  return image.png({ compressionLevel: 9 });
}

async function processOne(file, opts) {
  const base = sharp(file, { failOn: 'error' }).rotate().ensureAlpha();
  const initial = await analyze(base, opts.threshold);
  let targetAngle = opts.orientation === 'horizontal' ? 0 : 90;
  let rotation = targetAngle - initial.angle;
  while (rotation > 90) rotation -= 180;
  while (rotation < -90) rotation += 180;

  const rotated = base.extend({ top: opts.padding, bottom: opts.padding, left: opts.padding, right: opts.padding, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  const rotatedBuffer = await rotated.png().toBuffer();
  const measured = await analyze(sharp(rotatedBuffer), opts.threshold, true);
  const extracted = sharp(rotatedBuffer).extract(measured.bbox);
  const maxWidth = Math.max(1, Math.round(opts.width * opts.occupancy));
  const maxHeight = Math.max(1, Math.round(opts.height * opts.occupancy));
  const fitted = await extracted.resize(maxWidth, maxHeight, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
  const meta = await sharp(fitted).metadata();
  const left = Math.floor((opts.width - meta.width) / 2);
  const top = Math.floor((opts.height - meta.height) / 2);
  const canvas = sharp({ create: { width: opts.width, height: opts.height, channels: 4, background: parseBackground(opts.background) } })
    .composite([{ input: fitted, left, top }]);
  const relative = path.relative(opts.input, file);
  const outDir = path.join(opts.output, path.dirname(relative));
  const outFile = path.join(outDir, outputName(file, opts));
  if (!opts.dryRun) {
    await fs.mkdir(outDir, { recursive: true });
    const encoded = await encode(canvas, opts.format, opts.quality, path.extname(file));
    await encoded.toFile(outFile);
  }
  return { file: relative, angle: initial.angle, correction: rotation, output: outFile };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { help(); return; }
  if (opts.input === opts.output) throw new Error('Input and output directories must be different.');
  parseBackground(opts.background);
  const files = await listImages(opts.input, opts.recursive);
  if (!files.length) throw new Error('No supported image files found.');
  console.log(`Found ${files.length} image(s).`);
  let failed = 0;
  for (const [index, file] of files.entries()) {
    try {
      const result = await processOne(file, opts);
      console.log(`[${index + 1}/${files.length}] ${result.file}  angle=${result.angle.toFixed(2)}° correction=${result.correction.toFixed(2)}°`);
    } catch (error) {
      failed++;
      console.error(`[${index + 1}/${files.length}] FAILED ${path.relative(opts.input, file)}: ${error.message}`);
    }
  }
  if (failed) process.exitCode = 1;
  console.log(`${opts.dryRun ? 'Analyzed' : 'Completed'}: ${files.length - failed}, failed: ${failed}`);
}

main().catch(error => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
