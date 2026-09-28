'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('transfer surface belongs to the content box, not the fullscreen modal shell', () => {
    const css = fs.readFileSync('app/static/css/transfer-modal.css', 'utf8');
    const content = css.match(/\.modal-content\.transfer-modal\s*\{([^}]+)\}/);
    assert.ok(content);
    assert.match(content[1], /background: var\(--transfer-surface\)/);
    assert.match(content[1], /box-shadow:/);
    for (const block of css.matchAll(/^\.transfer-modal\s*\{([^}]+)\}/gm)) {
        assert.doesNotMatch(block[1], /(?:^|;)\s*(?:background|box-shadow|overflow|border-radius)\s*:/);
    }
});
