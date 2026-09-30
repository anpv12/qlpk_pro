const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush, submit, manualTimers, Event } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/medicine-reference-catalog.html', 'utf8');
const BODY = template.slice(template.indexOf('<body'), template.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '')
    .replace("{% include 'partials/clinic-pagination.html' %}", fs.readFileSync('app/templates/partials/clinic-pagination.html', 'utf8'));

async function setup() {
    const downloads = [];
    const revoked = [];
    let pager;
    let tick;
    const page = await loadPage('medicines/reference-catalog.js', { html: BODY, before(window) {
        tick = manualTimers(window);
        window.URL = { createObjectURL: () => 'blob:qa', revokeObjectURL: url => revoked.push(url) };
        window.QLPKUserFeedback = { show() {} };
        window.QLPKApiTransport = { hasSession: () => true };
        window.QLPKPagination = { create(options) { pager = { options, update(state) { this.state = state; } }; return pager; } };
        globalThis.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {} }) } };
        window.document.getElementById('referenceStatus').value = 'active';
        const createElement = window.document.createElement.bind(window.document);
        window.document.createElement = tag => {
            const node = createElement(tag);
            if (tag === 'a') node.click = () => downloads.push({ href: node.getAttribute('href'), download: node.getAttribute('download') });
            return node;
        };
    } });
    const $ = id => page.document.getElementById(id);
    const respond = async (index, items, total = items.length, summary = null) => {
        page.requests[index].respond(200, { success: true, data: items, total, summary });
        await flush();
    };
    const input = value => { $('referenceSearch').value = value; $('referenceSearch').dispatchEvent(new Event('input')); };
    return { ...page, $, respond, input, tick, pager, downloads, revoked, submit: () => submit($('referenceSearchForm')) };
}

test('DAV detail labels inferred routes and prefers explicit source values', async () => {
    const h = await setup();
    await h.respond(0, [{ id: 1, name: 'Thuốc' }], 1);
    for (const [route, suggestion, expectedLabel, expectedValue] of [
        [null, 'Nhỏ mắt', 'Đường dùng (gợi ý)', 'Nhỏ mắt'],
        ['Tiêm tĩnh mạch', 'Tiêm', 'Đường dùng', 'Tiêm tĩnh mạch'],
        [null, null, 'Đường dùng', ''],
    ]) {
        h.$('referenceTableBody').querySelector('.reference-detail-btn').click();
        h.requests.at(-1).respond(200, { success: true, data: { name: 'Thuốc', route, suggested_route: suggestion } });
        await flush();
        const html = h.$('referenceDetailContent').innerHTML;
        assert.ok(html.includes(`<div class="detail-label">${expectedLabel}</div>`));
        assert.ok(html.includes(`<div class="detail-value">${expectedValue}</div>`));
        if (route || !suggestion) assert.ok(!html.includes('Đường dùng (gợi ý)'));
    }
});

test('catalogue values render as text, never markup', async () => {
    const h = await setup();
    await h.respond(0, [{ id: 7, name: '<img src=x>', registration_number: 'VN-1', old_registration_number: 'VN-0', strength: '5mg', is_expired: true }], 1);
    const row = h.$('referenceTableBody').querySelector('tr');
    assert.equal(row.querySelector('.drug-name').textContent, '<img src=x>');
    assert.equal(row.querySelector('img'), null);
    assert.equal(row.querySelector('.badge').textContent, 'Hết hạn');
    assert.equal(row.querySelectorAll('.muted-line').length, 6);
});

test('Enter submits current search once, resets pagination, and clears the debounce timer', async () => {
    const h = await setup();
    await h.respond(0, [], 100, { total: 54752 });
    h.pager.options.onChange(3, 10);
    await h.respond(1, [], 100);
    h.input('tablet'); h.submit(); h.submit(); await h.tick(350);
    assert.equal(h.requests.length, 3);
    assert.match(h.requests[2].url, /search=tablet.*page=1.*include_summary=0/);
    assert.equal(h.$('referenceSearchButton').disabled, true);
    assert.equal(h.$('referenceTableBody').children[0].children[0].textContent, 'Đang tìm thuốc DAV…');
    await h.respond(2, [{ id: 1, name: '02 Tablet' }], 1239);
    assert.equal(h.pager.state.total, 1239);
    assert.equal(h.$('referenceSearchButton').disabled, false);
    assert.equal(h.$('clinicPagination').classList.contains('d-none'), false);
});

