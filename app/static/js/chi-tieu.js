/* global getRevDateRange, isInDateRange, loadAndRenderRevenue, parseDateStr, renderGrid, renderThuChiChart, updateCell */
/* exported _thuChiChartInstance, acBlurTimer, activeTab, apiRequest, closeAllAc, columns, computeRow, fmtNum, getCat, loadExpenses, normalizeSearchText, render, rows, saveColumnsToServer, setCtVisible, switchTab */

// Continued in (nạp ngay sau file này, cùng scope trang): chi-tieu/chi-tieu-2.js, chi-tieu/chi-tieu-3.js, chi-tieu/chi-tieu-4.js
let activeTab = (location.hash === '#chi') ? 'chi' : 'tonghop';

function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
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

// ===== CATEGORY CONFIG =====
const CAT = {
	'Thuê nhà': { icon: 'bi-house', color: '#8b5cf6', bg: '#f5f3ff' },
	'Tiền điện': { icon: 'bi-lightning', color: '#eab308', bg: '#fefce8' },
	'Nước': { icon: 'bi-droplet', color: '#06b6d4', bg: '#ecfeff' },
	'Rác': { icon: 'bi-trash', color: '#78716c', bg: '#fafaf9' },
	'Tiền lương': { icon: 'bi-wallet2', color: '#ef4444', bg: '#fef2f2' },
	'Sửa chữa vật tư': { icon: 'bi-tools', color: '#f97316', bg: '#fff7ed' },
	'Mua sắm vật tư': { icon: 'bi-cart3', color: '#10b981', bg: '#ecfdf5' },
	'Khác': { icon: 'bi-three-dots', color: '#64748b', bg: '#f8fafc' },
	'Từ thiện': { icon: 'bi-heart', color: '#ec4899', bg: '#fdf2f8' },
	'Quan hệ': { icon: 'bi-people', color: '#6366f1', bg: '#eef2ff' },
	'Hàng ngày': { icon: 'bi-calendar-day', color: '#0ea5e9', bg: '#f0f9ff' },
	'Hợp đồng': { icon: 'bi-file-earmark-text', color: '#14b8a6', bg: '#f0fdfa' },
};
function getCat(type) {
	if (CAT[type]) return CAT[type];
	// Generate unique color from category name hash
	let hash = 0;
	for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
	const hue = ((hash % 360) + 360) % 360;
	const color = `hsl(${hue}, 55%, 50%)`;
	const bg = `hsl(${hue}, 40%, 95%)`;
	return { icon: 'bi-tag', color, bg };
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
let rows = [];

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
		rows = await apiRequest('/api/expenses');
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
			else value = right === 0 ? 0 : (operator === '/' ? value / right : value % right);
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
function sumCol(colId) { return rows.reduce((s, r) => s + (parseFloat(computeRow(r)[colId]) || 0), 0); }

// ===== AUTOCOMPLETE =====
let acBlurTimer = null;
function getAcOptions(col) {
	const fromData = [...new Set(rows.map(r => r[col.id]).filter(Boolean))];
	const fromCol = col.options || [];
	return [...new Set([...fromCol, ...fromData])];
}
// Delegated through shared/inline-actions.js (mousedown keeps the input from blurring first).
function acSelectAttrs(ri, colId, value) {
	const args = JSON.stringify([ri, colId, value]).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
	return `data-qlpk-call="selectAc" data-qlpk-on="mousedown" data-qlpk-args='${args}'`;
}
function openAcList(ri, colId, inputEl) {
	clearTimeout(acBlurTimer);
	closeAllAc();
	const col = columns.find(c => c.id === colId);
	const allOpts = getAcOptions(col);
	const query = normalizeSearchText(inputEl.value);
	const filtered = query ? allOpts.filter(o => normalizeSearchText(o).includes(query)) : allOpts;
	const listEl = inputEl.parentElement.querySelector('.ac-list');
	if (!listEl) return;
	let html = filtered.map(o => `<div class="ac-item" ${acSelectAttrs(ri, colId, o)}> ${o}</div>`).join('');
	if (query && !allOpts.some(o => normalizeSearchText(o) === query)) {
		html += `<div class="ac-item ac-item-new" ${acSelectAttrs(ri, colId, query)}>
			<i class="bi bi-plus-circle me-1"></i> Thêm "${inputEl.value.trim()}"</div>`;
	}
	listEl.innerHTML = html || '<div class="ac-item ac-item-muted">Không có gợi ý</div>';
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
					cell.style.cssText = `--ct-type-bg:${cat.bg};--ct-type-color:${cat.color};`;
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
	const dateRows = rows.filter(r => isInDateRange(r));
	const validRows = dateRows.filter(r => parseFloat(r.amount) > 0);
	const totalChi = validRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
	let chiCash = 0, chiTransfer = 0;
	validRows.forEach(r => { if (r.payment === 'Tiền mặt') chiCash += (parseFloat(r.amount) || 0); else chiTransfer += (parseFloat(r.amount) || 0); });
	const avg = validRows.length > 0 ? Math.round(totalChi / validRows.length) : 0;
	const cashCount = validRows.filter(r => r.payment === 'Tiền mặt').length;
	const transferCount = validRows.filter(r => r.payment === 'Chuyển khoản').length;
	const cashPct = totalChi > 0 ? (chiCash / totalChi * 100).toFixed(1) : 0;
	const transPct = totalChi > 0 ? (chiTransfer / totalChi * 100).toFixed(1) : 0;

	// Top chi
	const chiByType = {};
	validRows.forEach(r => { const t = r.type || 'Khác'; chiByType[t] = (chiByType[t] || 0) + (parseFloat(r.amount) || 0); });
	const topType = Object.entries(chiByType).sort((a, b) => b[1] - a[1]);
	const topLine = topType.length > 0 ? `<b>${topType[0][0]}</b> chiếm nhiều nhất với <span class="al-highlight ct-text-danger">${fmtNum(topType[0][1])}</span>` : '';

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

	// Smart text
	const todayText = todayRows.length > 0
		? `<span class="sv ct-text-rose">${fmtNum(todayTotal)}</span> <span class="sm">(${todayRows.length} khoản)</span>`
		: '<span class="sm">Chưa phát sinh</span>';

	const topDateText = topDate.length > 0
		? `Ngày <span class="sv ct-text-indigo">${topDate[0][0]}</span> <span class="sm">(${fmtNum(topDate[0][1])})</span>`
		: '';

	const topTypeText = topType.length > 0
		? `<span class="sv ct-text-orange">${topType[0][0]}</span> <span class="sm">(${fmtNum(topType[0][1])})</span>`
		: '';

	// Khoản nhỏ nhất
	const minRow = validRows.length > 0
		? validRows.reduce((m, r) => (parseFloat(r.amount) || 0) < (parseFloat(m.amount) || 0) ? r : m)
		: null;
	const minText = minRow
		? `<span class="sv ct-text-cyan">${minRow.type || 'Khác'}</span> <span class="sm">(${fmtNum(parseFloat(minRow.amount) || 0)})</span>`
		: '';

	// Số ngày có chi
	const daysWithExpense = Object.keys(byDate).length;

	// Loại chi nhiều nhất (theo số lượng khoản)
	const typeCount = {};
	validRows.forEach(r => { const t = r.type || 'Khác'; typeCount[t] = (typeCount[t] || 0) + 1; });
	const topCountType = Object.entries(typeCount).sort((a, b) => b[1] - a[1]);
	const topCountText = topCountType.length > 0
		? `<span class="sv ct-text-purple">${topCountType[0][0]}</span> <span class="sm">(${topCountType[0][1]} khoản)</span>`
		: '';

		document.getElementById('summaryStrip').innerHTML = `
		<div class="ss-title"><i class="bi bi-bar-chart-line"></i> Phân tích Thu - Chi</div>
		<div class="ss-group">
			<span class="ss-group-label ss-group-label--blue"><i class="bi bi-clipboard-data"></i> Tổng quan</span>
			<div class="ss-items ss-items--inline" id="ssTongQuan">
				<span class="ss-item ss-item--muted"><i class="bi bi-hourglass-split spinner-border spinner-border-sm ct-spinner-inline"></i> Đang tính toán...</span>
			</div>
		</div>
		<div class="ss-group">
			<span class="ss-group-label ss-group-label--green"><i class="bi bi-credit-card"></i> Cấu trúc khoản chi</span>
			<div class="ss-items">
				<span class="ss-item"><span class="ss-emoji">🏦</span> Chuyển khoản <span class="sv ct-text-success">${fmtNum(chiTransfer)}</span> <span class="sm">${transPct}%</span></span>
				<span class="ss-item"><span class="ss-emoji">💵</span> Tiền mặt <span class="sv ct-text-blue">${fmtNum(chiCash)}</span> <span class="sm">${cashPct}%</span></span>
				<span class="ss-item"><span class="ss-emoji">👉</span> Hình thức chính: <span class="sv ct-text-success">${mainPayment}</span> <span class="sm">${mainPct}%</span></span>
			</div>
		</div>
		<div class="ss-group">
			<span class="ss-group-label ss-group-label--amber"><i class="bi bi-star"></i> Chi tiêu nổi bật</span>
			<div class="ss-items">
				<span class="ss-item"><span class="ss-emoji">🔺</span> Lớn nhất ${topTypeText}</span>
				<span class="ss-item"><span class="ss-emoji">🔻</span> Nhỏ nhất ${minText}</span>
				<span class="ss-item"><span class="ss-emoji">🔁</span> Nhiều nhất ${topCountText}</span>
			</div>
		</div>
	`;

	renderPieChart(totalChi, validRows);
	loadAndRenderRevenue();
	loadAndRenderThuChi(validRows, totalChi, daysWithExpense, todayText, topDateText);
}

function renderPieChart(totalChi, dateRows) {
	const chiByType = {};
	dateRows.forEach(r => { const t = r.type || 'Khác'; chiByType[t] = (chiByType[t] || 0) + (parseFloat(r.amount) || 0); });

	const data = Object.entries(chiByType).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({
		name, value, itemStyle: { color: getCat(name).color }
	}));

	const chart = echarts.init(document.getElementById('pieChart'));
	chart.setOption({
		tooltip: {
			trigger: 'item',
			formatter: p => `<b>${p.name}</b><br/>${fmtNum(p.value)} · ${p.percent}%`
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
	window.addEventListener('resize', () => chart.resize());
}

function renderRankList(totalChi, dateRows) {
	const chiByType = {};
	dateRows.forEach(r => { const t = r.type || 'Khác'; chiByType[t] = (chiByType[t] || 0) + (parseFloat(r.amount) || 0); });

	const sorted = Object.entries(chiByType).sort((a, b) => b[1] - a[1]);
	const colors = ['#ef4444', '#f97316', '#eab308', '#3b82f6', '#8b5cf6', '#64748b'];

		document.getElementById('rankList').innerHTML = sorted.map(([type, amount], i) => {
		const cat = getCat(type);
		const pct = totalChi > 0 ? (amount / totalChi * 100).toFixed(1) : 0;
		const rankCls = i < 3 ? `r${i + 1}` : 'r4';
		const barColor = colors[i] || '#94a3b8';
		return `<div class="rank-item">
			<div class="rank-num ${rankCls}">${i + 1}</div>
			<i class="bi ${cat.icon} rank-icon ct-rank-icon-dynamic" style="--ct-rank-color:${cat.color};"></i>
			<div class="rank-info">
				<div class="rank-name">${type}</div>
				<div class="rank-bar-wrap"><div class="rank-bar ct-rank-bar-dynamic" style="--ct-rank-width:${pct}%;--ct-rank-bar-color:${barColor};"></div></div>
			</div>
			<div class="ct-rank-value">
				<div class="rank-amount">${fmtNum(amount)}</div>
				<div class="rank-pct">${pct}%</div>
			</div>
		</div>`;
	}).join('');
}

// ==================== THỐNG KÊ THU CHI CHART ====================
let _thuChiChartInstance = null;
async function loadAndRenderThuChi(chiRows, totalChi = 0, daysWithExpense = 0, todayText = '', topDateText = '') {
	try {
		const range = getRevDateRange();
		if (!range) return;

		// 1. Group chi (expense) by day from expense rows
		const chiByDay = {};
		chiRows.forEach(r => {
			const d = r.date; // dd/mm/yyyy
			if (!d) return;
			const parts = d.split('/');
			const dayLabel = `${parseInt(parts[0],10)}/${parseInt(parts[1],10)}`; // "d/m"
			chiByDay[dayLabel] = (chiByDay[dayLabel] || 0) + (parseFloat(r.amount) || 0);
		});

		// 2. Load revenue data (already per-day from API)
		const data = await apiRequest(`/api/dashboard/revenue?from_date=${range.fromISO}&to_date=${range.toISO}`);
		const thuByDay = {};
		if (data && data.items) {
			data.items.forEach(item => {
				// item.label = "d/m" e.g. "13/4"
				thuByDay[item.label] = (thuByDay[item.label] || 0) + (item.total || 0);
			});
		}

		// 3. Build day labels — use all days from revenue API (sorted chronologically)
		const allDayLabels = data && data.items ? data.items.map(i => i.label) : [];
		// Add chi-only days that might not be in revenue
		Object.keys(chiByDay).forEach(k => { if (!allDayLabels.includes(k)) allDayLabels.push(k); });

		if (allDayLabels.length === 0) return;

		const thuValues = allDayLabels.map(d => +((thuByDay[d] || 0) / 1000000).toFixed(2));
		const chiValues = allDayLabels.map(d => +((chiByDay[d] || 0) / 1000000).toFixed(2));

		// Calculate total Thu over the retrieved period
		let totalThu = 0;
		if (data && data.items) {
			data.items.forEach(item => totalThu += (item.total || 0));
		}

		const profit = totalThu - totalChi;
		const profitSign = profit >= 0 ? '+' : '';
		const profitClass = profit >= 0 ? 'ct-profit-positive' : 'ct-profit-negative';

		// Update DOM for Summary Strip's Tổng quan
		const ssTongQuan = document.getElementById('ssTongQuan');
		if (ssTongQuan) {
			ssTongQuan.innerHTML = `
				<span class="ss-item tooltip-host"><span class="ss-emoji">💰</span> Tổng thu: <span class="sv ct-summary-value ct-text-revenue">${fmtNum(totalThu)}</span></span>
				<span class="ss-item tooltip-host"><span class="ss-emoji">💸</span> Tổng chi: <span class="sv ct-summary-value ct-text-danger">${fmtNum(totalChi)}</span></span>
				<span class="ss-item tooltip-host"><span class="ss-emoji">📈</span> Lợi nhuận: <span class="sv ct-summary-profit ${profitClass}">${profitSign}${fmtNum(profit)}</span></span>
				<div class="ms-3 ps-3 border-start ct-summary-extra">
					<span class="ss-item"><span class="ss-emoji">☀️</span> Hôm nay chi: ${todayText}</span>
					<span class="ss-item"><span class="ss-emoji">📆</span> Chi nhiều nhất: ${topDateText}</span>
				</div>
			`;
		}

		renderThuChiChart(allDayLabels, thuValues, chiValues);
	} catch (e) {
		console.error('Load thu chi error:', e);
	}
}
