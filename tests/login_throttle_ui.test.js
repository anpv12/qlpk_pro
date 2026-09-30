'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush, submit } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/login.html', 'utf8');
const FORM = template.slice(template.indexOf('<form id="loginForm"'), template.indexOf('</form>') + 7);

async function harness() {
    const page = await loadPage('login.js', { html: FORM });
    const $ = selector => page.document.querySelector(selector);
    $('[name="username"]').value = 'qa';
    $('[name="password"]').value = 'password';
    return { ...page, $,
        async submit() { submit($('#loginForm')); await flush(); },
        async reject(status, retry) {
            page.requests.at(-1).respond(status, {}, retry === null || retry === undefined ? {} : { 'Retry-After': retry });
            await flush();
        } };
}

test('pending login cannot be submitted twice', async () => {
    const current = await harness();
    await current.submit();
    await current.submit();
    assert.equal(current.requests.length, 1);
});

test('429 displays server retry delay and reenables login', async () => {
    const current = await harness();
    await current.submit();
    await current.reject(429, '42');
    assert.match(current.$('#loginError').textContent, /42 giây/);
    assert.equal(current.$('#loginError').hidden, false);
    assert.equal(current.$('button[type="submit"]').disabled, false);
    await current.submit();
    assert.equal(current.requests.length, 2);
});

for (const value of [null, '-1', 'Infinity', '90000', '<img src=x>', '1.2']) {
    test(`invalid Retry-After uses safe copy: ${value}`, async () => {
        const current = await harness();
        await current.submit();
        await current.reject(429, value);
        assert.equal(current.$('#loginError').textContent, 'Đăng nhập quá nhiều lần. Vui lòng chờ một chút rồi thử lại.');
    });
}

test('401 keeps generic credential error without revealing account existence', async () => {
    const current = await harness();
    await current.submit();
    await current.reject(401);
    assert.equal(current.$('#loginError').textContent, 'Tên đăng nhập hoặc mật khẩu không đúng.');
});

test('503 remains retryable without clearing typed credentials', async () => {
    const current = await harness();
    await current.submit();
    await current.reject(503);
    assert.equal(current.$('[name="username"]').value, 'qa');
    assert.equal(current.$('button[type="submit"]').disabled, false);
});
