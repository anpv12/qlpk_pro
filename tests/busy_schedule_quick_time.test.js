const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { installDom } = require('./helpers/fake-dom');

const template = fs.readFileSync('app/templates/doctor-busy-schedule.html', 'utf8');
const FORM = template.slice(template.indexOf('<form id="busyScheduleForm"'), template.indexOf('</form>') + 7);
const source = fs.readFileSync('app/static/js/doctor-busy-schedule.js', 'utf8');
let sequence = 0;

async function harness(useDatepicker = true) {
    const window = installDom({ html: `${FORM}<button id="outside" class="active" data-quick-time-outside></button>` });
    const inputs = new Map();
    if (useDatepicker) window.setDatepickerValue = (input, value, trigger) => { assert.equal(trigger, true); inputs.set(input.getAttribute('name'), value); };
    const module = await import(`${pathToFileURL(path.join(__dirname, '../app/static/js/doctor-busy-schedule/quick-time.js')).href}?case=${++sequence}`);
    const buttons = [...window.document.querySelectorAll('#busyScheduleForm [data-quick-time]')];
    return { module, buttons, window, inputs, outside: window.document.getElementById('outside') };
}

test('quick selection works without window.event and only toggles its own buttons', async () => {
    const state = await harness();
    state.module.setQuickTime('morning', state.buttons[0]);
    state.module.setQuickTime('afternoon', state.buttons[1]);
    assert.equal(state.buttons[0].classList.contains('active'), false);
    assert.equal(state.buttons[0].getAttribute('aria-pressed'), 'false');
    assert.equal(state.buttons[1].classList.contains('active'), true);
    assert.equal(state.buttons[1].getAttribute('aria-pressed'), 'true');
    assert.equal(state.outside.classList.contains('active'), true);
});

for (const [type, startHour, endHour, endMinute] of [
    ['morning', 8, 12, 0], ['afternoon', 13, 17, 0], ['evening', 18, 22, 0], ['allday', 8, 23, 59],
]) {
    test(`${type} keeps the existing time range`, async () => {
        const state = await harness();
        state.module.setQuickTime(type, state.buttons[0]);
        const start = state.inputs.get('start_datetime');
        const end = state.inputs.get('end_datetime');
        assert.equal(start.getHours(), startHour);
        assert.equal(end.getHours(), endHour);
        assert.equal(end.getMinutes(), endMinute);
    });
}

test('two hours starts now and remains two hours long', async () => {
    const state = await harness();
    const before = Date.now();
    state.module.setQuickTime('2hours', state.buttons[0]);
    const start = state.inputs.get('start_datetime');
    const end = state.inputs.get('end_datetime');
    assert.ok(start.getTime() >= before && start.getTime() <= Date.now());
    assert.equal(end - start, 7200000);
});

test('plain inputs still work when datepicker is unavailable', async () => {
    const state = await harness(false);
    state.module.setQuickTime('morning', state.buttons[0]);
    assert.match(state.window.document.querySelector('input[name="start_datetime"]').value, /T08:00$/);
    assert.match(state.window.document.querySelector('input[name="end_datetime"]').value, /T12:00$/);
});

test('template declares the five presets on the buttons themselves', () => {
    const presets = [...template.matchAll(/data-quick-time="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(presets, ['morning', 'afternoon', 'evening', 'allday', '2hours']);
    assert.match(source, /delegate\(form, 'click', '\[data-quick-time\]', \(event, button\) => setQuickTime\(button\.dataset\.quickTime, button\)\)/);
});

test('clearing selection resets pressed state without touching unrelated buttons', async () => {
    const state = await harness();
    state.module.setQuickTime('morning', state.buttons[0]);
    state.module.setQuickTimeSelection();
    assert.ok(state.buttons.every(button => !button.classList.contains('active') && button.getAttribute('aria-pressed') === 'false'));
    assert.equal(state.outside.classList.contains('active'), true);
    assert.match(source, /on\(form, 'reset', \(\) => setQuickTimeSelection\(\)\)/);
    assert.match(source, /setQuickTimeSelection\(\);\n\t\tvalidateDateTimeInputs\(\);/);
});
