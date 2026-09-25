(function (window) {
	'use strict';

	const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
	}

	function getBadgeTexts(data = {}) {
		return {
			total: 'Tổng: ' + (data.total || 0),
			synced: 'Đã đồng bộ: ' + (data.synced || 0),
			missing: 'Thiếu: ' + (data.missing || 0),
			error: 'Lỗi: ' + (data.error || 0)
		};
	}

	function buildEmptyRowHtml() {
		return `
				<tr>
					<td colspan="7" class="appointment-sync-empty-cell">
						<i class="bi bi-calendar-x appointment-empty-icon appointment-sync-empty-icon"></i>
						Không có lịch hẹn trong khoảng thời gian này
					</td>
				</tr>
			`;
	}

	function getDateKey(appointment) {
		return appointment.date_key || appointment.datetime.split(' ').slice(1).join(' ');
	}

	function groupAppointmentsByDate(appointments) {
		const groupedByDate = {};
		(appointments || []).forEach(appointment => {
			const dateKey = getDateKey(appointment);
			if (!groupedByDate[dateKey]) {
				groupedByDate[dateKey] = [];
			}
			groupedByDate[dateKey].push(appointment);
		});
		return groupedByDate;
	}

	function getDayName(dateKey) {
		const parts = dateKey.split('/');
		const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
		return DAY_NAMES[dateObj.getDay()];
	}

	function buildDateHeaderRowHtml(dateKey, appointments) {
		return `
				<tr class="sync-date-header appointment-sync-date-header" data-date-key="${dateKey}">
					<td colspan="7" class="appointment-table-strong">
						<i class="bi bi-chevron-down collapse-icon appointment-sync-date-icon"></i>
						<i class="bi bi-calendar3 appointment-sync-date-icon"></i>
						${getDayName(dateKey)} - ${dateKey}
						<span class="qlpk-status appointment-sync-badge appointment-sync-badge--info appointment-sync-date-count">${appointments.length} lịch hẹn</span>
					</td>
				</tr>
			`;
	}

	function buildStatusBadgeHtml(appointment) {
		if (appointment.sync_status === 'synced') {
			return `
						<div class="verify-icons" data-appt-id="${appointment.id}">
							<span class="qlpk-status appointment-sync-badge appointment-sync-badge--neutral"><i class="bi bi-hourglass-split"></i> Đang kiểm tra...</span>
						</div>
					`;
		}

		return `
						<div class="verify-icons" data-appt-id="${appointment.id}">
							<span class="qlpk-status appointment-sync-badge appointment-sync-badge--warning"><i class="bi bi-exclamation-triangle"></i> Thiếu</span>
						</div>
					`;
	}

	function buildActionButtonHtml(appointment) {
		if (!appointment.doctor_has_calendar) {
			return '<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="btn appointment-button appointment-button--neutral appointment-button--sm action-btn appointment-calendar-action-nowrap" disabled><i class="bi bi-google"></i> Chưa kết nối</button>';
		}

		if (appointment.sync_status === 'synced') {
			return `<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="btn appointment-button appointment-button--neutral appointment-button--sm action-btn" data-appt-id="${appointment.id}" disabled>
						<i class="bi bi-hourglass-split"></i> Đang kiểm tra...
					</button>`;
		}

		return `<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn appointment-button appointment-button--primary appointment-button--sm sync-single-btn action-btn" data-appt-id="${appointment.id}">
						<i class="bi bi-arrow-repeat"></i> Đồng bộ
					</button>`;
	}

	function buildAppointmentRowHtml(appointment, dateKey) {
		const statusBadge = buildStatusBadgeHtml(appointment);
		const actionButton = buildActionButtonHtml(appointment);
		const googleIcon = appointment.doctor_has_calendar
			? '<i class="bi bi-google appointment-google-link-icon appointment-google-link-icon--connected" title="Đã liên kết Google Calendar"></i>'
			: '<i class="bi bi-google appointment-google-link-icon appointment-google-link-icon--disconnected" title="Chưa liên kết Google Calendar"></i>';

		return `
					<tr data-appt-id="${appointment.id}" data-sync-status="${appointment.sync_status}" data-date-key="${dateKey}">
						<td><input type="checkbox" class="form-check-input sync-checkbox" data-appt-id="${appointment.id}"></td>
						<td><strong>${appointment.time || appointment.datetime.split(' ')[0]}</strong></td>
						<td>${appointment.duration || appointment.service_duration || '-'} phút</td>
						<td>
							${escapeHtml(appointment.doctor_name)}
							${googleIcon}
						</td>
						<td>${escapeHtml(appointment.patient_name)}</td>
						<td class="sync-status-cell">${statusBadge}</td>
						<td>${actionButton}</td>
					</tr>
				`;
	}

	function buildSyncTableRowsHtml(appointments) {
		const groupedByDate = groupAppointmentsByDate(appointments);
		let html = '';
		Object.keys(groupedByDate).forEach(dateKey => {
			const dateAppointments = groupedByDate[dateKey];
			html += buildDateHeaderRowHtml(dateKey, dateAppointments);
			dateAppointments.forEach(appointment => {
				html += buildAppointmentRowHtml(appointment, dateKey);
			});
		});
		return html;
	}

	function buildSyncTableView(data = {}) {
		const appointments = data.appointments || [];
		return {
			badgeTexts: getBadgeTexts(data),
			bodyHtml: appointments.length ? buildSyncTableRowsHtml(appointments) : buildEmptyRowHtml(),
			isEmpty: appointments.length === 0
		};
	}

	window.AppointmentManagementCalendarSyncTableUtils = {
		buildActionButtonHtml,
		buildAppointmentRowHtml,
		buildDateHeaderRowHtml,
		buildEmptyRowHtml,
		buildStatusBadgeHtml,
		buildSyncTableRowsHtml,
		buildSyncTableView,
		getBadgeTexts,
		getDateKey,
		groupAppointmentsByDate
	};
})(window);
