'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
const { readCssSource, stylesheetOwner } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');

const template = readTemplateSource('medicine-management.html');
const css = readCssSource(path.join(__dirname, '../app/static/css/pages/medicine-management.css'));

test('stock receipt count uses the user-approved brand badge rather than neutral action styling', () => {
    const source = readMedicineManagementSource();
    const badge = source.match(/<button[^>]*class="badge stock-detail-badge"[^>]*>/)?.[0];
    assert.ok(badge);
    assert.doesNotMatch(badge, /data-qlpk-button/);
    assert.match(badge, /data-qlpk-call="showStockDetail" data-qlpk-args='\[\$\{medicine\.id\}\]'/);
    assert.match(css, /\.badge\.stock-detail-badge[^{}]*\{\s*background: var\(--qlpk-workflow-context-header-bg\)/);
});

test('medicine toolbar keeps geometry classes and declares semantic action roles', () => {
    const roles = { addMedicineBtn: 'execute', importWarehouseBtn: 'execute', exportDataBtn: 'neutral', searchBtn: 'view' };
    for (const id of ['addMedicineBtn', 'importWarehouseBtn', 'exportDataBtn', 'searchBtn']) {
        const button = template.match(new RegExp(`<button\\b[^>]*id="${id}"[^>]*>`))?.[0];
        assert.ok(button, id);
        assert.ok(button.includes(`data-qlpk-button="${roles[id]}"`));
        const classes = button.match(/class="([^"]*)"/)[1].split(/\s+/);
        assert.ok(classes.includes('btn-primary'), id);
        assert.ok(!classes.includes('mm-action-secondary'), id);
        assert.ok(!classes.includes('btn-outline-primary'), id);
        assert.doesNotMatch(button, /\bdisabled\b/);
    }
    assert.doesNotMatch(css, /\.mm-action-row\s+\.btn-outline-primary/);
});

test('the modal cancel action retains its secondary style', () => {
    assert.match(template, /class="btn btn-primary mm-action-secondary" data-bs-dismiss="modal">Hủy/);
    assert.match(template, /<button data-qlpk-button="neutral"[^>]*class="btn btn-primary mm-action-secondary"/);
});

test('medicine actions use shared button colors while navigation retains brand gradient', () => {
    assert.doesNotMatch(css, /--qlpk-color-primary(?:-strong|-rgb)?\s*:/);
    assert.match(css, /\.medicine-management-page \.page-item\.active \.page-link\s*\{\s*background-image:\s*var\(--qlpk-workflow-context-header-bg\)/);
    const actions = fs.readFileSync(path.join(__dirname, '../app/static/css/shared/button-actions.css'), 'utf8');
    assert.match(actions, /--qlpk-action-color: var\(--qlpk-button-primary-bg\)/);
    assert.doesNotMatch(css, /background(?:-color)?:\s*var\(--qlpk-color-primary\)/);
    assert.doesNotMatch(css, /\.btn\.mm-action-price\s*\{/);
    assert.match(css, /\.form-check-input:indeterminate\s*\{\s*background-image:\s*var\(--bs-form-check-bg-image\),\s*var\(--qlpk-workflow-context-header-bg\)/);
    const brand = fs.readFileSync(path.join(__dirname, '../app/static/css/shared/bootstrap-brand.css'), 'utf8');
    assert.match(brand, /--bs-btn-bg:\s*var\(--qlpk-color-primary\)/);
    assert.match(brand, /--bs-btn-disabled-bg:\s*var\(--qlpk-color-primary\)/);
    assert.match(brand, /--bs-btn-hover-bg:\s*var\(--qlpk-color-primary-strong\)/);
    assert.match(brand, /--bs-btn-active-bg:\s*var\(--qlpk-color-primary-strong\)/);
    assert.match(brand, /--bs-btn-focus-shadow-rgb:\s*var\(--qlpk-color-primary-rgb\)/);
});

test('the shared gradient has one owner available without loading the doctor queue stylesheet', () => {
    const root = path.join(__dirname, '../app/static/css');
    const tokens = readCssSource(path.join(root, 'shared/color-tokens.css'));
    const queue = readCssSource(path.join(root, 'components/waiting-queue-card.css'));
    const header = readCssSource(path.join(root, 'components/app-header.css'));
    const doctor = readCssSource(path.join(root, 'pages/doctor-examination.css'));
    const gradient = tokens.match(/--qlpk-workflow-context-header-bg:\s*([^;]+);/)?.[1];
    assert.ok(gradient);
    assert.ok(header.includes(`background: ${gradient};`));
    assert.match(doctor, /background:\s*var\(--qlpk-workflow-context-header-bg,/);
    assert.doesNotMatch(queue, /--qlpk-workflow-context-header-bg\s*:/);
    assert.doesNotMatch(css, /--qlpk-workflow-context-header-bg\s*:/);
    for (const filename of fs.readdirSync(root, { recursive: true }).filter(name => name.endsWith('.css') && stylesheetOwner(root, name) !== 'shared/color-tokens.css')) {
        assert.doesNotMatch(fs.readFileSync(path.join(root, filename), 'utf8'), /--qlpk-workflow-context-header-bg\s*:/, filename);
    }
    // The page itself (not a partial) opts into the shared brand theme.
    assert.match(fs.readFileSync(path.join(__dirname, '../app/templates/medicine-management.html'), 'utf8'), /include 'partials\/brand-theme.html'/);
});

test('medicine gradients are never used as text, border or shadow colors', () => {
    for (const [, property, value] of css.matchAll(/(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]+)/g)) {
        if (!/var\(--(?:qlpk-workflow-context-header-bg|mm-import-header-bg)\)/.test(value)) continue;
        assert.ok(['background', 'background-image', '--mm-import-header-bg'].includes(property), property);
    }
});

test('confirmed DAV borders use success tokens without changing badge backgrounds', () => {
    const variant = css.match(/\.mm-reference-button\.text-success\s*\{([^}]+)\}/)?.[1];
    assert.ok(variant);
    assert.match(variant, /--mm-badge-border-color:\s*rgba\(var\(--qlpk-feedback-success-rgb\),\s*\.4\)/);
    assert.match(variant, /--mm-badge-active-border-color:\s*var\(--qlpk-feedback-success\)/);
    assert.doesNotMatch(variant, /(?:background|padding|font-size)\s*:/);
    assert.match(css, /border:\s*1px solid var\(--mm-badge-border-color,\s*var\(--qlpk-brown-200\)\)/);
    for (const property of ['border-color', 'outline']) {
        const stateRule = css.match(/\.stock-detail-badge:hover[^{}]*,\s*\.medicine-management-page \.stock-detail-badge:focus-visible[^{}]*\{([^}]+)\}/)?.[1];
        assert.ok(stateRule);
        assert.match(stateRule, new RegExp(`${property}:\\s*(?:1px solid )?var\\(--mm-badge-active-border-color,\\s*var\\(--qlpk-color-primary\\)\\)`));
    }
});
