'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { MEDICINE_SEARCH_FILES, loadDoctorRegistry } = require('./helpers/doctor-registry');

class FakeElement {
    constructor(tag) {
        this.tagName = tag.toUpperCase();
        this.attributes = {};
        this.dataset = {};
        this.style = {};
        this.hidden = false;
        this.innerHTML = '';
        this.className = '';
        this.value = '';
        this.isConnected = true;
        this.rect = { top: 100, bottom: 130, left: 40, width: 300 };
    }
    replaceChildren() { this.innerHTML = ''; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return key in this.attributes ? this.attributes[key] : null; }
    removeAttribute(key) { delete this.attributes[key]; }
    getBoundingClientRect() { return this.rect; }
    querySelectorAll(selector) {
        if (selector !== '[data-medicine-select]') return [];
        if (this.optionsHtml !== this.innerHTML) {
            this.optionsHtml = this.innerHTML;
            this.options = [...this.innerHTML.matchAll(/id="([^"]+)"[^>]*data-medicine-select="([^"]+)"/g)].map(([, id, key]) => {
                const classes = new Set();
                return {
                    id,
                    dataset: { medicineSelect: key },
                    attributes: {},
                    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)), contains: name => classes.has(name) },
                    setAttribute(name, value) { this.attributes[name] = String(value); },
                    scrollIntoView() { this.scrolled = true; }
                };
            });
        }
        return this.options;
    }
}

function setup(overrides = {}) {
    const timers = [];
    const window = {
        setTimeout: (callback, delay) => timers.push({ callback, delay, cleared: false }),
        clearTimeout: id => { if (timers[id - 1]) timers[id - 1].cleared = true; }
    };
    const factory = loadDoctorRegistry(MEDICINE_SEARCH_FILES, window).require('prescriptionMedicineSearch');
    const elements = new Map();
    const doc = {
        getElementById: id => elements.get(id) || null,
        createElement: tag => new FakeElement(tag),
        body: { appendChild: element => elements.set(element.id, element) },
        defaultView: { innerHeight: 900, innerWidth: 1440 }
    };
    const requests = [];
    const rows = new Set();
    const search = factory.create({
        requestJson: overrides.requestJson || (url => { requests.push(url); return Promise.resolve(overrides.response || { medicines: [] }); }),
        getEndpoint: query => `/api/medicines/?search=${encodeURIComponent(query)}`,
        getDocument: () => doc,
        isRowCurrent: row => rows.has(row)
    });
    const flush = async () => {
        for (const timer of timers.splice(0)) if (!timer.cleared) await timer.callback();
    };
    const row = { uid: 'rx-1', isExternal: false };
    rows.add(row);
    const input = new FakeElement('input');
    return { search, doc, timers, flush, requests, rows, row, input, dropdown: () => elements.get('doctorMedicineDropdown') };
}

const MEDICINES = [
    { id: 10, name: 'Diazepam <5mg>', strength: '5mg', unit: 'viên', stock_quantity: 80.5, unit_price: 9500, prescription_type: 'H' },
    { id: 11, name: 'Zopinox 7.5', strength: '', unit: 'viên', stock_quantity: null, unit_price: 4000, prescription_type: 'BASIC' }
];

test('create requires the prescription-owned dependencies', () => {
    const factory = loadDoctorRegistry(MEDICINE_SEARCH_FILES, {}).require('prescriptionMedicineSearch');
    assert.throws(() => factory.create({}), /Thiếu dependency cho ô tìm thuốc/);
});

test('search shows loading, debounces typed queries and renders escaped stock options', async () => {
    const h = setup({ response: { medicines: MEDICINES } });
    h.search.search(h.input, { uid: 'rx-9', isExternal: true });
    assert.equal(h.dropdown(), undefined, 'external rows never search the stock catalog');

    h.input.value = ' diaze ';
    h.search.search(h.input, h.row);
    const dropdown = h.dropdown();
    assert.equal(dropdown.getAttribute('role'), 'listbox');
    assert.equal(dropdown.dataset.prescriptionDropdown, 'true');
    assert.match(dropdown.innerHTML, /Đang tải danh sách thuốc/);
    assert.equal(h.input.getAttribute('aria-busy'), 'true');
    assert.equal(h.input.getAttribute('aria-expanded'), 'true');
    assert.equal(h.input.getAttribute('aria-controls'), 'doctorMedicineDropdown');
    assert.equal(h.timers.at(-1).delay, 250);

    await h.flush();
    assert.deepEqual(h.requests, ['/api/medicines/?search=diaze']);
    assert.equal(h.input.getAttribute('aria-busy'), null);
    assert.match(dropdown.innerHTML, /Diazepam &lt;5mg&gt;/);
    assert.match(dropdown.innerHTML, /doctor-support-dropdown__item--rx-h/);
    assert.match(dropdown.innerHTML, /title="Đơn hướng thần \(H\)"/);
    assert.match(dropdown.innerHTML, /Tồn kho 0/);
    assert.equal(h.search.getOption('rx-1:10').name, 'Diazepam <5mg>');
    assert.equal(dropdown.dataset.placement, 'below');

    h.input.value = '';
    h.search.search(h.input, h.row);
    assert.equal(h.timers.at(-1).delay, 0, 'empty query loads immediately');
});

