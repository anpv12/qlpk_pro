const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { runScriptFile } = require('./helpers/module-source');
const PAGE_FILES = ['chi-tieu.js', 'chi-tieu/revenue-charts.js', 'chi-tieu/grid-and-filters.js', 'chi-tieu/import-and-edit.js'];
const readScriptSource = () => PAGE_FILES.map(file => fs.readFileSync(`app/static/js/${file}`, 'utf8')).join('\n');

function loadFormulaEngine() {
	const source = readScriptSource('app/static/js/chi-tieu.js');
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

test('biểu đồ Chỉ tiêu dựng qua mountCtChart: dispose bản cũ, resize theo khung, không cộng dồn listener', () => {
	const pageSource = readScriptSource('app/static/js/chi-tieu.js');
	assert.doesNotMatch(pageSource, /addEventListener\('resize'/);
	assert.equal((pageSource.match(/= mountCtChart\(dom\)/g) || []).length, 4);
	const source = readScriptSource('app/static/js/chi-tieu.js');
	const start = source.indexOf('const ctChartObservers');
	const end = source.indexOf('\n}\n', start) + 3;
	const observed = [];
	const disposed = [];
	const instances = new Map();
	const echarts = {
		getInstanceByDom: dom => instances.get(dom),
		init: dom => { const chart = { resized: 0, resize() { this.resized++; }, dispose() { disposed.push(dom); instances.delete(dom); } }; instances.set(dom, chart); return chart; }
	};
	class ResizeObserver { constructor(callback) { this.callback = callback; observed.push(this); } observe(dom) { this.dom = dom; } }
	const context = { echarts, ResizeObserver, WeakMap };
	vm.runInNewContext(source.slice(start, end) + '\nthis.mountCtChart = mountCtChart;', context);
	const dom = {};
	context.mountCtChart(dom);
	const second = context.mountCtChart(dom);
	assert.equal(disposed.length, 1);
	assert.equal(observed.length, 1);
	observed[0].callback();
	assert.equal(second.resized, 1);
});
