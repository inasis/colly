'use strict';

const PROG = 'colly';
const OUTPUT_DIR = 'output';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff', '.avif']);
const CROP_INPUT_EXT = new Set(['.png', '.jpg', '.jpeg']);
const WHITE_THRESHOLD = 245;
const WHITE_ROW_RATIO = 0.99;

module.exports = { PROG, OUTPUT_DIR, IMAGE_EXTENSIONS, CROP_INPUT_EXT, WHITE_THRESHOLD, WHITE_ROW_RATIO };