const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const { readOrderManagementSource } = require('./helpers/order-management-source');
const source = readOrderManagementSource();
const start = source.indexOf('function resolveSurveyAnswerText(');
const end = source.indexOf('// Render single survey result card', start);
const helperStart = source.indexOf('function attrJson(');
const helperEnd = source.indexOf('\n}\n', helperStart) + 3;
const context = vm.createContext({ escapeHtml: value => String(value).replaceAll('<', '&lt;'), JSON });
vm.runInContext(source.slice(helperStart, helperEnd) + source.slice(start, end), context);
const template = { questions_by_criteria: {
    A: [{ id: 'q0', text: 'Câu có điểm 0', answers: [{ id: 'a0', text: 'Không', score: 0 }] },
        { id: 'q1', text: 'Câu điểm khác 0', answers: [{ id: 'a2', text: 'Có', score: 2 }] }],
    B: [{ id: 'q2', text: 'Câu chưa trả lời', answers: [] }],
} };
const response = { id: 1, examination_id: 1, responses: { q0: 'a0', q1: 'a2' }, total_scores: { A: 2 } };
const summary = context.summarizePatientAnswersForOrderManagement(template, response);
assert.equal(summary.scores.A, 2);
assert.equal(summary.scores.B, null);
assert.equal(summary.criteria.A.length, 2);
assert.equal(summary.criteria.B.length, 0);
let html = context.renderSurveyResultsByCriteria(template, response);
assert.match(html, /Chưa tính được/);
assert.doesNotMatch(html, /score-value">0</);
response.total_scores.A = 0;
html = context.renderSurveyResultsByCriteria(template, response);
assert.match(html, /score-value">0</);
assert.match(html, /Chưa tính được/);
assert.equal(context.resolveSurveyAnswerText({ answers: [{ id: 'abc', text: 'Không' }] }, '0'), 'Không ghép được đáp án');
assert.equal(context.resolveSurveyAnswerText({ answers: [{ text: 'Không' }, { text: 'Có' }] }, '1'), 'Có');
assert.equal(context.resolveSurveyAnswerText({ answers: [{ id: 2, text: 'Đúng mã 2' }, { id: 1, text: 'Mã 1' }] }, '2'), 'Đúng mã 2');
const noPrefixMatch = context.summarizePatientAnswersForOrderManagement(template, { responses: { A_1: 'a0' }, total_scores: {} });
assert.equal(noPrefixMatch.criteria.A.length, 0);
console.log('Survey result identity, missing-score and real-zero checks passed');

const patientSource = require('./helpers/page-script-source').readPageScripts('patient-survey.html', ['patient-survey.js', 'patient-survey/']);
const optionStart = patientSource.indexOf('function surveyOptionId(');
const optionEnd = patientSource.indexOf('function renderRadioOption(', optionStart);
vm.runInContext(patientSource.slice(optionStart, optionEnd), context);
assert.equal(context.surveyOptionId({ id: 0 }, 2), 0);
assert.equal(context.surveyOptionId({ id: '' }, 2), 2);
assert.equal(context.surveyOptionId({ id: 'stable' }, 2), 'stable');

// Both patient reopening and physician review hydrate the same renderer.
vm.runInContext(patientSource.slice(patientSource.indexOf('function restoreSavedSurveyResponses('),
    patientSource.indexOf('// Use the same question renderer')), context);
context.allQuestions = [
    {id: 'single'}, {id: 'multi', type: 'checkboxes'},
    {id: 'text', type: 'paragraph'}, {id: 'day', type: 'date'},
    {id: 'grid', type: 'multiple_choice_grid', grid: {rows: [{id: 'row', question_id: 'saved-row'}]}},
    {id: 'missing'},
];
context.restoreSavedSurveyResponses({single: 0, multi: ['a', 'b'], text: 'Đáp án đã lưu',
    day: '2026-09-06', 'saved-row': 'column', unrelated: 'ignore'});
assert.deepEqual(JSON.parse(JSON.stringify(context.surveyResponses)), {
    q_single: {answer_id: 0}, q_multi: {answer_ids: ['a', 'b']},
    q_text: {answer_text: 'Đáp án đã lưu'}, q_day: {answer_value: '2026-09-06'},
    q_grid: {grid_responses: {row: 'column'}},
});
context.restoreSavedSurveyResponses({single: 'other'});
assert.deepEqual(JSON.parse(JSON.stringify(context.surveyResponses)), {q_single: {answer_id: 'other'}});
const progressLabels = {};
context.$ = selector => ({text: value => {progressLabels[selector] = value;}});
context.setSurveyProgressBar = value => {progressLabels.bar = value;};
context.totalQuestions = 1;
context.restoreSavedSurveyResponses({single: 0});
vm.runInContext(patientSource.slice(patientSource.indexOf('function updateProgress()'),
    patientSource.indexOf('// Update navigation buttons\nfunction updateNavigationButtons')), context);
context.updateProgress();
assert.equal(progressLabels.bar, 100);
