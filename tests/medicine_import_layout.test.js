'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { freshGraph } = require('./helpers/fresh-esm');
const { installDom } = require('./helpers/fake-dom');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');
const { readCssSource } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');

const template = readTemplateSource('medicine-management.html');
const css = readCssSource(path.join(__dirname, '../app/static/css/pages/medicine-management.css'));
const actions = fs.readFileSync(path.join(__dirname, '../app/static/css/shared/button-actions.css'), 'utf8');
test('missing-price action keeps edit semantics with approved red tokens and standard font size', () => {
    const source = readMedicineManagementSource();
    assert.match(source, /supplement\.dataset\.qlpkButton = 'edit'/);
    assert.match(source, /supplement\.dataset\.qlpkButtonVariant = 'solid'/);
    const badge = css.match(/\.mm-missing-price-badge:is\(:hover, :focus-visible, :active\)\s*\{([^}]+)\}/)?.[1];
    assert.ok(badge);
    assert.match(badge, /--qlpk-action-color: var\(--qlpk-button-danger-bg\)/);
    assert.match(badge, /font-size: var\(--qlpk-font-size-md\)/);
    assert.match(badge, /--qlpk-action-hover: var\(--qlpk-button-danger-hover\)/);
});
test('import column headings are centered without changing value alignment', () => {
    assert.match(css, /\.qlpk-batch-import-table thead th\s*\{[^}]*text-align: center/);
    assert.doesNotMatch(css, /\.qlpk-batch-import-table :is\(th, td\):nth-child\(7\)/);
    assert.match(css, /\.qlpk-batch-import-table td:nth-child\(7\),[\s\S]*?text-align: right/);
});
test('import actions delegate interactive color to the shared semantic owner', () => {
    assert.match(actions, /transition-property: background-color/);
    assert.match(actions, /:hover[^{]+\{[^}]*background-color: var\(--qlpk-action-hover\);[^}]*background-image: none;[^}]*color: var\(--qlpk-action-text\)/);
    assert.match(actions, /--bs-btn-active-color: var\(--qlpk-action-text\)/);
    assert.match(actions, /--bs-btn-disabled-color: var\(--qlpk-button-disabled-text\)/);
});
test('dispensing filters share control geometry without changing focus or global controls', () => {
    const controls = css.match(/\.qlpk-receipt-dispensing-filters :is\(\.form-control, \.form-select, \.btn\)\s*\{([^}]+)\}/)?.[1];
    assert.ok(controls);
    for (const rule of ['min-height: 2.25rem', 'padding: 0.375rem 0.625rem', 'border-width: 0.0625rem',
        'border-radius: var(--clinic-control-radius)', 'font-size: var(--clinic-control-font-size)',
        'font-weight: var(--qlpk-font-weight-medium)', 'line-height: var(--qlpk-line-height-normal)']) {
        assert.ok(controls.includes(rule), rule);
    }
    assert.doesNotMatch(controls, /outline:|box-shadow:|(?:^|;)\s*height:/);
    assert.match(css, /\.qlpk-receipt-dispensing-filters \.form-select\s*\{\s*padding-right: 2.25rem/);
});
const importMarkup = template.slice(template.indexOf('id="importBatchModal"'), template.indexOf('<!-- Modal Quản lý Nhà cung cấp -->'));
const importStyles = css.slice(css.indexOf('.medicine-management-page .modal.qlpk-import-batch-modal .modal-dialog'), css.indexOf('.medicine-management-page .mm-scroll-100vh-400'));

test('receipt metadata shares readable regular text and left alignment without changing field ownership', () => {
    assert.match(css, /\.mm-import-fields\s*\{[^}]*--clinic-control-font-size:\s*var\(--qlpk-font-size-md\);[^}]*--qlpk-control-font-weight:\s*var\(--qlpk-font-weight-regular\)/);
    assert.match(css, /\.mm-import-fields \.form-control\s*\{[^}]*text-align:\s*start/);
    assert.match(importMarkup, /id="batchSupplier"[^>]*required readonly/);
    assert.match(importMarkup, /id="batchImportUser"[^>]*readonly disabled/);
    assert.match(importStyles, /\.mm-import-ledger-table :is\(th, td\)\s*\{[^}]*padding:\s*\.4rem \.5rem;[^}]*vertical-align:\s*middle/);
    assert.match(importStyles, /\.mm-import-ledger-table\s*\{[^}]*min-inline-size:\s*60rem/);
});

