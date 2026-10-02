const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { QLPKHtml } = require('./helpers/html-escape');

test('shared escaper neutralises markup and attribute breakouts', () => {
    assert.equal(QLPKHtml.escape('<img src=x onerror="a()">'), '&lt;img src=x onerror=&quot;a()&quot;&gt;');
    assert.equal(QLPKHtml.escape("O'Neil & `x`"), 'O&#039;Neil &amp; &#096;x&#096;');
    assert.equal(QLPKHtml.escape(null), '');
    assert.equal(QLPKHtml.escape(0), '0');
});

test('shared escaper loads before page scripts on every runtime page', () => {
    const runtime = fs.readFileSync('app/static/js/shared/runtime.js', 'utf8');
    assert.ok(runtime.indexOf('./html-escape.js') >= 0);
    assert.ok(runtime.indexOf('./html-escape.js') < runtime.indexOf('./api-transport.js'));
});
