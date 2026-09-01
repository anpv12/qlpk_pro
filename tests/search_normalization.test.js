'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'app/static/js/shared/search-normalization.js'),
  'utf8'
);

const window = {};
vm.runInNewContext(source, { window });

const helper = window.QLPKSearchNormalization;
assert.ok(helper);
assert.equal(helper.normalizeSearchText('Đạt'), 'dat');
assert.equal(helper.normalizeSearchText('đạt'), 'dat');
assert.equal(helper.normalizeSearchText('ĐẠT'), 'dat');
assert.equal(helper.contains('Ngô Hiển Đạt', 'dat'), true);
assert.equal(helper.contains('Ngô Hiển Đạt', 'ĐẠT'), true);
assert.equal(helper.contains('Ngô Hiển Đạt', 'xyz'), false);

console.log('shared search normalization: ok');
