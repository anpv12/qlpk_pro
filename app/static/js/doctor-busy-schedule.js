/* global filterTable, formatTimeRangeReadable, getStatusIndicator, resetForm, setQuickTimeSelection, showAlert */
/* exported currentBusySchedules, loadMyBusySchedules, normalizeSearchText */

// Continued in (nạp ngay sau file này, cùng scope trang): doctor-busy-schedule/doctor-busy-schedule-2.js
// Doctor Busy Schedule Management JavaScript

let currentUser = null;
let currentBusySchedules = [];
let busyListRevision = 0;
let busyReasonsCache = null;
let busyReasonsCacheTime = null;

function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

// Initialize page
$(document).ready(function () {
	loadUserInfo();
	loadMyBusySchedules();
	setupEventHandlers();
	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['busy_schedule.changed'],
			debounceMs: 500,
			handler: function () {
				loadMyBusySchedules();
			}
		});
	}
});

// Load user information
function loadUserInfo() {
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = 'login.html';
		return;
	}

	$.ajax({
		url: '/check/me',
		method: 'GET',
		success: function (response) {
			currentUser = response;
			updateSidebarUserInfo();
		},
		error: function (xhr) {
			if (xhr.status === 401) {
				window.location.href = 'login.html';
			} else {
				showAlert('Không thể tải thông tin người dùng', 'error');
			}
		}
	});
}

// Update sidebar user info
function updateSidebarUserInfo() {
	if (currentUser) {
		$('#sidebarUserName').text(currentUser.full_name || 'N/A');
		$('#sidebarUserRole').text(currentUser.role || 'N/A');
	}
}

// Setup event handlers
function setupEventHandlers() {
	// Form submit
	$('#busyScheduleForm').on('submit', function (e) {
		e.preventDefault();
		createBusySchedule();
	});

	// Auto-set end time when start time changes
	$('input[name="start_datetime"]').on('change', function () {
		const startTime = new Date($(this).val());
		if (startTime && !$('input[name="end_datetime"]').val()) {
			// Auto-set end time to 1 hour later
			const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
			$('input[name="end_datetime"]').val(endTime.toISOString().slice(0, 16));
		}
	});

	// Real-time validation
	$('input[name="start_datetime"], input[name="end_datetime"]').on('change', function () {
		setQuickTimeSelection();
		validateDateTimeInputs();
	});
	$('#busyScheduleForm').on('reset', function () {
		setQuickTimeSelection();
	});

	// Search functionality
	$('#searchInput').on('input', function () {
		filterTable();
	});

	// Status filter
	$('#statusFilter').on('change', function () {
		loadMyBusySchedules();
	});

	// Quick reason suggestions
	$('input[name="reason"]').on('focus', function () {
		showReasonSuggestions();
	});

	// Reset form button
	$('#resetFormBtn').on('click', function () {
		resetForm();
	});

	// Logout
	$('#logoutBtn').on('click', function () {
		window.QLPKAppHeader?.logout();
	});
}

// Real-time validation for datetime inputs
function validateDateTimeInputs() {
	const startVal = $('input[name="start_datetime"]').val();
	const endVal = $('input[name="end_datetime"]').val();

	// Chỉ validate khi CẢ HAI trường đều có dữ liệu
	if (!startVal || !endVal) {
		$('.validation-message').remove();
		return;
	}

	const startTime = new Date(startVal);
	const endTime = new Date(endVal);

	// Clear previous validation messages
	$('.validation-message').remove();

	if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
		if (startTime >= endTime) {
			showValidationMessage('end_datetime', 'Thời gian kết thúc phải sau thời gian bắt đầu', 'error');
		} else if (endTime < new Date()) {
			showValidationMessage('end_datetime', 'Không thể tạo lịch bận trong quá khứ', 'error');
		} else {
			// Show success message
			const duration = Math.round((endTime - startTime) / (1000 * 60 * 60));
			showValidationMessage('end_datetime', `Thời gian bận: ${duration} giờ`, 'success');
		}
	}
}

// Show validation message
// Show validation message
function showValidationMessage(fieldName, message, type) {
	if (typeof window.AppointmentUtils !== 'undefined' && typeof window.AppointmentUtils.showToast === 'function') {
		window.AppointmentUtils.showToast(type, message);
	} else {
		// Fallback if Utils not loaded
		const field = $(`input[name="${fieldName}"]`);
		const existingMsg = field.siblings('.validation-message');

		if (existingMsg.length) {
			existingMsg.remove();
		}

		const msgClass = type === 'error' ? 'text-danger' : 'text-success';
		const icon = type === 'error' ? 'bi-exclamation-triangle' : 'bi-check-circle';

		field.after(`<div class="validation-message small ${msgClass} mt-1"><i class="bi ${icon}"></i> ${window.QLPKHtml.escape(message)}</div>`);
	}
}

// Show reason suggestions
function showReasonSuggestions() {
	const suggestionsContainer = $('#reasonSuggestionsContainer');

	// Show loading state
	suggestionsContainer.html('<small class="text-muted">Đang tải gợi ý...</small>');

	// Load suggestions from API
	loadBusyReasons();
}