test('the inventory palette reuses shared brand tokens within the import modal', () => {
    const palette = css.match(/\.medicine-management-page \.modal\.qlpk-import-batch-modal\s*\{([^}]+)\}/)?.[1];
    assert.ok(palette);
    const colors = {
        '--qlpk-color-page-bg': 'var(--qlpk-color-surface-warm)',
        '--qlpk-color-surface-muted': 'var(--qlpk-brown-100)',
        '--mm-import-control-text': 'var(--qlpk-brown-700)',
        '--mm-import-table-header': 'var(--qlpk-brown-150)',
        '--mm-import-header-bg': 'var(--qlpk-workflow-context-header-bg)',
        '--mm-import-header-text': 'var(--qlpk-color-white)',
        '--mm-import-header-muted': 'var(--qlpk-brown-150)',
        '--mm-import-danger': 'var(--qlpk-feedback-error)',
        '--mm-import-amount': 'var(--qlpk-brown-800)',
        '--clinic-placeholder-color': 'var(--qlpk-color-text-muted)',
    };
    for (const [token, color] of Object.entries(colors)) {
        assert.ok(palette.includes(`${token}: ${color};`), token);
    }
    const sharedTokens = readCssSource(path.join(__dirname, '../app/static/css/shared/color-tokens.css'));
    assert.match(sharedTokens, /--qlpk-color-primary:\s*var\(--qlpk-brand-primary\)/);
    assert.doesNotMatch(palette, /--qlpk-color-primary(?:-strong|-rgb)?\s*:/);
    assert.doesNotMatch(palette, /#[0-9a-f]{3,8}\b/i);
    assert.doesNotMatch(palette, /--qlpk-brown-\d+\s*:/);
});

test('import colors distinguish active tabs, neutral actions, focus and monetary values', () => {
    assert.match(importStyles, /\.modal-header\s*\{[^}]*background:\s*var\(--mm-import-header-bg\)/);
    assert.match(importStyles, /\.modal-title\s*\{[^}]*color:\s*var\(--mm-import-header-text\)/);
    assert.match(importStyles, /\.mm-import-footer\s*\{[^}]*background:\s*var\(--qlpk-color-surface-muted\)/);
    assert.match(importStyles, /\.mm-import-tab\.is-active\s*\{[^}]*color:\s*var\(--qlpk-color-primary\);[^}]*border-top-color:\s*var\(--qlpk-color-primary\)/);
    assert.match(actions, /--qlpk-action-secondary-bg: var\(--qlpk-button-secondary-bg\)/);
    assert.match(css, /\.modal\.qlpk-import-batch-modal :is\(\.form-control, \.form-select\):focus[^{}]*\{[^}]*border-color:\s*var\(--qlpk-color-primary\);[^}]*box-shadow:\s*var\(--mm-import-focus-shadow\)/);
    for (const selector of ['.batch-row-total', '.lot-value', '.qlpk-batch-total-value']) {
        const rule = importStyles.slice(importStyles.indexOf(selector));
        assert.match(rule.slice(0, rule.indexOf('}')), /color:\s*var\(--mm-import-amount\)/);
    }
    assert.doesNotMatch(importStyles, /gradient\(|backdrop-filter/);
});

test('import modal allocates viewport height through dialog, content, body and table', () => {
    assert.match(importStyles, /\.modal-dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 1rem\)/);
    assert.match(importStyles, /\.modal-dialog\s*\{[^}]*\sheight:\s*calc\(100dvh - 1rem\)/);
    assert.match(importStyles, /\.modal-content\s*\{[^}]*\sheight:\s*100%;[^}]*min-height:\s*0;[^}]*max-height:\s*100%/);
    assert.match(importStyles, /\.modal-body\s*\{[^}]*min-height:\s*0/);
    assert.match(importMarkup, /class="mm-import-list"/);
    assert.match(importMarkup, /class="table-responsive mm-import-table-scroll"/);
    assert.doesNotMatch(template + css, /mm-scroll-100vh-420/);
    assert.match(css, /\.modal-footer\s*\{[^}]*flex-shrink:\s*0/);
    assert.match(importMarkup, /class="modal-footer[^]*id="confirmImportBatchBtn"/);
});

