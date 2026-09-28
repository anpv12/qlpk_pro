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
function openAcList(ri, colId, inputEl) {
	clearTimeout(acBlurTimer);
	closeAllAc();
	const col = columns.find(c => c.id === colId);
	const allOpts = getAcOptions(col);
	const query = normalizeSearchText(inputEl.value);
	const filtered = query ? allOpts.filter(o => normalizeSearchText(o).includes(query)) : allOpts;
	const listEl = inputEl.parentElement.querySelector('.ac-list');
	if (!listEl) return;
	let html = filtered.map(o => `<div class="ac-item" onmousedown="selectAc(${ri},'${colId}','${o.replace(/'/g, "\\'")}')"> ${o}</div>`).join('');
	if (query && !allOpts.some(o => normalizeSearchText(o) === query)) {
		html += `<div class="ac-item ac-item-new" onmousedown="selectAc(${ri},'${colId}','${query.replace(/'/g, "\\'")}')">
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

function renderThuChiChart(labels, thuValues, chiValues) {
	_thuChiExportData = { labels, thuValues, chiValues };
	const dom = document.getElementById('thuChiChart');
	if (!dom) return;

	if (_thuChiChartInstance) { _thuChiChartInstance.dispose(); _thuChiChartInstance = null; }

	const chart = echarts.init(dom);
	_thuChiChartInstance = chart;

	chart.setOption({
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			confine: true,
			formatter: params => {
				const thu = params.find(p => p.seriesName === 'Doanh thu');
				const chi = params.find(p => p.seriesName === 'Chi tiêu');
				const diff = ((thu?.value || 0) - (chi?.value || 0)).toFixed(2);
				const diffClass = diff >= 0 ? 'ct-tooltip-positive' : 'ct-tooltip-negative';
				return `<strong>${params[0].name}</strong><br/>` +
					`${thu?.marker || ''} Doanh thu: <b>${(thu?.value || 0).toFixed(2)}</b> triệu<br/>` +
					`${chi?.marker || ''} Chi tiêu: <b>${(chi?.value || 0).toFixed(2)}</b> triệu<br/>` +
					`<span class="${diffClass}">⬤</span> Chênh lệch: <b class="${diffClass}">${diff} triệu</b>`;
			}
		},
		legend: {
			show: true, top: 0, left: 'center',
			textStyle: { fontSize: 12 },
			data: ['Doanh thu', 'Chi tiêu']
		},
		grid: { left: 50, right: 20, top: 45, bottom: 30 },
		xAxis: {
			type: 'category', data: labels,
			axisLabel: { fontSize: 12, color: '#334155', fontWeight: 500 },
			axisTick: { show: false },
			axisLine: { lineStyle: { color: '#E2E8F0' } }
		},
		yAxis: {
			type: 'value', name: 'Triệu',
			nameTextStyle: { fontSize: 11, color: '#94A3B8' },
			axisLabel: { fontSize: 11, color: '#94A3B8' },
			splitLine: { lineStyle: { color: '#F1F5F9' } }
		},
		series: [{
			name: 'Doanh thu', type: 'bar',
			data: thuValues,
			itemStyle: { color: '#059669', borderRadius: [4, 4, 0, 0] },
			emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(5,150,105,0.3)' } },
			barMaxWidth: 36, barGap: '30%',
			label: {
				show: true, position: 'top',
				formatter: p => p.value > 0 ? p.value.toFixed(1) : '',
				fontSize: 10, color: '#059669', fontWeight: 600
			}
		}, {
			name: 'Chi tiêu', type: 'bar',
			data: chiValues,
			itemStyle: { color: '#dc2626', borderRadius: [4, 4, 0, 0] },
			emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(220,38,38,0.3)' } },
			barMaxWidth: 36,
			label: {
				show: true, position: 'top',
				formatter: p => p.value > 0 ? p.value.toFixed(1) : '',
				fontSize: 10, color: '#dc2626', fontWeight: 600
			}
		}]
	});

	window.addEventListener('resize', () => chart.resize());
}

// Last chart data, kept for export
let _thuChiExportData = null;

window.exportThuChiExcel = async function() {
	try {
		const range = getRevDateRange();
		if (!range) { alert('Chưa có dữ liệu để xuất'); return; }
		const url = `/api/dashboard/export-thu-chi?from_date=${range.fromISO}&to_date=${range.toISO}`;
		const response = await fetch(url);
		if (!response.ok) { alert('Lỗi xuất Excel'); return; }
		const blob = await response.blob();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		const cd = response.headers.get('Content-Disposition') || '';
		const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		a.download = match ? match[1].replace(/['"]/g, '') : 'thong_ke_thu_chi.xlsx';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(a.href);
	} catch (e) {
		console.error('Export thu chi error:', e);
		window.QLPKUserFeedback?.show('error', 'Không thể xuất dữ liệu. Vui lòng thử lại.');
	}
};

// Export Chi tiêu Excel (reuse existing backend API)
window.exportChiTieuExcel = async function() {
	try {
		const fromEl = document.getElementById('dateFrom');
		const toEl = document.getElementById('dateTo');
		if (!fromEl || !toEl || !fromEl.value || !toEl.value) { alert('Chưa có dữ liệu'); return; }
		const url = `/api/expenses/export?from=${encodeURIComponent(fromEl.value)}&to=${encodeURIComponent(toEl.value)}`;
		const response = await fetch(url);
		if (!response.ok) { alert('Lỗi xuất Excel'); return; }
		const blob = await response.blob();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		const cd = response.headers.get('Content-Disposition') || '';
		const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		a.download = match ? match[1].replace(/['"]/g, '') : 'chi_tieu.xlsx';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(a.href);
	} catch (e) {
		console.error('Export chi tieu error:', e);
		window.QLPKUserFeedback?.show('error', 'Không thể xuất dữ liệu. Vui lòng thử lại.');
	}
};

// ==================== REVENUE CHART ====================
async function loadAndRenderRevenue() {
	try {
		const fromEl = document.getElementById('dateFrom');
		const toEl = document.getElementById('dateTo');
		if (!fromEl || !toEl || !fromEl.value || !toEl.value) return;

		const parseFp = (v) => {
			const p = v.split('/');
			return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
		};
		const range = getRevDateRange();
		if (!range) return;

		const data = await apiRequest(`/api/dashboard/revenue?from_date=${range.fromISO}&to_date=${range.toISO}`);
		if (data && data.items) {
			renderRevenueChart(data.items);
		}
	} catch (e) {
		console.error('Load revenue error:', e);
	}
}

let _revenueChartInstance = null;
function renderRevenueChart(items) {
	const dom = document.getElementById('revenueChart');
	if (!dom) return;

	if (_revenueChartInstance) {
		_revenueChartInstance.dispose();
		_revenueChartInstance = null;
	}

	const labels = items.map(i => i.label);
	const serviceValues = items.map(i => +(i.service / 1000000).toFixed(2));
	const medicineValues = items.map(i => +(i.medicine / 1000000).toFixed(2));

	const chart = echarts.init(dom);
	_revenueChartInstance = chart;

	chart.setOption({
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			confine: true,
			formatter: params => {
				const svc = params.find(p => p.seriesName === 'Dịch vụ');
				const med = params.find(p => p.seriesName === 'Thuốc');
				const total = ((svc?.value || 0) + (med?.value || 0)).toFixed(2);
				return `<strong>${params[0].name}</strong><br/>` +
					`${svc?.marker || ''} Dịch vụ: <b>${(svc?.value || 0).toFixed(2)}</b> triệu<br/>` +
					`${med?.marker || ''} Thuốc: <b>${(med?.value || 0).toFixed(2)}</b> triệu<br/>` +
					`<b>Tổng: ${total} triệu</b>`;
			}
		},
		legend: {
			show: true, top: 0, left: 'center',
			selectedMode: true,
			textStyle: { fontSize: 11 },
			data: ['Dịch vụ', 'Thuốc']
		},
		grid: { left: 45, right: 10, top: 40, bottom: 25 },
		xAxis: {
			type: 'category', data: labels,
			axisLabel: { fontSize: 11, color: '#64748B' },
			axisTick: { show: false },
			axisLine: { lineStyle: { color: '#E5E7EB' } }
		},
		yAxis: {
			type: 'value', name: 'Triệu',
			nameTextStyle: { fontSize: 11, color: '#94A3B8' },
			axisLabel: { fontSize: 11, color: '#94A3B8' },
			splitLine: { lineStyle: { color: '#F1F5F9' } }
		},
		series: [{
			name: 'Dịch vụ', type: 'bar', stack: 'revenue',
			data: serviceValues,
			itemStyle: { color: '#3B82F6', borderRadius: [0, 0, 0, 0] },
			emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(59,130,246,0.3)' } },
			barMaxWidth: 40
		}, {
			name: 'Thuốc', type: 'bar', stack: 'revenue',
			data: medicineValues,
			itemStyle: { color: '#10B981', borderRadius: [4, 4, 0, 0] },
			emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(16,185,129,0.3)' } },
			barMaxWidth: 40,
			label: {
				show: true, position: 'top',
				formatter: p => {
					const idx = p.dataIndex;
					const total = serviceValues[idx] + medicineValues[idx];
					return total > 0 ? total.toFixed(2) : '';
				},
				fontSize: 10, color: '#64748B'
			}
		}]
	});

	window.addEventListener('resize', () => chart.resize());

	// Click on bar to show revenue detail
	chart.on('click', (params) => {
		if (params.seriesName === 'D\u1ecbch v\u1ee5' || params.seriesName === 'Thu\u1ed1c') {
			const typeMap = { 'D\u1ecbch v\u1ee5': 'service', 'Thu\u1ed1c': 'medicine' };
			showRevenueDetail(typeMap[params.seriesName], params.name);
		}
	});
}

// ==================== REVENUE VIEW TOGGLE ====================
let _revView = 'time';
let _serviceChartInstance = null;

function getRevDateRange() {
	const fromEl = document.getElementById('dateFrom');
	const toEl = document.getElementById('dateTo');
	if (!fromEl || !toEl || !fromEl.value || !toEl.value) return null;
	const parseFp = (v) => { const p = v.split('/'); return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; };
	let fromISO = parseFp(fromEl.value);
	let toISO = parseFp(toEl.value);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
	if (toISO > todayISO) toISO = todayISO;
	return { fromISO, toISO };
}

window.setRevView = function(view) {
	_revView = view;
	['btnRevTime', 'btnRevService', 'btnRevMedicine'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.classList.remove('active');
	});
	const activeMap = { time: 'btnRevTime', service: 'btnRevService', medicine: 'btnRevMedicine' };
	const btn = document.getElementById(activeMap[view]);
	if (btn) btn.classList.add('active');

	setCtVisible('revenueChart', view === 'time');
	setCtVisible('serviceChart', view !== 'time');

	if (view === 'time') {
		if (_revenueChartInstance) setTimeout(() => _revenueChartInstance.resize(), 30);
	} else {
		loadServiceSummary(view);
		if (_serviceChartInstance) setTimeout(() => _serviceChartInstance.resize(), 30);
	}
};

async function loadServiceSummary(view) {
	try {
		const range = getRevDateRange();
		if (!range) return;
		const url = `/api/dashboard/service-summary?from_date=${range.fromISO}&to_date=${range.toISO}`;
		const data = await apiRequest(url);
		const activeView = view || _revView || 'service';
		const items = activeView === 'medicine' ? (data.medicines || []) : (data.services || []);
		const type = activeView === 'medicine' ? 'medicine' : 'service';
		renderServiceChart(items, type);
	} catch (e) {
		console.error('Load service summary error:', e);
	}
}

function renderServiceChart(items, type) {
	const dom = document.getElementById('serviceChart');
	if (!dom) return;

	if (_serviceChartInstance) { _serviceChartInstance.dispose(); _serviceChartInstance = null; }

	const formatCurrency = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);
	const COLORS_SVC = ['#3B82F6', '#F97316', '#10B981', '#EF4444', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#14B8A6', '#84CC16'];
	const COLORS_MED = ['#10B981', '#F97316', '#6366F1', '#EF4444', '#06B6D4', '#F59E0B', '#34D399', '#EC4899', '#84CC16', '#14B8A6'];
	const COLORS = type === 'medicine' ? COLORS_MED : COLORS_SVC;
	const unit = type === 'medicine' ? 'vi\u00ean' : 'ca';
	const categoryLabel = type === 'medicine' ? 'Thu\u1ed1c' : 'D\u1ecbch v\u1ee5';
	const categoryColor = type === 'medicine' ? '#10B981' : '#3B82F6';
	const total = items.reduce((s, i) => s + i.revenue, 0);

	const roseData = items.map((item, i) => ({
		name: item.name, value: item.revenue, _count: item.count, _unit: unit,
		itemStyle: { color: COLORS[i % COLORS.length], borderRadius: 6, borderColor: '#fff', borderWidth: 1.5 }
	}));

	const chart = echarts.init(dom);
	_serviceChartInstance = chart;

	chart.setOption({
		backgroundColor: 'transparent',
		tooltip: {
			trigger: 'item', confine: true,
			formatter: (p) => {
				const d = p.data;
				return `<b>${p.name}</b><br/>${p.marker} Doanh thu: <b>${formatCurrency(p.value)}</b><br/>\u{1F4CA} T\u1ef7 l\u1ec7: <b>${p.percent}%</b><br/>\u{1F4E6} S\u1ed1 l\u01b0\u1ee3ng: <b>${d._count || 0} ${d._unit}</b>`;
			}
		},
		graphic: [{
			type: 'text', left: 'center', top: '41%',
			style: {
				text: `{a|${categoryLabel}}\n{b|${formatCurrency(total)}}`,
				rich: {
					a: { font: 'bold 13px sans-serif', fill: categoryColor, align: 'center', lineHeight: 22 },
					b: { font: '11px sans-serif', fill: '#64748B', align: 'center', lineHeight: 18 }
				},
				textAlign: 'center'
			}
		}],
		series: [{
			name: categoryLabel, type: 'pie', radius: ['40%', '65%'], center: ['50%', '50%'],
			avoidLabelOverlap: true,
			itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
			label: {
				show: true, position: 'outside',
				formatter: (p) => `{name|${p.name}}\n{pct|${p.percent}%}`,
				rich: {
					name: { fontSize: 11, color: '#334155', fontWeight: '500', lineHeight: 16, align: 'center' },
					pct: { fontSize: 12, color: categoryColor, fontWeight: 'bold', lineHeight: 18, align: 'center' }
				}
			},
			labelLine: { show: true, length: 12, length2: 18, smooth: 0.5, lineStyle: { color: '#CBD5E1', width: 1.5 } },
			emphasis: {
				itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' },
				label: { fontSize: 13 }
			},
			data: roseData, animationType: 'scale', animationEasing: 'elasticOut', animationDuration: 700
		}]
	});

	window.addEventListener('resize', () => chart.resize());
}

// Revenue Detail Modal (click on bar chart)
async function showRevenueDetail(type, dateLabel) {
	const formatCurrency = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
	const modalEl = document.getElementById('revenueDetailModal');
	if (!modalEl) return;
	const modal = new bootstrap.Modal(modalEl);

	document.getElementById('revenueDetailTitle').textContent = `Chi ti\u1ebft ${type === 'service' ? 'D\u1ecbch v\u1ee5' : 'Thu\u1ed1c'} - ${dateLabel}`;
	setCtVisible('revenueDetailLoading', true);
	setCtVisible('revenueDetailContent', false);
	setCtVisible('revenueDetailEmpty', false);
	modal.show();

	try {
		const url = `/api/dashboard/revenue/detail?mode=day&type=${type}&date_key=${encodeURIComponent(dateLabel)}`;
		const data = await apiRequest(url);
		setCtVisible('revenueDetailLoading', false);

		if (data.items && data.items.length > 0) {
			setCtVisible('revenueDetailContent', true);
			const tbody = document.getElementById('revenueDetailTableBody');
			const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

			let totalQty = 0;
			tbody.innerHTML = data.items.map((item, index) => {
				totalQty += item.quantity;
				const qtyDisplay = type === 'medicine' ? `${item.quantity} ${item.unit || ''}` : item.quantity;
				const colorClass = `ct-revenue-dot-${index % COLORS.length}`;
				return `<tr>
					<td class="ps-3 py-2 border-bottom"><div class="d-flex align-items-center">
						<span class="ct-revenue-dot ${colorClass}"></span>
						<span class="fw-medium text-dark ct-revenue-cell-text">${item.name}</span>
					</div></td>
					<td class="py-2 text-center border-bottom text-secondary ct-revenue-cell-text">${qtyDisplay}</td>
					<td class="pe-3 py-2 text-end border-bottom fw-medium text-dark ct-revenue-cell-text">${formatCurrency(item.total_amount)}</td>
				</tr>`;
			}).join('');

			document.getElementById('revenueDetailTotalQty').textContent = totalQty;
			document.getElementById('revenueDetailTotalAmount').textContent = formatCurrency(data.total_sum);

			// Donut chart in modal
			const chartDom = document.getElementById('revenueDetailChart');
			if (chartDom) {
				const oldChart = echarts.getInstanceByDom(chartDom);
				if (oldChart) oldChart.dispose();
				const donut = echarts.init(chartDom);
				donut.setOption({
					tooltip: { trigger: 'item', formatter: (p) => `${p.marker} ${p.name}<br/><b>${formatCurrency(p.value)}</b> (${p.percent}%)` },
					legend: { show: false },
					series: [{
						type: 'pie', radius: ['45%', '78%'], avoidLabelOverlap: false,
						label: { show: true, position: 'center', formatter: () => `{bold|${data.items.length}}\n{sub|h\u1ea1ng m\u1ee5c}`,
							rich: { bold: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', lineHeight: 30 }, sub: { fontSize: 11, color: '#94A3B8', lineHeight: 18 } }
						},
						emphasis: { label: { show: true }, itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.2)' } },
						data: data.items.map((item, i) => ({ name: item.name, value: item.total_amount, itemStyle: { color: COLORS[i % COLORS.length] } }))
					}]
				});
			}
		} else {
				setCtVisible('revenueDetailEmpty', true);
		}
	} catch (error) {
		console.error('Revenue detail error:', error);
		setCtVisible('revenueDetailLoading', false);
		setCtVisible('revenueDetailEmpty', true);
	}
}

// Export Revenue Excel
window.exportRevenueExcel = async function() {
	try {
		const range = getRevDateRange();
		if (!range) return;
		const url = `/api/dashboard/export-excel?from_date=${range.fromISO}&to_date=${range.toISO}`;
		const response = await fetch(url);
		if (!response.ok) { alert('L\u1ed7i xu\u1ea5t Excel'); return; }
		const blob = await response.blob();
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		const cd = response.headers.get('Content-Disposition') || '';
		const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		a.download = match ? match[1].replace(/['"]/g, '') : 'doanh_thu.xlsx';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(a.href);
	} catch (e) {
		console.error('Export error:', e);
		window.QLPKUserFeedback?.show('error', 'Không thể xuất dữ liệu. Vui lòng thử lại.');
	}
};


let fpFrom = null, fpTo = null;
let filterDateFrom = null, filterDateTo = null;
let activePreset = 'month';

function initGlobalDateFilter() {
	const fpOpts = { locale: 'vn', dateFormat: 'd/m/Y', allowInput: false };
	fpFrom = flatpickr('#dateFrom', {
		...fpOpts,
		onChange(sel) { if (sel[0]) { filterDateFrom = sel[0]; clearActivePreset(); render(); } }
	});
	fpTo = flatpickr('#dateTo', {
		...fpOpts,
		onChange(sel) { if (sel[0]) { filterDateTo = sel[0]; clearActivePreset(); render(); } }
	});
	setPreset('month'); // Changed from 'year' to 'month'
	loadExpenses();
}

function setPreset(preset) {
	activePreset = preset;
	const now = new Date();
	let from, to;
	switch (preset) {
		case 'week':
			from = new Date(now); from.setDate(now.getDate() - now.getDay() + 1);
			to = new Date(from); to.setDate(from.getDate() + 6);
			break;
		case 'month':
			from = new Date(now.getFullYear(), now.getMonth(), 1);
			to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
			break;
		case 'quarter':
			const q = Math.floor(now.getMonth() / 3);
			from = new Date(now.getFullYear(), q * 3, 1);
			to = new Date(now.getFullYear(), q * 3 + 3, 0);
			break;
		case 'year':
			from = new Date(now.getFullYear(), 0, 1);
			to = new Date(now.getFullYear(), 11, 31);
			break;
		case 'all':
			filterDateFrom = null; filterDateTo = null;
			if (fpFrom) fpFrom.clear();
			if (fpTo) fpTo.clear();
			updatePresetBtns();
			render();
			return;
	}
	filterDateFrom = from; filterDateTo = to;
	if (fpFrom) fpFrom.setDate(from, false);
	if (fpTo) fpTo.setDate(to, false);
	updatePresetBtns();
	render();
}

function clearActivePreset() { activePreset = ''; updatePresetBtns(); }

function updatePresetBtns() {
	document.querySelectorAll('.preset-btn').forEach(btn => {
		let p = '';
		try { p = JSON.parse(btn.getAttribute('data-qlpk-args') || '[]')[0] || ''; } catch { p = ''; }
		btn.classList.toggle('active', p === activePreset);
	});
}

function closeAllPresetDD() {
	document.querySelectorAll('.preset-dd-menu').forEach(m => m.classList.remove('show', 'cols-2'));
}

let selectedYear = new Date().getFullYear();
let selectedMonth = null;
let selectedQuarter = null;

function togglePresetDD(type, btnEl) {
	const menu = document.getElementById('dd-' + type);
	const wasOpen = menu.classList.contains('show');
	closeAllPresetDD();
	if (wasOpen) return;

	const now = new Date();
	const curYear = now.getFullYear();
	const curMonth = now.getMonth();
	let html = '';

	if (type === 'month') {
		for (let m = 0; m < 12; m++) {
			const isCur = (selectedMonth === m);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["month", ${m}, ${selectedYear}]'>T${m + 1}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.remove('cols-2');
	} else if (type === 'quarter') {
		for (let q = 0; q < 4; q++) {
			const isCur = (selectedQuarter === q);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["quarter", ${q}, ${selectedYear}]'>Q${q + 1}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	} else if (type === 'year') {
		for (let y = curYear; y >= curYear - 4; y--) {
			const isCur = (y === selectedYear);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["year", 0, ${y}]'>${y}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	} else if (type === 'week') {
		const labels = ['Tuần này', '1 tuần trước', '2 tuần trước', '3 tuần trước'];
		for (let w = 0; w < 4; w++) {
			const isCur = (w === 0);
			html += `<div class="preset-dd-item${isCur ? ' current' : ''}" data-qlpk-call="selectPresetItem" data-qlpk-args='["week", ${w}, ${curYear}]'>${labels[w]}</div>`;
		}
		menu.innerHTML = html;
		menu.classList.add('cols-2');
	}
	menu.classList.add('show');
}

function selectPresetItem(type, index, year) {
	let from, to;
	if (type === 'month') {
		selectedMonth = index;
		selectedQuarter = null;
		from = new Date(year, index, 1);
		to = new Date(year, index + 1, 0);
		activePreset = 'month';
	} else if (type === 'quarter') {
		selectedQuarter = index;
		selectedMonth = null;
		from = new Date(year, index * 3, 1);
		to = new Date(year, index * 3 + 3, 0);
		activePreset = 'quarter';
	} else if (type === 'year') {
		selectedYear = year;
		// Re-apply month/quarter with new year
		if (selectedMonth !== null) {
			selectPresetItem('month', selectedMonth, year);
			return;
		} else if (selectedQuarter !== null) {
			selectPresetItem('quarter', selectedQuarter, year);
			return;
		}
		from = new Date(year, 0, 1);
		to = new Date(year, 11, 31);
		activePreset = 'year';
	} else if (type === 'week') {
		selectedMonth = null;
		selectedQuarter = null;
		const now = new Date();
		const dayOfWeek = now.getDay() || 7;
		from = new Date(now);
		from.setDate(now.getDate() - dayOfWeek + 1 - (index * 7));
		to = new Date(from);
		to.setDate(from.getDate() + 6);
		activePreset = 'week';
	}
	filterDateFrom = from; filterDateTo = to;
	if (fpFrom) fpFrom.setDate(from, false);
	if (fpTo) fpTo.setDate(to, false);
	updatePresetBtns();
	closeAllPresetDD();
	render();
}

// Close dropdown when clicking outside
document.addEventListener('click', function(e) {
	if (!e.target.closest('.preset-dd')) closeAllPresetDD();
});

function parseDateStr(dateStr) {
	if (!dateStr) return null;
	const parts = dateStr.split('/');
	if (parts.length === 2) return new Date(new Date().getFullYear(), parseInt(parts[1]) - 1, parseInt(parts[0]));
	if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
	return null;
}

function isInDateRange(row) {
	if (!filterDateFrom && !filterDateTo) return true;
	const rowDate = parseDateStr(row.date);
	if (!rowDate) return false;
	if (filterDateFrom) { const s = new Date(filterDateFrom); s.setHours(0, 0, 0, 0); if (rowDate < s) return false; }
	if (filterDateTo) { const e = new Date(filterDateTo); e.setHours(23, 59, 59, 999); if (rowDate > e) return false; }
	return true;
}

// ==================== FILTER (chi tiết tab) ====================
let sortColId = 'date';
let sortOrder = 'desc';
let selectedFilterTypes = [];
const expandedGroups = new Set();

window.setSort = function(colId) {
	if (sortColId === colId) {
		sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
	} else {
		sortColId = colId;
		sortOrder = 'desc';
	}
	render();
};

window.toggleMultiSelect = function(e, menuId) {
	e.stopPropagation();
	document.querySelectorAll('.multi-sel-menu').forEach(m => {
		if (m.id !== menuId) m.classList.remove('show');
	});
	const menu = document.getElementById(menuId);
	if (menu) menu.classList.toggle('show');
};

document.addEventListener('click', function(e) {
	if (!e.target.closest('.faux-select-wrap')) {
		document.querySelectorAll('.multi-sel-menu').forEach(m => m.classList.remove('show'));
	}
});

window.handleTypeChange = function(checkbox) {
	if (checkbox.checked) {
		if (!selectedFilterTypes.includes(checkbox.value)) selectedFilterTypes.push(checkbox.value);
	} else {
		selectedFilterTypes = selectedFilterTypes.filter(v => v !== checkbox.value);
	}
	updateFilterTypeLabel();
	render();
};

function updateFilterTypeLabel() {
	const lbl = document.getElementById('filterTypeLabel');
	if (!lbl) return;
	if (selectedFilterTypes.length === 0) {
		lbl.textContent = 'Tất cả loại chi';
	} else if (selectedFilterTypes.length === 1) {
		lbl.textContent = selectedFilterTypes[0];
	} else {
		lbl.textContent = `Loại chi (${selectedFilterTypes.length})`;
	}
}
function getFilteredRows() {
	const search = normalizeSearchText(document.getElementById('filterSearch')?.value || '');
	const filterPayment = document.getElementById('filterPayment')?.value || '';

	return rows.map((row, idx) => ({ row, idx })).filter(({ row }) => {
		if (!isInDateRange(row)) return false;
		if (selectedFilterTypes.length > 0 && !selectedFilterTypes.includes(row.type)) return false;
		if (filterPayment && row.payment !== filterPayment) return false;
		if (search) {
			const haystack = normalizeSearchText(columns.map(c => String(row[c.id] || '')).join(' '));
			if (!haystack.includes(search)) return false;
		}
		return true;
	}).sort((a, b) => {
		// Step 1: Always group by month (newest month first)
		const mA = parseDateStr(a.row.date);
		const mB = parseDateStr(b.row.date);
		const monthKeyA = mA ? `${mA.getFullYear()}-${String(mA.getMonth() + 1).padStart(2,'0')}` : 'z';
		const monthKeyB = mB ? `${mB.getFullYear()}-${String(mB.getMonth() + 1).padStart(2,'0')}` : 'z';

		if (monthKeyA !== monthKeyB) {
			return monthKeyB.localeCompare(monthKeyA);
		}

		// Step 2: Within the same month, sort by chosen column
		const valA = a.row[sortColId] ?? '';
		const valB = b.row[sortColId] ?? '';
		let cmp = 0;
		if (sortColId === 'date') {
			const tA = mA?.getTime() || 0;
			const tB = mB?.getTime() || 0;
			cmp = tB - tA;
		} else {
			const numA = parseFloat(String(valA).replace(/,/g, ''));
			const numB = parseFloat(String(valB).replace(/,/g, ''));
			const isNumA = !isNaN(numA) && isFinite(numA);
			const isNumB = !isNaN(numB) && isFinite(numB);
			if (isNumA && isNumB) {
				cmp = numB - numA;
			} else {
				cmp = String(valB).localeCompare(String(valA));
			}
		}
		return sortOrder === 'asc' ? -cmp : cmp;
	});
}

function populateFilterOptions() {
	const menu = document.getElementById('filterTypeMenu');
	if (menu) {
		const types = [...new Set(rows.map(r => r.type).filter(Boolean))];
		let html = '';
		types.forEach(t => {
			const checked = selectedFilterTypes.includes(t) ? 'checked' : '';
			html += `<label class="multi-sel-item">
				<input type="checkbox" value="${t}" ${checked} data-qlpk-call="handleTypeChange" data-qlpk-args='["$this"]' data-qlpk-on="change">
				${t}
			</label>`;
		});
		if (types.length === 0) html = '<div class="multi-sel-item multi-sel-item--empty">Không có dữ liệu</div>';
		menu.innerHTML = html;
	}

	const paySel = document.getElementById('filterPayment');
	if (paySel) {
		const currentVal = paySel.value;
		const payments = [...new Set(rows.map(r => r.payment).filter(Boolean))];
		paySel.innerHTML = '<option value="">Tất cả hình thức</option>' +
			payments.map(p => `<option value="${p}" ${p === currentVal ? 'selected' : ''}>${p}</option>`).join('');
	}
}

// ==================== TABLE ====================
function renderGrid() {
	populateFilterOptions();
	const filtered = getFilteredRows();

	// Filter count
	const countEl = document.getElementById('filterCount');
	if (countEl) {
		if (filtered.length < rows.length) {
			countEl.textContent = `Hiển thị ${filtered.length}/${rows.length} khoản`;
		} else {
			countEl.textContent = `${rows.length} khoản`;
		}
	}

	let h = '<tr><th class="row-num">#</th>';
	for (const col of columns) {
		const widthAttr = col.width ? ` style="width:${col.width}px;"` : '';
		let sortIcon = '';
		if (sortColId === col.id) {
			const activeIcon = sortOrder === 'asc' ? 'bi-sort-up' : 'bi-sort-down';
			sortIcon = ` <i class="bi ${activeIcon} ms-1 ct-sort-icon-active"></i>`;
		} else {
			sortIcon = ` <i class="bi bi-chevron-bar-expand ms-1 ct-sort-icon-muted"></i>`;
		}
		h += `<th class="ct-sortable-th"${widthAttr} data-qlpk-call="setSort" data-qlpk-args='["${col.id}"]' title="Sắp xếp theo ${col.name}">
			<div class="ct-th-content">${col.name}${sortIcon}</div>
		</th>`;
	}
	h += '<th class="ct-action-th"></th></tr>';
	document.getElementById('chiHead').innerHTML = h;

	let b = '';
	let currentMonthGroup = null;
	const totalCols = columns.length + 2;
	let currentGroupId = '';

	// Global toggle function
	window.toggleMonthGroup = function(groupId, el) {
		const isCollapsed = !expandedGroups.has(groupId);
		const icon = el.querySelector('.toggle-icon');
		const rows = document.querySelectorAll('.' + groupId);
		
		if (isCollapsed) {
			expandedGroups.add(groupId);
			rows.forEach(r => setCtVisible(r, true));
			if (icon) icon.classList.remove('ct-toggle-icon-collapsed');
			el.dataset.collapsed = 'false';
		} else {
			expandedGroups.delete(groupId);
			rows.forEach(r => setCtVisible(r, false));
			if (icon) icon.classList.add('ct-toggle-icon-collapsed');
			el.dataset.collapsed = 'true';
		}
	};

	// Pre-calculate stats per group
	const groupStats = {};
	filtered.forEach(({ row }) => {
		const rowDateStr = row.date || '';
		let safeId = 'grp-unknown';
		const parsed = parseDateStr(rowDateStr);
		if (parsed) {
			const m = String(parsed.getMonth() + 1).padStart(2, '0');
			const y = parsed.getFullYear();
			safeId = `grp-${m}-${y}`;
		} else if (rowDateStr) {
			safeId = 'grp-' + rowDateStr.replace(/[^a-zA-Z0-9]/g, '');
		}
		
		if (!groupStats[safeId]) groupStats[safeId] = { count: 0, sum: 0 };
		const c = computeRow(row);
		const amount = parseFloat(c.amount) || 0;
		if (amount > 0) groupStats[safeId].count++;
		groupStats[safeId].sum += amount;
	});

	filtered.forEach(({ row, idx: ri }, vi) => {
		const rowDateStr = row.date || '';
		let monthGroup = 'Chưa xác định';
		let safeId = 'grp-unknown';
		const parsed = parseDateStr(rowDateStr);
		if (parsed) {
			const m = String(parsed.getMonth() + 1).padStart(2, '0');
			const y = parsed.getFullYear();
			monthGroup = `Tháng ${m}/${y}`;
			safeId = `grp-${m}-${y}`;
		} else if (rowDateStr) {
			monthGroup = rowDateStr;
			safeId = 'grp-' + rowDateStr.replace(/[^a-zA-Z0-9]/g, '');
		}

		if (monthGroup !== currentMonthGroup) {
			currentMonthGroup = monthGroup;
			currentGroupId = safeId;
			const stats = groupStats[safeId] || { count: 0, sum: 0 };
			const isExpanded = expandedGroups.has(safeId);
			const collapseState = isExpanded ? 'false' : 'true';
			const iconCollapsedClass = isExpanded ? '' : 'ct-toggle-icon-collapsed';
			
			b += `<tr class="month-group-row" data-collapsed="${collapseState}" data-qlpk-call="toggleMonthGroup" data-qlpk-args='["${currentGroupId}", "$this"]'>`;
			b += `<td class="row-num ct-month-toggle-cell"><i class="bi bi-chevron-down text-primary toggle-icon ${iconCollapsedClass}"></i></td>`;
			
			for (const col of columns) {
				if (col.id === 'date') {
					b += `<td class="ct-month-label-cell"><i class="bi bi-calendar3 text-primary me-2"></i>${monthGroup}</td>`;
				} else if (col.id === 'desc') {
					b += `<td class="ct-month-stat-cell">${stats.count > 0 ? stats.count + ' khoản' : ''}</td>`;
				} else if (col.id === 'amount') {
					b += `<td class="ct-month-stat-cell ct-month-amount-cell">${fmtNum(stats.sum)}</td>`;
				} else {
					b += `<td></td>`;
				}
			}
			b += `<td></td></tr>`;
		}

		const c = computeRow(row);
		const isLarge = (parseFloat(c.amount) || 0) >= 2000;
		const isHidden = !expandedGroups.has(currentGroupId);
		b += `<tr class="${currentGroupId} ${isLarge ? 'highlight' : ''} ${isHidden ? 'ct-hidden' : ''}"><td class="row-num">${vi + 1}</td>`;
		for (const col of columns) {
			const val = c[col.id] ?? '';
			if (col.type === 'formula') {
				b += `<td><input class="cell-input readonly num" value="${fmtNum(val)}" readonly tabindex="-1"></td>`;
			} else if (col.type === 'autocomplete') {
				const isType = col.id === 'type';
				const cat = isType ? getCat(val) : null;
				const typeStyle = isType ? `style="--ct-type-bg:${cat.bg};--ct-type-color:${cat.color};"` : '';
				b += `<td class="${isType ? 'ct-type-cell' : ''}" ${typeStyle}><div class="ac-wrap">
					<input class="cell-input ${isType ? 'ct-type-input' : ''}" value="${val}" data-ri="${ri}" data-col="${col.id}"
						data-qlpk-on-focusin="openAcList" data-qlpk-on-focusin-args='[${ri}, "${col.id}", "$this"]'
						data-qlpk-on-input="openAcList" data-qlpk-on-input-args='[${ri}, "${col.id}", "$this"]'
						data-qlpk-on-focusout="scheduleCloseAc"
						data-qlpk-on-change="updateCell" data-qlpk-on-change-args='[${ri}, "${col.id}", "$value"]'>
					<div class="ac-list"></div>
				</div></td>`;
			} else if (col.type === 'number') {
				const raw = val || '';
				const display = raw !== '' ? fmtNum(parseFloat(raw)) : '';
				b += `<td><input class="cell-input num" value="${display}" data-raw="${raw}"
					data-qlpk-on-focusin="showRawNumberCell" data-qlpk-on-focusin-args='["$this"]'
					data-qlpk-on-focusout="formatNumberCell" data-qlpk-on-focusout-args='["$this"]'
					data-qlpk-on-change="updateCell" data-qlpk-on-change-args='[${ri}, "${col.id}", "$value"]' placeholder=""></td>`;
			} else {
				b += `<td><input class="cell-input" value="${val}" data-qlpk-call="updateCell" data-qlpk-args='[${ri}, "${col.id}", "$value"]' data-qlpk-on="change" placeholder=""></td>`;
			}
		}
		b += `<td class="row-actions"><button data-qlpk-button="danger" data-qlpk-button-variant="soft" data-qlpk-call="deleteRow" data-qlpk-args='[${ri}]' title="Xóa"><i class="bi bi-trash"></i></button></td></tr>`;
	});
	document.getElementById('chiBody').innerHTML = b;

	// Totals - render right after header row in thead
	const filteredRows = filtered.map(f => f.row);
	const sumFiltered = (colId) => filteredRows.reduce((s, r) => s + (parseFloat(computeRow(r)[colId]) || 0), 0);

	let f = '<tr class="total-row"><td class="row-num">Σ</td>';
	for (const col of columns) {
		if (col.type === 'number' || col.type === 'formula') {
			f += `<td><input class="cell-input readonly num" value="${fmtNum(sumFiltered(col.id))}" readonly tabindex="-1"></td>`;
		} else if (col.id === 'desc') {
			const validCount = filteredRows.filter(r => parseFloat(r.amount) > 0).length;
			f += `<td><input class="cell-input readonly" value="${validCount > 0 ? validCount + ' khoản' : ''}" readonly tabindex="-1"></td>`;
		} else { f += '<td></td>'; }
	}
	f += '<td></td></tr>';
	document.getElementById('chiHead').innerHTML = h + f;
}

// ==================== EXPORT EXCEL ====================
function exportExcel() {
	const from = document.getElementById('dateFrom')?.value || '';
	const to = document.getElementById('dateTo')?.value || '';
	const params = new URLSearchParams();
	if (from) params.set('from', from);
	if (to) params.set('to', to);
	const url = '/api/expenses/export' + (params.toString() ? '?' + params : '');
	fetch(url)
		.then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
		.then(blob => {
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `chi-tieu-${new Date().toISOString().slice(0, 10)}.xlsx`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		}).catch(e => console.error('Export error:', e));
}

function downloadTemplate() {
	fetch('/api/expenses/template')
		.then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
		.then(blob => {
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = 'mau-import-chi-tieu.xlsx';
			a.click();
			URL.revokeObjectURL(blobUrl);
		}).catch(e => console.error('Template download error:', e));
}

function importCSV(input) {
	const file = input.files[0];
	if (!file) return;
	const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

	if (isExcel) {
		const reader = new FileReader();
		reader.onload = function (e) {
			const wb = XLSX.read(e.target.result, { type: 'array' });
			const ws = wb.Sheets[wb.SheetNames[0]];
			const raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
			if (raw.length < 2) { CustomModal.alert('File không có dữ liệu'); return; }
			processImportRows(raw, file.name);
		};
		reader.readAsArrayBuffer(file);
	} else {
		const reader = new FileReader();
		reader.onload = function (e) {
			const text = e.target.result;
			const lines = text.split(/\r?\n/).filter(l => l.trim());
			if (lines.length < 2) { CustomModal.alert('File không có dữ liệu'); return; }
			const raw = lines.map(l => parseCSVLine(l));
			processImportRows(raw, file.name);
		};
		reader.readAsText(file, 'UTF-8');
	}
	input.value = '';
}

function cleanDate(val) {
	if (!val) return '';
	let s = String(val).trim();
	// Excel serial date number
	if (/^\d{5}$/.test(s)) {
		const d = new Date((parseInt(s) - 25569) * 86400000);
		return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
	}
	// Normalize separators: dots, dashes → slashes
	s = s.replace(/[.\-]/g, '/');
	const parts = s.split('/');
	if (parts.length >= 2) {
		const day = parts[0].padStart(2, '0');
		const month = parts[1].padStart(2, '0');
		const year = parts.length === 3 ? parts[2] : new Date().getFullYear();
		return `${day}/${month}/${year}`;
	}
	return s;
}

function cleanAmount(val) {
	if (val === null || val === undefined) return 0;
	if (typeof val === 'number') return val;
	// Remove everything except digits, dots, commas, minus
	const s = String(val).replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
	return parseFloat(s) || 0;
}

function processImportRows(raw, fileName) {
	const headers = raw[0].map(h => String(h || '').trim());
	const colMap = {};
	headers.forEach((h, i) => {
		const col = columns.find(c => normalizeSearchText(c.name) === normalizeSearchText(h));
		if (col) colMap[i] = col.id;
	});

	const items = [];
	for (let i = 1; i < raw.length; i++) {
		const vals = raw[i];
		if (!vals || vals.every(v => !v)) continue; // skip empty rows
		const row = {};
		columns.forEach(c => row[c.id] = '');
		vals.forEach((v, idx) => {
			if (colMap[idx]) {
				const colDef = columns.find(c => c.id === colMap[idx]);
				if (colDef && colDef.type === 'date') {
					row[colMap[idx]] = cleanDate(v);
				} else if (colDef && colDef.type === 'number') {
					row[colMap[idx]] = cleanAmount(v);
				} else {
					row[colMap[idx]] = String(v || '').trim();
				}
			}
		});
		items.push(row);
	}

	if (!items.length) { CustomModal.alert('File không có dữ liệu hợp lệ'); return; }

	apiRequest('/api/expenses/bulk', 'POST', { items }).then(res => {
		rows = res.items.concat(rows);
		render();
		CustomModal.alert(`Đã import <b>${res.items.length}</b> khoản chi từ file <b>${fileName}</b>`);
	}).catch(e => {
		console.error('Import error:', e);
		CustomModal.alert('Lỗi import dữ liệu');
	});
}

function parseCSVLine(line) {
	const result = [];
	let current = '', inQuote = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuote) {
			if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
			else if (ch === '"') inQuote = false;
			else current += ch;
		} else {
			if (ch === '"') inQuote = true;
			else if (ch === ',') { result.push(current); current = ''; }
			else current += ch;
		}
	}
	result.push(current);
	return result;
}

// ===== CELL & ROW =====
// Debounce map cho updateCell
const updateTimers = {};
function updateCell(ri, colId, value) {
	const col = columns.find(c => c.id === colId);
	if (col && col.type === 'number') value = parseFloat(value) || 0;
	rows[ri][colId] = value;
	// Update totals row without full re-render
	updateTotals();
	// Debounce API call 500ms
	const row = rows[ri];
	if (row.id) {
		const key = row.id + '_' + colId;
		clearTimeout(updateTimers[key]);
		updateTimers[key] = setTimeout(() => {
			apiRequest('/api/expenses/' + row.id, 'PUT', { [colId]: value }).catch(e => console.error('Update error:', e));
		}, 500);
	}
}
function updateTotals() {
	const thead = document.getElementById('chiHead');
	if (!thead) return;
	const totalRow = thead.querySelector('.total-row');
	if (!totalRow) return;
	const filtered = getFilteredRows();
	const filteredRows = filtered.map(f => f.row);
	const cells = totalRow.querySelectorAll('td');
	let cellIdx = 1; // skip # column
	for (const col of columns) {
		if (col.type === 'number' || col.type === 'formula') {
			const sum = filteredRows.reduce((s, r) => s + (parseFloat(computeRow(r)[col.id]) || 0), 0);
			const input = cells[cellIdx]?.querySelector('input');
			if (input) input.value = fmtNum(sum);
		} else if (col.id === 'desc') {
			const validCount = filteredRows.filter(r => parseFloat(r.amount) > 0).length;
			const input = cells[cellIdx]?.querySelector('input');
			if (input) input.value = validCount > 0 ? validCount + ' khoản' : '';
		}
		cellIdx++;
	}
}
async function addRow() {
	const today = new Date();
	const dateStr = String(today.getDate()).padStart(2, '0') + '/' + String(today.getMonth() + 1).padStart(2, '0') + '/' + today.getFullYear();
	try {
		const newRow = await apiRequest('/api/expenses', 'POST', { date: dateStr });
		rows.unshift(newRow);
		render();
		setTimeout(() => { const tb = document.getElementById('chiBody'); const fr = tb.firstElementChild; if (fr) { const inp = fr.querySelector('.cell-input'); if (inp) inp.focus(); } }, 50);
	} catch (e) {
		console.error('Add row error:', e);
		CustomModal.alert('Lỗi thêm khoản chi');
	}
}
function deleteRow(ri) {
	CustomModal.confirm('Xóa khoản chi này?', 'Xác nhận xóa', 'warning', 'danger').then(async confirmed => {
		if (!confirmed) return;
		const row = rows[ri];
		try {
			if (row.id) await apiRequest('/api/expenses/' + row.id, 'DELETE');
			rows.splice(ri, 1);
			render();
		} catch (e) {
			console.error('Delete error:', e);
			CustomModal.alert('Lỗi xóa khoản chi');
		}
	});
}

// ===== CONFIG =====
let editingColId = null;
function toggleConfig() {
	const o = document.getElementById('configOverlay');
	const isHidden = o ? window.getComputedStyle(o).display === 'none' : true;
	setCtVisible(o, isHidden);
	hideAddCol(); renderColList();
}
function renderColList() {
	const typeLabels = { number: 'Số', text: 'Văn bản', date: 'Ngày', time: 'Giờ', select: 'Dropdown', formula: 'Công thức', autocomplete: 'Tự động' };
	document.getElementById('colList').innerHTML = columns.map(col => {
		const fTag = col.type === 'formula' ? `<span class="ct-formula-summary">= ${col.formula}</span>` : '';
		return `<li class="col-list-item"><i class="bi bi-grip-vertical ct-grip-icon"></i><span class="col-name">${col.name}${fTag}</span><span class="col-type">${typeLabels[col.type]}</span><div class="col-actions"><button data-qlpk-button="edit" data-qlpk-button-variant="soft" data-qlpk-call="editCol" data-qlpk-args='["${col.id}"]'><i class="bi bi-pencil"></i></button><button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="del-btn" data-qlpk-call="deleteCol" data-qlpk-args='["${col.id}"]'><i class="bi bi-trash"></i></button></div></li>`;
	}).join('');
}
function showAddCol() {
	editingColId = null;
	setCtVisible('colFormSection', true);
	setCtVisible('configOverlay', true);
	document.getElementById('colFormTitle').textContent = 'Thêm cột mới';
	document.getElementById('colName').value = '';
	document.getElementById('colType').value = 'number';
	document.getElementById('colFormula').value = '';
	onTypeChange(); renderFormulaPicker();
}
function hideAddCol() { setCtVisible('colFormSection', false); editingColId = null; }
function editCol(colId) {
	const col = columns.find(c => c.id === colId);
	if (!col) return;
	editingColId = colId;
	setCtVisible('colFormSection', true);
	setCtVisible('configOverlay', true);
	document.getElementById('colFormTitle').textContent = `Sửa cột: ${col.name}`;
	document.getElementById('colName').value = col.name;
	document.getElementById('colType').value = col.type;
	if (col.formula) document.getElementById('colFormula').value = col.formula;
	if (col.options) document.getElementById('colOptions').value = col.options.join('\n');
	onTypeChange(); renderFormulaPicker();
}
function onTypeChange() {
	const t = document.getElementById('colType').value;
	setCtVisible('formulaGroup', t === 'formula');
	setCtVisible('optionsGroup', t === 'select' || t === 'autocomplete');
}
function scheduleCloseAc() {
	acBlurTimer = setTimeout(closeAllAc, 200);
}

function showRawNumberCell(input) {
	input.value = input.dataset.raw || '';
}

function formatNumberCell(input) {
	if (input.value !== '') {
		input.dataset.raw = input.value;
		input.value = fmtNum(parseFloat(input.value) || 0);
	} else {
		input.dataset.raw = '';
	}
}

function attrJson(values) {
	return JSON.stringify(values).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function appendFormulaToken(token) {
	const field = document.getElementById('colFormula');
	if (field) field.value += token;
}

window.triggerImportFile = function () {
	const input = document.getElementById('importFile');
	if (input) input.click();
};

function renderFormulaPicker() {
	const nc = columns.filter(c => c.type === 'number' || c.type === 'formula');
	document.getElementById('formulaPicker').innerHTML = nc.map(c => `<span class="formula-tag" data-qlpk-call="appendFormulaToken" data-qlpk-args="${attrJson(['[' + c.name + ']'])}">${c.name}</span>`).join('') +
		['+', '-', '*'].map((op, index) => `<span class="formula-op" data-qlpk-call="appendFormulaToken" data-qlpk-args="${attrJson([' ' + op + ' '])}">${['+', '−', '×'][index]}</span>`).join('');
}
function saveCol() {
	const name = document.getElementById('colName').value.trim();
	if (!name) { CustomModal.alert('Vui lòng nhập tên cột', 'Thiếu thông tin', 'warning'); return; }
	const type = document.getElementById('colType').value;
	const formula = type === 'formula' ? document.getElementById('colFormula').value : undefined;
	const options = type === 'select' ? document.getElementById('colOptions').value.split('\n').map(s => s.trim()).filter(Boolean) : undefined;
	if (editingColId) {
		const col = columns.find(c => c.id === editingColId);
		if (col) { col.name = name; col.type = type; col.formula = formula; col.options = options; }
	} else {
		const id = 'col_' + Date.now();
		columns.push({ id, name, type, formula, options, width: 90 });
		rows.forEach(r => { r[id] = type === 'number' ? 0 : ''; });
	}
	hideAddCol(); render(); renderColList();
	saveColumnsToServer();
}
function deleteCol(colId) {
	CustomModal.confirm('Xóa cột này?', 'Xác nhận xóa cột', 'warning', 'danger').then(confirmed => {
		if (!confirmed) return;
		const idx = columns.findIndex(c => c.id === colId);
		if (idx > -1) columns.splice(idx, 1);
		rows.forEach(r => delete r[colId]);
		render(); renderColList();
		saveColumnsToServer();
	});
}

function registerFinanceRealtime() {
	if (window.QLPKRealtimeClient && typeof window.QLPKRealtimeClient.start === 'function') {
		window.QLPKRealtimeClient.start();
	}
	if (!window.QLPKRealtimePageHooks) return;

	let pendingReload = false;
	function reloadWhenIdle() {
		const active = document.activeElement;
		if (active && active.classList && active.classList.contains('cell-input')) {
			if (pendingReload) return;
			pendingReload = true;
			active.addEventListener('blur', function () {
				pendingReload = false;
				loadExpenses();
			}, { once: true });
			return;
		}

		loadExpenses();
	}

	window.QLPKRealtimePageHooks.register({
		types: ['finance.changed'],
		debounceMs: 500,
		handler: reloadWhenIdle,
	});
}

initGlobalDateFilter();
registerFinanceRealtime();
switchTab(activeTab);
