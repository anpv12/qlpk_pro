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
		let userRole = null;
		try {
			const user = JSON.parse(localStorage.getItem('qlpk_user') || '{}');
			userRole = user.role ? user.role.toLowerCase() : null;
		} catch (e) {
			console.error('Error parsing user info in dashboard:', e);
		}

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
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
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
			const res = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` } });
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
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
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
						<span class="dashboard-status-pill ${this.getExamStatusClass(it.status)}">${it.status}</span>
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
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (response.ok) {
				const data = await response.json();
				this.renderReferralSourceChart(data.items || []);
			}
		} catch (e) {
			console.error('Error loading referral source stats:', e);
		}
	}

	renderReferralSourceChart(items) {
		const dom = document.getElementById('referralSourceChart');
		if (!dom) return;

		if (this.referralSourceChart) {
			this.referralSourceChart.dispose();
			this.referralSourceChart = null;
		}

		if (!items.length) {
			dom.innerHTML = '<div class="empty-state"><i class="bi bi-diagram-3"></i>Chưa có dữ liệu nguồn giới thiệu</div>';
			return;
		}

		const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
		const fallbackColors = {
			facebook: '#1877F2',
			website: '#22C55E',
			referral: '#F59E0B',
			medpro: '#EF4444',
			walk_in: '#06B6D4',
			other: '#8B5CF6'
		};
		const iconFor = {
			facebook: 'bi-facebook',
			website: 'bi-globe2',
			referral: 'bi-people-fill',
			medpro: 'bi-heart-pulse-fill',
			walk_in: 'bi-door-open-fill',
			other: 'bi-grid-3x3-gap-fill'
		};
		const classFor = (key) => String(key || 'unknown').replace(/[^a-z0-9_-]/gi, '');
		const colorFor = (item) => {
			const color = String(item.color || '').trim();
			return /^#[0-9a-f]{6}$/i.test(color) ? color : (fallbackColors[item.key] || '#8B5CF6');
		};
		const percentFor = (count) => total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
		const percentText = (percent) => Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;

		dom.innerHTML = `
			<div class="referral-source-tag-summary">
				<span class="referral-source-tag-summary-label">Tổng lượt khám</span>
				<span class="referral-source-tag-summary-value">${total}</span>
			</div>
			<div class="referral-source-tag-grid">
				${items.map((item) => {
					const count = item.count || 0;
					const percent = percentFor(count);
					const color = colorFor(item);
					const icon = iconFor[item.key] || 'bi-tag-fill';
					return `<button type="button" class="referral-source-tag referral-source-tag--${classFor(item.key)}"
						style="--tag-color:${color};--tag-bg:${color}14;--tag-shadow:${color}26;--tag-width:${percent}%;"
						data-source-key="${this.escapeHtml(item.key)}" data-source-label="${this.escapeHtml(item.label)}" data-source-count="${item.count || 0}"
						title="${this.escapeHtml(item.label)}: ${item.count || 0} lượt khám">
						<span class="referral-source-tag-icon"><i class="bi ${icon}"></i></span>
						<span class="referral-source-tag-main">
							<span class="referral-source-tag-label">${this.escapeHtml(item.label)}</span>
							<span class="referral-source-tag-metrics">
								<span class="referral-source-tag-count">${count} lượt</span>
								<span class="referral-source-tag-share">${percentText(percent)}</span>
							</span>
						</span>
						<span class="referral-source-tag-bar"><span></span></span>
					</button>`;
				}).join('')}
			</div>
		`;

		dom.querySelectorAll('.referral-source-tag').forEach((button) => {
			button.addEventListener('click', () => {
				this.showReferralSourceDetail(
					button.dataset.sourceKey,
					button.dataset.sourceLabel,
					Number(button.dataset.sourceCount || 0)
				);
			});
		});
	}

	async showReferralSourceDetail(sourceKey, sourceLabel, count) {
		const modalEl = document.getElementById('referralSourceDetailModal');
		if (!modalEl) return;
		const modal = new bootstrap.Modal(modalEl);

		document.getElementById('referralSourceDetailTitle').textContent = `${sourceLabel} — ${count || 0} lượt khám`;
		this.setElementVisible('referralSourceDetailLoading', true);
		this.setElementVisible('referralSourceDetailContent', false);
		this.setElementVisible('referralSourceDetailEmpty', false);
		modal.show();

		try {
			const url = `/api/dashboard/referral-source-detail?source=${encodeURIComponent(sourceKey)}&from_date=${this.referralSourceFromDate}&to_date=${this.referralSourceToDate}`;
			const res = await fetch(url, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (!res.ok) throw new Error('API error');
			const data = await res.json();
			const items = data.items || [];

			this.setElementVisible('referralSourceDetailLoading', false);

			if (items.length === 0) {
				this.setElementVisible('referralSourceDetailEmpty', true);
				return;
			}

			const tbody = document.getElementById('referralSourceDetailTableBody');
			tbody.innerHTML = items.map((item, index) => `
				<tr class="${index % 2 === 0 ? '' : 'dashboard-row-green-alt'}">
					<td class="ps-3 py-2 text-center fw-semibold dashboard-cell-accent">${index + 1}</td>
					<td class="py-2 fw-semibold">${this.escapeHtml(item.patient_name || '')}</td>
					<td class="py-2 dashboard-cell-muted">${this.escapeHtml(item.phone || '')}</td>
					<td class="py-2 text-center dashboard-cell-muted">${this.escapeHtml(item.exam_date || '')}</td>
					<td class="py-2 text-center dashboard-cell-accent dashboard-cell-semibold">${this.escapeHtml(item.exam_time || '')}</td>
					<td class="py-2 referral-source-detail-reason">${this.escapeHtml(item.main_reason || '—')}</td>
					<td class="pe-3 py-2 referral-source-detail-source">${this.escapeHtml(item.source_value || item.source_label || '')}</td>
				</tr>
			`).join('');

			this.setElementVisible('referralSourceDetailContent', true);
		} catch (e) {
			console.error('Referral source detail error:', e);
			this.setElementVisible('referralSourceDetailLoading', false);
			this.setElementVisible('referralSourceDetailEmpty', true);
		}
	}

	// ==================== TOP ICD ====================
	async loadTopICD() {
		try {
			const url = `/api/dashboard/top-icd?from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
			const response = await fetch(url, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (response.ok) {
				const data = await response.json();
				this.renderICDChart(data.items || []);
			}
		} catch (e) {
			console.error('Error loading top ICD:', e);
		}
	}


	renderICDChart(items) {
		const dom = document.getElementById('icdChart');
		if (!dom) return;

		if (this.icdChart) { this.icdChart.dispose(); this.icdChart = null; }

		if (items.length === 0) {
			dom.innerHTML = '<div class="empty-state"><i class="bi bi-clipboard2-pulse"></i>Chưa có dữ liệu ICD</div>';
			return;
		}

		const COLORS = [
			'#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
			'#06B6D4', '#F97316', '#EC4899', '#14B8A6', '#A855F7',
			'#6366F1', '#84CC16', '#D946EF', '#0EA5E9', '#22C55E',
			'#FB923C', '#F43F5E', '#7C3AED', '#0891B2', '#65A30D'
		];

		const total = items.reduce((s, i) => s + i.count, 0);
		const treemapData = items.map((item, i) => ({
			name: item.icd_code,
			value: item.count,
			_disease: item.disease_name || '',
			_pct: total > 0 ? (item.count / total * 100).toFixed(1) : 0,
			itemStyle: { color: COLORS[i % COLORS.length] }
		}));

		const chart = echarts.init(dom);
		this.icdChart = chart;

		chart.setOption({
			tooltip: {
				trigger: 'item',
				confine: true,
				formatter: (p) => {
					const d = p.data;
					return `<b>${d.name}</b><br/>
						<span class="dashboard-tooltip-muted">${d._disease}</span><br/>
						${p.marker} <b>${d.value}</b> ca &nbsp;•&nbsp; ${d._pct}%`;
				}
			},
			series: [{
				type: 'treemap',
				width: '100%',
				height: '100%',
				roam: false,
				nodeClick: false,
				breadcrumb: { show: false },
				label: {
					show: true,
					formatter: (p) => `{code|${p.name}}\n{cnt|${p.value} ca}`,
					rich: {
						code: { fontSize: 13, fontWeight: 'bold', color: '#fff', lineHeight: 20 },
						cnt: { fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 16 }
					}
				},
				upperLabel: { show: false },
				itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 2 },
				emphasis: {
					itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' },
					label: { color: '#fff' }
				},
				data: treemapData,
				animationType: 'expansion',
				animationDuration: 600
			}]
		});

		// Click vào 1 ICD block → show chi tiết ca khám
		chart.on('click', (params) => {
			if (params.data && params.data.name) {
				this.showICDDetail(params.data.name, params.data._disease, params.data.value);
			}
		});

		window.addEventListener('resize', () => chart.resize());
	}

	async showICDDetail(icdCode, diseaseName, count) {
		const modalEl = document.getElementById('icdDetailModal');
		if (!modalEl) return;
		const modal = new bootstrap.Modal(modalEl);

		document.getElementById('icdDetailTitle').textContent =
			`${icdCode} — ${diseaseName || ''} (${count} ca)`;
		this.setElementVisible('icdDetailLoading', true);
		this.setElementVisible('icdDetailContent', false);
		this.setElementVisible('icdDetailEmpty', false);
		modal.show();

		try {
			const url = `/api/dashboard/icd-detail?icd_code=${encodeURIComponent(icdCode)}&from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
			const res = await fetch(url, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (!res.ok) throw new Error('API error');
			const data = await res.json();
			const items = data.items || [];

			this.setElementVisible('icdDetailLoading', false);

			if (items.length === 0) {
				this.setElementVisible('icdDetailEmpty', true);
				return;
			}

			const tbody = document.getElementById('icdDetailTableBody');
			tbody.innerHTML = items.map((it, i) =>
				`<tr class="${i % 2 === 0 ? '' : 'dashboard-row-green-alt'}">
					<td class="ps-3 py-2 text-center fw-semibold dashboard-cell-accent">${i + 1}</td>
					<td class="py-2 fw-semibold">${it.patient_name}</td>
					<td class="py-2 dashboard-cell-muted">${it.doctor_name}</td>
					<td class="py-2 text-center dashboard-cell-muted">${it.exam_date}</td>
					<td class="pe-3 py-2 text-center dashboard-cell-accent dashboard-cell-semibold">${it.exam_time}</td>
				</tr>`
			).join('');

			this.setElementVisible('icdDetailContent', true);
		} catch (e) {
			console.error('ICD detail error:', e);
			this.setElementVisible('icdDetailLoading', false);
			this.setElementVisible('icdDetailEmpty', true);
		}
	}


	// ==================== EXPORT EXCEL ====================
	async exportICDExcel() {
		const btn = document.getElementById('btnExportICD');
		if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang xuất...'; }
		try {
			const url = `/api/dashboard/export-icd-excel?from_date=${this.icdFromDate}&to_date=${this.icdToDate}`;
			const response = await fetch(url, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (!response.ok) {
				const err = await response.json();
				window.QLPKUserFeedback?.show('error', 'Không thể xuất danh sách ICD. Vui lòng thử lại.');
				return;
			}
			const blob = await response.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			const cd = response.headers.get('Content-Disposition') || '';
			const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
			a.download = match ? match[1].replace(/['"]/g, '') : 'icd.xlsx';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(a.href);
		} catch (e) {
			console.error('Export ICD error:', e);
			window.QLPKUserFeedback?.show('error', 'Không thể xuất danh sách ICD. Vui lòng thử lại.');
		} finally {
			if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-excel"></i> Excel'; }
		}
	}

	async exportReferralSourceExcel() {
		const btn = document.getElementById('btnExportReferralSource');
		if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Đang xuất...'; }
		try {
			const url = `/api/dashboard/export-referral-source-excel?from_date=${this.referralSourceFromDate}&to_date=${this.referralSourceToDate}`;
			const response = await fetch(url, {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (!response.ok) {
				const err = await response.json();
				window.QLPKUserFeedback?.show('error', 'Không thể xuất nguồn giới thiệu. Vui lòng thử lại.');
				return;
			}
			const blob = await response.blob();
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			const cd = response.headers.get('Content-Disposition') || '';
			const match = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
			a.download = match ? match[1].replace(/['"]/g, '') : 'nguon_gioi_thieu.xlsx';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(a.href);
		} catch (e) {
			console.error('Export referral source error:', e);
			window.QLPKUserFeedback?.show('error', 'Không thể xuất nguồn giới thiệu. Vui lòng thử lại.');
		} finally {
			if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-excel"></i> Excel'; }
		}
	}

	// ==================== STAFF ONLINE ====================
	async loadStaffOnline() {
		try {
			const response = await fetch('/api/dashboard/staff-online', {
				headers: { 'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}` }
			});
			if (response.ok) {
				const data = await response.json();
				this.renderStaffOnline(data);
			}
		} catch (e) {
			console.error('Error loading staff online:', e);
		}
	}

	renderStaffOnline(data) {
		const container = document.getElementById('staffOnlineList');
		const badge = document.getElementById('onlineCount');
		if (!container) return;

		const items = (data.items || []).sort((a, b) => {
			if (a.is_online !== b.is_online) return b.is_online - a.is_online;
			return (a.full_name || '').localeCompare(b.full_name || '');
		});
		const onlineCount = data.online_count || 0;

		if (badge) {
			badge.textContent = `${onlineCount} online`;
			badge.className = `online-badge ${onlineCount > 0 ? 'has-online' : ''}`;
		}

		if (items.length === 0) {
			container.innerHTML = '<div class="empty-state"><i class="bi bi-people"></i>Chưa có nhân viên</div>';
			return;
		}

		container.innerHTML = items.map(s => {
			const dotClass = s.is_online ? 'online' : 'offline';
			const statusText = s.is_online ? 'Đang hoạt động' : (s.last_login ? this.timeAgo(s.last_login) : 'Chưa đăng nhập');
			const initials = (s.full_name || '').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase();
			const avatarHtml = s.avatar
				? `<img class="staff-avatar staff-avatar-img" src="${s.avatar}" alt="${s.full_name}">`
				: `<div class="staff-avatar">${initials}</div>`;
			return `
				<div class="staff-item">
					${avatarHtml}
					<div class="staff-info">
						<div class="staff-name">${s.full_name}</div>
						<div class="staff-role">${s.role_label}</div>
					</div>
					<div class="staff-status">
						<span class="status-dot ${dotClass}"></span>
						<span class="status-text ${dotClass}">${statusText}</span>
					</div>
				</div>
			`;
		}).join('');
	}

	timeAgo(isoString) {
		const now = new Date();
		const past = new Date(isoString);
		const diffMs = now - past;
		const mins = Math.floor(diffMs / 60000);
		if (mins < 60) return `${mins} phút trước`;
		const hours = Math.floor(mins / 60);
		if (hours < 24) return `${hours} giờ trước`;
		const days = Math.floor(hours / 24);
		return `${days} ngày trước`;
	}

	escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
	if (!localStorage.getItem('qlpk_token')) {
		window.location.href = '/login.html';
		return;
	}
	window.dashboardManager = new DashboardManager();
});
