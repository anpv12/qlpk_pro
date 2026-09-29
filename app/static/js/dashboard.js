// Continued in (nạp ngay sau file này, cùng scope trang): dashboard-methods.js
/**
 * Dashboard V2 — Lượt khám / Lịch hẹn / Top ICD
 */

class DashboardManager {
	constructor() {
		this.appointments = [];
		this.examStatsChart = null;
		this.icdChart = null;
		this.referralSourceChart = null;

		this.init();
	}

	async init() {
		// Kiểm tra quyền hiển thị
		const user = await window.QLPKApiTransport.currentUser();
		const userRole = user.role ? String(user.role).toLowerCase() : null;

		if (userRole !== 'admin') {
			this.setElementVisible('user-welcome-view', true);
			this.setElementVisible('admin-dashboard-view', false);
			return; // Dừng tại đây, không nạp biểu đồ, không gọi API thống kê
		}

		this.setElementVisible('admin-dashboard-view', true);
		this.setElementVisible('user-welcome-view', false);

		const todayRev = new Date();
		const thirtyAgo = new Date(todayRev);
		thirtyAgo.setDate(todayRev.getDate() - 6);
		const yearStart = new Date(todayRev.getFullYear(), 0, 1);
		const fmtISO = d => {
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, '0');
			const day = String(d.getDate()).padStart(2, '0');
			return `${y}-${m}-${day}`;
		};
		this.fmtISO = fmtISO;
		this.revFromDate = fmtISO(thirtyAgo);
		this.revToDate   = fmtISO(todayRev);

