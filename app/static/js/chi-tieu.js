// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './custom-modal.js';
import './realtime-client.js';
import './realtime-page-hooks.js';
import { state } from './chi-tieu/state.js';
import { el, icon, replace } from './shared/dom.js';
import { CAT, getCat } from './chi-tieu/categories.js';
import { registerFinanceRealtime, updateCell } from './chi-tieu/import-and-edit.js';
import { isInDateRange, parseDateStr, renderGrid } from './chi-tieu/grid-and-filters.js';
import { getRevDateRange, initGlobalDateFilter, loadAndRenderRevenue, renderThuChiChart } from './chi-tieu/revenue-charts.js';
import { QLPKHtml } from './shared/html-escape.js';
import { QLPKSearchNormalization } from './shared/search-normalization.js';
import { QLPKInlineActions } from './shared/inline-actions.js';

let activeTab = (location.hash === '#chi') ? 'chi' : 'tonghop';

function normalizeSearchText(value) {
	return QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

function setCtVisible(target, isVisible) {
	const el = typeof target === 'string' ? document.getElementById(target) : target;
	if (!el) return;
	el.classList.toggle('ct-hidden', !isVisible);
}

function setCtTabVisible(id, isVisible) {
	const el = document.getElementById(id);
	if (!el) return;
	el.classList.toggle('ct-tab-active', isVisible);
	el.classList.toggle('ct-hidden', !isVisible);
}

// ===== CHI COLUMNS =====
const DEFAULT_COLUMNS = [
	{ id: 'date', name: 'Ngày', type: 'date', width: 70 },
	{ id: 'desc', name: 'Nội dung', type: 'text', width: 200 },
	{ id: 'category', name: 'Hạng mục', type: 'autocomplete', options: ['Chi phát sinh', 'Chi thường xuyên', 'Chi vật tư tiêu hao'], width: 120 },
	{ id: 'type', name: 'Loại chi', type: 'autocomplete', options: Object.keys(CAT), width: 120 },
	{ id: 'amount', name: 'Số tiền', type: 'number', width: 90 },
	{ id: 'payment', name: 'Hình thức', type: 'autocomplete', options: ['Tiền mặt', 'Chuyển khoản'], width: 100 },
	{ id: 'note', name: 'Nguồn tiền', type: 'autocomplete', options: ['BS Hiến','BS Tuấn','TLG Khương','Tươi','Tiền lễ tân','Tài khoản PK','Tiền khám'], width: 120 },
];
let columns = [...DEFAULT_COLUMNS];

// ===== CHI DATA =====
state.rows = [];

// ===== API HELPER =====
async function apiRequest(url, method = 'GET', body = null) {
	const opts = {
		method,
		headers: { 'Content-Type': 'application/json' }
	};
	if (body) opts.body = JSON.stringify(body);
	const res = await fetch(url, opts);
	if (!res.ok) throw new Error(await res.text());
	return res.json();
}

async function loadColumns() {
	try {
		const saved = await apiRequest('/api/expenses/columns');
		if (saved && saved.length > 0) {
			columns = saved;
		}
	} catch (e) {
		console.warn('Load columns fallback to default:', e);
	}
}

async function saveColumnsToServer() {
	try {
		await apiRequest('/api/expenses/columns', 'POST', columns);
	} catch (e) {
		console.error('Save columns error:', e);
	}
}

async function loadExpenses() {
	try {
		await loadColumns();
		state.rows = await apiRequest('/api/expenses');
		render();
	} catch (e) {
		console.error('Load expenses error:', e);
	}
}

// ===== ENGINE =====
const FORMULA_TOKEN = /\s*(\d+(?:\.\d+)?|[-+*/%()])\s*/y;

function tokenizeFormula(expr) {
	const tokens = [];
	FORMULA_TOKEN.lastIndex = 0;
	while (FORMULA_TOKEN.lastIndex < expr.length) {
		const match = FORMULA_TOKEN.exec(expr);
		if (!match) return null;
		tokens.push(match[1]);
	}
	return tokens;
}

// Arithmetic-only evaluator for formula columns: numbers, + - * / %, parentheses, unary sign.
// Division/modulo by zero yields 0; anything else (functions, identifiers, code) yields 0.
function evaluateArithmetic(expr) {
	const tokens = tokenizeFormula(String(expr ?? ''));
	if (!tokens || !tokens.length) return 0;
	let index = 0;
	const peek = () => tokens[index];
	const next = () => tokens[index++];
	function parsePrimary() {
		const token = next();
		if (token === '(') {
			const value = parseExpression();
			if (next() !== ')') throw new Error('missing )');
			return value;
		}
		if (token === '-') return -parsePrimary();
		if (token === '+') return parsePrimary();
		if (token !== undefined && /^\d/.test(token)) return parseFloat(token);
		throw new Error('unexpected token');
	}
	function parseTerm() {
		let value = parsePrimary();
		while (peek() === '*' || peek() === '/' || peek() === '%') {
			const operator = next();
			const right = parsePrimary();
			if (operator === '*') value *= right;
			else if (right === 0) value = 0;
			else value = operator === '/' ? value / right : value % right;
		}
		return value;
	}
	function parseExpression() {
		let value = parseTerm();
		while (peek() === '+' || peek() === '-') {
			const operator = next();
			const right = parseTerm();
			value = operator === '+' ? value + right : value - right;
		}
		return value;
	}
	try {
		const value = parseExpression();
		return index === tokens.length && Number.isFinite(value) ? value : 0;
	} catch {
		return 0;
	}
}

function evalFormula(formula, rowData) {
	let expr = formula;
	for (const m of (formula.match(/\[([^\]]+)\]/g) || [])) {
		const col = columns.find(c => c.name === m.slice(1, -1));
		expr = expr.replace(m, col ? (parseFloat(rowData[col.id]) || 0) : 0);
	}
	return evaluateArithmetic(expr);
}
function computeRow(row) {
	const c = { ...row };
	for (const col of columns) if (col.type === 'formula' && col.formula) c[col.id] = evalFormula(col.formula, c);
	return c;
}
function fmtNum(v) { return (!v && v !== 0) || v === 0 ? '0' : new Intl.NumberFormat('vi-VN').format(v); }

