const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadFormulaEngine() {
	const source = fs.readFileSync('app/static/js/chi-tieu.js', 'utf8');
	const start = source.indexOf('const FORMULA_TOKEN');
	const end = source.indexOf('function computeRow(');
	const context = { columns: [{ id: 'c1', name: 'Thu' }, { id: 'c2', name: 'Chi' }] };
	vm.runInNewContext(source.slice(start, end) + '\nthis.evalFormula = evalFormula; this.evaluateArithmetic = evaluateArithmetic;', context);
	return context;
}

test('formula columns are evaluated with arithmetic only', () => {
	const engine = loadFormulaEngine();
	assert.equal(engine.evalFormula('[Thu] - [Chi]', { c1: '1000', c2: '250.5' }), 749.5);
	assert.equal(engine.evalFormula('([Thu] + [Chi]) * 2 % 7', { c1: 3, c2: 4 }), 0);
	assert.equal(engine.evalFormula('-[Thu] / 4', { c1: 8 }), -2);
	assert.equal(engine.evalFormula('[Unknown] + 1', {}), 1);
});

test('division by zero, malformed input and code are rejected as 0', () => {
	const engine = loadFormulaEngine();
	assert.equal(engine.evaluateArithmetic('5 / 0'), 0);
	assert.equal(engine.evaluateArithmetic('(1 + 2'), 0);
	assert.equal(engine.evaluateArithmetic('1 +'), 0);
	assert.equal(engine.evaluateArithmetic('alert(1)'), 0);
	assert.equal(engine.evaluateArithmetic('window.location'), 0);
	assert.equal(engine.evaluateArithmetic(''), 0);
	assert.equal(engine.evaluateArithmetic('2 ** 3'), 0);
});
