'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readCssSource } = require('./helpers/css-source');

const css = readCssSource(path.join(__dirname, '../app/static/css/shared/color-tokens.css'));
const declarations = [...css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];
const tokens = new Map(declarations.map(([, name, value]) => [name, value.trim()]));

function resolve(name, chain = []) {
    assert.ok(tokens.has(name), `Missing token: ${name}`);
    assert.ok(!chain.includes(name), `Circular token: ${name}`);
    return tokens.get(name).replace(/var\((--[\w-]+)\)/g, (_, reference) => resolve(reference, [...chain, name]));
}

function luminance(color) {
    const channels = /^#[0-9a-f]{6}$/i.test(color)
        ? color.slice(1).match(/../g).map(channel => parseInt(channel, 16))
        : /^rgb\(\s*\d+,\s*\d+,\s*\d+\s*\)$/.test(color)
            ? color.match(/\d+/g).map(Number)
            : null;
    assert.ok(channels, `Unsupported color: ${color}`);
    const linear = channels.map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function checkContrast(foreground, background, minimum = 4.5) {
    const values = [luminance(foreground), luminance(background)].sort((first, second) => second - first);
    const ratio = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(ratio >= minimum, `${foreground} on ${background}: ${ratio.toFixed(2)} < ${minimum}`);
}

test('button tokens are unique and independent from brand colors', () => {
    const buttonDeclarations = declarations.filter(([, name]) => name.startsWith('--qlpk-button-'));
    assert.equal(new Set(buttonDeclarations.map(([, name]) => name)).size, buttonDeclarations.length);
    for (const [, name, value] of buttonDeclarations) {
        assert.doesNotMatch(value, /gradient|brown|brand|color-primary/, name);
    }
    assert.equal(resolve('--qlpk-button-primary-bg'), '#176b5b');
    assert.equal(resolve('--qlpk-button-on-dark-bg'), '#ffffff');
    assert.equal(resolve('--qlpk-button-secondary-bg'), '#f5f5f5');
});

for (const role of ['primary', 'danger']) {
    test(role + ': readable text in normal, hover and active states', () => {
        for (const state of ['bg', 'hover', 'active']) {
            checkContrast(resolve('--qlpk-button-' + role + '-text'), resolve('--qlpk-button-' + role + '-' + state));
        }
    });
}

test('secondary text and danger links remain readable on both surfaces', () => {
    for (const surface of ['secondary', 'on-dark']) {
        for (const state of ['bg', 'hover', 'active']) {
            const background = resolve('--qlpk-button-' + surface + '-' + state);
            checkContrast(resolve('--qlpk-button-secondary-text'), background);
            checkContrast(resolve('--qlpk-button-danger-bg'), background);
        }
    }
});

test('focus is tested against actual light and dark containing surfaces', () => {
    checkContrast(resolve('--qlpk-button-focus-light'), '#ffffff', 3);
    for (const background of ['#6d3d27', '#4b2719']) {
        checkContrast(resolve('--qlpk-button-focus-dark'), background, 3);
        checkContrast(resolve('--qlpk-button-on-dark-bg'), background, 3);
    }
    assert.equal(resolve('--qlpk-button-focus-width'), '2px');
    assert.equal(resolve('--qlpk-button-focus-offset'), '3px');
});

test('disabled controls match approved neutral palette without gradient or border', () => {
    assert.equal(resolve('--qlpk-button-disabled-bg'), '#e7e7e7');
    assert.equal(resolve('--qlpk-button-disabled-text'), '#747474');
    assert.equal(resolve('--qlpk-button-disabled-image'), 'none');
    assert.equal(resolve('--qlpk-button-disabled-border'), 'transparent');
    checkContrast(resolve('--qlpk-button-disabled-text'), resolve('--qlpk-button-disabled-bg'), 3);
});
