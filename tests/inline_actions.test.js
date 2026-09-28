const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load() {
    const listeners = {};
    const document = { addEventListener: (type, fn) => { listeners[type] = fn; } };
    const window = { document };
    const context = { window, document, console: { error: () => {} }, Element: class {}, JSON };
    vm.runInNewContext(fs.readFileSync('app/static/js/shared/inline-actions.js', 'utf8'), context);
    return { window, listeners, Element: context.Element };
}

function element(Element, attrs, parent = null) {
    const el = new Element();
    el.attrs = attrs; el.parent = parent; el.value = attrs.value;
    el.getAttribute = name => (name in attrs ? attrs[name] : null);
    el.hasAttribute = name => name in attrs;
    el.closest = selector => { let node = el; const attr = selector.slice(1, -1); while (node) { if (node.hasAttribute(attr)) return node; node = node.parent; } return null; };
    return el;
}

test('dispatches to window functions with JSON args, placeholders and event options', () => {
    const { window, listeners, Element } = load();
    const calls = [];
    window.editService = (...args) => calls.push(['edit', ...args]);
    window.CustomModal = { closeModal(id, ok) { calls.push(['close', this === window.CustomModal, id, ok]); } };
    const button = element(Element, { 'data-qlpk-call': 'editService', 'data-qlpk-args': '[12, "x"]', 'data-qlpk-prevent': '' });
    const icon = element(Element, {}, button);
    let prevented = false;
    listeners.click({ type: 'click', target: icon, preventDefault: () => { prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.deepEqual(calls, [['edit', 12, 'x']]);
    assert.equal(prevented, true);
    const select = element(Element, { 'data-qlpk-call': 'CustomModal.closeModal', 'data-qlpk-args': '["m1", true]', 'data-qlpk-on': 'change' });
    listeners.click({ type: 'click', target: select, preventDefault() {} });
    listeners.change({ type: 'change', target: select, preventDefault() {} });
    assert.deepEqual(calls[1], ['close', true, 'm1', true]);
    const input = element(Element, { 'data-qlpk-call': 'onInput', 'data-qlpk-args': '["$value", "$this", "$event"]', 'data-qlpk-on': 'input', value: 'abc' });
    const event = { type: 'input', target: input, preventDefault() {} };
    window.onInput = (value, el, ev) => calls.push(['input', value, el === input, ev === event]);
    listeners.input(event);
    assert.deepEqual(calls[2], ['input', 'abc', true, true]);
});

test('self guard, missing functions and stop propagation', () => {
    const { window, listeners, Element } = load();
    const calls = [];
    window.toggleConfig = () => calls.push('toggle');
    const overlay = element(Element, { 'data-qlpk-call': 'toggleConfig', 'data-qlpk-self': '' });
    const inner = element(Element, {}, overlay);
    listeners.click({ type: 'click', target: inner, preventDefault() {} });
    listeners.click({ type: 'click', target: overlay, preventDefault() {} });
    assert.deepEqual(calls, ['toggle']);
    const missing = element(Element, { 'data-qlpk-call': 'nope.fn' });
    assert.doesNotThrow(() => listeners.click({ type: 'click', target: missing, preventDefault() {} }));
    let stopped = 0;
    const stopper = element(Element, { 'data-qlpk-call': 'toggleConfig', 'data-qlpk-stop': '' });
    listeners.click({ type: 'click', target: stopper, preventDefault() {}, stopPropagation: () => stopped++, stopImmediatePropagation: () => stopped++ });
    assert.equal(stopped, 2);
    assert.throws(() => listeners.click({ type: 'click', target: element(Element, { 'data-qlpk-call': 'toggleConfig', 'data-qlpk-args': '{bad' }), preventDefault() {} }), /JSON/);
});

test('per-event bindings on one element and focusin/focusout support', () => {
    const { window, listeners, Element } = load();
    const calls = [];
    window.openAcList = (...args) => calls.push(['open', ...args]);
    window.updateCell = (...args) => calls.push(['cell', ...args]);
    window.scheduleCloseAc = () => calls.push(['close']);
    const input = element(Element, { 'data-qlpk-on-focusin': 'openAcList', 'data-qlpk-on-focusin-args': '[1, "c1", "$this"]', 'data-qlpk-on-input': 'openAcList', 'data-qlpk-on-input-args': '[1, "c1", "$this"]', 'data-qlpk-on-focusout': 'scheduleCloseAc', 'data-qlpk-on-change': 'updateCell', 'data-qlpk-on-change-args': '[1, "c1", "$value"]', value: 'v' });
    assert.deepEqual(listeners.focusin ? 'has' : 'missing', 'has');
    listeners.focusin({ type: 'focusin', target: input, preventDefault() {} });
    listeners.input({ type: 'input', target: input, preventDefault() {} });
    listeners.change({ type: 'change', target: input, preventDefault() {} });
    listeners.focusout({ type: 'focusout', target: input, preventDefault() {} });
    listeners.click({ type: 'click', target: input, preventDefault() {} });
    assert.deepEqual(calls, [['open', 1, 'c1', input], ['open', 1, 'c1', input], ['cell', 1, 'c1', 'v'], ['close']]);
});
