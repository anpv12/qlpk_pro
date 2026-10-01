'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { readCssSource } = require('./helpers/css-source');
const { readTemplateSource } = require('./helpers/template-source');

async function setup() {
    const env = require('./helpers/autocomplete-dom').createEnvironment();
    const {window, document, context, Element} = env;
    const nodes = {}, requests = [];
    const field = env.createField('medicineReviewField');
    nodes.medicineReviewField = field.root;
    nodes.medicineReviewSearch = field.input;
    const get = id => {
        if (!nodes[id]) { nodes[id] = new Element(); nodes[id].id = id; document.body.append(nodes[id]); }
        return nodes[id];
    };
    document.getElementById = get;
    const root = get('medicineReferenceReviewModal');
    let closes = 0, reloads = 0;
    const modal = {show() {}, hide() { root.fire('hide.bs.modal'); closes++; }};
    Object.assign(window, {bootstrap: {Modal: {getOrCreateInstance: () => modal}}});
    Object.assign(context, {localStorage: {getItem: () => 'QA'},
        fetch: (url, options) => new Promise(resolve => requests.push({url, options, resolve}))});
    env.load('app/static/js/components/autocomplete-field.js');
    const module = await env.loadModule('medicines/reference-review.js');
    module.configureReferenceReview({ onLinked() { reloads++; } });
    document.fire('DOMContentLoaded');
    const flush = () => new Promise(resolve => setImmediate(resolve));
    const respond = async (index, data, ok = true) => {
        requests[index].resolve({ok, json: async () => data}); await flush();
    };
    const input = value => {
        if (field.input.disabled) get('medicineReviewChange').fire('click');
        field.input.value = value; field.input.fire('input');
    };
    return {window, module, get, requests, respond, input, root, field, flush,
        tick: async () => { env.tick(); await flush(); }, closed: () => closes, reloaded: () => reloads};
}

const preview = (id = 1) => ({medicine_id: id, original: {name: 'Tên cũ '+id}, reference: {
    id: id + 10, name: 'DAV '+id, registration_number: 'VD-'+id, updated_at: 'source-v1'
}, medicine_version: 'medicine-v1', can_apply: true, review_status: 'pending', message: ''});

test('allowed replacement hides advisory text but blocked replacement keeps its error', async () => {
    const harness = await setup();
    harness.module.openMedicineReferenceReview(1);
    await harness.respond(0, {...preview(), reference: null});
    harness.input('DAV');
    await harness.tick();
    await harness.respond(1, {data: [{id: 11, name: 'DAV 1'}], has_more: false});
    harness.field.list.children[0].fire('click');
    await harness.respond(2, {...preview(), message: 'Thông tin đối chiếu'});
    assert.equal(harness.get('medicineReviewStatus').hidden, true);
    harness.input('Khác');
    await harness.tick();
    await harness.respond(3, {data: [{id: 12, name: 'DAV 2'}], has_more: false});
    harness.field.list.children[0].fire('click');
    await harness.respond(4, {...preview(), can_apply: false, message: 'Không thể liên kết'});
    assert.equal(harness.get('medicineReviewStatus').textContent, 'Không thể liên kết');
    assert.equal(harness.get('medicineReviewStatus').hidden, false);
    assert.equal(harness.get('medicineReviewSave').disabled, true);
});

test('save enables once preview applies; one submit preserves preview versions and blocks dismissal', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    assert.equal(h.get('medicineReviewSave').disabled, true);
    await h.respond(0, preview());
    assert.equal(h.get('medicineReviewSave').disabled, false);
    h.get('medicineReviewSave').fire('click');
    h.get('medicineReviewSave').fire('click');
    assert.equal(h.requests.length, 2);
    const payload = JSON.parse(h.requests[1].options.body);
    assert.equal(payload.reference_version, 'source-v1');
    assert.equal(payload.reference_medicine_version, 'medicine-v1');
    assert.equal(payload.reference_link_confirmed, true);
    let prevented = false;
    h.root.fire('hide.bs.modal', {preventDefault: () => {prevented = true;}});
    assert.equal(prevented, true);
    await h.respond(1, {medicine: {}});
    assert.equal(h.closed(), 1);
    assert.equal(h.reloaded(), 1);
});

