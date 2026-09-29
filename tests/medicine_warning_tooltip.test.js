'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { readMedicineManagementSource } = require('./helpers/medicine-management-source');

const source = readMedicineManagementSource();

function setup() {
    const badges = [], instances = new Map(), events = [], created = [];
    class Tooltip {
        constructor(badge, options) {
            this.badge = badge;
            this.options = options;
            instances.set(badge, this);
            created.push(this);
        }
        hide() { events.push('hide'); }
        dispose() { events.push('dispose'); instances.delete(this.badge); }
        static getInstance(badge) { return instances.get(badge); }
    }
    const tbody = {
        empty() { events.push('empty'); badges.length = 0; },
        html() { events.push('empty-message'); },
        append(markup) {
            for (const match of markup.matchAll(/medicine-warning-badge"[^>]*aria-label="([^"]*)"/g)) {
                badges.push({getAttribute: () => match[1], handlers: {},
                    addEventListener(type, handler) { this.handlers[type] = handler; }});
            }
        }
    };
    const context = vm.createContext({
        document: {querySelectorAll: () => badges}, bootstrap: {Tooltip},
        $: () => tbody, medicines: [], currentPage: 1, medicinePageSize: 10,
        canReviewMedicineReference: false, formatCurrency: String,
        formatStockDisplay: () => '0 viên', bindCheckboxEvents() {}
    });
    vm.runInContext(source.slice(source.indexOf('function escapeHtml('), source.indexOf('function debounce(')), context);
    vm.runInContext(source.slice(source.indexOf('function getMedicineWarnings('), source.indexOf('// Bind checkbox events\nfunction bindCheckboxEvents')), context);
    return {context, badges, instances, events, created};
}

test('warning badges expose keyboard-accessible labels without native title delays', () => {
    const {context} = setup();
    assert.equal(context.renderWarningBadges([]), '');
    const markup = context.renderWarningBadges([{color: 'warning', icon: 'bi-clock-fill', text: 'Tồn "thấp" < 5 & 10'}]);
    assert.match(markup, /tabindex="0" role="img"/);
    assert.match(markup, /aria-label="Tồn &quot;thấp&quot; &lt; 5 &amp; 10"/);
    assert.match(markup, /aria-hidden="true"/);
    assert.doesNotMatch(markup, /\stitle=/);
});

test('populated table initializes fast hover/focus tooltips outside table overflow', () => {
    const {context, badges, created, events} = setup();
    context.medicines = [{id: 1, name: 'Thuốc', stock_quantity: 0, is_expiring_soon: true}];
    context.renderMedicineTable();
    assert.equal(created.length, 2);
    for (const tooltip of created) {
        assert.equal(tooltip.options.trigger, 'hover focus');
        assert.equal(tooltip.options.delay.show, 120);
        assert.equal(tooltip.options.delay.hide, 0);
        assert.equal(tooltip.options.animation, false);
        assert.equal(tooltip.options.container, 'body');
        assert.equal(tooltip.options.html, false);
    }
    assert.equal(created[0].options.title, 'Hết tồn kho');
    assert.equal(created[1].options.title, 'Sắp hết hạn');
    badges[0].handlers.keydown({key: 'Enter'});
    assert.deepEqual(events, ['empty']);
    badges[0].handlers.keydown({key: 'Escape'});
    assert.equal(events.at(-1), 'hide');
});

test('rerender disposes existing tooltips before replacing rows, including empty results', () => {
    const {context, events, instances, created} = setup();
    context.medicines = [{id: 1, name: 'Thuốc', stock_quantity: 0}];
    context.renderMedicineTable();
    context.renderMedicineTable();
    assert.deepEqual(events, ['empty', 'dispose', 'empty']);
    assert.equal(instances.size, 1);
    assert.equal(created.length, 2);
    context.medicines = [];
    context.renderMedicineTable();
    assert.deepEqual(events.slice(-3), ['dispose', 'empty', 'empty-message']);
    assert.equal(instances.size, 0);
});
