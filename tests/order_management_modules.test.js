'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { orderManagementScripts } = require('./helpers/order-management-source');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const scripts = orderManagementScripts();
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('order page loads the shared core first, then each slice once, init last', () => {
    assert.deepEqual(scripts, ['order-management.js', ...['detail', 'survey', 'survey-results', 'files', 'actions', 'init', 'survey-level']
        .map(name => `orders/order-management-${name}.js`)]);
});

test('order slices stay small and only declare at top level (bootstrap lives in the last slice)', () => {
    for (const file of scripts) {
        const source = read(file);
        assert.ok(source.split('\n').length <= 600, file);
        const topLevel = source.split('\n').filter(line => /^[^\s/}*]/.test(line));
        const allowed = file.endsWith('survey-level.js')
            ? /^(?:async\s+)?function |^(?:let|const) |^window\.updateLevelInputAlignment = function|^if \(document\.readyState === 'loading'\) \{|^\} else \{/
            : /^(?:async\s+)?function |^(?:let|const) /;
        for (const line of topLevel) assert.match(line, allowed, `${file}: ${line}`);
    }
    assert.match(read(scripts[scripts.length - 1]), /if \(document\.readyState === 'loading'\) \{\n\s*document\.addEventListener\('DOMContentLoaded', initializePage\)/);
});

test('top-level names are declared by exactly one order slice', () => {
    const owners = new Map();
    for (const file of scripts) {
        for (const match of read(file).matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:let|const)\s+(\w+)/gm)) {
            const name = match[1] || match[2];
            assert.equal(owners.get(name), undefined, `${name} declared in ${owners.get(name)} and ${file}`);
            owners.set(name, file);
        }
    }
});
