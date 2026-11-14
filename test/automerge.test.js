'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { groupFiles } = require('../image/automerge');
test('dynamic suffix order and missing middle image', () => {
  const groups = groupFiles(['/x/상품명A상단.png','/x/상품명A하단.png','/x/상품명B상단.png','/x/상품명B중단.png','/x/상품명B하단.png'], '상품명', ['상단','중단','하단']);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find(g => g.model === '상품명A').parts.map(p => p.length), [1,0,1]);
  assert.deepEqual(groups.find(g => g.model === '상품명B').parts.map(p => p.length), [1,1,1]);
});
test('custom suffixes are not hardcoded', () => {
  const groups = groupFiles(['/x/제품A머리.png','/x/제품A꼬리.png'], '제품', ['머리','몸통','꼬리']);
  assert.deepEqual(groups[0].parts.map(p => p.length), [1,0,1]);
});