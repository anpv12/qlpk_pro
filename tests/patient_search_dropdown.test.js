const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createEnvironment } = require('./helpers/autocomplete-dom');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function setup() {
    const env = createEnvironment();
    env.load('app/static/js/components/patient-search-dropdown.js');
    const row = new env.Element('tr'), nameInput = new env.Element('input'), dropdown = new env.Element('div');
    row.append(nameInput, dropdown);
    env.document.body.append(row);
    const calls = { searches: [], selected: [], cleared: 0, changed: 0 };
    let resolveSearch;
    const handlers = env.window.QLPKPatientSearchDropdown.attach({
        row, nameInput, dropdown, floatingClass: 'relative-search-dropdown--floating',
        search: (query, target, { onSelect, onShow, perPage, shouldRender }) => {
            calls.searches.push({ query, perPage });
            return new Promise(resolve => { resolveSearch = () => { if (shouldRender()) { target.innerHTML = 'results'; onShow(); } onSelect({ id: 7 }); resolve(); }; });
        },
        onSelect: patient => calls.selected.push(patient),
        onQueryCleared: () => { calls.cleared += 1; },
        onQueryChanged: () => { calls.changed += 1; }
    });
    env.tick();
    return { env, row, nameInput, dropdown, calls, handlers, finishSearch: () => resolveSearch() };
}

test('the opening click of an add/edit button cannot close a dropdown opened by synchronous focus', async () => {
    const env = createEnvironment();
    env.load('app/static/js/components/patient-search-dropdown.js');
    const row = new env.Element('tr'), nameInput = new env.Element('input'), dropdown = new env.Element('div'), button = new env.Element('button');
    row.append(nameInput, dropdown);
    env.document.body.append(row, button);
    const handlers = env.window.QLPKPatientSearchDropdown.attach({ row, nameInput, dropdown, floatingClass: 'x', search: () => new Promise(() => {}), onSelect() {} });
    nameInput.focus();
    assert.equal(dropdown.dataset.visible, 'true');
    await env.document.fire('click', { target: button });
    assert.equal(dropdown.dataset.visible, 'true', 'click that is still bubbling must not close the dropdown');
    env.tick();
    await env.document.fire('click', { target: button });
    assert.equal(dropdown.dataset.visible, 'false', 'later outside clicks close it');
    handlers.dispose();
    assert.equal((env.document.events.click || []).length, 0);
});

test('focus loads recent patients and a selection closes the dropdown', async () => {
    const state = setup();
    state.nameInput.focus();
    assert.deepEqual(state.calls.searches, [{ query: '', perPage: 10000 }]);
    assert.equal(state.dropdown.dataset.visible, 'true');
    assert.match(state.dropdown.innerHTML, /Đang tải/);
    state.finishSearch();
    await Promise.resolve();
    assert.deepEqual(state.calls.selected, [{ id: 7 }]);
    assert.equal(state.dropdown.dataset.visible, 'false');
});

test('typing debounces, clears links on short queries and ignores stale results', async () => {
    const state = setup();
    state.nameInput.focus();
    state.nameInput.value = 'a';
    await state.nameInput.fire('input');
    assert.equal(state.calls.cleared, 1);
    assert.match(state.dropdown.innerHTML, /Nhập tên/);
    state.nameInput.value = 'an';
    await state.nameInput.fire('input');
    assert.equal(state.calls.changed, 1);
    assert.equal(state.calls.searches.length, 1, 'debounced search waits for the timer');
    state.env.tick();
    assert.deepEqual(state.calls.searches.at(-1), { query: 'an', perPage: 10000 });
    state.nameInput.value = 'anh';
    await state.nameInput.fire('input');
    state.finishSearch();
    await Promise.resolve();
    assert.equal(state.calls.selected.length, 0, 'stale search result must not select a patient');
});

test('keyboard navigation, escape and dispose stay within the shared owner', async () => {
    const state = setup();
    state.nameInput.focus();
    const first = new state.env.Element('div'), second = new state.env.Element('div');
    [first, second].forEach(item => { item.className = 'relative-search-item'; item.scrollIntoView = () => {}; state.dropdown.append(item); });
    state.dropdown.querySelector = selector => (selector === '.relative-search-item.active' ? [first, second].find(item => item.classList.contains('active')) || null : null);
    await state.nameInput.fire('keydown', { key: 'ArrowDown' });
    assert.equal(first.classList.contains('active'), true);
    await state.nameInput.fire('keydown', { key: 'ArrowDown' });
    assert.equal(second.classList.contains('active'), true);
    let clicked = 0;
    second.addEventListener('click', () => { clicked += 1; });
    await state.nameInput.fire('keydown', { key: 'Enter' });
    assert.equal(clicked, 1);
    await state.nameInput.fire('keydown', { key: 'Escape' });
    assert.equal(state.dropdown.dataset.visible, 'false');
    state.handlers.dispose();
    state.finishSearch();
    await Promise.resolve();
    assert.equal(state.calls.selected.length, 0, 'disposed dropdown ignores late results');
    assert.equal(state.env.document.events.click.length, 0, 'document click listener removed');
});

test('result rendering escapes values and reports empty results', () => {
    const env = createEnvironment();
    env.load('app/static/js/components/patient-search-dropdown.js');
    const dropdown = new env.Element('div');
    dropdown.querySelectorAll = () => [];
    env.window.QLPKPatientSearchDropdown.renderPatientResults(dropdown, [{ id: 3, full_name: '<b>An</b>', phone: '090', latest_diagnosis: 'F32' }], {
        escapeHtml: value => String(value).replace(/</g, '&lt;'), formatDateDisplay: value => value,
        nameClass: 'relative-search-name', metaClass: 'relative-search-meta', onSelect() {}, shouldRender: () => true
    });
    assert.match(dropdown.innerHTML, /&lt;b>An/);
    assert.match(dropdown.innerHTML, /data-patient-id="3"/);
    env.window.QLPKPatientSearchDropdown.renderPatientResults(dropdown, [], { escapeHtml: String, formatDateDisplay: String, nameClass: '', metaClass: '', onSelect() {}, shouldRender: () => true });
    assert.match(dropdown.innerHTML, /Không tìm thấy bệnh nhân/);
});

test('relative and joint-exam components delegate the autocomplete lifecycle to the shared owner', () => {
    for (const file of ['relative-table.js', 'joint-exam-manager.js']) {
        const source = readScriptSource(`app/static/js/${file}`);
        assert.match(source, /QLPKPatientSearchDropdown\.attach\(/);
        assert.doesNotMatch(source, /activeSearchToken|handleViewportChange|ArrowDown/);
    }
    for (const entry of ['doctor-examination-entry.js', 'receptionist-new-entry.js']) {
        assert.match(fs.readFileSync(`app/static/js/${entry}`, 'utf8'), /patient-search-dropdown\.js';\nimport '\.\/relative-table\.js'/, entry);
    }
    for (const entry of ['psychologist-examination-entry.js']) {
        assert.match(fs.readFileSync(`app/static/js/${entry}`, 'utf8'), /patient-search-dropdown\.js';\nimport '\.\/relative-table\.js'/, entry);
    }
});
