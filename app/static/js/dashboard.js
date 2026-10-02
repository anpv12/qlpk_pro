// Admin dashboard: today's appointments, exam visits per day, top ICD treemap, referral sources,
// staff presence, detail modals and Excel exports. Non-admin users see the welcome view only.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import { byId, delegate, el, icon, replace } from './shared/dom.js';
import { bindExamStatsChartInteractions, buildExamStatsChartOption, buildICDChartOption } from './dashboard/charts.js';
import { emptyState, examDetailRows, icdDetailRows, referralDetailRows, renderAppointments, renderReferralSources, renderStaffOnline } from './dashboard/panels.js';

const state = { charts: {} };
const fmtISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const setVisible = (id, visible) => byId(id)?.classList.toggle('dashboard-hidden', !visible);

async function getJson(url) {
	const response = await fetch(url);
	return response.ok ? response.json() : null;
}

function resetChart(name) {
	state.charts[name]?.dispose();
	state.charts[name] = null;
}

function mountChart(name, dom, option) {
	const chart = window.echarts.init(dom);
	state.charts[name] = chart;
	chart.setOption(option);
	window.addEventListener('resize', () => chart.resize());
	return chart;
}

async function loadAppointments() {
	try {
		const today = fmtISO(new Date());
		const data = await getJson(`/api/?per_page=1000&date_from=${today}&date_to=${today}`);
		const container = byId('appointmentList');
		if (data && container) renderAppointments(container, data.appointments || []);
	} catch (error) {
		console.error('Error loading appointments:', error);
	}
}

const examToDate = () => (state.revToDate > fmtISO(new Date()) ? fmtISO(new Date()) : state.revToDate);

async function loadExamStats() {
	try {
		const data = await getJson(`/api/dashboard/exam-stats-by-day?from_date=${state.revFromDate}&to_date=${examToDate()}`);
		if (data) renderExamStatsChart(data.items || []);
	} catch (error) {
		console.error('Error loading exam stats:', error);
	}
}

function renderExamStatsChart(items) {
	const dom = byId('examStatsChart');
	if (!dom) return;
	resetChart('exam');
	const doctorCounts = items.map(item => item.doctor_count || 0);
	const psychCounts = items.map(item => item.psychologist_count || 0);
	const totalDoctor = doctorCounts.reduce((sum, value) => sum + value, 0);
	const totalPsych = psychCounts.reduce((sum, value) => sum + value, 0);
	const chart = mountChart('exam', dom, buildExamStatsChartOption({ labels: items.map(item => item.label), doctorCounts, psychCounts, total: totalDoctor + totalPsych }));
	bindExamStatsChartInteractions(chart, { items, totalDoctor, totalPsych, onDayClick: item => showExamDetail(item.date, item.label, item.count) });
}

// Opens a detail modal, shows its loading state, then fills its table from `url`.
async function showDetail({ prefix, title, url, rows, logName }) {
	const modalEl = byId(`${prefix}DetailModal`);
	if (!modalEl) return;
	byId(`${prefix}DetailTitle`).textContent = title;
	setVisible(`${prefix}DetailLoading`, true);
	setVisible(`${prefix}DetailContent`, false);
	setVisible(`${prefix}DetailEmpty`, false);
	new window.bootstrap.Modal(modalEl).show();
	try {
		const data = await getJson(url);
		if (!data) throw new Error('API error');
		const items = data.items || [];
		setVisible(`${prefix}DetailLoading`, false);
		if (!items.length) {
			setVisible(`${prefix}DetailEmpty`, true);
			return;
		}
		replace(byId(`${prefix}DetailTableBody`), rows(items));
		setVisible(`${prefix}DetailContent`, true);
	} catch (error) {
		console.error(`${logName} detail error:`, error);
		setVisible(`${prefix}DetailLoading`, false);
		setVisible(`${prefix}DetailEmpty`, true);
	}
}

const showExamDetail = (date, label, count) => showDetail({ prefix: 'exam', title: `Ca khám ngày ${label} — ${count} ca`,
	url: `/api/dashboard/exam-detail-by-day?date=${date}`, rows: examDetailRows, logName: 'Exam' });

async function loadTopICD() {
	try {
		const data = await getJson(`/api/dashboard/top-icd?from_date=${state.icdFromDate}&to_date=${state.icdToDate}`);
		if (!data) return;
		const items = data.items || [];
		const dom = byId('icdChart');
		if (!dom) return;
		resetChart('icd');
		if (!items.length) {
			replace(dom, emptyState('bi-clipboard2-pulse', 'Chưa có dữ liệu ICD'));
			return;
		}
		const chart = mountChart('icd', dom, buildICDChartOption(items));
		chart.on('click', params => {
			if (params.data && params.data.name) showDetail({ prefix: 'icd', title: `${params.data.name} — ${params.data._disease || ''} (${params.data.value} ca)`,
				url: `/api/dashboard/icd-detail?icd_code=${encodeURIComponent(params.data.name)}&from_date=${state.icdFromDate}&to_date=${state.icdToDate}`, rows: icdDetailRows, logName: 'ICD' });
		});
	} catch (error) {
		console.error('Error loading top ICD:', error);
	}
}

