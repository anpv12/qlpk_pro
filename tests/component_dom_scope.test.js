const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fakeDocument(rootId, elements) {
    const byId = new Map(Object.entries(elements));
    const root = { id: rootId, getElementById: id => byId.get(id) || null };
    return { getElementById: id => (id === rootId ? root : null), root, byId };
}

function loadContext(files) {
    const window = {};
    const document = fakeDocument('visitRoot', { mainReason: { value: '' }, mainSymptoms: { value: '' }, problemStartTime: { value: '' }, severityLevel: { value: '' }, symptomProgression: { value: '' }, currentBehavior: { value: '' } });
    const context = vm.createContext({ window, document, console });
    for (const file of files) vm.runInContext(fs.readFileSync(`app/static/js/components/${file}`, 'utf8'), context, { filename: file });
    return { window, document };
}

test('createScopedComponent scopes every handler to the configured root and keeps populate payloads first', () => {
    const { window, document } = loadContext(['component-dom-scope.js']);
    const seen = [];
    const component = window.QLPKComponentDomScope.createScopedComponent({ apiCall: 'api' }, { rootId: 'visitRoot', fields: { mainReason: 'mainReason' } }, {
        bind: options => seen.push(['bind', options.apiCall, options.document.root.id]),
        populate: (payload, options) => seen.push(['populate', payload.value, options.document.root.id, options.extra])
    });
    component.bind();
    component.populate({ value: 'x' }, { extra: true });
    assert.deepEqual(seen, [['bind', 'api', 'visitRoot'], ['populate', 'x', 'visitRoot', true]]);
    assert.equal(component.getConfig, undefined);
    const scoped = window.QLPKComponentDomScope.resolveScopedDocument({ document, context: { getDocument: options => ({ fromContext: options.rootId }) } }, { rootId: 'visitRoot' });
    assert.deepEqual(scoped, { fromContext: 'visitRoot' });
});

test('patient visit form instances resolve their own root through the shared scope owner', () => {
    const { window, document } = loadContext(['component-dom-scope.js', 'patient-visit-info-form.js']);
    const instance = window.QLPKPatientVisitInfoForm.create({ config: { rootId: 'visitRoot' } });
    assert.equal(instance.getConfig().rootId, 'visitRoot');
    assert.deepEqual(JSON.parse(JSON.stringify(window.QLPKPatientVisitInfoForm.defaults)), { rootId: '', strictRoot: false, fields: {} });
    assert.deepEqual(JSON.parse(JSON.stringify(window.QLPKComponentDomScope.mergeScopedConfig({ fields: { a: 'b' } }))), { rootId: '', strictRoot: false, fields: { a: 'b' } });
    instance.populate({ examination_info: { main_reason: 'Đau đầu', main_symptoms: 'Mất ngủ' }, patient_info: { severity_level: 'low' } });
    assert.equal(document.byId.get('mainReason').value, 'Đau đầu');
    const collected = instance.collect();
    assert.equal(collected.main_reason, 'Đau đầu');
    assert.equal(collected.main_symptoms, 'Mất ngủ');
    assert.equal(collected.severity_level, 'Nhẹ');
    assert.equal('notes' in collected, false, 'fields outside the root are not collected');
    instance.clear();
    assert.equal(document.byId.get('mainReason').value, '');
});

test('patient info and visit forms no longer keep private scoped-document copies', () => {
    for (const file of ['patient-info-form.js', 'patient-visit-info-form.js']) {
        const source = fs.readFileSync(`app/static/js/components/${file}`, 'utf8');
        assert.doesNotMatch(source, /function getScopedDocument/);
        assert.match(source, /QLPKComponentDomScope\.createScopedComponent\(/);
    }
});
