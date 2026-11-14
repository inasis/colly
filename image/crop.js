'use strict';

const { WHITE_THRESHOLD, WHITE_ROW_RATIO } = require('../core/constants');
function detectWhiteRows(data, width, height) {
  const rows = new Array(height);
  for (let y = 0; y < height; y++) {
    let white = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] === 0 || (data[i] >= WHITE_THRESHOLD && data[i + 1] >= WHITE_THRESHOLD && data[i + 2] >= WHITE_THRESHOLD)) white++;
    }
    rows[y] = white >= width * WHITE_ROW_RATIO;
  }
  return rows;
}
function findGaps(rows, height, minGap) {
  const gaps = [];
  let start = null;
  const close = end => { if (start !== null && end - start + 1 >= minGap) gaps.push({ start, end }); start = null; };
  for (let y = 0; y < height; y++) rows[y] ? (start ??= y) : close(y - 1);
  close(height - 1);
  return gaps;
}
function findSections(gaps, height) {
  const sections = [];
  let top = 0;
  for (const gap of gaps) {
    const h = gap.start - top;
    if (h > 1) sections.push({ top, height: h });
    top = gap.end + 1;
  }
  if (top < height) sections.push({ top, height: height - top });
  return sections;
}

module.exports = { detectWhiteRows, findGaps, findSections };