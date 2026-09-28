'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '../app/static/css/pages/receptionist-new.css'), 'utf8');
const template = fs.readFileSync(path.join(__dirname, '../app/templates/receptionist-new.html'), 'utf8');

test('native appointment time keeps room for hours, minutes and picker', () => {
    assert.match(template, /<input type="time" class="form-control" id="appointmentTime">/);
    assert.match(css, /\.receptionist-intake-panel \.receptionist-field--appointment-time \.form-control\s*\{[^}]*inline-size: 9\.25em;[^}]*min-inline-size: 9\.25em;[^}]*flex-shrink: 0;/);
    assert.doesNotMatch(css, /inline-size: min\(100%, 5\.5rem\)/);
});

test('intake typography matches doctor sizes and laptop breakpoint', () => {
    const doctor = fs.readFileSync(path.join(__dirname, '../app/static/css/pages/doctor-examination.css'), 'utf8');
    const breakpoint = '@media (min-width: 48rem) and (max-width: 96rem)';
    assert.doesNotMatch(css, /--receptionist-font-scale:/);
    assert.doesNotMatch(css, /--qlpk-font-size-(?:base|sm|xs|md|lg):/);
    for (const selector of ['.receptionist-intake-panel-title', '.receptionist-workspace .qlpk-queue-panel__title']) {
        const rule = css.slice(css.indexOf(selector + ' {')).split('}')[0];
        assert.match(rule, /font-size: var\(--receptionist-font-panel-title/);
    }
    for (const role of ['text', 'label', 'meta', 'chip', 'section-title']) {
        const base = '--receptionist-font-' + role + ': var(--qlpk-font-size-base);';
        const compact = '--receptionist-font-' + role + ': var(--qlpk-font-size-sm);';
        assert.ok(css.includes(base));
        assert.ok(doctor.includes(base));
        assert.ok(css.split(breakpoint)[1].includes(compact));
        assert.ok(doctor.split(breakpoint)[1].includes(compact));
    }
    assert.doesNotMatch(css, /--receptionist-header-control-block/);
});

test('header reserves intrinsic time column and keeps two rows on wide desktop', () => {
    const medium = css.split('@container receptionist-intake (min-width: 62rem)')[1];
    assert.match(medium, /grid-template-areas:\s*"title \. actions"\s*"schedule schedule schedule"/);
    assert.match(medium, /minmax\(10\.2rem, 1fr\)\s*max-content/);
    assert.doesNotMatch(css, /"title schedule actions"/);
    assert.doesNotMatch(css, /@container receptionist-intake \(min-width: 78rem\)/);
    assert.doesNotMatch(css, /--qlpk-workflow-context-header-block-size/);
    assert.match(medium, /padding-block: var\(--receptionist-header-padding-block\)/);
});

test('receptionist headers size naturally with shared text and spacing metrics', () => {
    const queue = css.split('.receptionist-workspace .qlpk-queue-panel__header {')[1].split('}')[0];
    assert.match(queue, /block-size: auto/);
    assert.match(queue, /padding-block: var\(--receptionist-header-padding-block\)/);
    assert.match(css, /\.receptionist-workspace \.qlpk-queue-panel__header-inner\s*\{\s*row-gap: var\(--receptionist-header-row-gap\)/);
    assert.match(css, /\.receptionist-workspace \.qlpk-save-info-btn\s*\{\s*block-size: auto;\s*min-block-size: 2\.2em;\s*font-size: var\(--receptionist-font-text\);\s*line-height: 1\.25;/);
});

test('paired intake cards share content-driven alignment only in two-column layout', () => {
    const shared = fs.readFileSync(path.join(__dirname, '../app/static/css/components/patient-info-form.css'), 'utf8');
    const doctor = fs.readFileSync(path.join(__dirname, '../app/static/css/pages/doctor-examination.css'), 'utf8');
    const stacked = shared.split('@container receptionist-intake (min-width: 60rem)')[0];
    const paired = shared.split('@container receptionist-intake (min-width: 60rem)')[1].split('/* Shared patient administrative')[0];
    assert.match(stacked, /align-items: start/);
    assert.match(paired, /\.receptionist-intake-grid\s*\{[^}]*align-items: stretch/);
    assert.match(paired, /grid-template-rows: auto auto minmax\(0, 1fr\)/);
    assert.match(paired, /grid-auto-rows: minmax\(0, 1fr\)/);
    assert.doesNotMatch(paired, /(?:height|block-size):\s*\d+(?:px|rem|vh)/);
    assert.doesNotMatch(doctor, /\.doctor-receptionist-intake-panel \.receptionist-intake-grid\s*\{/);
    assert.doesNotMatch(doctor, /\.doctor-receptionist-intake-panel \.qlpk-patient-info-card/);
});
