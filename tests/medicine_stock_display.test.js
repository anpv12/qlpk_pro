'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../app/static/js/medicine-management.js'), 'utf8');
const context = vm.createContext({});
for (const name of ['escapeHtml', 'getUnitDisplay', 'formatStockQuantity', 'formatStockDisplay']) {
    const start = source.indexOf('function ' + name + '(');
    const end = source.indexOf('\n}', start) + 2;
    vm.runInContext(source.slice(start, end), context);
}

test('stock uses total dispensing units, not packaging or a stock suffix', () => {
    assert.equal(context.formatStockDisplay({stock_quantity: 370, unit: 'tablet', units_per_box: 100, packaging_unit: 'bottle'}), '370 viên');
    assert.equal(context.formatStockDisplay({stock_quantity: 100, unit: 'gói', packaging: 'Hộp 10 gói'}), '100 gói');
    assert.equal(context.formatStockDisplay({stock_quantity: 300, unit: 'tablet', units_per_box: 100, packaging_unit: 'box'}), '300 viên');
});

test('stock preserves fractional quantities and Vietnamese number formatting', () => {
    assert.equal(context.formatStockDisplay({stock_quantity: 140.5, unit: 'tablet'}), '140,5 viên');
    assert.equal(context.formatStockDisplay({stock_quantity: '1234.5', unit: 'ml'}), '1.234,5 ml');
});

test('zero and missing stock retain a unit and unit text is escaped', () => {
    assert.equal(context.formatStockDisplay({stock_quantity: 0, unit: 'gói'}), '0 gói');
    assert.equal(context.formatStockDisplay({stock_quantity: null, unit: 'tablet'}), '0 viên');
    assert.equal(context.formatStockDisplay(null), '-');
    assert.equal(context.formatStockDisplay({stock_quantity: 1, unit: '<img>'}), '1 &lt;img&gt;');
});
