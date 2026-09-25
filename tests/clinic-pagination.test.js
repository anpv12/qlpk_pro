'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Element {
    constructor() { this.children = []; this.dataset = {}; this.events = {}; this.attributes = {}; }
    append(child) { this.children.push(child); }
    replaceChildren() { this.children = []; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.events[name] = callback; }
    closest() { return this; }
}

function setup() {
    const nodes = Object.fromEntries(['clinicPagination', 'clinicPageSize', 'clinicPageInfo', 'clinicPageLinks'].map(id => [id, new Element()]));
    nodes.clinicPagination.querySelector = selector => nodes[selector.slice(1)];
    const context = { window: {}, document: { getElementById: id => nodes[id], createElement: () => new Element() } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/static/js/components/clinic-pagination.js'), 'utf8'), context);
    const controls = () => nodes.clinicPageLinks.children.flatMap(li => li.children);
    const click = label => {
        const target = controls().find(button => button.attributes['aria-label'] === label);
        assert.ok(target, `Missing control: ${label}`);
        nodes.clinicPageLinks.events.click({ target });
    };
    const resize = size => { nodes.clinicPageSize.value = String(size); nodes.clinicPageSize.events.change(); };
    return { api: context.window.QLPKPagination, nodes, controls, click, resize };
}

// Client list: continuous row indices, last page, resizing and filtering.
{
    const h = setup();
    let shown;
    const list = h.api.createClient({ render: (rows, offset) => { shown = { rows: Array.from(rows), offset }; } });
    list.setItems(Array.from({ length: 51 }, (_, i) => i + 1));
    assert.deepEqual(shown.rows, [1,2,3,4,5,6,7,8,9,10]);
    h.click('Trang trước'); // Disabled controls cannot load page zero.
    assert.equal(shown.offset, 0);
    h.click('Trang sau');
    assert.equal(shown.offset, 10);
    assert.equal(h.nodes.clinicPageInfo.textContent, '11–20 / 51 mục');
    h.click('Trang 6');
    assert.deepEqual(shown.rows, [51]);
    h.click('Trang sau');
    assert.equal(shown.offset, 50);
    for (const size of [20, 50, 100, 10]) {
        h.resize(size);
        assert.equal(shown.offset, 0);
        assert.equal(shown.rows.length, Math.min(size, 51));
    }
    h.click('Trang 6');
    list.setItems([7]);
    assert.equal(h.nodes.clinicPageInfo.textContent, '1–1 / 1 mục');
    list.setItems([]);
    assert.equal(h.nodes.clinicPageInfo.textContent, '0–0 / 0 mục');
    assert.equal(shown.rows.length, 0);
    assert.ok(h.controls().filter(b => b.textContent !== '1').every(b => b.disabled));
}

// Server adapter: bounded navigation for large catalogs and no page actions
// when the current page or a disabled edge receives a click.
{
    const h = setup();
    const requests = [];
    const pager = h.api.create({ onChange: (page, size) => requests.push([page, size]) });
    pager.update({ page: 345, pageSize: 10, total: 54752 });
    assert.ok(h.controls().length <= 7);
    assert.equal(h.controls().find(b => b.attributes['aria-current'] === 'page').textContent, '345');
    h.click('Trang 345');
    assert.equal(requests.length, 0);
    h.click('Trang sau');
    h.resize(100);
    assert.deepEqual(requests, [[346, 10], [1, 100]]);
    pager.update({ page: 548, pageSize: 100, total: 54752 });
    assert.equal(h.nodes.clinicPageInfo.textContent, '54701–54752 / 54752 mục');
    h.click('Trang sau');
    assert.equal(requests.length, 2);
    pager.update({ page: 3, pageSize: 20, total: 0 });
    assert.equal(h.nodes.clinicPageInfo.textContent, '0–0 / 0 mục');
}
process.stdout.write('Clinic pagination interactions OK\n');