test('only the latest search for the current row can render', async () => {
    let resolveFirst;
    const h = setup({ requestJson: url => (url.endsWith('=a') ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve({ medicines: MEDICINES })) });
    h.input.value = 'a';
    h.search.search(h.input, h.row);
    await Promise.race([h.flush(), Promise.resolve()]);
    h.input.value = 'ab';
    h.search.search(h.input, h.row);
    resolveFirst({ medicines: [MEDICINES[1]] });
    await Promise.resolve();
    assert.match(h.dropdown().innerHTML, /Đang tải danh sách thuốc/, 'stale response is ignored');
    await h.flush();
    assert.equal(h.search.getOption('rx-1:10').id, 10);

    h.rows.clear();
    h.search.search(h.input, h.row);
    await h.flush();
    assert.match(h.dropdown().innerHTML, /Đang tải danh sách thuốc/, 'removed rows are not re-rendered');
});

test('empty results and failures keep the dropdown contract', async () => {
    const empty = setup();
    empty.input.value = 'zzzz';
    empty.search.search(empty.input, empty.row);
    await empty.flush();
    assert.match(empty.dropdown().innerHTML, /Không tìm thấy thuốc trong kho/);

    const failed = setup({ requestJson: () => Promise.reject(new Error('offline')) });
    failed.input.value = 'x';
    failed.search.search(failed.input, failed.row);
    await failed.flush();
    assert.equal(failed.dropdown().hidden, true);
    assert.equal(failed.dropdown().innerHTML, '');
    assert.equal(failed.input.getAttribute('aria-expanded'), 'false');
});

test('keyboard navigation clamps, wraps from none and returns the selected option key', async () => {
    const h = setup({ response: { medicines: MEDICINES } });
    h.input.value = 'diaze';
    h.search.search(h.input, h.row);
    await h.flush();
    const key = name => ({ key: name, target: h.input, prevented: false, preventDefault() { this.prevented = true; } });

    const up = key('ArrowUp');
    assert.equal(h.search.handleKeydown(h.doc, up), null);
    assert.equal(up.prevented, true);
    assert.equal(h.input.getAttribute('aria-activedescendant'), 'doctorMedicineOption-rx-1-1');
    h.search.handleKeydown(h.doc, key('ArrowDown'));
    assert.equal(h.input.getAttribute('aria-activedescendant'), 'doctorMedicineOption-rx-1-1', 'clamped at last option');
    h.search.handleKeydown(h.doc, key('ArrowUp'));
    h.search.handleKeydown(h.doc, key('ArrowUp'));
    assert.equal(h.input.getAttribute('aria-activedescendant'), 'doctorMedicineOption-rx-1-0', 'clamped at first option');
    const options = h.dropdown().querySelectorAll('[data-medicine-select]');
    assert.equal(options[0].classList.contains('is-active'), true);
    assert.equal(options[0].attributes['aria-selected'], 'true');
    assert.equal(options[1].attributes['aria-selected'], 'false');

    assert.equal(h.search.handleKeydown(h.doc, { ...key('Enter'), target: {} }), null, 'other inputs are ignored');
    const enter = key('Enter');
    assert.equal(h.search.handleKeydown(h.doc, enter), 'rx-1:10');
    assert.equal(enter.prevented, true);

    assert.equal(h.search.handleKeydown(h.doc, key('Escape')), null);
    assert.equal(h.dropdown().hidden, true);
    assert.equal(h.input.getAttribute('aria-activedescendant'), null);
    assert.equal(h.search.handleKeydown(h.doc, key('ArrowDown')), null, 'hidden dropdown ignores arrows');
});

test('position flips above near the bottom edge and reset forgets options', async () => {
    const h = setup({ response: { medicines: MEDICINES } });
    h.input.value = 'diaze';
    h.input.rect = { top: 760, bottom: 790, left: 1300, width: 200 };
    h.search.search(h.input, h.row);
    await h.flush();
    const dropdown = h.dropdown();
    assert.equal(dropdown.dataset.placement, 'above');
    assert.equal(dropdown.style.width, '320px');
    assert.equal(dropdown.style.left, '1112px');

    h.input.isConnected = false;
    dropdown.dataset.placement = 'kept';
    h.search.position(h.doc);
    assert.equal(dropdown.dataset.placement, 'kept', 'detached inputs are not positioned');

    h.search.reset(h.doc);
    assert.equal(h.search.getOption('rx-1:10'), null);
    assert.equal(dropdown.hidden, true);
});
