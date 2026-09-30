const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, flush, Event } = require('./helpers/esm-page');

const template = fs.readFileSync(path.join(__dirname, '../app/templates/icd-management.html'), 'utf8');
const BODY = template.slice(template.indexOf('<body'), template.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '')
    .replace("{% include 'partials/clinic-pagination.html' %}", fs.readFileSync(path.join(__dirname, '../app/templates/partials/clinic-pagination.html'), 'utf8'));
const transport = fs.readFileSync(path.join(__dirname, '../app/static/js/shared/api-transport.js'), 'utf8');

async function setup() {
    let pager;
    const page = await loadPage('icd-management.js', { html: BODY, url: 'https://clinic.test/icd-management.html', before(window) {
        window.localStorage.setItem('qlpk_token', 'active-qa-session');
        new Function('window', 'document', 'localStorage', transport)(window, window.document, window.localStorage);
        globalThis.fetch = window.fetch;
        window.QLPKPagination = { create: () => (pager = { update(value) { this.value = value; } }) };
        window.QLPKUserFeedback = { show() {} };
        window.bootstrap = { Modal: { getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
    } });
    const $ = selector => page.document.querySelector(selector);
    const payload = (current, rows, total = 21) => ({ data: rows, pagination: { current_page: current, per_page: 10, total_count: total, total_pages: Math.ceil(total / 10) } });
    const list = () => page.requests.filter(request => request.url.startsWith('/api/icd/?'));
    return { ...page, $, payload, list, pager: () => pager, visible: () => $('#clinicPagination').style.display !== 'none' };
}

test('ICD uses the real shared auth wrapper and sends server pagination/search', async () => {
    const h = await setup();
    const load = h.module.loadICDList(2);
    const request = h.list().at(-1);
    assert.equal(request.headers.get('Authorization'), 'Bearer active-qa-session');
    assert.match(request.url, /skip=10&limit=10/);
    assert.equal(h.visible(), false);
    request.respond(200, h.payload(2, [{ id: 11, icd_code: 'A01', disease_name: 'Tên bệnh', created_at: null }]));
    await load;
    assert.match(h.$('#icdTableBody').textContent, /A01/);
    assert.equal(h.pager().value.page, 2);
    assert.equal(h.visible(), true);
    h.$('#searchInput').value = 'bệnh';
    const option = h.document.createElement('option');
    option.setAttribute('value', 'Nhóm');
    h.$('#diseaseGroupFilter').append(option);
    h.$('#diseaseGroupFilter').value = 'Nhóm';
    h.$('#icdSearchForm').dispatchEvent(new Event('submit'));
    const query = new URL(h.list().at(-1).url, 'http://localhost').searchParams;
    assert.equal(query.get('skip'), '0');
    assert.equal(query.get('search'), 'bệnh');
    assert.equal(query.get('disease_group'), 'Nhóm');
});

test('failed requests show retry, not empty data or a misleading zero pager', async () => {
    const h = await setup();
    const load = h.module.loadICDList();
    h.list().at(-1).respond(500, {});
    await load;
    assert.ok(h.$('#icdTableBody #retryICDList'));
    assert.equal(h.visible(), false);
    assert.equal(h.$('#icdTableBody').getAttribute('aria-busy'), 'false');
    h.$('#retryICDList').click();
    h.list().at(-1).respond(200, h.payload(1, [], 0));
    await flush();
    assert.match(h.$('#icdTableBody').textContent, /Không tìm thấy/);
    assert.equal(h.visible(), true);
});

test('late responses cannot replace the newer result or clear its loading state', async () => {
    const h = await setup();
    const first = h.module.loadICDList(1);
    const firstRequest = h.list().at(-1);
    const second = h.module.loadICDList(2);
    const secondRequest = h.list().at(-1);
    firstRequest.respond(200, h.payload(1, []));
    await first;
    assert.equal(h.$('#icdTableBody').getAttribute('aria-busy'), 'true');
    secondRequest.respond(200, h.payload(2, [{ id: 2, icd_code: 'NEW', disease_name: 'Mới' }]));
    await second;
    assert.match(h.$('#icdTableBody').textContent, /NEW/);
    assert.equal(h.pager().value.page, 2);
});

test('a deleted last-page row returns the list to the last valid server page', async () => {
    const h = await setup();
    const load = h.module.loadICDList(3);
    h.list().at(-1).respond(200, h.payload(3, [], 11));
    await flush();
    assert.match(h.list().at(-1).url, /skip=10/);
    h.list().at(-1).respond(200, h.payload(2, [{ id: 11, icd_code: 'LAST', disease_name: 'Cuối' }], 11));
    await load;
    assert.equal(h.pager().value.page, 2);
});

test('ICD ignores repeated saves while pending and unlocks the real form buttons on failure', async () => {
    const h = await setup();
    const buttons = [...h.document.querySelectorAll('#addICDForm button[type="submit"], #editICDForm button[type="submit"]')];
    assert.equal(buttons.length, 2);
    h.$('#icdCode').value = 'A00';
    h.$('#diseaseName').value = 'Tả';
    const saves = () => h.requests.filter(request => request.init.method === 'POST');
    const first = h.module.saveICD();
    await h.module.saveICD();
    assert.equal(saves().length, 1);
    assert.ok(buttons.every(button => button.disabled && button.getAttribute('aria-busy') === 'true'));
    saves()[0].respond(500, {});
    await first;
    assert.ok(buttons.every(button => !button.disabled && button.getAttribute('aria-busy') === 'false'));
    const retry = h.module.saveICD();
    assert.equal(saves().length, 2);
    saves()[1].respond(500, {});
    await retry;
});

test('ICD format validation is wired to both actual template inputs', async () => {
    const h = await setup();
    for (const id of ['icdCode', 'editICDCode']) {
        const field = h.$('#' + id);
        field.value = 'A00 invalid!';
        field.dispatchEvent(new Event('blur', { bubbles: false }));
        assert.ok(field.classList.contains('is-invalid'));
        assert.match(field.parentElement.querySelector('.invalid-feedback').textContent, /Mã ICD chỉ được chứa/);
        field.value = 'A00.0';
        assert.equal(h.module.validateField(field), true);
        assert.ok(field.classList.contains('is-valid'));
    }
});

test('ICD rows render codes and names as text', async () => {
    const h = await setup();
    const load = h.module.loadICDList(1);
    h.list().at(-1).respond(200, h.payload(1, [{ id: 5, icd_code: '<b>X</b>', disease_name: '<img src=x>', created_at: null }], 1));
    await load;
    assert.equal(h.$('#icdTableBody img, #icdTableBody b'), null);
    assert.equal(h.$('#icdTableBody [data-icd-action="delete"]').dataset.icdCode, '<b>X</b>');
});
