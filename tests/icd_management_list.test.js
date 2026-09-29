const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { runScriptFile } = require('./helpers/module-source');

function setup() {
    const nodes = new Map(), requests = [];
    function $(selector) {
        if (!nodes.has(selector)) nodes.set(selector, {
            visible: true, htmlValue: '', value: '', attributes: {},
            ready() { return this; }, ajaxSend() { return this; }, ajaxError() { return this; },
            on() { return this; }, find() { return this; }, not() { return this; }, remove() { return this; },
            empty() { this.htmlValue = ''; return this; },
            html(value) { this.htmlValue = value; return this; },
            append(value) { this.htmlValue += value; return this; },
            show() { this.visible = true; return this; }, hide() { this.visible = false; return this; },
            attr(key, value) { if (value === undefined) return this.attributes[key]; this.attributes[key] = value; return this; },
            prop(key, value) { if (value === undefined) return this.attributes[key]; this.attributes[key] = value; return this; },
            addClass() { return this; }, removeClass() { return this; },
            siblings() { return this; },
            val(value) { if (value === undefined) return this.value; this.value = value; return this; },
            text(value) { this.textValue = value; return this; }
        });
        return nodes.get(selector);
    }
    const window = {
        location: { href: 'https://clinic.test/icd-management.html', origin: 'https://clinic.test' },
        QLPKSharedUtils: { escapeHtml: value => String(value).replace(/</g, '&lt;') },
        fetch(url, options) { return new Promise(resolve => requests.push({url, options, resolve})); }
    };
    const context = vm.createContext({window, document: {}, $, Headers, URL, URLSearchParams, setTimeout,
        localStorage: {getItem: key => key === 'qlpk_token' ? 'active-qa-session' : 'stale-legacy-session'}
    });
    Object.defineProperty(context, 'fetch', {get: () => window.fetch});
    window.localStorage = context.localStorage;
    runScriptFile(path.join(__dirname, '../app/static/js/shared/api-transport.js'), context);
    runScriptFile(path.join(__dirname, '../app/static/js/icd-management.js'), context);
    context.pager = {update(value) { this.value = value; }};
    vm.runInContext('listPagination = pager;', context);
    const respond = (request, data, status = 200) => request.resolve({ok: status < 400, status, json: async () => data});
    const payload = (page, rows, total = 21) => ({data: rows, pagination: {
        current_page: page, per_page: 10, total_count: total, total_pages: Math.ceil(total / 10)
    }});
    return {context, $, requests, respond, payload};
}

test('ICD uses the real shared auth wrapper and sends server pagination/search', async () => {
    const h = setup();
    const load = h.context.loadICDList(2);
    assert.equal(h.requests[0].options.headers.get('Authorization'), 'Bearer active-qa-session');
    assert.match(h.requests[0].url, /skip=10&limit=10/);
    assert.equal(h.$('#clinicPagination').visible, false);
    h.respond(h.requests[0], h.payload(2, [{id: 11, icd_code: 'A01', disease_name: 'Tên bệnh', created_at: null}]));
    await load;
    assert.match(h.$('#icdTableBody').htmlValue, /A01/);
    assert.equal(h.context.pager.value.page, 2);
    assert.equal(h.$('#clinicPagination').visible, true);
    h.$('#searchInput').val('bệnh'); h.$('#diseaseGroupFilter').val('Nhóm');
    h.context.searchICD();
    const query = new URL(h.requests[1].url, 'http://localhost').searchParams;
    assert.equal(query.get('skip'), '0'); assert.equal(query.get('search'), 'bệnh');
    assert.equal(query.get('disease_group'), 'Nhóm');
});

test('failed requests show retry, not empty data or a misleading zero pager', async () => {
    const h = setup(); const load = h.context.loadICDList();
    h.respond(h.requests[0], {}, 500); await load;
    assert.match(h.$('#icdTableBody').htmlValue, /retryICDList/);
    assert.equal(h.$('#clinicPagination').visible, false);
    assert.equal(h.$('#icdTableBody').attributes['aria-busy'], 'false');
    const retry = h.context.loadICDList();
    h.respond(h.requests[1], h.payload(1, [], 0)); await retry;
    assert.match(h.$('#icdTableBody').htmlValue, /Không tìm thấy/);
    assert.equal(h.$('#clinicPagination').visible, true);
});

test('late responses cannot replace the newer result or clear its loading state', async () => {
    const h = setup(); const first = h.context.loadICDList(1), second = h.context.loadICDList(2);
    h.respond(h.requests[0], h.payload(1, [])); await first;
    assert.equal(h.$('#icdTableBody').attributes['aria-busy'], 'true');
    h.respond(h.requests[1], h.payload(2, [{id: 2, icd_code: 'NEW', disease_name: 'Mới'}])); await second;
    assert.match(h.$('#icdTableBody').htmlValue, /NEW/);
    assert.equal(h.context.pager.value.page, 2);
});

test('a deleted last-page row returns the list to the last valid server page', async () => {
    const h = setup(); const load = h.context.loadICDList(3);
    h.respond(h.requests[0], h.payload(3, [], 11));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(h.requests[1].url, /skip=10/);
    h.respond(h.requests[1], h.payload(2, [{id: 11, icd_code: 'LAST', disease_name: 'Cuối'}], 11));
    await load; assert.equal(h.context.pager.value.page, 2);
});

test('ICD ignores repeated saves while pending and unlocks the real form buttons on failure', async () => {
    const h = setup();
    const template = fs.readFileSync(path.join(__dirname, '../app/templates/icd-management.html'), 'utf8');
    for (const formId of ['addICDForm', 'editICDForm']) {
        const form = template.match(new RegExp(`<form id="${formId}">([\\s\\S]*?)</form>`));
        assert.ok(form && /<button\b[^>]*type="submit"/.test(form[1]), 'The selector must target an actual submit button');
    }
    h.context.validateForm = () => true;
    const buttons = h.$('#addICDForm button[type="submit"], #editICDForm button[type="submit"]');
    const first = h.context.saveICD();
    await h.context.saveICD();
    assert.equal(h.requests.length, 1);
    assert.equal(buttons.attributes.disabled, true);
    assert.equal(buttons.attributes['aria-busy'], 'true');
    h.respond(h.requests[0], {}, 500);
    await first;
    assert.equal(buttons.attributes.disabled, false);
    assert.equal(buttons.attributes['aria-busy'], 'false');
    const retry = h.context.saveICD();
    assert.equal(h.requests.length, 2);
    h.respond(h.requests[1], {}, 500);
    await retry;
});

test('ICD format validation is wired to both actual template inputs', () => {
    const h = setup();
    const template = fs.readFileSync(path.join(__dirname, '../app/templates/icd-management.html'), 'utf8');
    for (const id of ['icdCode', 'editICDCode']) {
        const input = template.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0];
        const field = h.$('#' + id);
        field.attr('name', input.match(/name="([^"]+)"/)?.[1]);
        field.prop('required', /\brequired\b/.test(input));
        field.val('A00 invalid!');
        assert.equal(h.context.validateField(field), false);
        assert.match(field.textValue, /Mã ICD chỉ được chứa/);
        field.val('A00.0');
        assert.equal(h.context.validateField(field), true);
    }
});
