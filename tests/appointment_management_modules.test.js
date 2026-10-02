'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JS_ROOT, pageModuleScripts } = require('./helpers/module-graph');

const template = fs.readFileSync(path.join(__dirname, '../app/templates/appointment-management.html'), 'utf8');
const scripts = pageModuleScripts('appointment-management.html', 'appointment-management.js')
    .filter(file => file === 'appointment-management.js' || file.startsWith('appointment-management/'));
const read = file => fs.readFileSync(path.join(JS_ROOT, file), 'utf8');

test('appointment page is one ES module entry reaching every page slice, without jQuery', () => {
    assert.equal(scripts[0], 'appointment-management.js');
    const onDisk = fs.readdirSync(path.join(JS_ROOT, 'appointment-management')).map(name => `appointment-management/${name}`);
    assert.deepEqual(onDisk.filter(file => !scripts.includes(file)), []);
    assert.doesNotMatch(template, /jquery|<script src="\/static\/js\/appointment-management/i);
    assert.match(template, /<script type="module" src="\/static\/js\/appointment-management\.js/);
});

test('slices stay small, use native DOM and keep no window namespace', () => {
    for (const file of scripts) {
        const source = read(file);
        assert.ok(source.split('\n').length <= 500, file);
        assert.doesNotMatch(source, /\$\(|\$\.ajax|\bjQuery\b|\.innerHTML\b|insertAdjacentHTML/, file);
        assert.doesNotMatch(source, /window\.AppointmentManagement\w*|window\.(?:openAddAppointmentWithDate|notifyBusyScheduleChanged|calendar)\b/, file);
    }
});

test('shared page state is initialised once by the entry', () => {
    const entry = read('appointment-management.js');
    const init = entry.match(/Object\.assign\(state, \{\n([\s\S]+?)\n\}\);/)[1];
    const names = init.split('\n').map(line => line.trim().split(':')[0]);
    for (const file of scripts) {
        for (const match of read(file).matchAll(/(?<![\w-])state\.(\w+)(?!\.js)/g)) {
            assert.ok(names.includes(match[1]), `${file}: state.${match[1]} is not initialised`);
        }
    }
});