test('review modal follows content height with one bounded scrolling body and an aligned comparison table', () => {
    const css = readCssSource(path.join(__dirname, '../app/static/css/pages/medicine-management.css'));
    const template = readTemplateSource('medicine-management.html');
    assert.match(css, /\.modal\.qlpk-medicine-reference-review-modal \.modal-content\s*\{[^}]*max-height:\s*calc\(100dvh - 1rem\)/);
    assert.doesNotMatch(css, /\.modal\.qlpk-medicine-reference-review-modal \.(?:modal-dialog|modal-content)\s*\{[^}]*(?:\s|;)height:/);
    assert.match(css, /\.modal\.qlpk-medicine-reference-review-modal \.modal-body\s*\{[^}]*overflow-y:\s*auto/);
    assert.match(css, /\.mm-review-table\s*\{[^}]*table-layout:\s*fixed/);
    assert.match(template, /<tbody id="medicineReviewComparison"><\/tbody>/);
    assert.match(template, /<th scope="col">Hiện tại<\/th>/);
    assert.match(template, /id="medicineReviewChange" hidden>Đổi thuốc DAV/);
    assert.match(template, /id="medicineReviewCompareSection"[^>]*hidden/);
    assert.match(template, /id="medicineReviewAfterTitle">Dự kiến sau khi liên kết/);
    assert.match(css, /\.mm-review-start\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.mm-review-start\s*\{[^}]*align-items:\s*stretch/);
    assert.doesNotMatch(template + css, /mm-review-card/);
    const script = fs.readFileSync(path.join(__dirname, '../app/static/js/medicines/reference-review.js'), 'utf8');
    assert.doesNotMatch(template + css + script, /medicineReviewSource|mm-review-source|mm-review-details/);
    assert.doesNotMatch(template + css + script, /medicineReviewLegend|medicineReviewNote|mm-review-legend|mm-review-note/);
    assert.doesNotMatch(template + script, /Chọn đúng thuốc theo thông tin trên bao bì|thông tin sẽ thay đổi khi lưu/);
});

test('comparison aligns shared fields and highlights only the differing DAV cells', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), original: {name: 'Tên cũ 1', generic_name: 'Hoạt chất A', origin: 'Việt Nam'},
        reference: {...preview().reference, active_ingredient: 'hoạt chất a ', manufacturer_country: 'Philippines'}});
    const rows = h.get('medicineReviewComparison').children;
    assert.equal(h.get('medicineReviewChanges').hidden, true);
    assert.deepEqual(rows.map(row => row.children[0].textContent), ['Tên thuốc', 'Hoạt chất', 'Hàm lượng', 'Nước sản xuất']);
    assert.ok(rows.every(row => row.children.length === 3 && row.children[0].getAttribute('scope') === 'row'));
    assert.deepEqual(rows.filter(row => row.children[2].classList.contains('mm-review-diff')).map(row => row.children[0].textContent), ['Tên thuốc', 'Nước sản xuất']);
    assert.ok(rows.every(row => !row.children[1].classList.contains('mm-review-diff')));
});

test('switching medicines or closing discards late preview responses', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    h.module.openMedicineReferenceReview(2);
    await h.respond(1, preview(2));
    await h.respond(0, preview(1));
    assert.equal(h.get('medicineReviewComparison').children[0].children[1].textContent, 'Tên cũ 2');
    h.module.openMedicineReferenceReview(3);
    h.root.fire('hide.bs.modal');
    await h.respond(2, preview(3));
    assert.equal(h.get('medicineReviewSave').disabled, true);
    assert.equal(h.get('medicineReviewComparison').children.length, 0);
});

test('search clears old DAV values and highlights but preserves the original identity', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, preview());
    h.input('Thuốc khác');
    const rows = h.get('medicineReviewComparison').children;
    assert.equal(rows[0].children[1].textContent, 'Tên cũ 1');
    assert.ok(rows.every(row => row.children[2].textContent === 'Chưa chọn thuốc'));
    assert.equal(h.get('medicineReviewSave').disabled, true);
});

test('missing source fields remain explicit and matching fields do not show a difference legend', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), original: {name: ' DAV 1 '}});
    const rows = h.get('medicineReviewComparison').children;
    assert.equal(rows[2].children[2].textContent, 'Chưa có thông tin');
    assert.equal(rows[2].children[2].classList.contains('mm-review-missing'), true);
});

test('an unlinked medicine keeps its original identity without showing stale DAV details', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), reference: null, can_apply: false});
    assert.equal(h.get('medicineReviewComparison').children[0].children[1].textContent, 'Tên cũ 1');
    assert.equal(h.get('medicineReviewComparison').children[0].children[2].textContent, 'Chưa chọn thuốc');
    assert.equal(h.get('medicineReviewSave').disabled, true);
});