// ===== AUTOCOMPLETE =====
state.acBlurTimer = null;
function getAcOptions(col) {
	const fromData = [...new Set(state.rows.map(r => r[col.id]).filter(Boolean))];
	const fromCol = col.options || [];
	return [...new Set([...fromCol, ...fromData])];
}
// Options are delegated through shared/inline-actions.js (mousedown keeps the input from blurring first).
function openAcList(ri, colId, inputEl) {
	clearTimeout(state.acBlurTimer);
	closeAllAc();
	const col = columns.find(c => c.id === colId);
	const allOpts = getAcOptions(col);
	const query = normalizeSearchText(inputEl.value);
	const filtered = query ? allOpts.filter(o => normalizeSearchText(o).includes(query)) : allOpts;
	const listEl = inputEl.parentElement.querySelector('.ac-list');
	if (!listEl) return;
	const option = (className, value, ...label) => el('div', { class: className, 'data-qlpk-call': 'selectAc', 'data-qlpk-on': 'mousedown', 'data-qlpk-args': JSON.stringify([ri, colId, value]) }, ...label);
	const items = filtered.map(o => option('ac-item', o, ` ${o}`));
	if (query && !allOpts.some(o => normalizeSearchText(o) === query)) items.push(option('ac-item ac-item-new', query, icon('bi-plus-circle', 'me-1'), ` Thêm "${inputEl.value.trim()}"`));
	replace(listEl, items.length ? items : el('div', { class: 'ac-item ac-item-muted' }, 'Không có gợi ý'));
	listEl.classList.add('show');
}
function selectAc(ri, colId, value) {
	updateCell(ri, colId, value);
	closeAllAc();
	// Update the input value and style inline (no full re-render)
	const col = columns.find(c => c.id === colId);
	if (!col) return;
	// Find the input by scanning visible rows
	const tbody = document.getElementById('chiBody');
	if (!tbody) return;
	const inputs = tbody.querySelectorAll(`input[data-col="${colId}"]`);
	inputs.forEach(inp => {
		if (inp.dataset.ri === String(ri)) {
			inp.value = value;
			if (colId === 'type') {
				const cat = getCat(value);
				const cell = inp.closest('td');
				inp.classList.add('ct-type-input');
				if (cell) {
					cell.classList.add('ct-type-cell');
					cell.removeAttribute('style');
					cell.style.setProperty('--ct-type-bg', cat.bg);
					cell.style.setProperty('--ct-type-color', cat.color);
				}
			}
		}
	});
}
function closeAllAc() {
	document.querySelectorAll('.ac-list.show').forEach(el => el.classList.remove('show'));
}

