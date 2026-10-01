'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPage, flush } = require('./helpers/esm-page');
const { JS_ROOT, pageModuleScripts } = require('./helpers/module-graph');

const PROGRESS_HTML = '<div id="survey-content"></div><b id="cur"></b><span id="total"></span><div id="kpi"></div><i id="bar"></i>';
const load = entry => loadPage(entry, { html: PROGRESS_HTML, url: 'http://localhost/patient-survey.html' });

test('patient survey page is one ES module entry without jQuery or HTML strings', () => {
    const template = fs.readFileSync(path.join(__dirname, '../app/templates/patient-survey.html'), 'utf8');
    const scripts = pageModuleScripts('patient-survey.html', 'patient-survey.js').filter(file => file.startsWith('patient-survey'));
    assert.equal(scripts[0], 'patient-survey.js');
    assert.doesNotMatch(template, /jquery|<script src="\/static\/js\/patient-survey/i);
    for (const file of scripts) {
        const source = fs.readFileSync(path.join(JS_ROOT, file), 'utf8');
        assert.doesNotMatch(source, /\$\(|\$\.ajax|\.innerHTML\b|insertAdjacentHTML/, file);
    }
});

test('answer checks accept zero-valued answers and required grids', async () => {
    const { module: interaction } = await load('patient-survey/interaction.js');
    const { validateGridQuestion } = await import(path.join(JS_ROOT, 'patient-survey/interaction-parts/grid-and-restore.js'));
    for (const value of [0, '0', ['0'], 'answer']) assert.equal(interaction.hasSurveyAnswer(value), true);
    for (const value of [undefined, null, '', '  ', []]) assert.equal(interaction.hasSurveyAnswer(value), false);
    const required = { required: true };
    assert.equal(interaction.canProceedSurveyQuestion(required, { answer_id: 0 }), true);
    assert.equal(interaction.canProceedSurveyQuestion(required, { answer_value: 0 }), true);
    assert.equal(interaction.canProceedSurveyQuestion(required, { answer_ids: [] }), false);
    assert.equal(interaction.canProceedSurveyQuestion({ required: false }, undefined), true);
    assert.equal(interaction.canProceedSurveyQuestion(required, undefined), false);
    const grid = { type: 'multiple_choice_grid', required: true, grid: { rows: [{ id: 0 }, { id: 'r1' }] } };
    assert.equal(interaction.canProceedSurveyQuestion(grid, { grid_responses: { 0: 0, r1: 0 } }), true);
    assert.equal(interaction.canProceedSurveyQuestion(grid, { grid_responses: { 0: 0 } }), false);
    assert.equal(validateGridQuestion(grid, { grid_responses: { 0: 0 } }), false);
    grid.required = false;
    assert.equal(interaction.canProceedSurveyQuestion(grid, { grid_responses: { 0: 0 } }), true);
});

test('option ids keep real zero and fall back to the index only when missing', async () => {
    const { module } = await load('patient-survey/questions-parts/answer-renderers.js');
    assert.equal(module.surveyOptionId({ id: 0 }, 2), 0);
    assert.equal(module.surveyOptionId({ id: '' }, 2), 2);
    assert.equal(module.surveyOptionId({ id: 'stable' }, 2), 'stable');
});

test('patient reopening and physician review hydrate the same renderer, and progress counts it', async () => {
    const { module: restore, document } = await load('patient-survey/interaction-parts/grid-and-restore.js');
    const { state } = await import(path.join(JS_ROOT, 'patient-survey/state.js'));
    const { updateProgress } = await import(path.join(JS_ROOT, 'patient-survey/interaction.js'));
    state.allQuestions = [
        { id: 'single' }, { id: 'multi', type: 'checkboxes' },
        { id: 'text', type: 'paragraph' }, { id: 'day', type: 'date' },
        { id: 'grid', type: 'multiple_choice_grid', grid: { rows: [{ id: 'row', question_id: 'saved-row' }] } },
        { id: 'missing' },
    ];
    restore.restoreSavedSurveyResponses({ single: 0, multi: ['a', 'b'], text: 'Đáp án đã lưu',
        day: '2026-09-06', 'saved-row': 'column', unrelated: 'ignore' });
    assert.deepEqual(JSON.parse(JSON.stringify(state.surveyResponses)), {
        q_single: { answer_id: 0 }, q_multi: { answer_ids: ['a', 'b'] },
        q_text: { answer_text: 'Đáp án đã lưu' }, q_day: { answer_value: '2026-09-06' },
        q_grid: { grid_responses: { row: 'column' } },
    });
    restore.restoreSavedSurveyResponses({ single: 'other' });
    assert.deepEqual(JSON.parse(JSON.stringify(state.surveyResponses)), { q_single: { answer_id: 'other' } });

    state.totalQuestions = 1;
    restore.restoreSavedSurveyResponses({ single: 0 });
    updateProgress();
    await flush();
    assert.equal(document.getElementById('kpi').textContent, '100%');
    assert.equal(document.getElementById('cur').textContent, '1');
    assert.equal(document.getElementById('bar').style.insetInlineEnd, '0%');
});
