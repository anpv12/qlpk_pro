const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
    const nodes = {}, requests = [], timers = new Map(), downloads = [], revoked = [];
    let timerId = 0, pager;
    class Element {
        constructor() {
            this.value = ''; this.children = []; this.events = {}; this.attributes = {};
            const classes = new Set();
            this.classList = {add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name)};
        }
        addEventListener(name, fn) { this.events[name] = fn; }
        setAttribute(name, value) { this.attributes[name] = value; }
        replaceChildren(...children) { this.children = children; }
        append(child) { this.children.push(child); }
        appendChild(child) { this.append(child); }
        click() { downloads.push({href:this.href, download:this.download}); }
        remove() {}
        set innerHTML(value) { this.html = value; this.children = []; }
        get innerHTML() { return this.html || this.textContent || ''; }
    }
    const get = id => nodes[id] ||= new Element();
    get('referenceStatus').value = 'active';
    const window = {
        location: {}, addEventListener() {},
        URL: {createObjectURL:() => 'blob:qa', revokeObjectURL:url => revoked.push(url)},
        QLPKUserFeedback: {show() {}},
        QLPKPagination: {create(options) { pager = {options, update(state) {this.state = state;}}; return pager; }},
        setTimeout(fn, delay) {timers.set(++timerId, {fn, delay}); return timerId;},
        clearTimeout(id) {timers.delete(id);}
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/static/js/medicines/reference-catalog.js'), 'utf8'), {
        window, URLSearchParams, AbortController,
        bootstrap: {Modal: {getOrCreateInstance: () => ({show() {}})}},
        document: {body:new Element(), getElementById:get, createElement:() => new Element(), addEventListener:(event, fn) => fn()},
        localStorage:{getItem:() => 'qa'}, sessionStorage:{getItem:() => null},
        fetch:(url, options) => new Promise((resolve, reject) => {
            requests.push({url, options, resolve});
            options.signal?.addEventListener('abort', () => reject(Object.assign(new Error(), {name:'AbortError'})));
        })
    });
    const settle = () => new Promise(resolve => setImmediate(resolve));
    const respond = async (index, items, total = items.length, summary = null) => {
        requests[index].resolve({ok:true, status:200, json:async() => ({success:true, data:items, total, summary})});
        await settle();
    };
    const input = value => {get('referenceSearch').value = value; get('referenceSearch').events.input();};
    const submit = () => get('referenceSearchForm').events.submit({preventDefault(){}});
    const tick = async delay => {
        for (const [id, timer] of [...timers]) if (timer.delay === delay) {timers.delete(id); timer.fn();}
        await settle();
    };
    return {get, requests, respond, input, submit, tick, pager, settle, downloads, revoked};
}

test('DAV detail labels inferred routes and prefers explicit source values', async () => {
    const h = setup(); await h.respond(0, [], 0);
    for (const [route, suggestion, expectedLabel, expectedValue] of [
        [null, 'Nhỏ mắt', 'Đường dùng (gợi ý)', 'Nhỏ mắt'],
        ['Tiêm tĩnh mạch', 'Tiêm', 'Đường dùng', 'Tiêm tĩnh mạch'],
        [null, null, 'Đường dùng', ''],
    ]) {
        h.get('referenceTableBody').events.click({target:{closest:()=>({dataset:{id:'1'}})}});
        h.requests.at(-1).resolve({ok:true, json:async()=>({success:true,data:{name:'Thuốc',route,suggested_route:suggestion}})});
        await h.settle();
        const html = h.get('referenceDetailContent').innerHTML;
        assert.ok(html.includes(`<div class="detail-label">${expectedLabel}</div>`));
        assert.ok(html.includes(`<div class="detail-value">${expectedValue}</div>`));
        if (route || !suggestion) assert.ok(!html.includes('Đường dùng (gợi ý)'));
    }
});

test('Enter submits current search once, resets pagination, and clears the debounce timer', async () => {
    const h = setup(); await h.respond(0, [], 100, {total:54752});
    h.pager.options.onChange(3, 10); await h.respond(1, [], 100);
    h.input('tablet'); h.submit(); h.submit(); await h.tick(350);
    assert.equal(h.requests.length, 3);
    assert.match(h.requests[2].url, /search=tablet.*page=1.*include_summary=0/);
    assert.equal(h.get('referenceSearchButton').disabled, true);
    assert.equal(h.get('referenceTableBody').children[0].children[0].textContent, 'Đang tìm thuốc DAV…');
    await h.respond(2, [{id:1,name:'02 Tablet'}], 1239);
    assert.equal(h.pager.state.total, 1239);
    assert.equal(h.get('referenceSearchButton').disabled, false);
    assert.equal(h.get('clinicPagination').classList.contains('d-none'), false);
});

test('Excel exports the selected filters across pages, deduplicates clicks and releases the download URL', async () => {
    const h = setup(); await h.respond(0, [], 1239);
    h.get('referenceSearch').value = ' tablet ';
    h.get('referenceStatus').value = 'expired';
    h.get('referenceExportButton').events.click();
    h.get('referenceExportButton').events.click();
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].url, /export\/excel\?search=tablet&status=expired$/);
    assert.equal(h.get('referenceExportButton').disabled, true);
    h.requests[1].resolve({ok:true, headers:{get:() => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}, blob:async() => ({})});
    await h.settle();
    assert.deepEqual(h.downloads, [{href:'blob:qa', download:'danh_muc_thuoc_DAV.xlsx'}]);
    assert.equal(h.get('referenceExportButton').disabled, false);
    await h.tick(1000);
    assert.deepEqual(h.revoked, ['blob:qa']);
});

test('failed Excel requests restore the button without downloading an error response', async () => {
    const h = setup(); await h.respond(0, [], 0);
    h.get('referenceExportButton').events.click();
    h.requests[1].resolve({ok:false, status:500});
    await h.settle();
    assert.equal(h.downloads.length, 0);
    assert.equal(h.get('referenceExportButton').disabled, false);
    h.get('referenceExportButton').events.click();
    assert.equal(h.requests.length, 3);
    await h.tick(120000);
    assert.equal(h.requests[2].options.signal.aborted, true);
    assert.equal(h.get('referenceExportButton').disabled, false);
});

test('changing the query aborts pending fetch and ignores its late result', async () => {
    const h = setup();
    h.input('tablet'); await h.tick(350);
    assert.equal(h.requests[0].options.signal.aborted, true);
    h.input('18'); await h.tick(350);
    assert.equal(h.requests[1].options.signal.aborted, true);
    await h.respond(2, [{id:18,name:'18 medicine'}], 9116);
    await h.respond(1, [{id:2,name:'old tablet'}], 1239);
    assert.equal(h.pager.state.total, 9116);
    assert.match(h.get('referenceTableBody').children[0].innerHTML, /18 medicine/);
});

test('timeout offers retry instead of leaving stale data, and an empty result clears pagination', async () => {
    const h = setup(); await h.tick(15000);
    assert.match(h.get('referenceTableBody').children[0].children[0].textContent, /quá lâu/);
    assert.equal(h.get('referenceSearchButton').disabled, false);
    h.submit(); await h.respond(1, [], 0);
    assert.equal(h.pager.state.total, 0);
    assert.match(h.get('referenceTableBody').innerHTML, /Không có dữ liệu/);
});