		// Exam stats date range pickers (dùng lại id revFromDate/revToDate)
		const revFromEl = document.getElementById('revFromDate');
		const revToEl   = document.getElementById('revToDate');
		if (revFromEl && window.flatpickr) {
			flatpickr(revFromEl, {
				dateFormat: 'd/m/Y', defaultDate: thirtyAgo, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.revFromDate = fmtISO(dates[0]); this.loadExamStats(); } }
			});
		}
		if (revToEl && window.flatpickr) {
			flatpickr(revToEl, {
				dateFormat: 'd/m/Y', defaultDate: todayRev, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.revToDate = fmtISO(dates[0]); this.loadExamStats(); } }
			});
		}

		// ICD date range pickers
		this.icdFromDate = fmtISO(thirtyAgo);
		this.icdToDate   = fmtISO(todayRev);
		const fromEl = document.getElementById('icdFromDate');
		const toEl   = document.getElementById('icdToDate');
		if (fromEl && window.flatpickr) {
			flatpickr(fromEl, {
				dateFormat: 'd/m/Y', defaultDate: thirtyAgo, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.icdFromDate = fmtISO(dates[0]); this.loadTopICD(); } }
			});
		}
		if (toEl && window.flatpickr) {
			flatpickr(toEl, {
				dateFormat: 'd/m/Y', defaultDate: todayRev, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.icdToDate = fmtISO(dates[0]); this.loadTopICD(); } }
			});
		}

		// Referral source date range pickers
		this.referralSourceFromDate = fmtISO(yearStart);
		this.referralSourceToDate = fmtISO(todayRev);
		const referralFromEl = document.getElementById('referralSourceFromDate');
		const referralToEl = document.getElementById('referralSourceToDate');
		if (referralFromEl && window.flatpickr) {
			flatpickr(referralFromEl, {
				dateFormat: 'd/m/Y', defaultDate: yearStart, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.referralSourceFromDate = fmtISO(dates[0]); this.loadReferralSources(); } }
			});
		}
		if (referralToEl && window.flatpickr) {
			flatpickr(referralToEl, {
				dateFormat: 'd/m/Y', defaultDate: todayRev, disableMobile: true,
				onChange: (dates) => { if (dates[0]) { this.referralSourceToDate = fmtISO(dates[0]); this.loadReferralSources(); } }
			});
		}

		await Promise.all([
			this.loadAppointments(),
			this.loadExamStats(),
			this.loadTopICD(),
			this.loadReferralSources(),
			this.loadStaffOnline()
		]);

		this.registerRealtimeHandlers();
	}

	registerRealtimeHandlers() {
		if (!window.QLPKRealtimePageHooks) return;

		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed', 'catalog.changed', 'presence.changed'],
			debounceMs: 500,
			handler: (event) => {
				if (event.type === 'presence.changed') {
					this.loadStaffOnline();
					return;
				}

				Promise.all([
					this.loadAppointments(),
					this.loadExamStats(),
					this.loadTopICD(),
					this.loadReferralSources()
				]);
			}
		});
	}

	_getRevToDate() {
		const today = this.fmtISO(new Date());
		return this.revToDate > today ? today : this.revToDate;
	}

	// ==================== APPOINTMENTS ====================
	async loadAppointments() {
		try {
			const now = new Date();
			const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
			const response = await fetch(`/api/?per_page=1000&date_from=${today}&date_to=${today}`, {
			});
			if (response.ok) {
				const data = await response.json();
				this.appointments = data.appointments || [];
				this.renderAppointments();
			}
		} catch (e) {
			console.error('Error loading appointments:', e);
		}
	}

	renderAppointments() {
		const container = document.getElementById('appointmentList');
		if (!container) return;

		const now = new Date();
		const items = this.appointments
			.filter(apt => ['SCHEDULED', 'CONFIRMED'].includes((apt.status || '').toUpperCase()))
			.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));

		if (items.length === 0) {
			container.innerHTML = '<div class="empty-state"><i class="bi bi-calendar-x"></i>Không có lịch hẹn hôm nay</div>';
			return;
		}

		container.innerHTML = items.map(apt => {
			const aptDate = new Date(apt.appointment_date);
			const timeStr = aptDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
			const status = (apt.status || '').toUpperCase();
			const statusClass = status === 'CONFIRMED' ? 'confirmed' : 'pending';
			const statusText = status === 'CONFIRMED' ? 'Đã xác nhận' : 'Chờ xác nhận';
			const patientName = apt.patient_full_name || apt.full_name || 'Bệnh nhân';
			const phone = apt.patient_phone || '';
			const doctorName = apt.doctor_name || '';
			const serviceName = apt.service_name || '';

			let infoText = patientName;
			if (phone) infoText += ` - ${phone}`;
			if (serviceName) infoText += ` - ${serviceName}`;
			if (doctorName) infoText += ` - ${doctorName}`;

			const diffMs = aptDate - now;
			const diffMinutes = Math.round(diffMs / 60000);
			let countdown = '';
			if (diffMinutes > 0) {
				const totalHours = Math.floor(diffMinutes / 60);
				const remMinutes = diffMinutes % 60;
				if (diffMinutes < 60) {
					countdown = `Còn ${diffMinutes} phút`;
				} else if (totalHours < 24) {
					countdown = remMinutes > 0 ? `Còn ${totalHours} giờ ${remMinutes} phút` : `Còn ${totalHours} giờ`;
				} else {
					const days = Math.floor(totalHours / 24);
					const remHours = totalHours % 24;
					countdown = remHours > 0 ? `Còn ${days} ngày ${remHours} giờ` : `Còn ${days} ngày`;
				}
			}

			return `
				<div class="apt-item">
					<div class="apt-time">${timeStr}</div>
					<div class="apt-dot ${statusClass}"></div>
					<div class="apt-info">
						${infoText}
						${countdown ? `<div class="apt-countdown">${countdown}</div>` : ''}
					</div>
					<div class="apt-status ${statusClass}">${statusText}</div>
				</div>
			`;
		}).join('');
	}

	// ==================== EXAM STATS ====================
	async loadExamStats() {
		try {
			const url = `/api/dashboard/exam-stats-by-day?from_date=${this.revFromDate}&to_date=${this._getRevToDate()}`;
			const res = await fetch(url);
			if (res.ok) {
				const data = await res.json();
				this.renderExamStatsChart(data.items || []);
			}
		} catch (e) {
			console.error('Error loading exam stats:', e);
		}
	}

	renderExamStatsChart(items) {
		const dom = document.getElementById('examStatsChart');
		if (!dom) return;
		if (this.examStatsChart) { this.examStatsChart.dispose(); this.examStatsChart = null; }

		const labels = items.map(i => i.label);
		const doctorCounts = items.map(i => i.doctor_count || 0);
		const psychCounts = items.map(i => i.psychologist_count || 0);
		const totalDoctor = doctorCounts.reduce((s, v) => s + v, 0);
		const totalPsych = psychCounts.reduce((s, v) => s + v, 0);
		const total = totalDoctor + totalPsych;
		const maxVal = Math.max(...doctorCounts, ...psychCounts, 1);

		const DOCTOR_COLOR = '#0F766E';
		const PSYCH_COLOR = '#E91E90';

		const chart = echarts.init(dom);
		this.examStatsChart = chart;

		chart.setOption({
			tooltip: {
				trigger: 'axis',
				confine: true,
				formatter: params => {
					let html = `<strong>${params[0].name}</strong><br/>`;
					let dayTotal = 0;
					params.forEach(p => {
						html += `${p.marker} ${p.seriesName}: <b>${p.value}</b><br/>`;
						dayTotal += p.value;
					});
					html += `<b>Tổng: ${dayTotal}</b>`;
					return html;
				}
			},
			legend: {
				show: true,
				top: 4,
				left: 'center',
				textStyle: { fontSize: 11 },
				data: ['Bác sĩ', 'Tâm lý gia']
			},
			graphic: [{
				type: 'text', right: 16, top: 8,
				style: {
					text: `Tổng: ${total} lượt`,
					font: 'bold 12px sans-serif',
					fill: '#0F766E'
				}
			}],
			grid: { left: 42, right: 16, top: 42, bottom: 28 },
			xAxis: {
				type: 'category', data: labels,
				axisLabel: { fontSize: 11, color: '#64748B', interval: Math.floor(labels.length / 15) },
				axisTick: { show: false },
				axisLine: { lineStyle: { color: '#E5E7EB' } }
			},
			yAxis: {
				type: 'value', minInterval: 1,
				axisLabel: { fontSize: 11, color: '#94A3B8' },
				splitLine: { lineStyle: { color: '#F1F5F9' } }
			},
			series: [{
				name: 'Bác sĩ',
				type: 'line',
				data: doctorCounts,
				smooth: 0.4,
				symbol: 'circle',
				symbolSize: d => d === Math.max(...doctorCounts) && d > 0 ? 8 : (d > 0 ? 5 : 0),
				lineStyle: { color: DOCTOR_COLOR, width: 2.5 },
				itemStyle: { color: DOCTOR_COLOR, borderColor: '#fff', borderWidth: 2 },
				areaStyle: {
					color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
						colorStops: [
							{ offset: 0, color: 'rgba(15,118,110,0.22)' },
							{ offset: 1, color: 'rgba(15,118,110,0.02)' }
						]
					}
				},
				label: {
					show: true,
					position: 'top',
					formatter: p => p.value > 0 ? p.value : '',
					fontSize: 10, color: DOCTOR_COLOR
				},
				animationDuration: 800,
				animationEasing: 'cubicOut'
			}, {
				name: 'Tâm lý gia',
				type: 'line',
				data: psychCounts,
				smooth: 0.4,
				symbol: 'circle',
				symbolSize: d => d === Math.max(...psychCounts) && d > 0 ? 8 : (d > 0 ? 5 : 0),
				lineStyle: { color: PSYCH_COLOR, width: 2.5 },
				itemStyle: { color: PSYCH_COLOR, borderColor: '#fff', borderWidth: 2 },
				areaStyle: {
					color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
						colorStops: [
							{ offset: 0, color: 'rgba(233,30,144,0.18)' },
							{ offset: 1, color: 'rgba(233,30,144,0.02)' }
						]
					}
				},
				label: {
					show: true,
					position: 'top',
					formatter: p => p.value > 0 ? p.value : '',
					fontSize: 10, color: PSYCH_COLOR
				},
				animationDuration: 800,
				animationEasing: 'cubicOut'
			}]
		});

		window.addEventListener('resize', () => chart.resize());

		// Cập nhật tổng khi toggle legend
		chart.on('legendselectchanged', (params) => {
			const sel = params.selected;
			let filteredTotal = 0;
			if (sel['Bác sĩ']) filteredTotal += totalDoctor;
			if (sel['Tâm lý gia']) filteredTotal += totalPsych;
			chart.setOption({
				graphic: [{ style: { text: `Tổng: ${filteredTotal} lượt` } }]
			});
		});

		// Click vào vùng grid → show chi tiết ngày
		chart.getZr().on('click', (event) => {
			const pt = [event.offsetX, event.offsetY];
			if (!chart.containPixel('grid', pt)) return;
			const idx = Math.round(chart.convertFromPixel('grid', pt)[0]);
			if (idx >= 0 && idx < items.length) {
				const item = items[idx];
				this.showExamDetail(item.date, item.label, item.count);
			}
		});

		// Cursor pointer khi vào vùng grid
		chart.getZr().on('mousemove', (event) => {
			const pt = [event.offsetX, event.offsetY];
			const inGrid = chart.containPixel('grid', pt);
			chart.getZr().setCursorStyle(inGrid ? 'pointer' : 'default');
		});
	}

	async showExamDetail(dateISO, dateLabel, count) {
		const modalEl = document.getElementById('examDetailModal');
		if (!modalEl) return;
		const modal = new bootstrap.Modal(modalEl);

		document.getElementById('examDetailTitle').textContent =
			`Ca khám ngày ${dateLabel} — ${count} ca`;
		this.setElementVisible('examDetailLoading', true);
		this.setElementVisible('examDetailContent', false);
		this.setElementVisible('examDetailEmpty', false);
		modal.show();

		try {
			const res = await fetch(`/api/dashboard/exam-detail-by-day?date=${dateISO}`, {
			});
			if (!res.ok) throw new Error('API error');
			const data = await res.json();
			const items = data.items || [];

			this.setElementVisible('examDetailLoading', false);

			if (items.length === 0) {
				this.setElementVisible('examDetailEmpty', true);
				return;
			}

			const tbody = document.getElementById('examDetailTableBody');
			tbody.innerHTML = items.map((it, i) => {
				const isPsych = (it.doctor_role || '').toUpperCase() === 'PSYCHOLOGIST';
				const rowClass = isPsych ? 'dashboard-row-psych' : (i % 2 === 0 ? '' : 'dashboard-row-alt');
				const timeClass = isPsych ? 'dashboard-cell-psych dashboard-cell-psych-marker' : 'dashboard-cell-accent dashboard-cell-accent-marker';
				return `<tr class="${rowClass}">
					<td class="ps-3 py-2 text-center fw-semibold ${timeClass}">${it.time}</td>
					<td class="py-2 fw-semibold">${it.patient_name}</td>
					<td class="py-2 dashboard-cell-muted">${it.phone}</td>
					<td class="py-2">${it.doctor_name}</td>
					<td class="py-2 dashboard-cell-muted">${it.service || '—'}</td>
					<td class="pe-3 py-2 text-center">
						<span class="qlpk-status dashboard-status-pill ${this.getExamStatusClass(it.status)}">${it.status}</span>
					</td>
				</tr>`;
			}).join('');

			this.setElementVisible('examDetailContent', true);
		} catch (e) {
			console.error('Exam detail error:', e);
			this.setElementVisible('examDetailLoading', false);
			this.setElementVisible('examDetailEmpty', true);
		}
	}

	setElementVisible(id, visible) {
		const element = document.getElementById(id);
		if (element) element.classList.toggle('dashboard-hidden', !visible);
	}

	getExamStatusClass(status) {
		const statusMap = {
			'Hoàn thành': 'dashboard-status-pill--done',
			'Đang khám': 'dashboard-status-pill--active',
			'Đã xác nhận': 'dashboard-status-pill--confirmed',
			'Chờ xác nhận': 'dashboard-status-pill--waiting'
		};
		return statusMap[status] || 'dashboard-status-pill--muted';
	}

	// ==================== REFERRAL SOURCES ====================
	async loadReferralSources() {
		try {
			const url = `/api/dashboard/referral-sources?from_date=${this.referralSourceFromDate}&to_date=${this.referralSourceToDate}`;
			const response = await fetch(url, {
			});
			if (response.ok) {
				const data = await response.json();
				this.renderReferralSourceChart(data.items || []);
			}
		} catch (e) {
			console.error('Error loading referral source stats:', e);
		}
	}

}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = '/login.html';
		return;
	}
	window.dashboardManager = new DashboardManager();
});
