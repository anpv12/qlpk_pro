'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { orderManagementScripts } = require('./helpers/order-management-source');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const scripts = orderManagementScripts();
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('order page is one ES module entry that reaches every slice once', () => {
    assert.equal(scripts[0], 'order-management.js');
    const slices = ['state', 'detail', 'survey', 'survey-results', 'files', 'actions', 'init', 'survey-level'].map(name => `orders/order-management-${name}.js`);
    assert.deepEqual([...scripts].sort(), ['order-management.js', ...slices].sort());
});

test('order slices stay small and only declare at top level (bootstrap lives in the entry)', () => {
    for (const file of scripts) {
        const source = read(file);
        assert.ok(source.split('\n').length <= 500, file);
        const topLevel = source.split('\n').filter(line => /^[^\s/}*]/.test(line));
        const allowed = file === 'order-management.js'
            ? /^(?:async\s+)?function |^(?:let|const) |^import |^export |^state\.\w+ = |^document\.addEventListener\('DOMContentLoaded', initializePage\);$/
            : /^(?:async\s+)?function |^(?:let|const) |^import |^export |^state\.\w+ = |^window\.QLPKInlineActions\.register\(/;
        for (const line of topLevel) assert.match(line, allowed, `${file}: ${line}`);
    }
    assert.match(read('order-management.js'), /\ndocument\.addEventListener\('DOMContentLoaded', initializePage\);\n$/);
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