test('search by medicine name returns choices and selection fetches fresh preview, resetting save state', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, preview());
    h.input('Diropam'); await h.tick();
    assert.equal(h.get('medicineReviewSave').disabled, true);
    const searchIndex = h.requests.findIndex(item => item.url.includes('search=Diropam'));
    assert.notEqual(searchIndex, -1);
    assert.doesNotMatch(h.requests[searchIndex].url, /registration_number=/);
    await h.respond(searchIndex, {data: [{id: 20, name: 'Diropam', active_ingredient: 'Tofisopam'}], has_more: false});
    h.field.list.children[0].fire('click');
    assert.match(h.requests.at(-1).url, /reference_catalog_id=20/);
    await h.respond(h.requests.length - 1, {...preview(), can_apply: false, message: 'Đã liên kết với thuốc khác'});
    assert.equal(h.get('medicineReviewSave').disabled, true);
});

test('failed or stale save invalidates selection and requires a fresh review', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, preview());
    h.get('medicineReviewSave').fire('click');
    await h.respond(1, {error: 'Thông tin vừa thay đổi.'}, false);
    assert.equal(h.closed(), 0);
    assert.equal(h.get('medicineReviewSave').disabled, true);
    assert.match(h.get('medicineReviewStatus').textContent, /Thông tin vừa thay đổi/);
});

test('review shows current inventory identity and server-owned changes, not the historical name', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), current: {name: 'Thuốc đang lưu', strength: '5 mg'},
        rows: [{label: 'Tên thuốc', before: 'Thuốc đang lưu', after: 'DAV 1'},
            {label: 'Hàm lượng', before: '5 mg', after: null},
            {label: 'Đường dùng', before: 'Uống', after: 'Đường uống'}]});
    assert.equal(h.get('medicineReviewTargetName').textContent, 'Thuốc đang lưu');
    assert.equal(h.get('medicineReviewComparison').children[0].children[1].textContent, 'Thuốc đang lưu');
    assert.equal(h.get('medicineReviewComparison').children[2].children[0].textContent, 'Đường dùng');
    assert.doesNotMatch(h.get('medicineReviewChanges').textContent, /thông tin sẽ thay đổi/);
    assert.match(h.get('medicineReviewChanges').textContent, /hàm lượng; giá trị đang lưu sẽ bị để trống/);
    h.input('Khác');
    assert.equal(h.get('medicineReviewTargetName').textContent, 'Thuốc đang lưu');
    assert.doesNotMatch(h.get('medicineReviewChanges').textContent, /bị để trống/);
});

test('existing link status stays distinct from a newly selected candidate and clears on reopen', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), review_status: 'confirmed'});
    assert.match(h.get('medicineReviewLinkStatus').textContent, /Đã liên kết DAV/);
    assert.equal(h.get('medicineReviewSearchSection').hidden, true);
    h.input('Khác'); await h.tick();
    await h.respond(h.requests.length - 1, {data: [{id: 20, name: 'Thuốc khác'}], has_more: false});
    h.field.list.children[0].fire('click');
    await h.respond(h.requests.length - 1, {...preview(), reference: {...preview().reference, id: 20, name: 'Thuốc khác'}, review_status: 'confirmed'});
    assert.equal(h.get('medicineReviewStatus').hidden, true);
    h.module.openMedicineReferenceReview(2);
    assert.equal(h.get('medicineReviewLinkStatus').textContent, '');
    assert.equal(h.get('medicineReviewTargetDetails').textContent, '');
    assert.equal(h.get('medicineReviewTargetName').textContent, 'Đang tải thuốc trong kho…');
});

const confirmedPreview = () => ({...preview(), current: {name: 'DAV 1'},
    rows: [{label: 'Tên thuốc', before: 'DAV 1', after: 'DAV 1'}], review_status: 'confirmed'});

async function choose(h, reference) {
    h.input(reference.name); await h.tick();
    await h.respond(h.requests.length - 1, {data: [reference], has_more: false});
    h.field.list.children[0].fire('click');
    return h.requests.length - 1;
}

test('confirmed unchanged link opens as a summary and cannot submit redundantly', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    assert.equal(h.get('medicineReviewSearch').disabled, true);
    await h.respond(0, confirmedPreview());
    assert.equal(h.get('medicineReviewSearchSection').hidden, true);
    assert.equal(h.get('medicineReviewCompareSection').hidden, true);
    assert.equal(h.get('medicineReviewSave').hidden, true);
    assert.equal(h.get('medicineReviewSave').disabled, true);
    assert.equal(h.get('medicineReviewChange').hidden, false);
    assert.equal(h.get('medicineReviewStatus').hidden, true);
    h.get('medicineReviewSave').fire('click');
    assert.equal(h.requests.length, 1);
});

