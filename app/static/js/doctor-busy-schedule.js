// Doctor Busy Schedule Management JavaScript

let currentUser = null;
let deleteScheduleId = null;
let currentBusySchedules = [];
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
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		window.location.href = 'login.html';
		return;
	}

	$.ajax({
		url: '/check/me',
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (response) {
			currentUser = response;
			updateSidebarUserInfo();
		},
		error: function (xhr) {
			if (xhr.status === 401) {
				localStorage.removeItem('qlpk_token');
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
		validateDateTimeInputs();
	});

	// Search functionality
	$('#searchInput').on('input', function () {
		filterTable();
	});

	// Status filter
	$('#statusFilter').on('change', function () {
		filterTable();
	});

	// Quick reason suggestions
	$('input[name="reason"]').on('focus', function () {
		showReasonSuggestions();
	});

	// Status filter change
	$('#statusFilter').on('change', function () {
		loadMyBusySchedules();
	});

	// Delete confirmation
	$('#confirmDeleteBtn').on('click', function () {
		if (deleteScheduleId) {
			deleteBusySchedule(deleteScheduleId);
		}
	});

	// Reset form button
	$('#resetFormBtn').on('click', function () {
		resetForm();
	});

	// Logout
	$('#logoutBtn').on('click', function () {
		localStorage.removeItem('token');
		window.location.href = 'login.html';
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
	if (typeof AppointmentUtils !== 'undefined' && typeof AppointmentUtils.showToast === 'function') {
		AppointmentUtils.showToast(type, message);
	} else {
		// Fallback if Utils not loaded
		const field = $(`input[name="${fieldName}"]`);
		const existingMsg = field.siblings('.validation-message');

		if (existingMsg.length) {
			existingMsg.remove();
		}

		const msgClass = type === 'error' ? 'text-danger' : 'text-success';
		const icon = type === 'error' ? 'bi-exclamation-triangle' : 'bi-check-circle';

		field.after(`<div class="validation-message small ${msgClass} mt-1"><i class="bi ${icon}"></i> ${message}</div>`);
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

	const token = localStorage.getItem('qlpk_token');

	$.ajax({
		url: '/api/doctor-busy-schedules/busy-reasons',
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
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
		error: function (xhr) {
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
		`<span class="badge bg-light text-dark me-1 suggestion-badge" title="Click để chọn">${reason}</span>`
	).join('');

	suggestionsContainer.html(`
        <span class="text-muted me-2">(${suggestions.length} lý do):</span>
        ${suggestionsHtml}
    `);

	// Add click handlers for suggestions
	$('.suggestion-badge').on('click', function () {
		reasonInput.val($(this).text());
		// Highlight selected suggestion
		$('.suggestion-badge').removeClass('bg-primary text-white');
		$(this).addClass('bg-primary text-white');
	});
}

// Create or update busy schedule
function createBusySchedule() {
	// Kiểm tra currentUser đã load chưa
	if (!currentUser || !currentUser.id) {
		showAlert('Đang tải thông tin người dùng, vui lòng thử lại sau', 'warning');
		return;
	}

	const formData = new FormData($('#busyScheduleForm')[0]);
	const data = {
		doctor_id: currentUser.id,
		start_datetime: formData.get('start_datetime'),
		end_datetime: formData.get('end_datetime'),
		reason: formData.get('reason')
	};

	// Validation
	if (!data.start_datetime || !data.end_datetime || !data.reason) {
		showAlert('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
		return;
	}

	// Check if start time is before end time
	const startTime = new Date(data.start_datetime);
	const endTime = new Date(data.end_datetime);

	if (startTime >= endTime) {
		showAlert('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc', 'warning');
		return;
	}

	// Check if end time is in the past
	if (endTime < new Date()) {
		showAlert('Không thể tạo lịch bận trong quá khứ', 'warning');
		return;
	}

	// Show loading state
	const submitBtn = $('#busyScheduleForm button[type="submit"]');
	const originalText = submitBtn.html();

	// Determine if this is create or update
	const isUpdate = window.editingScheduleId;
	const loadingText = isUpdate ? 'Đang cập nhật...' : 'Đang tạo...';
	submitBtn.prop('disabled', true).html(`<i class="spinner-border spinner-border-sm me-2"></i>${loadingText}`);

	const token = localStorage.getItem('qlpk_token');

	// Set URL and method based on operation
	const url = isUpdate ? `/api/doctor-busy-schedules/${window.editingScheduleId}` : '/api/doctor-busy-schedules';
	const method = isUpdate ? 'PUT' : 'POST';

	$.ajax({
		url: url,
		method: method,
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(data),
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
				localStorage.removeItem('qlpk_token');
				window.location.href = 'login.html';
				return;
			} else if (xhr.status === 500) {
				errorMessage = 'Không thể lưu lịch bận. Vui lòng thử lại.';
			}

			showAlert(errorMessage, 'error');
		}
	});
}

// Load my busy schedules
function loadMyBusySchedules() {
	// Kiểm tra currentUser đã load chưa
	if (!currentUser || !currentUser.id) {
		setTimeout(loadMyBusySchedules, 500); // Retry after 500ms
		return;
	}

	const token = localStorage.getItem('qlpk_token');
	const status = $('#statusFilter').val();

	let url = '/api/doctor-busy-schedules/my-busy-schedules';
	if (status !== 'all') {
		url += `?status=${status}`;
	}

	$.ajax({
		url: url,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (response) {
			if (response.success) {
				renderBusySchedulesTable(response.data);
			} else {
				showAlert('Không thể tải danh sách lịch bận', 'error');
			}
		},
		error: function (xhr) {
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
                <td colspan="4" class="text-center py-4">
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
                        ${schedule.reason || 'Không có lý do'}
                    </span>
                </td>
                <td>
                    <small class="text-muted">${formatDateTime(new Date(schedule.created_at))}</small>
                </td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        ${schedule.status === 'active' ? `
                            <button class="btn btn-outline-warning btn-sm" onclick="editBusySchedule(${schedule.id})" title="Chỉnh sửa">
                                <i class="bi bi-pencil"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteBusySchedule(${schedule.id})" title="Xóa">
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
function getStatusText(status) {
	const statusMap = {
		'active': 'Đang hoạt động',
		'cancelled': 'Đã hủy'
	};
	return statusMap[status] || status;
}

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

// Format time range for better readability
function formatTimeRange(startTime, endTime) {
	const startDate = startTime.toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});

	const startTimeStr = startTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const endTimeStr = endTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	// Nếu cùng ngày
	if (startTime.toDateString() === endTime.toDateString()) {
		return `${startTimeStr} - ${endTimeStr} ${startDate}`;
	} else {
		// Khác ngày
		const endDate = endTime.toLocaleDateString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
		return `${startTimeStr} ${startDate} - ${endTimeStr} ${endDate}`;
	}
}

// Format date range only
function formatDateRange(startTime, endTime) {
	const startDate = startTime.toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});

	// Nếu cùng ngày
	if (startTime.toDateString() === endTime.toDateString()) {
		return startDate;
	} else {
		// Khác ngày
		const endDate = endTime.toLocaleDateString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
		return `${startDate} - ${endDate}`;
	}
}

// Format time only
function formatTimeOnly(startTime, endTime) {
	const startTimeStr = startTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const endTimeStr = endTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	return `${startTimeStr} - ${endTimeStr}`;
}

// Format time range in a more readable way
function formatTimeRangeReadable(startTime, endTime) {

	const startDate = startTime.toLocaleDateString('vi-VN', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric'
	});

	const startTimeStr = startTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	const endTimeStr = endTime.toLocaleTimeString('vi-VN', {
		hour: '2-digit',
		minute: '2-digit'
	});

	// Nếu cùng ngày
	if (startTime.toDateString() === endTime.toDateString()) {
		const result = `Từ ${startTimeStr} đến ${endTimeStr} ngày ${startDate}`;
		return result;
	} else {
		// Khác ngày
		const endDate = endTime.toLocaleDateString('vi-VN', {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		});
		const result = `Từ ${startTimeStr} ${startDate} đến ${endTimeStr} ${endDate}`;
		return result;
	}
}

// Get status indicator with color
function getStatusIndicator(startTime, endTime, status) {
	const now = new Date();

	if (status === 'cancelled') {
		return '<span class="badge bg-secondary" title="Đã hủy">❌</span>';
	}

	if (endTime < now) {
		return '<span class="badge bg-muted" title="Đã kết thúc">⏰</span>';
	} else if (startTime <= now && endTime >= now) {
		return '<span class="badge bg-danger" title="Đang diễn ra">🔴</span>';
	} else {
		return '<span class="badge bg-warning" title="Sắp diễn ra">⏳</span>';
	}
}

// Quick time selectors
function setQuickTime(type) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	let startTime, endTime;

	switch (type) {
		case 'morning':
			startTime = new Date(today.getTime() + 8 * 60 * 60 * 1000); // 8:00
			endTime = new Date(today.getTime() + 12 * 60 * 60 * 1000); // 12:00
			break;
		case 'afternoon':
			startTime = new Date(today.getTime() + 13 * 60 * 60 * 1000); // 13:00
			endTime = new Date(today.getTime() + 17 * 60 * 60 * 1000); // 17:00
			break;
		case 'evening':
			startTime = new Date(today.getTime() + 18 * 60 * 60 * 1000); // 18:00
			endTime = new Date(today.getTime() + 22 * 60 * 60 * 1000); // 22:00
			break;
		case 'allday':
			startTime = new Date(today.getTime() + 8 * 60 * 60 * 1000); // 8:00
			endTime = new Date(today.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000); // 23:59
			break;
		case '2hours':
			startTime = new Date(now); // Từ bây giờ
			endTime = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2 giờ từ bây giờ
			break;
	}

	// Use helper to set value for Flatpickr
	if (typeof window.setDatepickerValue === 'function') {
		const startInput = document.querySelector('input[name="start_datetime"]');
		const endInput = document.querySelector('input[name="end_datetime"]');
		if (startInput) window.setDatepickerValue(startInput, startTime, true);
		if (endInput) window.setDatepickerValue(endInput, endTime, true);
	} else {
		// Fallback
		const formatForInput = (date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			return `${year}-${month}-${day}T${hours}:${minutes}`;
		};

		$('input[name="start_datetime"]').val(formatForInput(startTime));
		$('input[name="end_datetime"]').val(formatForInput(endTime));
	}

	// Highlight the selected button
	$('.btn-outline-primary').removeClass('active');
	$(event.target).addClass('active');
}

// Filter table based on search and status
function filterTable() {
	const searchTerm = normalizeSearchText($('#searchInput').val());
	const statusFilter = $('#statusFilter').val();

	$('#busySchedulesTableBody tr').each(function () {
		const row = $(this);
		const timeText = normalizeSearchText(row.find('td:nth-child(2)').text());
		const reasonText = normalizeSearchText(row.find('td:nth-child(3)').text());
		const statusBadge = row.find('.badge');

		let matchesSearch = true;
		let matchesStatus = true;

		// Search filter
		if (searchTerm) {
			matchesSearch = timeText.includes(searchTerm) || reasonText.includes(searchTerm);
		}

		// Status filter
		if (statusFilter !== 'all') {
			if (statusFilter === 'active') {
				matchesStatus = !statusBadge.hasClass('bg-secondary');
			} else if (statusFilter === 'cancelled') {
				matchesStatus = statusBadge.hasClass('bg-secondary');
			}
		}

		if (matchesSearch && matchesStatus) {
			row.show();
		} else {
			row.hide();
		}
	});
}

// Edit busy schedule
function editBusySchedule(scheduleId) {
	// Tìm schedule trong danh sách hiện tại
	const schedule = currentBusySchedules.find(s => s.id === scheduleId);
	if (!schedule) {
		showAlert('Không tìm thấy lịch bận', 'error');
		return;
	}

	// Điền dữ liệu vào form
	const startDate = new Date(schedule.start_datetime);
	const endDate = new Date(schedule.end_datetime);


	// Use helper to set value for Flatpickr
	if (typeof window.setDatepickerValue === 'function') {
		const startInput = document.querySelector('input[name="start_datetime"]');
		const endInput = document.querySelector('input[name="end_datetime"]');
		if (startInput) window.setDatepickerValue(startInput, startDate, true);
		if (endInput) window.setDatepickerValue(endInput, endDate, true);
	} else {
		// Format datetime cho input (local time)
		const formatForInput = (date) => {
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, '0');
			const day = String(date.getDate()).padStart(2, '0');
			const hours = String(date.getHours()).padStart(2, '0');
			const minutes = String(date.getMinutes()).padStart(2, '0');
			return `${year}-${month}-${day}T${hours}:${minutes}`;
		};

		const startDateTime = formatForInput(startDate);
		const endDateTime = formatForInput(endDate);

		// Điền form
		$('input[name="start_datetime"]').val(startDateTime);
		$('input[name="end_datetime"]').val(endDateTime);
	}
	$('input[name="reason"]').val(schedule.reason);

	// Lưu ID để update
	window.editingScheduleId = scheduleId;

	// Thay đổi button text
	$('button[type="submit"]').html('<i class="bi bi-check-lg me-2"></i>Cập nhật lịch bận');

	// Scroll to form
	$('html, body').animate({
		scrollTop: $('.card-header:first').offset().top - 100
	}, 500);

	showAlert('Đã load dữ liệu lịch bận để chỉnh sửa', 'info');
}

// Reset form to create mode
function resetForm() {
	$('#busyScheduleForm')[0].reset();
	window.editingScheduleId = null;
	$('button[type="submit"]').html('<i class="bi bi-plus-lg me-2"></i>Tạo lịch bận');
	$('.validation-message').remove();
	$('#reasonSuggestionsContainer').html('');
	showAlert('Đã reset form về chế độ tạo mới', 'info');
}

// Confirm delete busy schedule
function confirmDeleteBusySchedule(scheduleId) {
	const schedule = currentBusySchedules.find(s => s.id === scheduleId);
	if (!schedule) return;

	const startTime = new Date(schedule.start_datetime);
	const endTime = new Date(schedule.end_datetime);
	const timeRange = formatTimeRangeReadable(startTime, endTime);

	const modalHtml = `
        <div class="modal fade" id="deleteConfirmModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header bg-danger text-white">
                        <h5 class="modal-title"><i class="bi bi-exclamation-triangle me-2"></i>Xác nhận xóa</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <p>Bạn có chắc chắn muốn xóa lịch bận này?</p>
                        <div class="alert alert-warning">
                            <strong>Thời gian:</strong> ${timeRange}<br>
                            <strong>Lý do:</strong> ${schedule.reason || 'Không có lý do'}
                        </div>
                        <p class="text-danger"><small>Hành động này không thể hoàn tác!</small></p>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
                        <button type="button" class="btn btn-danger" onclick="deleteBusySchedule(${scheduleId})">
                            <i class="bi bi-trash me-1"></i>Xóa
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

	// Remove existing modal if any
	$('#deleteConfirmModal').remove();

	// Add modal to body
	$('body').append(modalHtml);

	// Show modal
	$('#deleteConfirmModal').modal('show');
}

// Delete busy schedule
function deleteBusySchedule(scheduleId) {
	const token = localStorage.getItem('qlpk_token');

	$.ajax({
		url: `/api/doctor-busy-schedules/${scheduleId}`,
		method: 'DELETE',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (response) {
			if (response.success) {
				showAlert('Xóa lịch bận thành công!', 'success');
				$('#deleteConfirmModal').modal('hide');
				loadMyBusySchedules();

				// Broadcast thay đổi cho các tab/component khác
				if (typeof window.notifyBusyScheduleChanged === 'function') {
					window.notifyBusyScheduleChanged();
				}
			} else {
				showAlert('Không thể xóa lịch bận. Vui lòng thử lại.', 'error');
			}
		},
		error: function (xhr) {
			const errorMessage = 'Không thể xóa lịch bận. Vui lòng thử lại.';
			showAlert(errorMessage, 'error');
		}
	});
}

// Show alert
function showAlert(message, type = 'info') {
	return window.QLPKUserFeedback?.show(type, message, { duration: 5000 });
}
