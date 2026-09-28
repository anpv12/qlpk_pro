'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const handlers = new Map();
    const calls = [];
    const elements = new Map();
    function element(selector) {
        if (!elements.has(selector)) elements.set(selector, {
            props: {}, value: selector.includes('username') ? 'qa' : 'password', textValue: '',
            prop(key, value) { if (arguments.length === 1) return this.props[key]; this.props[key] = value; return this; },
            attr() { return this; },
            text(value) { this.textValue = value; return this; },
            val() { return this.value; },
            find: element,
            toggleClass() { return this; },
            on(name, handler) { handlers.set(`${selector}:${name}`, handler); return this; }
        });
        return elements.get(selector);
    }
    function jquery(selector) {
        if (typeof selector === 'function') return selector();
        if (typeof selector === 'object') return selector;
        return element(selector);
    }
    jquery.ajax = request => calls.push(request);
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/static/js/login.js'), 'utf8'), {
        $: jquery, window: { location: {} }, localStorage: { setItem() {} }
    });
    return { calls, element,
        submit() { handlers.get('#loginForm:submit').call(element('#loginForm'), { preventDefault() {} }); },
        reject(status, retry) { calls.at(-1).error({ status, getResponseHeader: () => retry }); }
    };
}

test('pending login cannot be submitted twice', () => {
    const current = harness();
    current.submit();
    current.submit();
    assert.equal(current.calls.length, 1);
});

test('429 displays server retry delay and reenables login', () => {
    const current = harness();
    current.submit();
    current.reject(429, '42');
    assert.match(current.element('#loginError').textValue, /42 giây/);
    assert.equal(current.element('#loginError').props.hidden, false);
    assert.equal(current.element('button[type="submit"]').props.disabled, false);
    current.submit();
    assert.equal(current.calls.length, 2);
});

for (const value of [null, '-1', 'Infinity', '90000', '<img src=x>', '1.2']) {
    test(`invalid Retry-After uses safe copy: ${value}`, () => {
        const current = harness();
        current.submit();
        current.reject(429, value);
        assert.equal(current.element('#loginError').textValue, 'Đăng nhập quá nhiều lần. Vui lòng chờ một chút rồi thử lại.');
    });
}

test('401 keeps generic credential error without revealing account existence', () => {
    const current = harness();
    current.submit();
    current.reject(401);
    assert.equal(current.element('#loginError').textValue, 'Tên đăng nhập hoặc mật khẩu không đúng.');
});

test('503 remains retryable without clearing typed credentials', () => {
    const current = harness();
    current.submit();
    current.reject(503);
    assert.equal(current.element('[name="username"]').value, 'qa');
    assert.equal(current.element('button[type="submit"]').props.disabled, false);
});
