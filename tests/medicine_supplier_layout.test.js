'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { importFresh } = require('./helpers/fresh-esm');
const { installDom } = require('./helpers/fake-dom');
const { readCssSource } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');

const template = readTemplateSource('medicine-management.html');
const css = readCssSource(path.join(__dirname, '../app/static/css/pages/medicine-management.css'));
const supplierMarkup = template.slice(template.indexOf('id="supplierManagementModal"'), template.indexOf('<!-- Flatpickr JS -->'));

test('supplier modal owns full available height and no longer uses a fixed table height deduction', () => {
    assert.match(css, /\.modal\.qlpk-supplier-management-modal \.modal-dialog\s*\{[^}]*height:\s*calc\(100dvh - 1rem\)/);
    assert.match(css, /\.modal\.qlpk-supplier-management-modal \.modal-content\s*\{[^}]*height:\s*100%/);
    assert.match(css, /\.modal\.qlpk-supplier-management-modal \.modal-body\s*\{[^}]*min-height:\s*0/);
    assert.match(supplierMarkup, /class="mm-supplier-list mb-2"/);
    assert.match(supplierMarkup, /class="table-responsive mm-supplier-table-scroll"/);
    assert.doesNotMatch(template + css, /mm-scroll-100vh-500/);
});

test('supplier table takes remaining desktop space while compact screens retain body scrolling', () => {
    const breakpoint = css.indexOf('@media (min-width: 48rem) and (min-height: 45rem)');
    assert.notEqual(breakpoint, -1);
    const desktop = css.slice(breakpoint, css.indexOf('.medicine-management-page .mm-scroll-100vh-400', breakpoint));
    assert.match(desktop, /\.modal\.qlpk-supplier-management-modal \.modal-body\s*\{[^}]*display:\s*flex;[^}]*overflow:\s*hidden/);
    for (const selector of ['mm-supplier-list', 'mm-supplier-table-scroll']) {
        assert.match(desktop, new RegExp(`\\.${selector}\\s*\\{[^}]*flex:\\s*1 1 0`));
    }
    assert.match(css, /\.modal-body\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(supplierMarkup, /mm-supplier-toolbar[^\"]*flex-wrap/);
    assert.match(supplierMarkup, /mm-supplier-filters[^\"]*flex-wrap/);
    assert.doesNotMatch(supplierMarkup, /mm-w-250|mm-w-150" id="supplierStatusFilter"/);
});

test('supplier status and action columns use intrinsic content width while name and address take spare space', async () => {
    installDom({ html: '<table><tbody id="supplierTableBody"></tbody></table>' });
    const { renderSuppliersTable } = await importFresh('medicines/management-suppliers.js');
    renderSuppliersTable([{ id: 3, name: 'NCC A', is_active: 1 }, { id: 4, name: 'NCC B', is_active: 0 }]);
    const rows = document.querySelectorAll('#supplierTableBody tr');
    assert.deepEqual([...rows].map(row => row.querySelector('.mm-supplier-status-cell .badge').textContent), ['Đang hoạt động', 'Ngừng hoạt động']);
    assert.equal(rows[0].querySelector('.mm-supplier-status-cell .badge').className, 'badge qlpk-status--success');
    assert.equal(rows[0].querySelectorAll('.mm-supplier-actions-cell button').length, 3);
    assert.equal(rows[0].querySelector('.mm-supplier-actions-cell button').title, 'Chọn cho đơn nhập kho');
    assert.match(supplierMarkup, /<th class="mm-supplier-status-cell">Trạng thái<\/th>/);
    const compactColumns = css.match(/\.mm-supplier-status-cell,\s*\.medicine-management-page \.mm-supplier-actions-cell\s*\{([^}]+)\}/);
    assert.ok(compactColumns);
    assert.match(compactColumns[1], /width:\s*0;[^}]*white-space:\s*nowrap/);
    assert.doesNotMatch(compactColumns[1], /min-width:|max-width:|\d(?:rem|px|%)/);
    assert.match(supplierMarkup, /<th>Tên nhà cung cấp<\/th>/);
    assert.match(supplierMarkup, /<th>Địa chỉ<\/th>/);
    assert.match(css, /\.mm-supplier-table-scroll :is\(th, td\)\s*\{[^}]*vertical-align:\s*middle/);
    assert.match(css, /\.mm-supplier-table-scroll\s*\{[^}]*overflow:\s*auto/);
    assert.match(supplierMarkup, /<th class="mm-supplier-actions-cell">Tác vụ<\/th>/);
});

test('shared sticky headers do not paint below their cells over the first data row', () => {
    const header = css.match(/\.mm-sticky-head th\s*\{([^}]+)\}/);
    assert.ok(header);
    assert.match(header[1], /position:\s*sticky;/);
    assert.match(header[1], /top:\s*0;/);
    assert.match(header[1], /box-shadow:\s*inset[^;,]+;/);
    assert.doesNotMatch(css, /\.mm-sticky-head th::(?:before|after)/);
    assert.match(supplierMarkup, /<thead class="mm-sticky-head">/);
    const importMarkup = template.slice(template.indexOf('id="batchImportTable"'), template.indexOf('id="batchImportTableBody"'));
    assert.match(importMarkup, /<thead class="mm-sticky-head">/);
});
