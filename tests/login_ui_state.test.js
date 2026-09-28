'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
    const nodes = new Map();
    const requests = [];
    const storage = new Map();
    function node(key) {
        if (!nodes.has(key)) nodes.set(key, {
            handlers: {}, properties: {}, attributes: {}, classes: new Set(), value: '', content: '',
            on(event, handler) { this.handlers[event] = handler; return this; },
            prop(name, value) { if (value === undefined) return this.properties[name]; this.properties[name] = value; return this; },
            attr(name, value) { if (value === undefined) return this.attributes[name]; this.attributes[name] = value; return this; },
            text(value) { this.content = value; return this; },
            val() { return this.value; },
            find(selector) { return node(`${key} ${selector}`); },
            toggleClass(name, enabled) { enabled ? this.classes.add(name) : this.classes.delete(name); return this; },
            removeClass(name) { this.classes.delete(name); return this; },
            addClass(name) { this.classes.add(name); return this; }
        });
        return nodes.get(key);
    }
    const jquery = value => typeof value === 'function' ? value() : typeof value === 'string' ? node(value) : value;
    jquery.ajax = request => requests.push(request);
    const window = { location: { href: '' } };
    vm.runInNewContext(fs.readFileSync('app/static/js/login.js', 'utf8'), {
        $: jquery, window, localStorage: { setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }
    });
    return { node, requests, storage, window, submit: () => node('#loginForm').handlers.submit.call(node('#loginForm'), { preventDefault() {} }) };
}

test('password toggle updates type, icon and pressed state together', () => {
    const harness = setup();
    const input = harness.node('#passwordInput').attr('type', 'password');
    const button = harness.node('#togglePassword');
    button.handlers.click.call(button);
    assert.equal(input.attr('type'), 'text');
    assert.equal(button.attr('aria-pressed'), 'true');
    assert.ok(button.find('i').classes.has('bi-eye'));
    button.handlers.click.call(button);
    assert.equal(input.attr('type'), 'password');
    assert.equal(button.attr('aria-pressed'), 'false');
    assert.ok(button.find('i').classes.has('bi-eye-slash'));
});

test('loading and failure reuse button, restore icon, and expose safe error text', () => {
    for (const status of [401, 500]) {
        const harness = setup();
        harness.node('#loginForm [name="username"]').value = 'qa';
        harness.node('#loginForm [name="password"]').value = 'invalid';
        harness.submit();
        const button = harness.node('#loginForm button[type="submit"]');
        assert.equal(button.prop('disabled'), true);
        assert.equal(button.attr('aria-busy'), 'true');
        assert.equal(button.find('.login-submit-label').content, 'Đang đăng nhập...');
        assert.ok(button.find('.login-icon').classes.has('bi-arrow-repeat'));
        assert.deepEqual(JSON.parse(harness.requests[0].data), { username: 'qa', password: 'invalid' });
        harness.requests[0].error({ status });
        assert.equal(button.prop('disabled'), false);
        assert.equal(button.attr('aria-busy'), 'false');
        assert.ok(button.find('.login-icon').classes.has('bi-arrow-right'));
        assert.equal(harness.node('#loginError').prop('hidden'), false);
        assert.match(harness.node('#loginError').content, status === 401 ? /không đúng/ : /Không thể đăng nhập/);
        harness.submit();
        assert.equal(harness.node('#loginError').prop('hidden'), true);
        assert.equal(harness.node('#loginError').content, '');
    }
});

test('authentication endpoints, role routing and fallback remain unchanged', () => {
    for (const role of ['doctor', 'psychologist', 'staff', 'admin']) {
        for (const fallback of [false, true]) {
            const harness = setup();
            harness.submit();
            assert.equal(harness.requests[0].url, '/auth/login');
            const user = { role, permissions: ['*'] };
            harness.requests[0].success({ access_token: 'test-token', user });
            assert.equal(harness.requests[1].url, '/check/me');
            assert.equal(harness.requests[1].headers.Authorization, 'Bearer test-token');
            fallback ? harness.requests[1].error() : harness.requests[1].success(user);
            assert.equal(harness.window.location.href, { doctor: '/doctor-examination.html', psychologist: '/psychologist-examination.html', staff: '/receptionist-new.html', admin: '/' }[role]);
            assert.equal(harness.storage.get('qlpk_token'), 'test-token');
        }
    }
});

test('cookie login uses shared action once, routes from RAM and never writes identity/token', async () => {
    const harness = setup();
    let finish;
    let calls = 0;
    const current = { status: 'authenticated', revision: 3, session: { user: { role: 'doctor', permissions: ['qlkham-bs'] } } };
    harness.window.QLPKApiTransport = { session: { owner: { snapshot: () => current }, actions: {
        login: () => { calls++; return new Promise(resolve => { finish = resolve; }); }
    } } };
    harness.storage.set('qlpk_token', 'legacy');
    const pending = harness.submit();
    harness.submit();
    assert.equal(calls, 1);
    assert.equal(harness.requests.length, 0);
    finish(current);
    await pending;
    assert.equal(harness.window.location.href, '/doctor-examination.html');
    assert.equal(harness.storage.size, 0);
});

for (const error of [{ status: 401 }, { status: 429, retryAfter: 35 }, { status: 503 }, { code: 'session.lock_unavailable' }]) {
    test(`cookie login failure ${error.status || error.code} does not fall back to legacy`, async () => {
        const harness = setup();
        harness.window.QLPKApiTransport = { session: { actions: { login: async () => { throw error; } } } };
        await harness.submit();
        assert.equal(harness.requests.length, 0);
        assert.equal(harness.window.location.href, '');
        assert.equal(harness.node('#loginForm button[type="submit"]').prop('disabled'), false);
        assert.equal(harness.node('#loginError').prop('hidden'), false);
        if (error.status === 429) assert.match(harness.node('#loginError').content, /35 giây/);
    });
}

test('cookie login completed under a replaced revision does not redirect or clear storage', async () => {
    const harness = setup();
    harness.storage.set('qlpk_user', 'new-account');
    harness.window.QLPKApiTransport = { session: {
        actions: { login: async () => ({ revision: 2 }) },
        owner: { snapshot: () => ({ revision: 3, status: 'authenticated' }) }
    } };
    await harness.submit();
    assert.equal(harness.window.location.href, '');
    assert.equal(harness.storage.get('qlpk_user'), 'new-account');
    assert.match(harness.node('#loginError').content, /Phiên đã thay đổi/);
});
