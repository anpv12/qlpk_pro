'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readCss = filename => fs.readFileSync(path.join(__dirname, '../app/static/css', filename), 'utf8');
const doctor = readCss('pages/doctor-examination.css');

test('doctor inherits header gradients without flattening their shared stops', () => {
    assert.doesNotMatch(doctor, /--qlpk-(?:header-bg|header-surface-strong|workflow-context-header-bg)\s*:/);
    const header = readCss('components/app-header.css');
    assert.match(header, /--qlpk-header-bg:\s*var\(--qlpk-brown-800\)/);
    assert.match(header, /background:\s*linear-gradient\(180deg,\s*var\(--qlpk-header-surface-strong/);
});

test('history and section selection reuse the shared brand background', () => {
    assert.match(doctor, /\.medical-history-workbench-nav__item\.is-active\s*\{[^}]*background:\s*var\(--qlpk-workflow-context-header-bg\)/);
    assert.match(doctor, /\.medical-history-tab-btn\.active,[^{]+\{[^}]*background:\s*var\(--qlpk-workflow-context-header-bg\)/);
    assert.match(doctor, /\.doctor-section-edge-nav__item\.is-active\s*\{[^}]*background:\s*var\(--qlpk-workflow-context-header-bg\)/);
});

test('intake cards retain shared brand accent borders by default', () => {
    assert.doesNotMatch(doctor, /--qlpk-intake-card-start-border/);
    for (const [filename, count] of [
        ['components/patient-info-form.css', 2],
        ['components/patient-visit-info-form.css', 1],
        ['components/patient-intake-support-sections.css', 3],
    ]) {
        const css = readCss(filename);
        const borders = [...css.matchAll(/border-inline-start:\s*0\.1875rem solid var\(/g)];
        assert.equal(borders.length, count, filename);
        assert.doesNotMatch(css, /--qlpk-intake-card-start-border/);
    }
    assert.doesNotMatch(readCss('pages/receptionist-new.css'), /--qlpk-intake-card-start-border\s*:/);
    const colors = readCss('shared/color-tokens.css');
    for (const token of ['qlpk-color-primary', 'qlpk-doctor-primary']) {
        assert.ok(colors.includes(`--${token}: var(--qlpk-brand-primary)`));
    }
});

test('neutral visit cards use the shared thin border instead of a second accent', () => {
    const css = readCss('components/patient-visit-info-form.css');
    const base = css.match(/\.qlpk-patient-visit-card\.receptionist-card\s*\{([^}]+)\}/)[1];
    assert.match(base, /border:\s*0\.0625rem solid var\(--qlpk-patient-visit-line\)/);
    assert.doesNotMatch(base, /border-inline-start\s*:/);
    assert.match(css, /\.qlpk-patient-visit-card\.receptionist-card:not\(\.qlpk-patient-visit-card--neutral-border\)\s*\{\s*border-inline-start:\s*0\.1875rem solid var\(--qlpk-patient-visit-accent\);\s*\}/);
});

test('only the two doctor examination cards opt into neutral borders and keep colored headers', () => {
    const template = fs.readFileSync(path.join(__dirname, '../app/templates/partials/doctor-clinical-workspace.html'), 'utf8');
    const cards = [...template.matchAll(/<section\b[^>]*class="[^"]*\bqlpk-patient-visit-card--neutral-border\b[^"]*"[^>]*id="([^"]+)"/g)];
    assert.deepEqual(cards.map(card => card[1]), ['doctorDecisionTreatmentTask', 'doctorClinicalDetailPanel']);
    assert.equal((template.match(/qlpk-patient-visit-card--neutral-border/g) || []).length, 2);
    assert.match(doctor, /\.doctor-clinical-form-card__header,\s*\.doctor-clinical-detail-panel__header\s*\{[^}]*background:\s*var\(--doctor-section-header-bg\)/);
    for (const filename of ['psychologist-clinical-workspace.html', 'patient-intake-sections.html']) {
        const otherTemplate = fs.readFileSync(path.join(__dirname, '../app/templates/partials', filename), 'utf8');
        assert.doesNotMatch(otherTemplate, /qlpk-patient-visit-card--neutral-border/);
    }
});

test('doctor and prescription never use a header gradient as ink or border color', () => {
    for (const filename of ['pages/doctor-examination.css', 'pages/doctor-prescription.css']) {
        const css = readCss(filename);
        const declarations = css.matchAll(/(?:^|[;{}])\s*([\w-]+)\s*:\s*([^;{}]+)/g);
        for (const [, property, value] of declarations) {
            if (!/var\(--(?:qlpk-workflow-context-header-bg|doctor-section-header-bg)/.test(value)) continue;
            assert.ok(['background', '--doctor-section-header-bg'].includes(property), `${filename}: ${property}`);
        }
    }
});