test('unlinked medicine only previews after selection and retains the link action', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...preview(), reference: null, review_status: 'unlinked', can_apply: false});
    assert.equal(h.get('medicineReviewSearchSection').hidden, false);
    assert.equal(h.get('medicineReviewCompareSection').hidden, true);
    assert.equal(h.get('medicineReviewChange').hidden, true);
    const index = await choose(h, preview().reference);
    await h.respond(index, {...preview(), review_status: 'unlinked'});
    assert.equal(h.get('medicineReviewCompareSection').hidden, false);
    assert.equal(h.get('medicineReviewSave').textContent, 'Liên kết với thuốc đã chọn');
    assert.equal(h.get('medicineReviewSave').disabled, false);
});

test('same selected DAV stays a no-op but another ID with identical text is a real link change', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, confirmedPreview());
    let index = await choose(h, preview().reference);
    await h.respond(index, confirmedPreview());
    assert.equal(h.get('medicineReviewSave').hidden, true);
    assert.equal(h.get('medicineReviewCompareSection').hidden, true);
    assert.match(h.get('medicineReviewStatus').textContent, /Không cần lưu lại/);
    const different = {...preview().reference, id: 20};
    index = await choose(h, different);
    await h.respond(index, {...confirmedPreview(), reference: different});
    assert.equal(h.get('medicineReviewCompareSection').hidden, false);
    assert.equal(h.get('medicineReviewAfterTitle').textContent, 'Dự kiến sau khi đổi');
    assert.equal(h.get('medicineReviewSave').textContent, 'Lưu liên kết mới');
    h.get('medicineReviewSave').fire('click');
    assert.equal(JSON.parse(h.requests.at(-1).options.body).reference_catalog_id, 20);
});

test('same-source update and pending confirmation are distinct from changing the DAV medicine', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...confirmedPreview(), review_status: 'stale',
        rows: [{label: 'Tên thuốc', before: 'Tên cũ', after: 'Tên mới'}]});
    assert.equal(h.get('medicineReviewCompareSection').hidden, false);
    assert.equal(h.get('medicineReviewSave').textContent, 'Cập nhật từ DAV');
    assert.equal(h.get('medicineReviewAfterTitle').textContent, 'Dự kiến sau khi cập nhật');
    h.module.openMedicineReferenceReview(2);
    await h.respond(1, {...confirmedPreview(), review_status: 'pending'});
    assert.equal(h.get('medicineReviewSave').textContent, 'Xác nhận liên kết hiện tại');
    assert.equal(h.get('medicineReviewSave').disabled, false);
});

test('metadata-only stale source avoids an identical table, and unavailable sources remain blocked', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, {...confirmedPreview(), review_status: 'stale'});
    assert.equal(h.get('medicineReviewCompareSection').hidden, true);
    assert.equal(h.get('medicineReviewSave').textContent, 'Cập nhật từ DAV');
    assert.match(h.get('medicineReviewStatus').textContent, /các thông tin đối chiếu không đổi/);
    h.module.openMedicineReferenceReview(2);
    await h.respond(1, {...confirmedPreview(), review_status: 'stale', can_apply: false, message: 'Thuốc không còn được chọn'});
    assert.equal(h.get('medicineReviewSave').disabled, true);
    assert.equal(h.get('medicineReviewStatus').textContent, 'Thuốc không còn được chọn');
    assert.equal(h.get('medicineReviewChange').hidden, false);
});

test('cancel change reloads saved link and rejects a late candidate response without writing', async () => {
    const h = await setup();
    h.module.openMedicineReferenceReview(1);
    await h.respond(0, confirmedPreview());
    const different = {...preview().reference, id: 20};
    const candidateIndex = await choose(h, different);
    h.get('medicineReviewCancelChange').fire('click');
    const reloadIndex = h.requests.length - 1;
    assert.doesNotMatch(h.requests[reloadIndex].url, /reference_catalog_id=/);
    await h.respond(reloadIndex, confirmedPreview());
    await h.respond(candidateIndex, {...confirmedPreview(), reference: different});
    assert.equal(h.get('medicineReviewSave').hidden, true);
    assert.equal(h.get('medicineReviewSearchSection').hidden, true);
    assert.equal(h.get('medicineReviewCompareSection').hidden, true);
    assert.equal(h.requests.some(item => item.options.method === 'POST'), false);
});
