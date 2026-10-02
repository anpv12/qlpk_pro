const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile, readScriptSource } = require('./helpers/module-source');

function initialize({ attributes = {}, labels = [], placeholder = '', altAttributes = {}, presetValue } = {}) {
    class Element {
        constructor(attrs) {
            this.attributes = { ...attrs };
            this.dataset = {};
            this.classList = { contains: () => false, add() {}, remove() {} };
            this.listeners = {};
        }
        getAttribute(name) { return this.attributes[name] || null; }
        setAttribute(name, value) { this.attributes[name] = value; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        dispatchEvent(event) { this.listeners[event.type]?.(event); }
    }
    const source = new Element(attributes), altInput = new Element(altAttributes);
    source.labels = labels.map(textContent => ({ textContent }));
    source.placeholder = placeholder;
    source.id = 'date:with-special-id';
    let config;
    const window = {};
    const initialized = [];
    runScriptFile('app/static/js/datepicker-init.js', vm.createContext({
        window, HTMLElement: Element, Event,
        document: { readyState: 'loading', addEventListener() {}, body: {} },
        flatpickr(element, options) {
            config = options;
            initialized.push(element.value);
            options.onReady([], '', { element, altInput, clear() {} });
        }
    }));
    if (presetValue === undefined) window.initDatepickers(source);
    else window.initDatepickerWithValue(source, presetValue);
    return { source, altInput, config, initialized };
}

test('datepicker generated input inherits explicit, associated, or fallback labels', () => {
    assert.equal(initialize({ attributes: { 'aria-label': 'Ngày hẹn' }, labels: ['Khác'] }).altInput.getAttribute('aria-label'), 'Ngày hẹn');
    assert.equal(initialize({ labels: [' Ngày sinh ', '(bệnh nhân)'] }).altInput.getAttribute('aria-label'), 'Ngày sinh (bệnh nhân)');
    assert.equal(initialize({ placeholder: 'Chọn ngày' }).altInput.getAttribute('aria-label'), 'Chọn ngày');
});

test('datepicker preserves aria-labelledby and existing alternative input labels', () => {
    assert.equal(initialize({ attributes: { 'aria-labelledby': 'date-label' } }).altInput.getAttribute('aria-labelledby'), 'date-label');
    assert.equal(initialize({ labels: ['Ngày'], altAttributes: { 'aria-label': 'Ngày riêng' } }).altInput.getAttribute('aria-label'), 'Ngày riêng');
    assert.equal(initialize().altInput.getAttribute('aria-label'), null);
});

test('datepicker accessibility does not change date format or event forwarding', () => {
    const { source, altInput, config } = initialize({ labels: ['Ngày sinh'] });
    const events = [];
    source.addEventListener('input', event => events.push(event.type));
    source.addEventListener('change', event => events.push(event.type));
    altInput.dispatchEvent(new Event('input'));
    altInput.dispatchEvent(new Event('change'));
    assert.deepEqual(events, ['input', 'change']);
    assert.equal(config.dateFormat, 'Y-m-d');
    assert.equal(config.altFormat, 'd/m/Y');
});

test('medical history checkboxes have a nonempty accessible name, not just an empty label wrapper', () => {
    const template = fs.readFileSync('app/templates/components/_inline_medical_history.html', 'utf8');
    const checkboxes = template.match(/<input type="checkbox"[^>]*data-medical-history-action="(?:substance|suicide)-toggle"[^>]*>/g);
    assert.equal(checkboxes.length, 17);
    for (const checkbox of checkboxes) assert.match(checkbox, /aria-label="[^"]+"/);
});

test('initDatepickerWithValue writes the date-only value before Flatpickr initialises', () => {
    assert.deepEqual(initialize({ presetValue: '2026-06-09T17:30:00' }).initialized, ['2026-06-09']);
    assert.deepEqual(initialize({ presetValue: '2026-06-09' }).initialized, ['2026-06-09']);
    assert.deepEqual(initialize({ presetValue: null }).initialized, [undefined], 'empty values leave the input untouched');
    for (const file of ['relative-table.js', 'joint-exam-manager.js']) {
        const source = readScriptSource(`app/static/js/${file}`);
        assert.doesNotMatch(source, /includes\('T'\)/, `${file} must not split datetimes before initialising a datepicker`);
        assert.match(source, /(?:window\.)?initDatepickerWithValue\??\.?\(/);
    }
});
