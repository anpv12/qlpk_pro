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

