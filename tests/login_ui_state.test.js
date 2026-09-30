'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush, submit } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/login.html', 'utf8');
const FORM = template.slice(template.indexOf('<form id="loginForm"'), template.indexOf('</form>') + 7);

async function setup(transport) {
    const page = await loadPage('login.js', { html: FORM, url: 'http://clinic.test/login.html', before(window) {
        window.location.href = '';
        if (transport) window.QLPKApiTransport = transport;
    } });
    const $ = selector => page.document.querySelector(selector);
    return { ...page, $, storage: page.window.localStorage.map, submit: async () => { submit($('#loginForm')); await flush(); } };
}

test('password toggle updates type, icon and pressed state together', async () => {
    const page = await setup();
    const input = page.$('#passwordInput');
    const button = page.$('#togglePassword');
    button.click();
    assert.equal(input.getAttribute('type'), 'text');
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.ok(button.querySelector('i').classList.contains('bi-eye'));
    button.click();
    assert.equal(input.getAttribute('type'), 'password');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    assert.ok(button.querySelector('i').classList.contains('bi-eye-slash'));
});

test('loading and failure reuse button, restore icon, and expose safe error text', async () => {
    for (const status of [401, 500]) {
        const page = await setup();
        page.$('[name="username"]').value = 'qa';
        page.$('[name="password"]').value = 'invalid';
        await page.submit();
        const button = page.$('#loginForm button[type="submit"]');
        assert.equal(button.disabled, true);
        assert.equal(button.getAttribute('aria-busy'), 'true');
        assert.equal(button.querySelector('.login-submit-label').textContent, 'Đang đăng nhập...');
        assert.ok(button.querySelector('.login-icon').classList.contains('bi-arrow-repeat'));
        assert.deepEqual(page.requests[0].body, { username: 'qa', password: 'invalid' });
        page.requests[0].respond(status, { user_message: 'x' });
        await flush();
        assert.equal(button.disabled, false);
        assert.equal(button.getAttribute('aria-busy'), 'false');
        assert.ok(button.querySelector('.login-icon').classList.contains('bi-arrow-right'));
        assert.equal(page.$('#loginError').hidden, false);
        assert.match(page.$('#loginError').textContent, status === 401 ? /không đúng/ : /Không thể đăng nhập/);
        await page.submit();
        assert.equal(page.$('#loginError').hidden, true);
        assert.equal(page.$('#loginError').textContent, '');
    }
});

test('authentication endpoints, role routing and fallback remain unchanged', async () => {
    for (const role of ['doctor', 'psychologist', 'staff', 'admin']) {
        for (const fallback of [false, true]) {
            const page = await setup();
            await page.submit();
            assert.equal(page.requests[0].url, '/auth/login');
            assert.equal(page.requests[0].init.method, 'POST');
            const user = { role, permissions: ['*'] };
            page.requests[0].respond(200, { access_token: 'test-token', user });
            await flush();
            assert.equal(page.requests[1].url, '/check/me');
            assert.equal(page.requests[1].headers.get('Authorization'), 'Bearer test-token');
            assert.equal(page.storage.get('qlpk_user'), JSON.stringify(user));
            fallback ? page.requests[1].respond(500, {}) : page.requests[1].respond(200, user);
            await flush();
            assert.equal(page.window.location.href, { doctor: '/doctor-examination.html', psychologist: '/psychologist-examination.html', staff: '/receptionist-new.html', admin: '/' }[role]);
            assert.equal(page.storage.get('qlpk_token'), 'test-token');
        }
    }
});

test('a role without its workspace permission lands on the dashboard', async () => {
    const page = await setup();
    assert.equal(page.module.loginLandingPath({ role: 'UserRole.DOCTOR', permissions: ['qlkham-bs'] }), '/doctor-examination.html');
    assert.equal(page.module.loginLandingPath({ role: 'doctor', permissions: ['qlkham-letan'] }), '/');
    assert.equal(page.module.loginLandingPath(null), '/');
});

test('cookie login uses shared action once, routes from RAM and never writes identity/token', async () => {
    let finish;
    let calls = 0;
    const current = { status: 'authenticated', revision: 3, session: { user: { role: 'doctor', permissions: ['qlkham-bs'] } } };
    const page = await setup({ session: { owner: { snapshot: () => current }, actions: {
        login: () => { calls++; return new Promise(resolve => { finish = resolve; }); },
    } } });
    page.storage.set('qlpk_token', 'legacy');
    await page.submit();
    await page.submit();
    assert.equal(calls, 1);
    assert.equal(page.requests.length, 0);
    finish(current);
    await flush();
    assert.equal(page.window.location.href, '/doctor-examination.html');
    assert.equal(page.storage.size, 0);
});

for (const error of [{ status: 401 }, { status: 429, retryAfter: 35 }, { status: 503 }, { code: 'session.lock_unavailable' }]) {
    test(`cookie login failure ${error.status || error.code} does not fall back to legacy`, async () => {
        const page = await setup({ session: { actions: { login: async () => { throw error; } } } });
        await page.submit();
        assert.equal(page.requests.length, 0);
        assert.equal(page.window.location.href, '');
        assert.equal(page.$('#loginForm button[type="submit"]').disabled, false);
        assert.equal(page.$('#loginError').hidden, false);
        if (error.status === 429) assert.match(page.$('#loginError').textContent, /35 giây/);
    });
}

test('cookie login completed under a replaced revision does not redirect or clear storage', async () => {
    const page = await setup({ session: {
        actions: { login: async () => ({ revision: 2 }) },
        owner: { snapshot: () => ({ revision: 3, status: 'authenticated' }) },
    } });
    page.storage.set('qlpk_user', 'new-account');
    await page.submit();
    assert.equal(page.window.location.href, '');
    assert.equal(page.storage.get('qlpk_user'), 'new-account');
    assert.match(page.$('#loginError').textContent, /Phiên đã thay đổi/);
});
