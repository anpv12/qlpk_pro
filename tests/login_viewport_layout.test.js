'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const css = fs.readFileSync('app/static/css/pages/login.css', 'utf8');
const template = fs.readFileSync('app/templates/login.html', 'utf8');

test('login controls have one geometry owner, not Bootstrap form overrides', () => {
    assert.doesNotMatch(template, /class="(?:form-control|form-label|form-check|alert)|bootstrap\.bundle/);
    assert.doesNotMatch(css, /\.form-control|\.form-label|data-qlpk-button\], \[data-qlpk-button\] \*/);
    assert.match(css, /\.login-input-wrap\s*\{[^}]*grid-template-columns: var\(--login-icon-size\) minmax\(0, 1fr\) 2rem/);
    assert.match(css, /\.login-control\s*\{[^}]*font-size:[^;]+;[^}]*line-height: 1\.5;/);
});

test('icons use square nonshrinking boxes and explicit glyph line-height', () => {
    assert.match(css, /\.login-icon\s*\{[^}]*inline-size: var\(--login-icon-size\);[^}]*block-size: var\(--login-icon-size\);[^}]*flex: 0 0 var\(--login-icon-size\);[^}]*line-height: 1;/);
    assert.match(css, /\.login-icon::before\s*\{[^}]*line-height: 1;[^}]*vertical-align: 0;/);
    assert.doesNotMatch(css, /translateY|scale\(|zoom:/);
    for (const icon of template.matchAll(/<i class="([^"]+)"/g)) assert.match(icon[1], /login-icon/);
});

test('responsive layout changes structure without shrinking controls', () => {
    assert.match(css, /min-height: 100svh;\s*min-height: 100dvh/);
    assert.match(css, /\.login-box, \.login-footer\s*\{[^}]*flex: 0 0 auto;[^}]*max-width: var\(--login-content-width\)/);
    const responsive = css.slice(css.indexOf('@media'), css.indexOf('@keyframes login-spin'));
    assert.doesNotMatch(responsive, /\.(?:login-control|login-input-wrap|login-icon|btn-login)\s*\{/);
    assert.doesNotMatch(css, /max-height:|overflow-y: hidden/);
    assert.match(css, /@media \(min-width: 48\.0625rem\)/);
    assert.match(css, /@media \(max-width: 48rem\) and \(min-height: 44\.0625rem\)/);
});

test('username and password leading icons use proportionate SVG drawings, not font glyphs', () => {
    const icons = [...template.matchAll(/<svg class="login-icon input-icon"[^>]*>[\s\S]*?<\/svg>/g)];
    assert.equal(icons.length, 2);
    for (const [icon] of icons) {
        assert.match(icon, /viewBox="0 0 24 24"/);
        assert.match(icon, /stroke="currentColor" stroke-width="1.75"/);
        assert.match(icon, /aria-hidden="true" focusable="false"/);
        assert.doesNotMatch(icon, /transform=|preserveAspectRatio="none"/);
    }
    assert.match(icons[0][0], /<circle cx="12" cy="7" r="4"/);
    assert.match(icons[1][0], /<rect x="3" y="10" width="18" height="11"/);
    assert.doesNotMatch(template, /bi-person|bi-lock/);
});

test('semantic button palette stays shared and loading keeps its existing DOM', () => {
    const script = fs.readFileSync('app/static/js/login.js', 'utf8');
    assert.match(template, /data-qlpk-button="execute" data-qlpk-button-variant="solid"/);
    assert.doesNotMatch(css, /\.btn-login[^{}]*\{[^}]*background:/);
    assert.doesNotMatch(script, /\.html\(/);
    assert.match(script, /setLoginPending\(submitBtn, true\)/);
    assert.match(script, /setLoginPending\(submitBtn, false\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});
