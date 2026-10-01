'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JS_ROOT, pageModuleScripts } = require('./helpers/module-graph');

const template = fs.readFileSync(path.join(__dirname, '../app/templates/payment-waiting.html'), 'utf8');
const scripts = pageModuleScripts('payment-waiting.html', 'payment-waiting.js');
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('cashier page is one ES module entry that reaches every slice once, without jQuery', () => {
    assert.equal(scripts[0], 'payment-waiting.js');
    const slices = ['state', 'list', 'detail', 'services', 'services-parts/financials', 'invoice', 'output'].map(name => `payment-waiting/${name}.js`);
    const pageScripts = scripts.filter(file => file.startsWith('payment-waiting'));
    assert.deepEqual([...pageScripts].sort(), ['payment-waiting.js', ...slices].sort());
    assert.doesNotMatch(template, /<script src="\/static\/js\/payment-waiting/);
    assert.doesNotMatch(template, /jquery/i);
    assert.match(template, /\{% include 'partials\/payment-invoice-form-template\.html' %\}/);
});

test('cashier slices stay small and only declare at top level (bootstrap lives in the entry)', () => {
    for (const file of scripts.filter(item => item.startsWith('payment-waiting'))) {
        const source = read(file);
        assert.ok(source.split('\n').length <= 500, file);
        assert.doesNotMatch(source, /\$\(|\$\.ajax|\.innerHTML\b/, file);
        const allowed = file === 'payment-waiting.js'
            ? /^(?:async\s+)?function |^(?:let|const) |^import |^export |^state\.\w+ = |^document\.addEventListener\('DOMContentLoaded', \(\) => \{$/
            : /^(?:async\s+)?function |^(?:let|const) |^import |^export /;
        for (const line of source.split('\n').filter(item => /^[^\s/}*]/.test(item))) {
            assert.match(line, allowed, `${file}: ${line}`);
        }
    }
    assert.match(read('payment-waiting.js'), /window\.QLPKUserFeedback\?\.show\(type, message\)/);
});

test('top-level names are declared by exactly one cashier slice', () => {
    const owners = new Map();
    for (const file of scripts.filter(item => item.startsWith('payment-waiting'))) {
        for (const match of read(file).matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:let|const)\s+(\w+)/gm)) {
            const name = match[1] || match[2];
            assert.equal(owners.get(name), undefined, `${name} declared in ${owners.get(name)} and ${file}`);
            owners.set(name, file);
        }
    }
});
