'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { medicineManagementScripts } = require('./helpers/medicine-management-source');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const scripts = medicineManagementScripts();

test('medicine page loads the shared core first, then each management slice once', () => {
    assert.deepEqual(scripts, [
        'medicine-management.js',
        'medicines/management-list.js',
        'medicines/management-form.js',
        'medicines/management-stock.js',
        'medicines/management-batch-import.js',
        'medicines/management-suppliers.js',
        'medicines/management-overview.js',
        'medicines/management-import-ledger.js',
    ]);
});

test('management slices stay small and only declare at top level', () => {
    for (const file of scripts) {
        const source = fs.readFileSync(path.join(JS_ROOT, file), 'utf8');
        assert.ok(source.split('\n').length <= 600, file);
        const topLevel = source.split('\n').filter(line => /^[^\s/}*]/.test(line));
        for (const line of topLevel) {
            assert.match(line, /^(?:async\s+)?function |^(?:let|const) |^\$\(document\)\.ready\(/, `${file}: ${line}`);
        }
    }
});

test('top-level names are declared by exactly one management slice', () => {
    const owners = new Map();
    for (const file of scripts) {
        const source = fs.readFileSync(path.join(JS_ROOT, file), 'utf8');
        for (const match of source.matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:let|const)\s+(\w+)/gm)) {
            const name = match[1] || match[2];
            assert.equal(owners.get(name), undefined, `${name} declared in ${owners.get(name)} and ${file}`);
            owners.set(name, file);
        }
    }
});

test('bulk delete button is revealed through the mm-hidden class, not an inline display that !important overrides', () => {
    const vm = require('node:vm');
    const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
    const source = readMedicineManagementSource();
    const slice = name => source.slice(source.indexOf(`function ${name}(`), source.indexOf('\n}', source.indexOf(`function ${name}(`)) + 2);
    const classes = new Set(['mm-hidden']);
    const button = { classList: { toggle: (name, force) => (force ? classes.add(name) : classes.delete(name)) } };
    let checked = 0;
    const context = vm.createContext({ document: { getElementById: id => (id === 'deleteSelectedBtn' ? button : null) }, $: () => ({ length: checked }) });
    vm.runInContext(slice('setElementVisible') + slice('toggleDeleteButton'), context);
    checked = 2; context.toggleDeleteButton();
    assert.equal(classes.has('mm-hidden'), false);
    checked = 0; context.toggleDeleteButton();
    assert.equal(classes.has('mm-hidden'), true);
});
