'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readCssSource } = require('./helpers/css-source');

const css = readCssSource(path.join(__dirname, '../app/static/css/pages/doctor-examination.css'));
const template = fs.readFileSync(path.join(__dirname, '../app/templates/partials/doctor-clinical-workspace.html'), 'utf8');
const fields = [...template.matchAll(/<label class="doctor-clinical-detail-field\b[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)];
const rule = selector => {
    const start = css.indexOf(`${selector} {`);
    assert.notEqual(start, -1, selector);
    return css.slice(start, css.indexOf('}', start));
};

test('detail preserves all 15 labelled textareas without inline exceptions or placeholders', () => {
    assert.deepEqual(fields.map(field => field[1]), [
        'examGeneralCirculation', 'examGeneralDigestive', 'examGeneralRenalUroGenital',
        'examGeneralMusculoskeletal', 'examGeneralENT', 'examGeneralEndocrineNutritionOthers',
        'examGeneralMental', 'examMentalOrientation', 'examMentalEmotions', 'examMentalPerception',
        'examMentalThought', 'examMentalBehavior', 'examMentalAttention', 'examMentalIntelligence', 'examMentalMemory',
    ]);
    for (const [, id, content] of fields) {
        assert.ok(content.includes(`id="${id}" rows="1"></textarea>`));
        assert.doesNotMatch(content, /placeholder=|disabled|readonly/);
    }
    assert.doesNotMatch(template + css, /doctor-clinical-detail-field--inline/);
});

test('detail uses uniform stacked labels and regular content without changing shared forms', () => {
    const base = '.doctor-clinical-detail-panel .doctor-clinical-detail-field.receptionist-paper-field';
    assert.match(rule(base), /grid-template-columns: minmax\(0, 1fr\)/);
    assert.match(rule(`${base} .form-label`), /font-weight: var\(--qlpk-font-weight-medium\)/);
    const control = rule(`${base} .form-control`);
    assert.match(control, /font-weight: var\(--qlpk-font-weight-regular\)/);
    assert.match(control, /color: var\(--doctor-clinical-content\)/);
    assert.match(control, /resize: vertical/);
    assert.match(rule('.doctor-clinical-detail-panel__group h4'), /font-weight: var\(--qlpk-font-weight-bold\)/);
    assert.doesNotMatch(control, /opacity|!important/);
});

test('detail keeps responsive columns and compact content-sized gaps', () => {
    assert.match(css, /@media \(min-width: 48rem\)\s*\{\s*\.doctor-clinical-detail-panel__fields\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(rule('.doctor-clinical-detail-field--full'), /grid-column: 1 \/ -1/);
    assert.match(css, /\.doctor-clinical-detail-panel__fields\s*\{\s*gap: 0\.5rem 0\.75rem/);
});
