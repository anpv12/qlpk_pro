'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

const window = {};
runScriptFile(path.join(__dirname, '..', 'app/static/js/shared/search-normalization.js'), vm.createContext({ window }));

const helper = window.QLPKSearchNormalization;
assert.ok(helper);
assert.equal(helper.normalizeSearchText('Đạt'), 'dat');
assert.equal(helper.normalizeSearchText('đạt'), 'dat');
assert.equal(helper.normalizeSearchText('ĐẠT'), 'dat');
assert.equal(helper.contains('Ngô Hiển Đạt', 'dat'), true);
assert.equal(helper.contains('Ngô Hiển Đạt', 'ĐẠT'), true);
assert.equal(helper.contains('Ngô Hiển Đạt', 'xyz'), false);

console.log('shared search normalization: ok');