// ===== TAB =====
function switchTab(tab) {
	activeTab = tab;
	location.hash = tab;
	document.querySelectorAll('.nav-tabs-custom .nav-link').forEach((t, i) => {
		t.classList.toggle('active', (i === 0 && tab === 'tonghop') || (i === 1 && tab === 'chi'));
	});
	setCtTabVisible('tab-chi', tab === 'chi');
	setCtTabVisible('tab-tonghop', tab === 'tonghop');
	render();
}

// ===== RENDER =====
function render() {
	if (activeTab === 'tonghop') { renderDashboard(); }
	else { renderGrid(); }
}

// ==================== DASHBOARD ====================
function renderDashboard() {
	const dateRows = state.rows.filter(r => isInDateRange(r));
	const validRows = dateRows.filter(r => parseFloat(r.amount) > 0);
	const totalChi = validRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
	let chiCash = 0, chiTransfer = 0;
	validRows.forEach(r => { if (r.payment === 'Tiền mặt') chiCash += (parseFloat(r.amount) || 0); else chiTransfer += (parseFloat(r.amount) || 0); });
	const cashPct = totalChi > 0 ? (chiCash / totalChi * 100).toFixed(1) : 0;
	const transPct = totalChi > 0 ? (chiTransfer / totalChi * 100).toFixed(1) : 0;

	// Top chi
	const chiByType = {};
	validRows.forEach(r => { const t = r.type || 'Khác'; chiByType[t] = (chiByType[t] || 0) + (parseFloat(r.amount) || 0); });
	const topType = Object.entries(chiByType).sort((a, b) => b[1] - a[1]);

	// Chi hôm nay
	const today = new Date(); today.setHours(0, 0, 0, 0);
	const todayRows = validRows.filter(r => {
		const d = parseDateStr(r.date);
		return d && d.getTime() === today.getTime();
	});
	const todayTotal = todayRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

	// Ngày chi nhiều nhất
	const byDate = {};
	validRows.forEach(r => {
		if (r.date) byDate[r.date] = (byDate[r.date] || 0) + (parseFloat(r.amount) || 0);
	});
	const topDate = Object.entries(byDate).sort((a, b) => b[1] - a[1]);

	// Hình thức chi chính
	const mainPayment = chiCash >= chiTransfer ? 'Tiền mặt' : 'Chuyển khoản';
	const mainPct = chiCash >= chiTransfer ? cashPct : transPct;

	// Smart text (node lists; each is inserted once)
	const sv = (tone, text) => el('span', { class: `sv ${tone}` }, text);
	const sm = text => el('span', { class: 'sm' }, text);
	const todayText = todayRows.length > 0 ? [sv('ct-text-rose', fmtNum(todayTotal)), ' ', sm(`(${todayRows.length} khoản)`)] : [sm('Chưa phát sinh')];
	const topDateText = topDate.length > 0 ? ['Ngày ', sv('ct-text-indigo', topDate[0][0]), ' ', sm(`(${fmtNum(topDate[0][1])})`)] : [];
	const topTypeText = topType.length > 0 ? [sv('ct-text-orange', topType[0][0]), ' ', sm(`(${fmtNum(topType[0][1])})`)] : [];
	const minRow = validRows.length > 0 ? validRows.reduce((m, r) => (parseFloat(r.amount) || 0) < (parseFloat(m.amount) || 0) ? r : m) : null;
	const minText = minRow ? [sv('ct-text-cyan', minRow.type || 'Khác'), ' ', sm(`(${fmtNum(parseFloat(minRow.amount) || 0)})`)] : [];
	const typeCount = {};
	validRows.forEach(r => { const t = r.type || 'Khác'; typeCount[t] = (typeCount[t] || 0) + 1; });
	const topCountType = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
	const topCountText = topCountType.length > 0 ? [sv('ct-text-purple', topCountType[0][0]), ' ', sm(`(${topCountType[0][1]} khoản)`)] : [];

	const item = (emoji, ...content) => el('span', { class: 'ss-item' }, el('span', { class: 'ss-emoji' }, emoji), ' ', ...content);
	const group = (tone, iconName, label, items) => el('div', { class: 'ss-group' }, el('span', { class: `ss-group-label ss-group-label--${tone}` }, icon(iconName), ` ${label}`), items);
	replace(document.getElementById('summaryStrip'),
		el('div', { class: 'ss-title' }, icon('bi-bar-chart-line'), ' Phân tích Thu - Chi'),
		group('blue', 'bi-clipboard-data', 'Tổng quan', el('div', { class: 'ss-items ss-items--inline', id: 'ssTongQuan' },
			el('span', { class: 'ss-item ss-item--muted' }, icon('bi-hourglass-split', 'spinner-border spinner-border-sm ct-spinner-inline'), ' Đang tính toán...'))),
		group('green', 'bi-credit-card', 'Cấu trúc khoản chi', el('div', { class: 'ss-items' },
			item('🏦', 'Chuyển khoản ', sv('ct-text-success', fmtNum(chiTransfer)), ' ', sm(`${transPct}%`)),
			item('💵', 'Tiền mặt ', sv('ct-text-blue', fmtNum(chiCash)), ' ', sm(`${cashPct}%`)),
			item('👉', 'Hình thức chính: ', sv('ct-text-success', mainPayment), ' ', sm(`${mainPct}%`)))),
		group('amber', 'bi-star', 'Chi tiêu nổi bật', el('div', { class: 'ss-items' },
			item('🔺', 'Lớn nhất ', topTypeText), item('🔻', 'Nhỏ nhất ', minText), item('🔁', 'Nhiều nhất ', topCountText))));

	renderPieChart(totalChi, validRows);
	loadAndRenderRevenue();
	loadAndRenderThuChi(validRows, totalChi, todayText, topDateText);
}

