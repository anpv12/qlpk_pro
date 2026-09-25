'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../app/static/css/shared/feedback-tokens.css'), 'utf8');

test('shared and legacy semantic status badges keep their intrinsic single-line width', () => {
    const rule = css.match(/\.qlpk-status,\s*\.badge:is\([^}]+\)\s*\{([^}]+)\}/);
    assert.ok(rule);
    assert.match(rule[1], /white-space:\s*nowrap;/);
    assert.match(rule[1], /flex-shrink:\s*0;/);
    assert.doesNotMatch(rule[1], /max-inline-size:|text-overflow:|overflow:\s*hidden/);
    assert.match(rule[1], /font-size:\s*var\(--qlpk-font-size-base, 13px\)/);
    assert.match(rule[1], /padding:\s*var\(--qlpk-status-padding\)/);
});
