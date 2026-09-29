'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const template = fs.readFileSync(path.join(__dirname, '../app/templates/payment-waiting.html'), 'utf8');
const scripts = [...template.matchAll(/<script src="\/static\/js\/((?:payment-waiting|payment-waiting\/[\w-]+)\.js)/g)].map(match => match[1]);
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('cashier page loads the shared core first, then each slice once', () => {
    assert.deepEqual(scripts, ['payment-waiting.js', ...['list', 'detail', 'services', 'invoice', 'output'].map(name => `payment-waiting/${name}.js`)]);
});

test('cashier slices stay small and only declare at top level', () => {
    for (const file of scripts) {
        const source = read(file);
        assert.ok(source.split('\n').length <= 600, file);
        for (const line of source.split('\n').filter(item => /^[^\s/}*]/.test(item))) {
            assert.match(line, /^(?:async\s+)?function |^(?:let|const) |^\$\(document\)\.ready\(/, `${file}: ${line}`);
        }
    }
    assert.match(read('payment-waiting.js'), /window\.QLPKUserFeedback\?\.show\(type, message\)/);
});

test('top-level names are declared by exactly one cashier slice', () => {
    const owners = new Map();
    for (const file of scripts) {
        for (const match of read(file).matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:let|const)\s+(\w+)/gm)) {
            const name = match[1] || match[2];
            assert.equal(owners.get(name), undefined, `${name} declared in ${owners.get(name)} and ${file}`);
            owners.set(name, file);
        }
    }
});