// Load busy reasons from API
function loadBusyReasons() {
	// Check cache first (cache for 5 minutes)
	const now = Date.now();
	if (busyReasonsCache && busyReasonsCacheTime && (now - busyReasonsCacheTime) < 300000) {
		displayReasonSuggestions(busyReasonsCache);
		return;
	}

	$.ajax({
		url: '/api/doctor-busy-schedules/busy-reasons',
		method: 'GET',
		success: function (response) {
			if (response.success && response.reasons) {
				// Cache the results
				busyReasonsCache = response.reasons;
				busyReasonsCacheTime = now;
				displayReasonSuggestions(response.reasons);
			} else {
				// Fallback to default suggestions
				displayReasonSuggestions([
					'Họp định kỳ', 'Nghỉ phép', 'Khám ngoài', 'Đào tạo',
					'Hội nghị', 'Nghỉ ốm', 'Công tác', 'Nghỉ lễ'
				]);
			}
		},
		error: function () {
			// Fallback to default suggestions
			displayReasonSuggestions([
				'Họp định kỳ', 'Nghỉ phép', 'Khám ngoài', 'Đào tạo',
				'Hội nghị', 'Nghỉ ốm', 'Công tác', 'Nghỉ lễ'
			]);
		}
	});
}

// Display reason suggestions
function displayReasonSuggestions(suggestions) {
	const reasonInput = $('input[name="reason"]');
	const suggestionsContainer = $('#reasonSuggestionsContainer');

	if (!suggestions || suggestions.length === 0) {
		suggestionsContainer.html('<small class="text-muted">Không có gợi ý</small>');
		return;
	}

	const suggestionsHtml = suggestions.map(reason =>
		`<span class="suggestion-badge" title="Click để chọn">${window.QLPKSharedUtils.escapeHtml(reason)}</span>`
	).join('');

	suggestionsContainer.html(`
        <span class="text-muted me-2">(${suggestions.length} lý do):</span>
        ${suggestionsHtml}
    `);

	// Add click handlers for suggestions
	$('.suggestion-badge').on('click', function () {
		reasonInput.val($(this).text());
		// Highlight selected suggestion
		$('.suggestion-badge').removeClass('is-selected');
		$(this).addClass('is-selected');
	});
}

// Create or update busy schedule
function runBusySchedule1(ctx) {
	const formData = new FormData($('#busyScheduleForm')[0]);
	ctx.data = {
		doctor_id: currentUser.id,
		start_datetime: formData.get('start_datetime'),
		end_datetime: formData.get('end_datetime'),
		reason: formData.get('reason')
	};
}

function runBusySchedule2(ctx) {
	// Show loading state
	const submitBtn = $('#busyScheduleForm button[type="submit"]');
	const originalText = submitBtn.html();
	// Determine if this is create or update
	const isUpdate = window.editingScheduleId;
	const loadingText = isUpdate ? 'Đang cập nhật...' : 'Đang tạo...';
	submitBtn.prop('disabled', true).html(`<i class="spinner-border spinner-border-sm me-2"></i>${loadingText}`);
	// Set URL and method based on operation
	const url = isUpdate ? `/api/doctor-busy-schedules/${window.editingScheduleId}` : '/api/doctor-busy-schedules';
	const method = isUpdate ? 'PUT' : 'POST';
	$.ajax({
		url: url,
		method: method,
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(ctx.data),
		success: function (response) {
			// Restore button state
			submitBtn.prop('disabled', false).html(originalText);

			if (response.success) {
				const successMessage = isUpdate ? 'Cập nhật lịch bận thành công!' : 'Tạo lịch bận thành công!';
				showAlert(successMessage, 'success');

				// Reset form and clear editing state
				$('#busyScheduleForm')[0].reset();
				window.editingScheduleId = null;
				$('button[type="submit"]').html('<i class="bi bi-plus-lg me-2"></i>Tạo lịch bận');

				loadMyBusySchedules();

				// Broadcast thay đổi cho các tab/component khác
				if (typeof window.notifyBusyScheduleChanged === 'function') {
					window.notifyBusyScheduleChanged();
				}

				// Clear cache to refresh suggestions with new reason
				busyReasonsCache = null;
				busyReasonsCacheTime = null;
			} else {
				showAlert(`Không thể ${isUpdate ? 'cập nhật' : 'tạo'} lịch bận. Vui lòng kiểm tra lại.`, 'error');
			}
		},
		error: function (xhr) {
			// Restore button state
			submitBtn.prop('disabled', false).html(originalText);

			let errorMessage = `Không thể ${isUpdate ? 'cập nhật' : 'tạo'} lịch bận. Vui lòng kiểm tra lại.`;

			if (xhr.status === 409) {
				const response = xhr.responseJSON;

				if (response && response.conflicts) {
					let conflictMessage = 'Xung đột với lịch hẹn hiện có:\n';
					response.conflicts.forEach(conflict => {
						conflictMessage += `- Bệnh nhân: ${conflict.patient_name}, Thời gian: ${conflict.appointment_date}\n`;
					});
					showAlert(conflictMessage, 'warning');
					return;
				} else if (response && response.conflict_schedule) {
					const conflict = response.conflict_schedule;
					let conflictMessage = `Xung đột với lịch bận khác:\n`;
					conflictMessage += `- Thời gian: ${conflict.start_datetime} đến ${conflict.end_datetime}\n`;
					conflictMessage += `- Lý do: ${conflict.reason}`;
					showAlert(conflictMessage, 'warning');
					return;
				} else {
					errorMessage = 'Xung đột thời gian với lịch bận hoặc lịch hẹn hiện có';
				}
			} else if (xhr.status === 400) {
				errorMessage = 'Thông tin lịch bận chưa hợp lệ. Vui lòng kiểm tra lại.';
			} else if (xhr.status === 401) {
				errorMessage = 'Phiên đăng nhập đã hết hạn';
				window.location.href = 'login.html';
				return;
			} else if (xhr.status === 500) {
				errorMessage = 'Không thể lưu lịch bận. Vui lòng thử lại.';
			}

			showAlert(errorMessage, 'error');
		}
	});
}

