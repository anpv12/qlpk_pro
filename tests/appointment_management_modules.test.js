'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const template = fs.readFileSync(path.join(__dirname, '../app/templates/appointment-management.html'), 'utf8');
const SLICES = ['data', 'view', 'calendar', 'edit-modal', 'editor', 'add-modal', 'busy-sync'].map(name => `appointment-management/page-${name}.js`);
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('page slices load after the shared utils and before the page entry', () => {
    const scripts = [...template.matchAll(/<script src="\/static\/js\/([^"?]+)/g)].map(match => match[1]);
    const entry = scripts.indexOf('appointment-management.js');
    assert.deepEqual(scripts.slice(entry - SLICES.length, entry), SLICES);
    assert.ok(scripts.indexOf('appointment-management/page-interactions-utils.js') < entry - SLICES.length);
});

test('entry and slices stay under 600 lines and slices only install functions', () => {
    for (const file of ['appointment-management.js', ...SLICES]) {
        assert.ok(read(file).split('\n').length <= 600, file);
    }
    for (const file of SLICES) {
        const source = read(file);
        assert.match(source, /^\/\/ .+\n\/\/ .+\n\(function \(window\) \{\n\tconst page = window\.AppointmentManagementPage \|\| \(window\.AppointmentManagementPage = \{ state: \{\} \}\);\n/, file);
        assert.match(source, /\n\tObject\.assign\(page, \{\n[\s\S]+\n\t\}\);\n\}\)\(window\);\n$/, file);
        assert.doesNotMatch(source, /\$\(document\)\.(?:on|off|ready)\(|\$\(function/, file);
    }
});

test('every page.<name> reference is installed by exactly one slice', () => {
    const owners = new Map();
    for (const file of SLICES) {
        const block = read(file).match(/\n\tObject\.assign\(page, \{\n([\s\S]+?)\n\t\}\);/)[1];
        for (const name of block.split(',').map(item => item.trim()).filter(Boolean)) {
            assert.equal(owners.get(name), undefined, `${name} in ${owners.get(name)} and ${file}`);
            assert.match(read(file), new RegExp(`\\n\\t(?:async )?function ${name}\\(`), `${file} declares ${name}`);
            owners.set(name, file);
        }
    }
    for (const file of ['appointment-management.js', ...SLICES]) {
        for (const match of read(file).matchAll(/\bpage\.(\w+)/g)) {
            if (match[1] === 'state') continue;
            assert.ok(owners.has(match[1]), `${file}: page.${match[1]} is not installed`);
        }
    }
});

test('shared page state is initialised once by the entry', () => {
    const entry = read('appointment-management.js');
    const init = entry.match(/Object\.assign\(state, \{\n([\s\S]+?)\n\t\}\);/)[1];
    const names = init.split('\n').map(line => line.trim().split(':')[0]);
    for (const file of ['appointment-management.js', ...SLICES]) {
        for (const match of read(file).matchAll(/\bstate\.(\w+)/g)) {
            assert.ok(names.includes(match[1]), `${file}: state.${match[1]} is not initialised`);
        }
    }
});
