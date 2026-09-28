const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app/static/js/doctor-busy-schedule.js', 'utf8');
const quickTime = source.slice(source.indexOf('function setQuickTime('), source.indexOf('// Filter table based on search and status'));
const template = fs.readFileSync('app/templates/doctor-busy-schedule.html', 'utf8');

function harness(useDatepicker = true) {
    const inputs = new Map();
    const buttons = Array.from({ length: 5 }, () => ({ active: false, pressed: 'false' }));
    const outside = { active: true };
    const selectors = [];
    const window = useDatepicker ? { setDatepickerValue(input, value, trigger) {
        assert.equal(trigger, true);
        inputs.set(input, value);
    } } : {};
    const document = { querySelector: selector => selector };
    function jquery(target) {
        selectors.push(target);
        const matched = target === '#busyScheduleForm [data-qlpk-call="setQuickTime"]'
            ? buttons : typeof target === 'string' ? [outside] : [target];
        const result = {
            removeClass() { matched.forEach(button => { button.active = false; }); return result; },
            addClass() { matched.forEach(button => { button.active = true; }); return result; },
            attr(name, value) { matched.forEach(button => { button.pressed = value; }); return result; },
            val(value) { inputs.set(target, value); return result; },
        };
        return result;
    }
    const context = vm.createContext({ window, document, $: jquery, Date });
    vm.runInContext(quickTime, context);
    return { context, buttons, outside, selectors, inputs };
}

test('quick selection works without window.event and only toggles its own buttons', () => {
    const state = harness();
    state.context.setQuickTime('morning', state.buttons[0]);
    state.context.setQuickTime('afternoon', state.buttons[1]);
    assert.equal(state.buttons[0].active, false);
    assert.equal(state.buttons[0].pressed, 'false');
    assert.equal(state.buttons[1].active, true);
    assert.equal(state.buttons[1].pressed, 'true');
    assert.equal(state.outside.active, true);
});

for (const [type, startHour, endHour, endMinute] of [
    ['morning', 8, 12, 0], ['afternoon', 13, 17, 0], ['evening', 18, 22, 0], ['allday', 8, 23, 59],
]) {
    test(`${type} keeps the existing time range`, () => {
        const state = harness();
        state.context.setQuickTime(type, state.buttons[0]);
        const [start, end] = [...state.inputs.values()];
        assert.equal(start.getHours(), startHour);
        assert.equal(end.getHours(), endHour);
        assert.equal(end.getMinutes(), endMinute);
    });
}

test('two hours starts now and remains two hours long', () => {
    const state = harness();
    const before = Date.now();
    state.context.setQuickTime('2hours', state.buttons[0]);
    const [start, end] = [...state.inputs.values()];
    assert.ok(start.getTime() >= before && start.getTime() <= Date.now());
    assert.equal(end - start, 7200000);
});

test('plain inputs still work when datepicker is unavailable', () => {
    const state = harness(false);
    state.context.setQuickTime('morning', state.buttons[0]);
    assert.match([...state.inputs.values()][0], /T08:00$/);
    assert.match([...state.inputs.values()][1], /T12:00$/);
});

test('template passes the button itself for nested-icon and keyboard activation', () => {
    const bindings = [...template.matchAll(/data-qlpk-call="setQuickTime"\s+data-qlpk-args='([^']+)'/g)];
    assert.equal(bindings.length, 5);
    for (const binding of bindings) assert.equal(JSON.parse(binding[1])[1], '$this');
});

test('clearing selection resets pressed state without touching unrelated buttons', () => {
    const state = harness();
    state.context.setQuickTime('morning', state.buttons[0]);
    state.context.setQuickTimeSelection();
    assert.ok(state.buttons.every(button => !button.active && button.pressed === 'false'));
    assert.equal(state.outside.active, true);
    assert.match(source, /on\('reset', function \(\) \{\s*setQuickTimeSelection\(\)/);
    assert.match(source, /on\('change', function \(\) \{\s*setQuickTimeSelection\(\)/);
});
