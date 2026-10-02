const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');

// Minimal DOM: enough for header text, section toggling, dirty tracking and the
// workspace click delegation. Layout-dependent behaviour is covered by browser QA.
function createDom() {
    class Element {
        constructor(tag, id = '', className = '') {
            this.tagName = tag.toUpperCase(); this.id = id; this.className = className; this.children = []; this.parentElement = null;
            this.attributes = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = '';
            this.scrollTop = 0; this.scrollLeft = 0; this.type = tag === 'input' ? 'text' : '';
            const classes = () => new Set(this.className.split(' ').filter(Boolean));
            this.classList = {
                add: name => { const set = classes(); set.add(name); this.className = [...set].join(' '); },
                remove: name => { const set = classes(); set.delete(name); this.className = [...set].join(' '); },
                contains: name => classes().has(name),
                toggle: (name, force) => { force ? this.classList.add(name) : this.classList.remove(name); }
            };
        }
        append(...nodes) { nodes.forEach(node => { node.parentElement = this; this.children.push(node); }); return this; }
        setAttribute(name, value) { this.attributes[name] = String(value); if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = String(value); }
        getAttribute(name) { return name in this.attributes ? this.attributes[name] : null; }
        removeAttribute(name) { delete this.attributes[name]; }
        hasAttribute(name) { return name in this.attributes; }
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
        dispatch(type, extra = {}) { const event = { type, target: this, preventDefault() {}, ...extra }; for (let node = this; node; node = node.parentElement) (node.listeners[type] || []).forEach(fn => fn(event)); }
        matches(selector) {
            return selector.split(',').map(s => s.trim()).some(s => {
                if (s.startsWith('#')) return this.id === s.slice(1);
                if (s.startsWith('.')) return this.classList.contains(s.slice(1));
                const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(s);
                if (attr) return attr[2] === undefined ? this.hasAttribute(attr[1]) : this.getAttribute(attr[1]) === attr[2];
                return this.tagName.toLowerCase() === s;
            });
        }
        closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
        querySelectorAll(selector) { const out = []; const walk = node => node.children.forEach(child => { if (child.matches(selector)) out.push(child); walk(child); }); walk(this); return out; }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        getElementById(id) { return this.querySelector('#' + id); }
    }
    class HTMLInputElement extends Element {}
    class HTMLTextAreaElement extends Element {}
    class HTMLSelectElement extends Element {}
    const document = new Element('document');
    document.getElementById = id => document.querySelector('#' + id);
    document.defaultView = { HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement };
    Element.prototype.ownerDocument = document;
    return { Element, document, HTMLTextAreaElement };
}

function setup() {
    const { Element, document, HTMLTextAreaElement } = createDom();
    const workspace = new Element('section', 'doctorClinicalWorkspace', 'doctor-clinical-workspace');
    const heading = new Element('h2', 'doctorClinicalHeading'); const code = new Element('span', 'doctorPatientCode');
    const latest = new Element('span', 'doctorPatientLatestVisit'); const history = new Element('div', 'doctorPatientHistory');
    const lastDiagnosis = new Element('span', 'doctorPatientLastDiagnosis'); const lastRx = new Element('span', 'doctorPatientLastPrescription');
    const status = new Element('span', 'doctorWorkspaceSaveStatus');
    const nav = ['doctorReceptionistIntakePanel', 'doctorClinicalDecisionPanel', 'doctorServicePanel'].map(target => { const link = new Element('a', '', 'doctor-section-edge-nav__item'); link.setAttribute('data-doctor-section-target', target); link.setAttribute('href', '#' + target); return link; });
    const sections = ['doctorReceptionistIntakePanel', 'doctorClinicalDecisionPanel', 'doctorServicePanel'].map(id => new Element('section', id, 'doctor-workspace-section'));
    const form = new Element('form', 'doctorClinicalForm'); const reason = new HTMLTextAreaElement('textarea', 'doctorClinicalReason'); form.append(reason);
    sections[1].append(form);
    const saveButton = new Element('button', '', 'doctor-workspace-button'); saveButton.setAttribute('data-doctor-workspace-action', 'save');
    const transferButton = new Element('button'); transferButton.setAttribute('data-doctor-workspace-action', 'transfer');
    workspace.append(heading, code, latest, history, lastDiagnosis, lastRx, status, saveButton, transferButton, ...nav, ...sections);
    document.append(workspace);

    const modules = new Map();
    const calls = { intake: [], clinical: [], saveController: [] };
    const registry = {
        register: (name, value) => modules.set(name, value),
        get: name => modules.get(name),
        require: name => { if (!modules.has(name)) throw new Error('missing ' + name); return modules.get(name); }
    };
    const window = { QLPKDoctorModuleRegistry: registry, document, getComputedStyle: () => ({ overflowY: 'visible', overflowX: 'visible' }) };
    const context = vm.createContext({ window, document, console, getComputedStyle: window.getComputedStyle, setTimeout, clearTimeout, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {} });
    for (const file of ['app/static/js/doctor-examination/module-registry.js', 'app/static/js/doctor-examination/support-runtime.js']) runScriptFile(file, (c => vm.isContext(c) ? c : vm.createContext(c))(context, { filename: file }));
    const REGISTRY = window.QLPKDoctorModuleRegistry;
    REGISTRY.register('doctorComponentConfig', { intake: {}, clinical: {}, workspace: { rootId: 'doctorClinicalWorkspace', defaultSectionId: 'doctorClinicalDecisionPanel' } });
    REGISTRY.register('patientIntakeForm', { create: () => ({ populate: (payload, opts) => calls.intake.push(['populate', payload.patient_info.full_name]), clear: () => calls.intake.push(['clear']), collect: () => ({ full_name: 'BN QA' }), bind: () => calls.intake.push(['bind']) }) });
    let clinicalDirty = false;
    let syncDirtyState = () => {};
    REGISTRY.register('clinicalExaminationForm', { create: options => { syncDirtyState = options.syncDirtyState; return ({
        render: (payload) => calls.clinical.push(['render', payload.id]), clear: () => calls.clinical.push(['clear']), bind: () => calls.clinical.push(['bind']),
        collect: () => ({ main_reason: 'Đau đầu' }), hasUnsavedChanges: () => clinicalDirty, getSaveState: () => ({ mainDirty: clinicalDirty, mainRevision: 1, detailDirtySections: new Set(), detailsLoaded: true }),
        markMainSaved() { clinicalDirty = false; }, ownsField: () => false, getContextToken: () => 1, whenInitialLoadSettled: () => Promise.resolve(true), setLoadFailed() {}, getExaminationId: () => 77
    }); } });
    REGISTRY.register('workspaceSaveController', { create: options => { calls.saveController.push(options); return { saveNow: async o => ({ status: 'success', options: o }), saveWorkspace: async o => { calls.saveController.push(['saveWorkspace', o.applyDetailDefaults]); return { status: 'success' }; }, completeNow: async () => ({ status: 'success' }), resolveUnsavedChanges: async () => 'confirm' }; } });
    const supportDirty = { value: false };
    REGISTRY.register('supportModulesUi', { hasUnsavedChanges: () => supportDirty.value });
    runScriptFile('app/static/js/doctor-examination/clinical-workspace-ui.js', context);
    const api = REGISTRY.get('clinicalWorkspace');
    return { api, document, workspace, heading, code, latest, sections, nav, reason, saveButton, transferButton, calls, setClinicalDirty: v => { clinicalDirty = v; syncDirtyState(); }, supportDirty };
}

