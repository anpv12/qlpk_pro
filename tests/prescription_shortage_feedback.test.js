'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');
const { loadSupportRuntime } = require('./helpers/doctor-registry');
const { createChangeTracker } = loadSupportRuntime();

const shortage = {
    medicine_name: 'Diazepam 5mg', unit: 'viên', requested_quantity: '150',
    stock_quantity: '140.5', additional_quantity: '150', available_quantity: '140.5', previous_quantity: '0'
};

async function saveFailure(payload, code = 'inventory.insufficient', extra = []) {
    let controllerModule;
    const messages = [];
    const window = { QLPKDoctorModuleRegistry: { register: (name, module) => { controllerModule = module; } } };
    runScriptFile('app/static/js/doctor-examination/workspace-save-controller.js', vm.createContext({ window }));
    const error = Object.assign(new Error('Không đủ thuốc trong kho'), { code, payload });
    const state = { appointment: { id: 1 }, contextToken: 1 };
    const controller = controllerModule.create({
        state, mainChanges: createChangeTracker(state, { revisionKey: 'mainRevision', dirtyKey: 'mainDirty' }), getDocument: () => ({}),
        textOf: String, valueOf: value => value, apiCall: async () => { throw new Error('Unexpected write'); },
        setWorkspaceSavePhase: () => {}, setBusy: () => {}, getDraftRecovery: () => null,
        getSupportModules: () => ({ saveAll: async () => ({ status: 'error', failedModules: [
            { key: 'prescription', label: 'Đơn thuốc', error }, ...extra
        ] }) }), showToast: (type, message) => messages.push({ type, message })
    });
    const result = await controller.saveWorkspace();
    assert.equal(result.status, 'error');
    return messages[0].message;
}

test('shortage uses requested copy and Vietnamese decimals from backend', async () => {
    const message = await saveFailure({ shortage });
    assert.equal(message.title, 'Chưa lưu được đơn thuốc');
    assert.equal(message.label, 'Diazepam 5mg:');
    assert.equal(message.emphasis, 'Đang bốc 150 viên, tồn kho 140,5 viên.');
    assert.equal(message.guidance, 'Vui lòng kiểm tra kho và bổ sung thuốc trước khi lưu lại.');
    assert.equal(message.detail, '');
});

test('amended prescription and unavailable batches remain explicit', async () => {
    const message = await saveFailure({ shortage: { ...shortage, previous_quantity: '50', additional_quantity: '100', available_quantity: '60' } },
        'inventory.insufficient', [{ key: 'services', label: 'Dịch vụ', reason: 'Lỗi dịch vụ' }]);
    assert.match(message.detail, /Đơn đã cấp 50 viên; lần này cần cấp thêm 100 viên/);
    assert.match(message.detail, /Các lô hợp lệ chỉ có thể cấp 60 viên/);
    assert.match(message.detail, /Dịch vụ cũng chưa được lưu/);
});

test('old payloads, malformed quantities and inventory reconciliation keep exact reasons', async () => {
    for (const code of ['inventory.insufficient', 'inventory.batch_missing', 'inventory.batch_expired']) {
        const message = await saveFailure({ errors: ['Thuốc A: cần kiểm tra lô.'], shortage: { ...shortage, requested_quantity: 'bad' } }, code);
        assert.match(message, /Thuốc A: cần kiểm tra lô/);
        assert.doesNotMatch(message, /NaN|cũng chưa/);
    }
});

function feedbackHarness() {
    const timers = [];
    const listeners = {};
    const { document } = require('./helpers/fake-dom').createWindow({ html: '<div id="qlpkWorkspaceToastHost"></div>' });
    const host = document.getElementById('qlpkWorkspaceToastHost');
    const classes = { get size() { return host.classList.contains('qlpk-workspace-toast-host--detailed') ? 1 : 0; } };
    const window = { document, setTimeout: (callback, duration) => { timers.push(duration); return timers.length; }, clearTimeout: () => {} };
    runScriptFile('app/static/js/shared/user-feedback.js', (c => vm.isContext(c) ? c : vm.createContext(c))({ window, document }));
    const close = () => host.querySelector('.qlpk-toast__close');
    listeners.click = () => close().dispatchEvent(new (require('./helpers/fake-dom').Event)('click'));
    return { feedback: window.QLPKUserFeedback, host, classes, listeners, timers };
}

test('structured toast safely escapes content, has close action, and resets for plain toast', async () => {
    const harness = feedbackHarness();
    const message = await saveFailure({ shortage: { ...shortage, medicine_name: '<img src=x onerror=alert(1)>' } });
    harness.feedback.show('error', message);
    assert.match(harness.host.innerHTML, /&lt;img/);
    assert.doesNotMatch(harness.host.innerHTML, /<img/);
    assert.match(harness.host.innerHTML, /qlpk-toast__emphasis/);
    assert.match(harness.host.innerHTML, /Đóng thông báo/);
    assert.equal(harness.timers.at(-1), 12000);
    harness.listeners.click();
    assert.equal(harness.host.innerHTML, '');
    harness.feedback.show('success', 'Đã lưu');
    assert.equal(harness.classes.size, 0);
    assert.doesNotMatch(harness.host.innerHTML, /qlpk-toast--detailed/);
    assert.equal(harness.timers.at(-1), 3000);
});

test('plain renderer receives a readable fallback rather than object text', async () => {
    const harness = feedbackHarness();
    let rendered;
    harness.feedback.show('error', await saveFailure({ shortage }), { renderer: (type, text) => { rendered = text; } });
    assert.match(rendered, /Diazepam 5mg: Đang bốc 150 viên/);
    assert.doesNotMatch(rendered, /\[object Object\]/);
});
