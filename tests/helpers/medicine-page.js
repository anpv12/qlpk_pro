'use strict';
// Renders medicine-management slices into the fake DOM through their real ES modules.
const { freshGraph } = require('./fresh-esm');
const { installDom } = require('./fake-dom');

const LIST_HTML = `<input id="selectAllCheckbox" type="checkbox"><button id="deleteSelectedBtn" class="mm-hidden"></button>
    <table id="medicineTable"><tbody></tbody></table><div id="tableInfo"></div><ul id="pagination"></ul>
    <input id="searchInput"><select id="sortByFilter"></select>`;

// Renders the medicine list rows for the given medicines; returns the table body and the modules.
async function renderMedicineRows(medicines, { canReviewMedicineReference = false, html = '' } = {}) {
    const window = installDom({ html: LIST_HTML + html });
    window.bootstrap = { Tooltip: class { static getInstance() { return null; } hide() {} } };
    const load = freshGraph();
    const [list, { state }] = await Promise.all([load('medicines/management-list.js'), load('medicines/management-state.js')]);
    return { list, window, tbody: document.querySelector('#medicineTable tbody'), state, render: () => {
        state.medicines = medicines;
        state.currentPage = 1;
        state.canReviewMedicineReference = canReviewMedicineReference;
        list.renderMedicineTable();
    } };
}

// Medicine edit form (partials without their Jinja tags; ids the macros would render are created on demand),
// with a fetch recorder: requests[i].respond(data, status) answers a call.
async function loadMedicineForm() {
    const { readTemplateSource } = require('./template-source');
    const html = ['partials/medicine-edit-modal.html', 'partials/medicine-price-editor.html']
        .map(name => readTemplateSource(name).replace(/\{[{%#][\s\S]*?[}%#]\}/g, '')).join('');
    const window = installDom({ html });
    const byId = document.getElementById.bind(document);
    document.getElementById = id => byId(id) || document.body.appendChild(Object.assign(document.createElement('input'), { id }));
    window.QLPKApiTransport = { hasSession: () => true };
    window.QLPKUserFeedback = { show() {} };
    window.bootstrap = { Modal: { getInstance: () => null, getOrCreateInstance: () => ({ show() {}, hide() {} }) } };
    const requests = [];
    window.fetch = (url, init = {}) => new Promise(resolve => requests.push({ url, init,
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        respond: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status })) }));
    const load = freshGraph();
    const [form, { state }] = await Promise.all([load('medicines/management-form.js'), load('medicines/management-state.js')]);
    return { window, form, state, requests, load, flush: () => new Promise(resolve => setImmediate(resolve)) };
}

function fetchRecorder(window) {
    const requests = [];
    window.fetch = (url, init = {}) => new Promise((resolve, reject) => requests.push({ url, init,
        params: new URLSearchParams(String(url).split('?')[1] || ''),
        body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body,
        respond: (data, status = 200) => resolve(new Response(data === undefined ? '' : JSON.stringify(data), { status })),
        fail: () => reject(new TypeError('Failed to fetch')) }));
    return requests;
}

// Bootstrap modal stand-in: show/hide toggle .show, add/remove a backdrop and fire the native bs events.
function modalRegistry(document) {
    const instances = new Map(), shown = [];
    const instance = node => {
        if (!instances.has(node)) {
            const trap = { active: true, activate() { this.active = true; }, deactivate() { this.active = false; } };
            let backdrop;
            instances.set(node, { _focustrap: trap,
                show() {
                    shown.push(node.id); node.classList.add('show');
                    backdrop = document.createElement('div'); backdrop.className = 'modal-backdrop'; document.body.append(backdrop);
                    document.activeElement = node;
                    node.dispatchEvent(new Event('shown.bs.modal'));
                },
                hide() {
                    const hide = new Event('hide.bs.modal');
                    node.dispatchEvent(hide);
                    if (hide.defaultPrevented) return;
                    node.classList.remove('show'); backdrop?.remove(); trap.active = false;
                    document.body.classList.remove('modal-open');
                    document.body.style.overflow = ''; document.body.style.paddingRight = '';
                    node.dispatchEvent(new Event('hidden.bs.modal'));
                } });
        }
        return instances.get(node);
    };
    return { instance, shown, Modal: { getOrCreateInstance: instance, getInstance: node => instances.get(node) || null } };
}

// The whole medicine-management page body (Jinja tags and scripts stripped) with fetch and modal fakes.
// load(rel) imports page modules from one fresh graph.
async function loadMedicinePage() {
    const { readTemplateSource } = require('./template-source');
    let html = readTemplateSource('medicine-management.html');
    html = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>')).replace(/^<body[^>]*>/, '')
        .replace(/<script[\s\S]*?<\/script>/g, '').replace(/\{[{%#][\s\S]*?[}%#]\}/g, '');
    const window = installDom({ html });
    // Controls rendered by Jinja macros (autocomplete fields) are created on first lookup.
    const byId = document.getElementById.bind(document);
    document.getElementById = id => byId(id) || document.body.appendChild(Object.assign(document.createElement('input'), { id }));
    const modals = modalRegistry(document);
    window.bootstrap = { Modal: modals.Modal, Tooltip: class { static getInstance() { return null; } } };
    window.QLPKApiTransport = { hasSession: () => true, userSnapshot: () => ({ full_name: 'QA' }) };
    const toasts = [];
    window.QLPKUserFeedback = { show: (type, message) => toasts.push([type, message]), reportError: (error, options) => toasts.push(['error', options?.fallback]) };
    const requests = fetchRecorder(window);
    const load = freshGraph();
    const { state } = await load('medicines/management-state.js');
    return { window, document, state, load, requests, toasts, modals, flush: () => new Promise(resolve => setImmediate(resolve)) };
}

module.exports = { loadMedicineForm, loadMedicinePage, renderMedicineRows };