async function loadReferralSources() {
	try {
		const data = await getJson(`/api/dashboard/referral-sources?from_date=${state.referralSourceFromDate}&to_date=${state.referralSourceToDate}`);
		const dom = byId('referralSourceChart');
		if (data && dom) renderReferralSources(dom, data.items || []);
	} catch (error) {
		console.error('Error loading referral source stats:', error);
	}
}

async function loadStaffOnline() {
	try {
		const data = await getJson('/api/dashboard/staff-online');
		const container = byId('staffOnlineList');
		if (data && container) renderStaffOnline(container, byId('onlineCount'), data);
	} catch (error) {
		console.error('Error loading staff online:', error);
	}
}

const EXPORTS = {
	icd: { button: 'btnExportICD', fallback: 'icd.xlsx', failed: 'Không thể xuất danh sách ICD. Vui lòng thử lại.', log: 'Export ICD error:',
		url: () => `/api/dashboard/export-icd-excel?from_date=${state.icdFromDate}&to_date=${state.icdToDate}` },
	referral: { button: 'btnExportReferralSource', fallback: 'nguon_gioi_thieu.xlsx', failed: 'Không thể xuất nguồn giới thiệu. Vui lòng thử lại.', log: 'Export referral source error:',
		url: () => `/api/dashboard/export-referral-source-excel?from_date=${state.referralSourceFromDate}&to_date=${state.referralSourceToDate}` },
};

async function exportExcel(kind) {
	const config = EXPORTS[kind];
	const button = byId(config.button);
	if (button) {
		button.disabled = true;
		replace(button, icon('bi-hourglass-split'), ' Đang xuất...');
	}
	try {
		const response = await fetch(config.url());
		if (!response.ok) {
			window.QLPKUserFeedback?.show('error', config.failed);
			return;
		}
		const link = el('a', { href: URL.createObjectURL(await response.blob()) });
		const match = (response.headers.get('Content-Disposition') || '').match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		link.download = match ? match[1].replace(/['"]/g, '') : config.fallback;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(link.href);
	} catch (error) {
		console.error(config.log, error);
		window.QLPKUserFeedback?.show('error', config.failed);
	} finally {
		if (button) {
			button.disabled = false;
			replace(button, icon('bi-file-earmark-excel'), ' Excel');
		}
	}
}

function bindPicker(id, initial, key, reload) {
	const input = byId(id);
	if (!input || !window.flatpickr) return;
	window.flatpickr(input, { dateFormat: 'd/m/Y', defaultDate: initial, disableMobile: true, onChange: dates => {
		if (!dates[0]) return;
		state[key] = fmtISO(dates[0]);
		reload();
	} });
}

function setupRanges() {
	const today = new Date();
	const weekAgo = new Date(today);
	weekAgo.setDate(today.getDate() - 6);
	const yearStart = new Date(today.getFullYear(), 0, 1);
	Object.assign(state, { revFromDate: fmtISO(weekAgo), revToDate: fmtISO(today), icdFromDate: fmtISO(weekAgo), icdToDate: fmtISO(today),
		referralSourceFromDate: fmtISO(yearStart), referralSourceToDate: fmtISO(today) });
	bindPicker('revFromDate', weekAgo, 'revFromDate', loadExamStats);
	bindPicker('revToDate', today, 'revToDate', loadExamStats);
	bindPicker('icdFromDate', weekAgo, 'icdFromDate', loadTopICD);
	bindPicker('icdToDate', today, 'icdToDate', loadTopICD);
	bindPicker('referralSourceFromDate', yearStart, 'referralSourceFromDate', loadReferralSources);
	bindPicker('referralSourceToDate', today, 'referralSourceToDate', loadReferralSources);
}

function bind() {
	delegate(document, 'click', '[data-dashboard-export]', (event, button) => exportExcel(button.dataset.dashboardExport));
	delegate(byId('referralSourceChart') || document, 'click', '.referral-source-tag', (event, tag) => showDetail({ prefix: 'referralSource',
		title: `${tag.dataset.sourceLabel} — ${Number(tag.dataset.sourceCount || 0) || 0} lượt khám`,
		url: `/api/dashboard/referral-source-detail?source=${encodeURIComponent(tag.dataset.sourceKey)}&from_date=${state.referralSourceFromDate}&to_date=${state.referralSourceToDate}`,
		rows: referralDetailRows, logName: 'Referral source' }));
	window.QLPKRealtimePageHooks?.register({
		types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'catalog.changed', 'presence.changed'],
		debounceMs: 500,
		handler(event) {
			if (event.type === 'presence.changed') loadStaffOnline();
			else Promise.all([loadAppointments(), loadExamStats(), loadTopICD(), loadReferralSources()]);
		},
	});
}

async function init() {
	const user = await window.QLPKApiTransport.currentUser();
	if ((user.role ? String(user.role).toLowerCase() : null) !== 'admin') {
		setVisible('user-welcome-view', true);
		setVisible('admin-dashboard-view', false);
		return;
	}
	setVisible('admin-dashboard-view', true);
	setVisible('user-welcome-view', false);
	setupRanges();
	await Promise.all([loadAppointments(), loadExamStats(), loadTopICD(), loadReferralSources(), loadStaffOnline()]);
	bind();
}

if (!window.QLPKApiTransport.hasSession()) window.location.href = '/login.html';
else init();