test('desktop order pane gives the table remaining height without stretching header or footer', () => {
    assert.match(importStyles, /\.modal\.qlpk-import-batch-modal \.modal-body\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden/);
    assert.match(importStyles, /\.qlpk-import-order-pane > :not\(\.mm-import-list\)\s*\{[^}]*flex-shrink:\s*0/);
    for (const selector of ['mm-import-list', 'mm-import-table-scroll']) {
        assert.match(importStyles, new RegExp(`\\.${selector}\\s*\\{[^}]*flex:\\s*1 1 auto`));
    }
    assert.match(importStyles, /:is\(\.qlpk-batch-note, \.qlpk-batch-lot-breakdown\)\s*\{[^}]*height:\s*3.5rem;[^}]*overflow-y:\s*auto/);
});

test('note and lot columns share one label-above-box pattern that stays aligned', () => {
    assert.match(importMarkup, /mm-import-lots">\s*<h6 class="form-label">/);
    assert.match(importMarkup, /id="batchLotBreakdown" class="mm-import-lot-list[^"]*"/);
    assert.match(importStyles, /\.mm-import-support > \*\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column/);
    assert.match(importStyles, /\.mm-import-support\s*\{[^}]*align-items:\s*end/);
    assert.match(importStyles, /\.mm-import-support \.form-label\s*\{\s*margin:\s*0 0 .375rem;\s*line-height:\s*var\(--qlpk-line-height-normal\)/);
    assert.match(importStyles, /\.mm-import-lot-list\s*\{[^}]*border:[^}]*border-radius:\s*.5rem/);
    assert.match(importStyles, /\.modal-header\s*\{[^}]*padding:\s*\.5rem 1rem/);
    assert.match(importStyles, /\.mm-import-footer\s*\{[^}]*padding:\s*\.375rem 1rem/);
});

test('note and lot boxes share height, padding and scrolling without independent resize limits', () => {
    const controls = importStyles.match(/\.mm-import-support :is\(\.qlpk-batch-note, \.qlpk-batch-lot-breakdown\)\s*\{([^}]+)\}/)?.[1];
    assert.ok(controls);
    assert.match(controls, /box-sizing:\s*border-box/);
    assert.match(controls, /flex:\s*0 0 auto/);
    assert.match(controls, /height:\s*3.5rem/);
    assert.match(controls, /padding:\s*.375rem .625rem/);
    assert.match(controls, /overflow-y:\s*auto/);
    assert.match(controls, /line-height:\s*var\(--qlpk-line-height-normal\)/);
    assert.match(importStyles, /\.qlpk-batch-note\s*\{\s*resize:\s*none/);
    assert.doesNotMatch(importStyles, /#(?:batchNote|batchLotBreakdown)\s*\{[^}]*max-height:/);
});

async function importRows(count = 1) {
    const window = installDom({ html: importMarkup });
    window.bootstrap = { Modal: { getInstance: () => null, getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
    const load = freshGraph();
    const [batchImport, totals] = await Promise.all([load('medicines/management-batch-import.js'), load('medicines/management-batch-import-parts/batch-totals.js')]);
    for (let index = 0; index < count; index++) batchImport.addBatchImportRow();
    return { batchImport, totals, rows: [...document.querySelectorAll('#batchImportTableBody tr')] };
}

// Intl currency output separates the symbol with a no-break space.
const money = node => node.textContent.replace(/\u00a0/g, ' ');

test('quantity unit stays inline with its input and rows align on one middle axis', async () => {
    const { rows } = await importRows();
    const quantity = rows[0].querySelector('.mm-import-qty');
    assert.deepEqual(quantity.children.map(node => node.localName), ['input', 'small']);
    assert.ok(quantity.children[0].classList.contains('batch-quantity'));
    assert.equal(quantity.children[1].className, 'batch-unit');
    assert.match(importStyles, /\.mm-import-qty\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center/);
    assert.match(importStyles, /\.qlpk-batch-import-table :is\(th, td\)\s*\{[^}]*vertical-align:\s*middle/);
    assert.doesNotMatch(importStyles, /\.qlpk-batch-import-table :is\(th, td\)\s*\{[^}]*vertical-align:\s*top/);
    assert.doesNotMatch(importStyles, /\.batch-unit\s*\{[^}]*display:\s*block/);
    assert.match(importStyles, /\.mm-import-total\s*\{[^}]*align-items:\s*baseline/);
});

test('narrow and short layouts scroll the body without hiding input rows or footer actions', () => {
    assert.match(importStyles, /\.modal\.qlpk-import-batch-modal \.modal-body\s*\{[^}]*padding:\s*0/);
    assert.match(importStyles, /\.mm-import-pane\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden/);
    assert.match(importStyles, /\.mm-import-table-scroll\s*\{[^}]*overflow:\s*auto/);
    assert.match(css, /\.qlpk-batch-import-table\s*\{[^}]*min-width:\s*68\.75rem/);
    assert.match(importStyles, /\.mm-import-toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.match(importStyles, /\.mm-import-toolbar\s*\{[^}]*flex-shrink:\s*0/);
    const compactStyles = importStyles.slice(importStyles.indexOf('@media (max-width: 47.99rem), (max-height: 44.99rem)'));
    assert.match(compactStyles, /\.modal\.qlpk-import-batch-modal \.modal-body\s*\{\s*overflow-y:\s*auto/);
    assert.match(compactStyles, /\.modal\.qlpk-import-batch-modal \.mm-import-pane\s*\{\s*flex:\s*1 0 auto;\s*overflow:\s*visible/);
    assert.match(compactStyles, /:is\(\.mm-import-list, \.mm-import-table-scroll, \.mm-import-ledger-scroll\)\s*\{\s*flex:\s*0 0 auto/);
});

test('import workspace has a bounded white table surface, balanced columns and one total in the action footer', () => {
    assert.match(importStyles, /\.mm-import-list\s*\{[^}]*border:[^}]*background:\s*var\(--qlpk-color-surface\)/);
    assert.match(importStyles, /\.qlpk-batch-import-table\s*\{[^}]*table-layout:\s*fixed/);
    assert.match(importStyles, /th:nth-child\(1\)\s*\{\s*width:\s*26%/);
    assert.doesNotMatch(importMarkup, /alert-info|justify-content-center|mm-w-180/);
    const footer = importMarkup.slice(importMarkup.indexOf('class="modal-footer'));
    for (const id of ['batchTotalValue', 'confirmImportBatchBtn']) {
        assert.equal(importMarkup.split(`id="${id}"`).length - 1, 1);
        assert.match(footer, new RegExp(`id="${id}"`));
    }
    assert.match(importStyles, /\.mm-import-support\s*\{[^}]*grid-template-columns:\s*1.5fr 1fr/);
    for (const id of ['batchSupplier', 'batchInvoiceNumber', 'batchImportUser', 'batchNote']) {
        assert.match(importMarkup, new RegExp(`for="${id}"`));
        assert.equal(importMarkup.split(`id="${id}"`).length - 1, 1);
    }
});

test('existing calculation writer still updates the single footer total and separate lot breakdown', async () => {
    const { rows, totals } = await importRows(20);
    rows.forEach((row, index) => {
        row.querySelector('.batch-quantity').value = '2.5';
        row.querySelector('.batch-price').value = '1000';
        row.querySelector('.batch-number-display').value = `LOT-${index % 2}<b>`;
    });
    totals.updateBatchTotal();
    assert.equal(money(document.getElementById('batchTotalValue')), '50.000 ₫');
    const lots = [...document.querySelectorAll('#batchLotBreakdown .lot-item')];
    assert.deepEqual(lots.map(item => item.querySelector('.lot-name').textContent), ['Lô LOT-0<b>:', 'Lô LOT-1<b>:']);
    assert.deepEqual(lots.map(item => money(item.querySelector('.lot-value'))), ['25.000 ₫', '25.000 ₫']);
    assert.equal(document.querySelector('#batchLotBreakdown b'), null);
    rows.forEach(row => row.remove());
    totals.updateBatchTotal();
    assert.equal(money(document.getElementById('batchTotalValue')), '0 ₫');
    assert.equal(document.getElementById('batchLotBreakdown').textContent, 'Chưa có dữ liệu');
});

test('dynamic import rows expose accessible controls without changing calculation or remove bindings', async () => {
    const { rows } = await importRows(2);
    for (const label of ['Tên thuốc', 'Số lô', 'Hạn dùng', 'Số lượng', 'Đơn giá nhập trên một đơn vị', 'Xóa dòng thuốc']) {
        assert.ok(rows[0].querySelector(`[aria-label="${label}"]`), label);
    }
    assert.notEqual(rows[0].id, rows[1].id);
    rows[0].querySelector('.batch-quantity').value = '3';
    rows[0].querySelector('.batch-price').value = '2000';
    rows[0].querySelector('.batch-quantity').dispatchEvent(new Event('input'));
    assert.equal(money(rows[0].querySelector('.batch-row-total')), '6.000 ₫');
    assert.equal(money(document.getElementById('batchTotalValue')), '6.000 ₫');
    rows[0].querySelector('.batch-price').value = '1000';
    rows[0].querySelector('.batch-price').dispatchEvent(new Event('input'));
    assert.equal(money(document.getElementById('batchTotalValue')), '3.000 ₫');
    rows[0].querySelector('.mm-import-remove').click();
    assert.equal(rows[0].parentNode, null);
    assert.equal(document.querySelectorAll('#batchImportTableBody tr').length, 1);
    assert.equal(money(document.getElementById('batchTotalValue')), '0 ₫');
});

test('Nhập kho modal has two tabs and no longer has the old Chi tiết tồn kho / Lịch sử giao dịch modals', () => {
    assert.doesNotMatch(template, /id="stockDetailModal"/);
    assert.doesNotMatch(template, /id="transactionHistoryModal"/);
    assert.doesNotMatch(readMedicineManagementSource(),
        /stockDetailModal|transactionHistoryModal|renderStockDetail|loadTransactionHistory|importLedgerToggle|importLedgerBody/);
    assert.match(importMarkup, /class="mm-import-tabs" role="tablist"/);
    assert.match(importMarkup, /id="importTabOrder" role="tab"[^]*aria-selected="true" aria-controls="importOrderPane"/);
    assert.match(importMarkup, /id="importTabLedger" role="tab"[^]*aria-selected="false" aria-controls="importLedgerPane"/);
    assert.match(importMarkup, /id="importOrderPane" class="mm-import-pane[^"]*" role="tabpanel"/);
    assert.match(importMarkup, /id="importLedgerPane" class="mm-import-pane[^"]*" role="tabpanel"[^]*hidden/);
    assert.match(importMarkup, /id="importLedgerSearch"/);
    assert.match(importMarkup, /id="importLedgerStatus"/);
    assert.match(importMarkup, /id="importLedgerTableBody"/);
    const expiryButton = template.slice(template.indexOf('id="medicine-expiry_date"') - 40, template.indexOf('id="medicine-expiry_date"') + 200);
    assert.match(expiryButton, /aria-controls="importBatchModal"/);
});

test('both tabs share the same viewport-height dialog and each pane fills the remaining body height', () => {
    assert.match(importStyles, /\.mm-import-tabs\s*\{/);
    assert.match(importStyles, /\.mm-import-tab\.is-active\s*\{[^}]*background:\s*var\(--qlpk-color-surface\)/);
    assert.match(importStyles, /\.mm-import-pane\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden/);
    assert.match(importStyles, /\.mm-import-pane\[hidden\]\s*\{[^}]*display:\s*none/);
    assert.match(importStyles, /\.qlpk-import-ledger-pane \.mm-import-ledger-toolbar,\s*\n\.medicine-management-page \.qlpk-import-ledger-pane \.mm-import-ledger-pager\s*\{[^}]*flex-shrink:\s*0/);
    assert.match(importStyles, /\.mm-import-ledger-scroll\s*\{[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*auto/);
    assert.doesNotMatch(importStyles, /mm-import-ledger-toggle|mm-import-ledger-body/);
});
