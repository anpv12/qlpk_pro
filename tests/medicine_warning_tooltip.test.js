'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderMedicineRows } = require('./helpers/medicine-page');

async function setup(medicines) {
    const instances = new Map(), events = [], created = [];
    class Tooltip {
        constructor(badge, options) { this.badge = badge; this.options = options; instances.set(badge, this); created.push(this); }
        hide() { events.push('hide'); }
        dispose() { events.push('dispose'); instances.delete(this.badge); }
        static getInstance(badge) { return instances.get(badge); }
    }
    const page = await renderMedicineRows(medicines);
    page.window.bootstrap = { Tooltip };
    return { ...page, instances, events, created };
}

test('warning badges expose keyboard-accessible labels without native title delays', async () => {
    const page = await setup([{ id: 1, name: 'Thuốc', stock_quantity: 0 }]);
    page.render();
    const badge = page.tbody.querySelector('.medicine-warning-badge');
    assert.equal(badge.getAttribute('tabindex'), '0');
    assert.equal(badge.getAttribute('role'), 'img');
    assert.equal(badge.getAttribute('aria-label'), 'Hết tồn kho');
    assert.equal(badge.querySelector('i').getAttribute('aria-hidden'), 'true');
    assert.equal(badge.hasAttribute('title'), false);
    page.state.medicines = [{ id: 2, name: 'Thuốc', stock_quantity: 3, low_stock_threshold: 5 }];
    page.list.renderMedicineTable();
    assert.equal(page.tbody.querySelector('.medicine-warning-badge').getAttribute('aria-label'), 'Tồn kho thấp (3 ≤ 5)');
});

test('populated table initializes fast hover/focus tooltips outside table overflow', async () => {
    const page = await setup([{ id: 1, name: 'Thuốc', stock_quantity: 0, is_expiring_soon: true }]);
    page.render();
    assert.equal(page.created.length, 2);
    for (const tooltip of page.created) {
        assert.equal(tooltip.options.trigger, 'hover focus');
        assert.equal(tooltip.options.delay.show, 120);
        assert.equal(tooltip.options.delay.hide, 0);
        assert.equal(tooltip.options.animation, false);
        assert.equal(tooltip.options.container, 'body');
        assert.equal(tooltip.options.html, false);
    }
    assert.equal(page.created[0].options.title, 'Hết tồn kho');
    assert.equal(page.created[1].options.title, 'Sắp hết hạn');
    const badge = page.tbody.querySelector('.medicine-warning-badge');
    badge.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Enter' }));
    assert.deepEqual(page.events, []);
    badge.dispatchEvent(Object.assign(new Event('keydown'), { key: 'Escape' }));
    assert.equal(page.events.at(-1), 'hide');
});

test('rerender disposes existing tooltips before replacing rows, including empty results', async () => {
    const page = await setup([{ id: 1, name: 'Thuốc', stock_quantity: 0 }]);
    page.render();
    page.list.renderMedicineTable();
    assert.deepEqual(page.events, ['dispose']);
    assert.equal(page.instances.size, 1);
    assert.equal(page.created.length, 2);
    page.state.medicines = [];
    page.list.renderMedicineTable();
    assert.deepEqual(page.events, ['dispose', 'dispose']);
    assert.equal(page.instances.size, 0);
    assert.equal(page.tbody.textContent, 'Không có thuốc phù hợp.');
});