test('render fills the patient header, shows the workspace and activates the default section', () => {
    const s = setup();
    s.api.render({ id: 1101, patient_full_name: 'Ngô QA', patient_code: 'HS1', patient_info: { id: 3, full_name: 'Ngô QA', patient_code: 'HS1' }, examination_info: {} }, { document: s.document });
    assert.equal(s.heading.textContent, 'Ngô QA');
    assert.equal(s.code.textContent, 'HS1');
    assert.equal(s.workspace.hidden, false);
    assert.equal(s.latest.textContent, 'Không tải được lịch sử trước', 'no prescription UI registered → unavailable snapshot');
    assert.deepEqual(s.sections.map(section => section.hidden), [true, false, true]);
    assert.deepEqual(s.calls.intake, [['populate', 'Ngô QA']]);
    assert.deepEqual(s.calls.clinical, [['render', 1101]]);
});

test('clear hides the workspace, resets header text and clears both shared components', () => {
    const s = setup();
    s.api.render({ id: 1, patient_info: { full_name: 'A', patient_code: 'C' }, examination_info: {} }, { document: s.document });
    s.api.clear({ document: s.document });
    assert.equal(s.workspace.hidden, true);
    assert.equal(s.heading.textContent, 'Chưa chọn bệnh nhân');
    assert.equal(s.code.hidden, true);
    assert.ok(s.calls.intake.some(c => c[0] === 'clear') && s.calls.clinical.some(c => c[0] === 'clear'));
});

test('section navigation toggles hidden/aria state and the active nav link', () => {
    const s = setup();
    s.api.render({ id: 1, patient_info: {}, examination_info: {} }, { document: s.document });
    const nextId = s.api.activateSection(s.document, 'doctorServicePanel');
    assert.equal(nextId, 'doctorServicePanel');
    assert.deepEqual(s.sections.map(section => [section.hidden, section.getAttribute('aria-hidden')]), [[true, 'true'], [true, 'true'], [false, null]]);
    assert.deepEqual(s.nav.map(link => link.getAttribute('aria-current')), [null, null, 'true']);
    assert.equal(s.api.activateSection(s.document, 'unknownPanel'), 'doctorClinicalDecisionPanel', 'unknown targets fall back to the default section');
});

test('dirty state aggregates workspace fields, the clinical form and support modules', () => {
    const s = setup();
    s.api.bind({ document: s.document, apiCall: async () => ({ ok: true }) });
    s.api.render({ id: 1, patient_info: {}, examination_info: {} }, { document: s.document });
    assert.equal(s.api.hasUnsavedChanges(), false);
    s.reason.dispatch('input');
    assert.equal(s.api.hasUnsavedChanges(), true, 'typing in a workspace-owned field marks the workspace dirty');
    s.api.render({ id: 2, patient_info: {}, examination_info: {} }, { document: s.document });
    assert.equal(s.api.hasUnsavedChanges(), false, 'rendering a new patient resets the dirty state');
    s.supportDirty.value = true;
    assert.equal(s.api.hasUnsavedChanges(), true, 'support modules contribute to the aggregate');
    s.supportDirty.value = false; s.setClinicalDirty(true);
    assert.equal(s.api.hasUnsavedChanges(), true, 'the clinical form reports through syncDirtyState');
});

test('the Lưu button delegates to the save controller with detail defaults and collect merges both forms', async () => {
    const s = setup();
    s.api.bind({ document: s.document, apiCall: async () => ({ ok: true }) });
    s.api.render({ id: 1, patient_info: {}, examination_info: {} }, { document: s.document });
    s.saveButton.dispatch('click');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(s.calls.saveController.at(-1), ['saveWorkspace', true]);
    assert.deepEqual(JSON.parse(JSON.stringify(s.api.collect({ document: s.document }))), { full_name: 'BN QA', main_reason: 'Đau đầu' });
});
