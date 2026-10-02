'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
const { readCssSource, stylesheetOwner } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');
const { runScriptFile } = require('./helpers/module-source');
const root = path.join(__dirname, '..');
const read = name => readCssSource(path.join(root, name));
const css = read('app/static/css/shared/button-actions.css');

test('shared action renderer uses explicit roles, not displayed labels', () => {
    const { document } = require('./helpers/fake-dom').createWindow();
    const window = { document };
    runScriptFile('app/static/js/shared/icon-system.js', (c => vm.isContext(c) ? c : vm.createContext(c))({ window }));
    const icons = window.QLPKIconSystem;
    for (const [action, role] of Object.entries({ add: 'execute', save: 'execute', view: 'view', edit: 'edit', delete: 'danger', cancel: 'neutral', download: 'neutral' })) {
        const button = icons.createActionButton({ action, label: 'Arbitrary label' });
        assert.equal(button.getAttribute('data-qlpk-button'), role);
        assert.equal(button.getAttribute('data-qlpk-button-variant'), 'soft');
    }
    assert.equal(icons.createActionButton({ action: 'edit', buttonRole: 'view' }).getAttribute('data-qlpk-button'), 'view');
    assert.equal(icons.createIconTextButton({ action: 'save' }).getAttribute('data-qlpk-button-variant'), 'soft');
    assert.equal(icons.createIconTextButton({ action: 'save', buttonVariant: 'solid' }).getAttribute('data-qlpk-button-variant'), 'solid');
    assert.equal(icons.createIconTextButton({ action: 'save', label: '<b>x</b>' }).textContent, '<b>x</b>');
    assert.equal(Object.keys(icons).some(name => name.startsWith('render')), false);
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

test('medicine buttons keep non-action badges and navigation outside action colors', async () => {
    const { renderMedicineRows } = require('./helpers/medicine-page');
    const page = await renderMedicineRows([{ id: 7, name: 'Paracetamol', batch_count: 2, stock_quantity: 5, unit: 'viên', reference_review_status: 'unlinked' }], { canReviewMedicineReference: true });
    page.render();
    const stockBadge = page.tbody.querySelector('.stock-detail-badge:not(.mm-reference-button)');
    assert.ok(stockBadge);
    assert.equal(stockBadge.getAttribute('type'), 'button');
    assert.equal(stockBadge.className, 'badge stock-detail-badge');
    assert.match(stockBadge.getAttribute('aria-label'), /\S/);
    assert.equal(stockBadge.hasAttribute('data-qlpk-button'), false);
    assert.match(read('references/ui/button-system.md'), /badge số lần nhập[\s\S]*không gắn data-qlpk-button/);
    assert.equal(page.tbody.querySelector('.action-btn:not(.delete)').getAttribute('data-qlpk-button'), 'edit');
    assert.equal(page.tbody.querySelector('.mm-reference-button').hasAttribute('data-qlpk-button'), false);
    assert.match(readMedicineManagementSource(), /supplement\.dataset\.qlpkButton = 'edit'/);
    const template = readTemplateSource('medicine-management.html');
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
            else if (file.endsWith('.css') && stylesheetOwner(cssRoot, path.relative(cssRoot, file)) !== 'shared/color-tokens.css') {
                assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /--qlpk-button-[\w-]+\s*:/, file);
            }
        }
    }
    const cssRoot = path.join(root, 'app/static/css');
    inspect(cssRoot);
    for (const file of ['CONTEXT.md', 'rule.md', 'references/context-files.md', 'references/ui/brand-theme.md']) {
        assert.ok(read(file).includes('button-system.md'), file);
    }
});

test('shared confirmation uses explicit danger intent without inferring labels', () => {
    const { createWindow } = require('./helpers/fake-dom');
    const { document } = createWindow();
    const window = {};
    runScriptFile('app/static/js/custom-modal.js', (c => vm.isContext(c) ? c : vm.createContext(c))({ window, document, setTimeout: () => {} }));
    window.CustomModal.confirm('<b>Arbitrary</b>', 'Arbitrary', 'warning', 'danger');
    assert.match(document.body.innerHTML, /data-qlpk-button="danger" data-qlpk-button-variant="solid"/);
    assert.match(document.body.innerHTML, /&lt;b&gt;Arbitrary/, 'messages are text, never markup');
    document.body.replaceChildren();
    window.CustomModal.confirm('Arbitrary');
    assert.match(document.body.innerHTML, /data-qlpk-button="execute" data-qlpk-button-variant="solid"/);
});
