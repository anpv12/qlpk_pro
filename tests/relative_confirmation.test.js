const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createWindow } = require('./helpers/fake-dom');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function harness(result, missingOwner = false) {
    const calls = [], messages = [], requests = [];
    const window = {
        QLPKUserFeedback: { show: (...args) => messages.push(args) },
        Swal: result === 'missing' ? undefined : { fire: async options => {
            calls.push(options);
            if (result === 'reject') throw new Error('dialog unavailable');
            return { isConfirmed: result === 'confirm' };
        } }
    };
    const { document } = createWindow({ html: '<div id="relatives"></div>' });
    const context = vm.createContext({ window, document, console });
    for (const file of ['shared/confirmation-dialog.js', 'components/patient-search-dropdown.js', 'joint-exam-manager.js', 'relative-table.js']) {
        runScriptFile(`app/static/js/${file}`, context);
    }
    if (missingOwner) delete window.QLPKConfirmationDialog;
    const joint = new window.JointExamManager({
        showToast: window.QLPKUserFeedback.show,
        apiCall: async (...args) => { requests.push(args); return { ok: true, json: async () => ({ success: true }) }; }
    });
    joint.load = async () => {};
    joint.renderPendingList = () => {};
    joint.pendingJointExamList = [{ temp_id: 1 }, { temp_id: 2 }];
    const relatives = window.RelativeTableManager.init('#relatives');
    relatives.request = async (...args) => { requests.push(args); return { success: true }; };
    relatives.reload = () => {};
    return { joint, relatives, calls, messages, requests };
}

for (const result of ['cancel', 'missing', 'reject']) {
    test(`relative deletion leaves server and pending rows untouched on ${result}`, async () => {
        const state = harness(result);
        await state.joint.delete(91);
        await state.joint.deletePending(1);
        await state.relatives.handleDelete({ id: 92 });
        assert.equal(state.requests.length, 0);
        assert.equal(state.joint.pendingJointExamList.length, 2);
        assert.equal(state.messages.length, result === 'cancel' ? 0 : 3);
    });
}

test('missing shared confirmation owner fails closed with feedback', async () => {
    const state = harness('confirm', true);
    await state.joint.delete(91);
    await state.joint.deletePending(1);
    await state.relatives.handleDelete({ id: 92 });
    assert.equal(state.requests.length, 0);
    assert.equal(state.joint.pendingJointExamList.length, 2);
    assert.equal(state.messages.length, 3);
});

test('confirmed deletions retain original endpoints and delete only the selected pending row', async () => {
    const state = harness('confirm');
    await state.joint.delete(91);
    await state.joint.deletePending(1);
    await state.relatives.handleDelete({ id: 92 });
    assert.deepEqual(state.requests.map(([url, options]) => [url, options.method]), [
        ['/api/appointment-relatives/91', 'DELETE'], ['/api/family-members/92', 'DELETE']
    ]);
    assert.equal(state.joint.pendingJointExamList.length, 1);
    assert.equal(state.joint.pendingJointExamList[0].temp_id, 2);
    for (const call of state.calls) {
        assert.equal(call.focusCancel, true);
        assert.equal(call.customClass.popup, 'qlpk-confirm-dialog qlpk-confirm-dialog--danger');
    }
});

test('shared relative and transfer components never open native dialogs or SweetAlert directly', () => {
    for (const file of ['relative-table.js', 'joint-exam-manager.js', 'transfer-modal-dry.js']) {
        const source = readScriptSource(`app/static/js/${file}`);
        assert.doesNotMatch(source, /\bSwal\b|\balert\s*\(|\bwindow\.confirm\s*\(/);
    }
});

test('relative create/edit templates label every dynamic input', () => {
    for (const file of ['relative-table.js', 'joint-exam-manager.js']) {
        const source = readScriptSource(`app/static/js/${file}`);
        const inputs = [...(source.match(/<input\b[^>]*(?:>|$)/gm) || []), ...(source.match(/el\('input', \{[^}]*\}/g) || [])];
        assert.ok(inputs.length >= 12, file);
        for (const input of inputs) assert.match(input, /aria-label(?:="[^"]+"|': '[^']+')/);
    }
});

test('linking and unlinking a patient preserves identity and phone accessible names', () => {
    const { joint } = harness('cancel');
    const field = () => ({ attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; } });
    const name = field(), identity = field(), phone = field();
    const fields = { '#jointExamNameInput': name, '#jointExamIdNumberInput': identity, '#jointExamPhoneInput': phone };
    const row = { classList: { toggle() {} }, querySelector: selector => fields[selector] };
    joint.applyLinkedPatientState(row, true);
    assert.match(identity.attributes['aria-label'], /^CCCD\/CMND - /);
    assert.match(phone.attributes['aria-label'], /^Số điện thoại - /);
    assert.equal(identity.disabled, true);
    joint.applyLinkedPatientState(row, false);
    assert.equal(identity.attributes['aria-label'], 'CCCD/CMND');
    assert.equal(phone.attributes['aria-label'], 'Số điện thoại');
    assert.equal(identity.disabled, false);
});