function renderPieChart(totalChi, dateRows) {
	const chiByType = {};
	dateRows.forEach(r => { const t = r.type || 'Khác'; chiByType[t] = (chiByType[t] || 0) + (parseFloat(r.amount) || 0); });

	const data = Object.entries(chiByType).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({
		name, value, itemStyle: { color: getCat(name).color }
	}));

	const dom = document.getElementById('pieChart');
	if (!dom) return;
	const chart = mountCtChart(dom);
	chart.setOption({
		tooltip: {
			trigger: 'item',
			formatter: p => `<b>${QLPKHtml.escape(p.name)}</b><br/>${fmtNum(p.value)} · ${p.percent}%`
		},
		legend: { bottom: 0, padding: [16, 0, 0, 0], textStyle: { fontSize: 10 } },
		series: [{
			type: 'pie', radius: ['42%', '66%'], center: ['50%', '38%'],
			avoidLabelOverlap: true,
			itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
			label: {
				show: true,
				formatter: p => p.percent >= 3 ? `${p.percent}%` : '',
				fontSize: 11, fontWeight: 600
			},
			emphasis: {
				label: { show: true, fontSize: 14, fontWeight: 'bold', formatter: '{b}\n{d}%' },
				itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' }
			},
			data
		}],
		graphic: [{
			type: 'text', left: 'center', top: '38%',
			style: {
				text: fmtNum(totalChi),
				textAlign: 'center', fill: '#1e293b',
				fontSize: 18, fontWeight: 800
			}
		}, {
			type: 'text', left: 'center', top: '48%',
			style: {
				text: 'Tổng chi',
				textAlign: 'center', fill: '#94a3b8', fontSize: 11
			}
		}]
	});
}