test('Excel exports the selected filters across pages, deduplicates clicks and releases the download URL', async () => {
    const h = await setup();
    await h.respond(0, [], 1239);
    const label = h.$('referenceExportButton').innerHTML;
    h.$('referenceSearch').value = ' tablet ';
    h.$('referenceStatus').value = 'expired';
    h.$('referenceExportButton').click();
    h.$('referenceExportButton').click();
    assert.equal(h.requests.length, 2);
    assert.match(h.requests[1].url, /export\/excel\?search=tablet&status=expired$/);
    assert.equal(h.$('referenceExportButton').disabled, true);
    h.requests[1].respond(200, {}, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await flush();
    assert.deepEqual(h.downloads, [{ href: 'blob:qa', download: 'danh_muc_thuoc_DAV.xlsx' }]);
    assert.equal(h.$('referenceExportButton').disabled, false);
    assert.equal(h.$('referenceExportButton').innerHTML, label);
    await h.tick(1000);
    assert.deepEqual(h.revoked, ['blob:qa']);
});

test('failed Excel requests restore the button without downloading an error response', async () => {
    const h = await setup();
    await h.respond(0, [], 0);
    h.$('referenceExportButton').click();
    h.requests[1].respond(500, {});
    await flush();
    assert.equal(h.downloads.length, 0);
    assert.equal(h.$('referenceExportButton').disabled, false);
    h.$('referenceExportButton').click();
    assert.equal(h.requests.length, 3);
    await h.tick(120000);
    assert.equal(h.requests[2].signal.aborted, true);
    assert.equal(h.$('referenceExportButton').disabled, false);
});

test('changing the query aborts pending fetch and ignores its late result', async () => {
    const h = await setup();
    h.input('tablet'); await h.tick(350);
    assert.equal(h.requests[0].signal.aborted, true);
    h.input('18'); await h.tick(350);
    assert.equal(h.requests[1].signal.aborted, true);
    await h.respond(2, [{ id: 18, name: '18 medicine' }], 9116);
    h.requests[1].respond(200, { success: true, data: [{ id: 2, name: 'old tablet' }], total: 1239 });
    await flush();
    assert.equal(h.pager.state.total, 9116);
    assert.match(h.$('referenceTableBody').children[0].innerHTML, /18 medicine/);
});

test('timeout offers retry instead of leaving stale data, and an empty result clears pagination', async () => {
    const h = await setup();
    await h.tick(15000);
    assert.match(h.$('referenceTableBody').children[0].children[0].textContent, /quá lâu/);
    assert.equal(h.$('referenceSearchButton').disabled, false);
    h.submit();
    await h.respond(1, [], 0);
    assert.equal(h.pager.state.total, 0);
    assert.match(h.$('referenceTableBody').innerHTML, /Không có dữ liệu/);
});

test('DAV sync reports counts and reloads the first page with a fresh summary', async () => {
    const h = await setup();
    await h.respond(0, [], 0);
    h.$('syncDavBtn').click();
    assert.equal(h.$('syncDavBtn').disabled, true);
    assert.match(h.$('syncDavBtn').textContent, /Đang đồng bộ/);
    assert.deepEqual(h.requests[1].body, { page_size: 1000 });
    h.requests[1].respond(200, { success: true, result: { total_source: 9, fetched: 8, inserted: 2, updated: 3, skipped: 1 } });
    await flush();
    assert.equal(h.$('syncResult').textContent, 'Nguồn 9 thuốc, đã lấy 8, thêm 2, cập nhật 3, bỏ qua 1.');
    assert.match(h.requests[2].url, /page=1.*include_summary=1/);
    await h.respond(2, [], 0);
    assert.equal(h.$('syncDavBtn').disabled, false);
    assert.equal(h.$('syncDavBtn').innerHTML, '<i class="bi bi-cloud-arrow-down me-1"></i>Đồng bộ DAV');
});
