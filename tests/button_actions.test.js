'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const css = read('app/static/css/shared/button-actions.css');

test('shared action renderer uses explicit roles, not displayed labels', () => {
    const window = {};
    vm.runInNewContext(read('app/static/js/shared/icon-system.js'), { window });
    for (const [action, role] of Object.entries({ add: 'execute', save: 'execute', view: 'view', edit: 'edit', delete: 'danger', cancel: 'neutral', download: 'neutral' })) {
        const rendered = window.QLPKIconSystem.renderActionButton({ action, label: 'Arbitrary label' });
        assert.ok(rendered.includes(`data-qlpk-button="${role}"`));
        assert.ok(rendered.includes('data-qlpk-button-variant="soft"'));
    }
    assert.match(window.QLPKIconSystem.renderActionButton({ action: 'edit', buttonRole: 'view' }), /data-qlpk-button="view"/);
    assert.match(window.QLPKIconSystem.renderIconTextButton({ action: 'save' }), /data-qlpk-button-variant="soft"/);
    assert.match(window.QLPKIconSystem.renderIconTextButton({ action: 'save', buttonVariant: 'solid' }), /data-qlpk-button-variant="solid"/);
});

test('single color owner maps every role and preserves geometry', () => {
    assert.match(css, /\[data-qlpk-button="execute"\]\[data-qlpk-button-variant="solid"\]/);
    assert.match(css, /--qlpk-action-color: var\(--qlpk-button-primary-bg\)/);
    assert.match(css, /\[data-qlpk-button\]\s*\{[^}]*--qlpk-action-color: var\(--qlpk-action-secondary-bg\)/);
    assert.doesNotMatch(css, /background-image:\s*var\(--qlpk-workflow/);
    assert.doesNotMatch(css, /!important|(?:^|\n)\s*(?:height|width|padding|margin|font-size|display|border-radius)\s*:/);
    assert.match(css, /:focus-visible\s*\{[^}]*outline: var\(--qlpk-button-focus-width\)/);
    assert.match(css, /:is\(:disabled, \.disabled, \.is-disabled, \[aria-disabled="true"\]\)\s*\{[^}]*background-image: var\(--qlpk-button-disabled-image\)/);
    assert.match(read('app/templates/partials/brand-theme.html'), /shared\/button-actions\.css/);
});

test('approved header action hierarchy is explicit and preserves dark surfaces', () => {
    const doctor = read('app/templates/partials/doctor-clinical-workspace.html');
    for (const action of ['save', 'transfer']) {
        assert.match(doctor, new RegExp(`<button[^>]*data-qlpk-button-variant="soft"[^>]*data-doctor-workspace-action="${action}"`));
    }
    assert.match(doctor, /<button[^>]*data-qlpk-button-variant="solid"[^>]*data-doctor-workspace-action="complete"/);
    assert.match(doctor, /class="doctor-patient-hero" data-qlpk-button-surface="dark"/);
    assert.match(doctor, /class="doctor-clinical-form-card__header" data-qlpk-button-surface="dark"/);
    for (const [file, control] of [['appointment-management.html', 'syncCalendarBtn'], ['receptionist-new.html', 'uploadDocumentBtn'], ['medicine-management.html', 'importWarehouseBtn']]) {
        assert.match(read(`app/templates/${file}`), new RegExp(`<button[^>]*data-qlpk-button-variant="soft"[^>]*id="${control}"`));
    }
});

test('secondary buttons stay neutral on hover and no decorative borders return', () => {
    assert.match(css, /\[data-qlpk-button-surface="dark"\]\s*\{[^}]*--qlpk-action-secondary-bg: var\(--qlpk-button-on-dark-bg\)/);
    assert.match(css, /\[data-qlpk-button-surface="light"\]\s*\{[^}]*--qlpk-action-secondary-bg: var\(--qlpk-button-secondary-bg\)/);
    for (const [, value] of css.matchAll(/\n\s*border-color:\s*([^;]+);/g)) {
        assert.ok(['transparent', 'var(--qlpk-button-disabled-border)'].includes(value.trim()));
    }
    for (const [, value] of css.matchAll(/\n\s*box-shadow:\s*([^;]+);/g)) assert.equal(value.trim(), 'none');
    assert.doesNotMatch(css, /:is\(:hover, :focus-visible\)/);
});

test('medicine buttons keep non-action badges and navigation outside action colors', () => {
    const source = readMedicineManagementSource();
    const stockBadge = source.match(/<button\b[^>]*data-qlpk-call="showStockDetail"[^>]*>/)?.[0];
    assert.ok(stockBadge);
    assert.match(stockBadge, /type="button"/);
    assert.match(stockBadge, /class="badge stock-detail-badge"/);
    assert.match(stockBadge, /aria-label="[^"]+"/);
    assert.doesNotMatch(stockBadge, /data-qlpk-button/);
    assert.match(read('references/ui/button-system.md'), /badge số lần nhập[\s\S]*không gắn data-qlpk-button/);
    assert.match(source, /<button data-qlpk-button="edit"[^>]*editMedicine/);
    assert.match(source, /supplement\.dataset\.qlpkButton = 'edit'/);
    assert.doesNotMatch(source, /<button data-qlpk-button=[^>]*mm-reference-button/);
    const template = read('app/templates/medicine-management.html');
    assert.match(template, /<button data-qlpk-button="neutral"[^>]*id="exportDataBtn"/);
    assert.match(template, /<button data-qlpk-button="danger"[^>]*id="confirmDeleteBtn"/);
    assert.doesNotMatch(template, /<button data-qlpk-button=[^>]*role="tab"/);
});

test('legacy high-specificity color rules explicitly exclude migrated buttons', () => {
    for (const file of ['shared/bootstrap-brand.css', 'shared/admin-management-ui.css', 'pages/medicine-management.css', 'shared/icon-tokens.css']) {
        assert.ok(read(`app/static/css/${file}`).includes(':not([data-qlpk-button], [data-qlpk-button] *)'), file);
    }
});

test('button tokens have one owner and future designers are routed to the contract', () => {
    function inspect(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) inspect(file);
            else if (file.endsWith('.css') && !file.endsWith('shared/color-tokens.css')) {
                assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /--qlpk-button-[\w-]+\s*:/, file);
            }
        }
    }
    inspect(path.join(root, 'app/static/css'));
    for (const file of ['CONTEXT.md', 'rule.md', 'references/context-files.md', 'references/ui/brand-theme.md']) {
        assert.ok(read(file).includes('button-system.md'), file);
    }
});

test('shared confirmation uses explicit danger intent without inferring labels', () => {
    let markup = '';
    const window = {};
    vm.runInNewContext(read('app/static/js/custom-modal.js'), {
        window,
        document: { body: { insertAdjacentHTML: (_, html) => { markup = html; } }, getElementById: () => ({ addEventListener: () => {} }), addEventListener: () => {} },
        setTimeout: () => {},
    });
    window.CustomModal.confirm('Arbitrary', 'Arbitrary', 'warning', 'danger');
    assert.match(markup, /data-qlpk-button="danger" data-qlpk-button-variant="solid"/);
    window.CustomModal.confirm('Arbitrary');
    assert.match(markup, /data-qlpk-button="execute" data-qlpk-button-variant="solid"/);
});