// ==================== THỐNG KÊ THU CHI CHART ====================
state._thuChiChartInstance = null;
const ctChartObservers = new WeakMap();
function mountCtChart(dom) {
	const existing = echarts.getInstanceByDom(dom);
	if (existing) existing.dispose();
	const chart = echarts.init(dom);
	if (!ctChartObservers.has(dom) && typeof ResizeObserver === 'function') {
		const observer = new ResizeObserver(() => {
			const current = echarts.getInstanceByDom(dom);
			if (current) current.resize();
		});
		observer.observe(dom);
		ctChartObservers.set(dom, observer);
	}
	return chart;
}
async function loadAndRenderThuChi(chiRows, totalChi = 0, todayText = '', topDateText = '') {
	try {
		const range = getRevDateRange();
		if (!range) return;

		// 1. Group chi (expense) by day from expense rows
		const chiByDay = groupExpensesByDay(chiRows);

		// 2. Load revenue data (already per-day from API; item.label = "d/m" e.g. "13/4")
		const data = await apiRequest(`/api/dashboard/revenue?from_date=${range.fromISO}&to_date=${range.toISO}`);
		const revenueItems = data && data.items ? data.items : [];
		const thuByDay = {};
		revenueItems.forEach(item => {
			thuByDay[item.label] = (thuByDay[item.label] || 0) + (item.total || 0);
		});

		// 3. Build day labels — use all days from revenue API (sorted chronologically), then chi-only days
		const allDayLabels = revenueItems.map(i => i.label);
		Object.keys(chiByDay).forEach(k => { if (!allDayLabels.includes(k)) allDayLabels.push(k); });

		if (allDayLabels.length === 0) return;

		const toMillions = byDay => allDayLabels.map(d => +((byDay[d] || 0) / 1000000).toFixed(2));
		const thuValues = toMillions(thuByDay);
		const chiValues = toMillions(chiByDay);

		// Calculate total Thu over the retrieved period
		const totalThu = revenueItems.reduce((sum, item) => sum + (item.total || 0), 0);

		renderThuChiSummary(totalThu, totalChi, todayText, topDateText);

		renderThuChiChart(allDayLabels, thuValues, chiValues);
	} catch (e) {
		console.error('Load thu chi error:', e);
	}
}

function groupExpensesByDay(chiRows) {
	const chiByDay = {};
	chiRows.forEach(r => {
		const d = r.date; // dd/mm/yyyy
		if (!d) return;
		const parts = d.split('/');
		const dayLabel = `${parseInt(parts[0],10)}/${parseInt(parts[1],10)}`; // "d/m"
		chiByDay[dayLabel] = (chiByDay[dayLabel] || 0) + (parseFloat(r.amount) || 0);
	});
	return chiByDay;
}

function renderThuChiSummary(totalThu, totalChi, todayText, topDateText) {
	const profit = totalThu - totalChi;
	const profitSign = profit >= 0 ? '+' : '';
	const profitClass = profit >= 0 ? 'ct-profit-positive' : 'ct-profit-negative';

	// Update DOM for Summary Strip's Tổng quan
	const ssTongQuan = document.getElementById('ssTongQuan');
	if (!ssTongQuan) return;
	const item = (emoji, label, value, extra = '') => el('span', { class: 'ss-item tooltip-host' }, el('span', { class: 'ss-emoji' }, emoji), ` ${label}: `, el('span', { class: `sv ${extra}` }, value));
	replace(ssTongQuan,
		item('💰', 'Tổng thu', fmtNum(totalThu), 'ct-summary-value ct-text-revenue'),
		item('💸', 'Tổng chi', fmtNum(totalChi), 'ct-summary-value ct-text-danger'),
		item('📈', 'Lợi nhuận', `${profitSign}${fmtNum(profit)}`, `ct-summary-profit ${profitClass}`),
		el('div', { class: 'ms-3 ps-3 border-start ct-summary-extra' },
			el('span', { class: 'ss-item' }, el('span', { class: 'ss-emoji' }, '☀️'), ' Hôm nay chi: ', todayText),
			el('span', { class: 'ss-item' }, el('span', { class: 'ss-emoji' }, '📆'), ' Chi nhiều nhất: ', topDateText)));
}

QLPKInlineActions.register({ openAcList, render, selectAc, switchTab });

export { activeTab, apiRequest, closeAllAc, columns, computeRow, fmtNum, getCat, loadExpenses, mountCtChart, normalizeSearchText, render, saveColumnsToServer, setCtVisible, switchTab };

// Entry evaluates last (its imports run first), so page bootstrap lives here.
initGlobalDateFilter();
registerFinanceRealtime();
switchTab(activeTab);
