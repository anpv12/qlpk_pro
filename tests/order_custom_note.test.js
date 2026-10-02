const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const { readOrderManagementSource } = require('./helpers/order-management-source');
const source = readOrderManagementSource();
const noteSource = source.slice(source.indexOf('function renderCustomOrderNote('), source.indexOf('// Load survey content directly'));

function setup(note = '') {
    const elements = {};
    const calls = [];
    const order = { id: 41, note_nurse: note };
    const context = vm.createContext({
        state: { currentOrderDetail: order, saveCustomOrderNote: null }, detailRequestVersion: 1,
        document: { getElementById: id => elements[id] },
        renderOrderSurveyContent() {
            for (const element of Object.values(elements)) element.isConnected = false;
            for (const id of ['customOrderResultNote', 'customOrderNoteStatus', 'saveCustomOrderNoteBtn']) {
                elements[id] = { value: '', textContent: '', isConnected: true, addEventListener() {} };
            }
        },
        updateOrderNote: async (...args) => { calls.push(args); },
        el: () => ({}),
    });
    vm.runInContext(noteSource, context);
    context.renderCustomOrderNote(order);
    return { context, order, elements, calls, input: elements.customOrderResultNote };
}

test('load does not write; preserves Vietnamese, line breaks and explicit clearing', async () => {
    const state = setup('Ghi chú cũ');
    assert.equal(state.input.value, 'Ghi chú cũ');
    assert.equal(state.calls.length, 0);
    state.input.value = 'Kết quả\nDòng thứ hai </textarea>';
    await state.context.state.saveCustomOrderNote();
    assert.deepEqual(state.calls[0], [41, 'note_nurse', state.input.value]);
    state.context.renderCustomOrderNote(state.order);
    assert.equal(state.elements.customOrderResultNote.value, 'Kết quả\nDòng thứ hai </textarea>');
    state.elements.customOrderResultNote.value = '';
    await state.context.state.saveCustomOrderNote();
    assert.equal(state.order.note_nurse, '');
});

test('serializes rapid edits and does not duplicate the same save', async () => {
    const state = setup();
    let release;
    state.context.updateOrderNote = (...args) => {
        state.calls.push(args);
        return state.calls.length === 1 ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
    };
    state.input.value = 'Bản đầu';
    const first = state.context.state.saveCustomOrderNote();
    await new Promise(setImmediate);
    state.input.value = 'Bản cuối';
    const second = state.context.state.saveCustomOrderNote();
    const duplicate = state.context.state.saveCustomOrderNote();
    assert.equal(state.calls.length, 1);
    release();
    await Promise.all([first, second, duplicate]);
    assert.equal(state.calls.length, 2);
    assert.equal(state.order.note_nurse, 'Bản cuối');
});

test('failed save keeps draft and can be retried', async () => {
    const state = setup('Cũ');
    state.context.updateOrderNote = async () => { throw new Error('offline'); };
    state.input.value = 'Mới';
    await assert.rejects(state.context.state.saveCustomOrderNote());
    assert.equal(state.order.note_nurse, 'Cũ');
    assert.equal(state.input.value, 'Mới');
    assert.match(state.elements.customOrderNoteStatus.textContent, /Chưa lưu được/);
    state.context.updateOrderNote = async () => {};
    await state.context.state.saveCustomOrderNote();
    assert.equal(state.order.note_nurse, 'Mới');
});

test('late response cannot overwrite the next order or its feedback', async () => {
    const state = setup();
    let release;
    state.context.updateOrderNote = () => new Promise(resolve => { release = resolve; });
    state.input.value = 'Ca A';
    const save = state.context.state.saveCustomOrderNote();
    await new Promise(setImmediate);
    const next = { id: 42, note_nurse: 'Ca B' };
    state.context.state.currentOrderDetail = next;
    state.context.detailRequestVersion++;
    state.context.renderCustomOrderNote(next);
    release();
    await save;
    assert.equal(next.note_nurse, 'Ca B');
    assert.equal(state.elements.customOrderResultNote.value, 'Ca B');
    assert.equal(state.elements.customOrderNoteStatus.textContent, '');
});
