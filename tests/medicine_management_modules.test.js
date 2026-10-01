'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { medicineManagementScripts } = require('./helpers/medicine-management-source');
const { importFresh } = require('./helpers/fresh-esm');
const { installDom } = require('./helpers/fake-dom');

const JS_ROOT = path.join(__dirname, '../app/static/js');
const scripts = medicineManagementScripts();
const template = fs.readFileSync(path.join(__dirname, '../app/templates/medicine-management.html'), 'utf8');

test('medicine page is one ES module entry that reaches every management slice once, without jQuery', () => {
    assert.equal(scripts[0], 'medicine-management.js');
    assert.deepEqual([...scripts].sort(), [
        'medicine-management.js',
        'medicines/clinic-catalog.js',
        'medicines/inventory-overlay.js',
        'medicines/management-batch-import-parts/batch-totals.js',
        'medicines/management-batch-import.js',
        'medicines/management-form.js',
        'medicines/management-import-ledger.js',
        'medicines/management-list.js',
        'medicines/management-overview.js',
        'medicines/management-state.js',
        'medicines/management-stock.js',
        'medicines/management-suppliers.js',
        'medicines/price-editor.js',
        'medicines/reference-review.js',
    ]);
    assert.doesNotMatch(template, /jquery|<script src="\/static\/js\/(?:medicine-management|medicines\/)/i);
});

test('management slices stay small, avoid jQuery/HTML strings and only declare at top level', () => {
    for (const file of scripts) {
        const source = fs.readFileSync(path.join(JS_ROOT, file), 'utf8');
        assert.ok(source.split('\n').length <= 500, file);
        assert.doesNotMatch(source, /\$\(|\$\.ajax|\.innerHTML\b|insertAdjacentHTML|data-qlpk-call/, file);
        const topLevel = source.split('\n').filter(line => /^[^\s/}*]/.test(line));
        for (const line of topLevel) {
            assert.match(line, /^(?:async\s+)?function |^(?:let|const) |^import |^export |^state\.\w+ = |^document\.addEventListener\('DOMContentLoaded', \(\) => \{$/, `${file}: ${line}`);
        }
    }
});

test('top-level names are declared by exactly one management slice', () => {
    const owners = new Map();
    for (const file of scripts.filter(name => name.startsWith('medicine-management') || name.includes('/management-'))) {
        const source = fs.readFileSync(path.join(JS_ROOT, file), 'utf8');
        for (const match of source.matchAll(/^(?:async\s+)?function\s+(\w+)|^(?:let|const)\s+(\w+)/gm)) {
            const name = match[1] || match[2];
            assert.equal(owners.get(name), undefined, `${name} declared in ${owners.get(name)} and ${file}`);
            owners.set(name, file);
        }
    }
});

test('bulk delete button is revealed through the mm-hidden class, not an inline display that !important overrides', async () => {
    installDom({ html: `<button id="deleteSelectedBtn" class="mm-hidden"></button><button id="confirmBulkDeleteBtn"></button>
        <input type="checkbox" id="selectAllCheckbox"><table id="medicineTable"><tbody>
        <tr><td><input type="checkbox" class="medicine-checkbox" value="1"></td></tr>
        <tr><td><input type="checkbox" class="medicine-checkbox" value="2"></td></tr></tbody></table>` });
    const list = await importFresh('medicines/management-list.js');
    list.bindMedicineSelection();
    const [first, second] = document.querySelectorAll('.medicine-checkbox');
    const button = document.getElementById('deleteSelectedBtn');
    first.checked = true;
    first.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(button.classList.contains('mm-hidden'), false);
    assert.equal(document.getElementById('selectAllCheckbox').checked, false);
    second.checked = true;
    second.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(document.getElementById('selectAllCheckbox').checked, true);
    const selectAll = document.getElementById('selectAllCheckbox');
    selectAll.checked = false;
    selectAll.dispatchEvent(new Event('change', { bubbles: true }));
    assert.equal(first.checked || second.checked, false);
    assert.equal(button.classList.contains('mm-hidden'), true);
    assert.equal(button.getAttribute('style'), null);
});
