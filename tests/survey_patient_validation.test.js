const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = require('./helpers/page-script-source').readPageScripts('patient-survey.html', ['patient-survey.js', 'patient-survey/']);
// Answer checks live in interaction.js; the grid validator sits in its grid-and-restore part.
const slice = (from, to) => { const start = source.indexOf(from); const end = source.indexOf(to, start); assert.ok(start >= 0 && end > start, from); return source.slice(start, end); };
const context = vm.createContext({});
vm.runInContext(slice('function hasSurveyAnswer(', '\nfunction ', ) + slice('function canProceedSurveyQuestion(', '\n}\n') + '\n}\n'
    + slice('function validateRegularQuestion(', '\n}\n') + '\n}\n'
    + slice('function validateGridQuestion(', '// Handle grid question response'), context);
for (const value of [0, '0', ['0'], 'answer']) assert.equal(context.hasSurveyAnswer(value), true);
for (const value of [undefined, null, '', '  ', []]) assert.equal(context.hasSurveyAnswer(value), false);
assert.equal(context.validateRegularQuestion({answer_id: 0}), true);
assert.equal(context.validateRegularQuestion({answer_value: 0}), true);
assert.equal(context.validateRegularQuestion({answer_ids: []}), false);
assert.equal(context.canProceedSurveyQuestion({required: false}, undefined), true);
assert.equal(context.canProceedSurveyQuestion({required: true}, undefined), false);
const grid = {type:'multiple_choice_grid', required:true, grid:{rows:[{id:0},{id:'r1'}]}};
assert.equal(context.canProceedSurveyQuestion(grid, {grid_responses:{0:0,r1:0}}), true);
assert.equal(context.canProceedSurveyQuestion(grid, {grid_responses:{0:0}}), false);
grid.required = false;
assert.equal(context.canProceedSurveyQuestion(grid, {grid_responses:{0:0}}), true);
console.log('Patient validation: optional questions, required grids and zero-valued answers passed');
