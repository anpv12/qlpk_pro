import { state } from './state.js';
import { el, replace } from '../shared/dom.js';
import { apiRequest, loadExpenses, mountCtChart, render, setCtVisible } from '../chi-tieu.js';
import { clearActivePreset, setPreset } from './grid-and-filters.js';
import { QLPKHtml } from '../shared/html-escape.js';
import { QLPKInlineActions } from '../shared/inline-actions.js';

function renderThuChiChart(labels, thuValues, chiValues) {
	const dom = document.getElementById('thuChiChart');
	if (!dom) return;

	if (state._thuChiChartInstance) { state._thuChiChartInstance.dispose(); state._thuChiChartInstance = null; }

	const chart = mountCtChart(dom);
	state._thuChiChartInstance = chart;

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
				return `<strong>${QLPKHtml.escape(params[0].name)}</strong><br/>` +
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

}

// Last chart data, kept for export

async function exportThuChiExcel() {
	try {
		const range = getRevDateRange();
		if (!range) { window.QLPKUserFeedback?.show('warning', 'Chưa có dữ liệu để xuất'); return; }
		const url = `/api/dashboard/export-thu-chi?from_date=${range.fromISO}&to_date=${range.toISO}`;
		const response = await fetch(url);
		if (!response.ok) { window.QLPKUserFeedback?.show('error', 'Lỗi xuất Excel'); return; }
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
async function exportChiTieuExcel() {
	try {
		const fromEl = document.getElementById('dateFrom');
		const toEl = document.getElementById('dateTo');
		if (!fromEl || !toEl || !fromEl.value || !toEl.value) { window.QLPKUserFeedback?.show('warning', 'Chưa có dữ liệu'); return; }
		const url = `/api/expenses/export?from=${encodeURIComponent(fromEl.value)}&to=${encodeURIComponent(toEl.value)}`;
		const response = await fetch(url);
		if (!response.ok) { window.QLPKUserFeedback?.show('error', 'Lỗi xuất Excel'); return; }
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

	const chart = mountCtChart(dom);
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
				return `<strong>${QLPKHtml.escape(params[0].name)}</strong><br/>` +
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
	const fromISO = parseFp(fromEl.value);
	let toISO = parseFp(toEl.value);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayISO = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
	if (toISO > todayISO) toISO = todayISO;
	return { fromISO, toISO };
}

function setRevView(view) {
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

	const chart = mountCtChart(dom);
	_serviceChartInstance = chart;

	chart.setOption({
		backgroundColor: 'transparent',
		tooltip: {
			trigger: 'item', confine: true,
			formatter: (p) => {
				const d = p.data;
				return `<b>${QLPKHtml.escape(p.name)}</b><br/>${p.marker} Doanh thu: <b>${formatCurrency(p.value)}</b><br/>\u{1F4CA} T\u1ef7 l\u1ec7: <b>${p.percent}%</b><br/>\u{1F4E6} S\u1ed1 l\u01b0\u1ee3ng: <b>${d._count || 0} ${QLPKHtml.escape(d._unit)}</b>`;
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
			replace(tbody, data.items.map((item, index) => {
				totalQty += item.quantity;
				const cell = 'ct-revenue-cell-text';
				return el('tr', {},
					el('td', { class: 'ps-3 py-2 border-bottom' }, el('div', { class: 'd-flex align-items-center' },
						el('span', { class: `ct-revenue-dot ct-revenue-dot-${index % COLORS.length}` }), el('span', { class: `fw-medium text-dark ${cell}` }, item.name))),
					el('td', { class: `py-2 text-center border-bottom text-secondary ${cell}` }, type === 'medicine' ? `${item.quantity} ${item.unit || ''}` : item.quantity),
					el('td', { class: `pe-3 py-2 text-end border-bottom fw-medium text-dark ${cell}` }, formatCurrency(item.total_amount)));
			}));

			document.getElementById('revenueDetailTotalQty').textContent = totalQty;
			document.getElementById('revenueDetailTotalAmount').textContent = formatCurrency(data.total_sum);

			// Donut chart in modal
			const chartDom = document.getElementById('revenueDetailChart');
			if (chartDom) {
				const oldChart = echarts.getInstanceByDom(chartDom);
				if (oldChart) oldChart.dispose();
				const donut = echarts.init(chartDom);
				donut.setOption({
					tooltip: { trigger: 'item', formatter: (p) => `${p.marker} ${QLPKHtml.escape(p.name)}<br/><b>${formatCurrency(p.value)}</b> (${p.percent}%)` },
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
async function exportRevenueExcel() {
	try {
		const range = getRevDateRange();
		if (!range) return;
		const url = `/api/dashboard/export-excel?from_date=${range.fromISO}&to_date=${range.toISO}`;
		const response = await fetch(url);
		if (!response.ok) { window.QLPKUserFeedback?.show('error', 'L\u1ed7i xu\u1ea5t Excel'); return; }
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
state.filterDateFrom = null; state.filterDateTo = null;
state.activePreset = 'month';

function initGlobalDateFilter() {
	const fpOpts = { locale: 'vn', dateFormat: 'd/m/Y', allowInput: false };
	fpFrom = flatpickr('#dateFrom', {
		...fpOpts,
		onChange(sel) { if (sel[0]) { state.filterDateFrom = sel[0]; clearActivePreset(); render(); } }
	});
	fpTo = flatpickr('#dateTo', {
		...fpOpts,
		onChange(sel) { if (sel[0]) { state.filterDateTo = sel[0]; clearActivePreset(); render(); } }
	});
	setPreset('month'); // Changed from 'year' to 'month'
	loadExpenses();
}

QLPKInlineActions.register({ exportChiTieuExcel, exportRevenueExcel, exportThuChiExcel, setRevView });

export { fpFrom, fpTo, getRevDateRange, initGlobalDateFilter, loadAndRenderRevenue, renderThuChiChart };