function createBusySchedule() {
	const ctx = {};
	// Kiểm tra currentUser đã load chưa
	if (!currentUser || !currentUser.id) {
		showAlert('Đang tải thông tin người dùng, vui lòng thử lại sau', 'warning');
		return;
	}
	runBusySchedule1(ctx);
	// Validation
	if (!ctx.data.start_datetime || !ctx.data.end_datetime || !ctx.data.reason) {
		showAlert('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
		return;
	}
	// Check if start time is before end time
	const startTime = new Date(ctx.data.start_datetime);
	const endTime = new Date(ctx.data.end_datetime);
	if (startTime >= endTime) {
		showAlert('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc', 'warning');
		return;
	}
	// Check if end time is in the past
	if (endTime < new Date()) {
		showAlert('Không thể tạo lịch bận trong quá khứ', 'warning');
		return;
	}
	runBusySchedule2(ctx);
}

// Load my busy schedules
function loadMyBusySchedules() {
	// Kiểm tra currentUser đã load chưa
	if (!currentUser || !currentUser.id) {
		setTimeout(loadMyBusySchedules, 500); // Retry after 500ms
		return;
	}

	const status = $('#statusFilter').val();
	const revision = ++busyListRevision;

	const url = `/api/doctor-busy-schedules/my-busy-schedules?status=${encodeURIComponent(status)}`;

	$.ajax({
		url: url,
		method: 'GET',
		success: function (response) {
			if (revision !== busyListRevision) return;
			if (response.success) {
				renderBusySchedulesTable(response.data);
				filterTable();
			} else {
				showAlert('Không thể tải danh sách lịch bận', 'error');
			}
		},
		error: function (xhr) {
			if (revision !== busyListRevision) return;
			if (xhr.status === 401) {
				localStorage.removeItem('token');
				window.location.href = 'login.html';
			} else {
				showAlert('Có lỗi xảy ra khi tải dữ liệu', 'error');
			}
		}
	});
}

// Render busy schedules table
function renderBusySchedulesTable(schedules) {
	const tbody = $('#busySchedulesTableBody');

	// Store schedules globally for edit functionality
	currentBusySchedules = schedules;

	if (schedules.length === 0) {
		tbody.html(`
            <tr>
                <td colspan="5" class="text-center py-4">
                    <i class="bi bi-calendar-x text-muted busy-empty-icon"></i>
                    <p class="mt-2 mb-0 text-muted">Chưa có lịch bận nào</p>
                </td>
            </tr>
        `);
		return;
	}

	let html = '';
	schedules.forEach(schedule => {
		const startTime = new Date(schedule.start_datetime);
		const endTime = new Date(schedule.end_datetime);

		html += `
            <tr>
                <td>
                    <div class="status-indicator">
                        ${getStatusIndicator(startTime, endTime, schedule.status)}
                    </div>
                </td>
                <td>
                    <div class="fw-semibold">${formatTimeRangeReadable(startTime, endTime)}</div>
                </td>
                <td>
                    <span class="reason-badge">
                        ${window.QLPKSharedUtils.escapeHtml(schedule.reason || 'Không có lý do')}
                    </span>
                </td>
                <td>
                    <span class="text-muted">${formatDateTime(new Date(schedule.created_at))}</span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        ${schedule.status === 'active' ? `
                            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-outline-warning btn-sm" data-qlpk-call="editBusySchedule" data-qlpk-args='[${schedule.id}]' title="Chỉnh sửa">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-outline-danger btn-sm" data-qlpk-call="confirmDeleteBusySchedule" data-qlpk-args='[${schedule.id}]' title="Xóa">
                                <i class="bi bi-trash"></i>
                            </button>
                        ` : `
                            <button class="btn btn-outline-secondary btn-sm" disabled title="Không thể chỉnh sửa lịch bận đã hủy">
                                <i class="bi bi-lock"></i>
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
	});

	tbody.html(html);
}


// Get status text

// Format datetime
function formatDateTime(date) {
	return date.toLocaleString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}
