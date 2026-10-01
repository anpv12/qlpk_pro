'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { importFresh } = require('./helpers/fresh-esm');
const { installDom } = require('./helpers/fake-dom');

const load = async () => { installDom({ html: '' }); return importFresh('medicines/management-stock.js'); };

test('stock uses total dispensing units, not packaging or a stock suffix', async () => {
    const { formatStockDisplay } = await load();
    assert.equal(formatStockDisplay({stock_quantity: 370, unit: 'tablet', units_per_box: 100, packaging_unit: 'bottle'}), '370 viên');
    assert.equal(formatStockDisplay({stock_quantity: 100, unit: 'gói', packaging: 'Hộp 10 gói'}), '100 gói');
    assert.equal(formatStockDisplay({stock_quantity: 300, unit: 'tablet', units_per_box: 100, packaging_unit: 'box'}), '300 viên');
});

test('stock preserves fractional quantities and Vietnamese number formatting', async () => {
    const { formatStockDisplay } = await load();
    assert.equal(formatStockDisplay({stock_quantity: 140.5, unit: 'tablet'}), '140,5 viên');
    assert.equal(formatStockDisplay({stock_quantity: '1234.5', unit: 'ml'}), '1.234,5 ml');
});

test('zero and missing stock retain a unit; unit text stays plain text for text-node rendering', async () => {
    const { formatStockDisplay } = await load();
    assert.equal(formatStockDisplay({stock_quantity: 0, unit: 'gói'}), '0 gói');
    assert.equal(formatStockDisplay({stock_quantity: null, unit: 'tablet'}), '0 viên');
    assert.equal(formatStockDisplay(null), '-');
    assert.equal(formatStockDisplay({stock_quantity: 1, unit: '<img>'}), '1 <img>');
});
