/* global currentBusySchedules, loadMyBusySchedules, normalizeSearchText */
/* exported deleteBusySchedule, filterTable, formatTimeRangeReadable, getStatusIndicator, resetForm, setQuickTimeSelection, showAlert */

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
		return '<span class="badge bg-secondary" title="Đã kết thúc">⏰</span>';
	} else if (startTime <= now && endTime >= now) {
		return '<span class="badge bg-danger" title="Đang diễn ra">🔴</span>';
	} else {
		return '<span class="badge bg-warning" title="Sắp diễn ra">⏳</span>';
	}
}

// Quick time selectors
function setQuickTime(type, buttonElement) {
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
	setQuickTimeSelection(buttonElement);
}

function setQuickTimeSelection(buttonElement) {
	$('#busyScheduleForm [data-qlpk-call="setQuickTime"]').removeClass('active').attr('aria-pressed', 'false');
	if (buttonElement) $(buttonElement).addClass('active').attr('aria-pressed', 'true');
}

// Filter table based on search and status
function filterTable() {
	if (!currentBusySchedules.length) return;
	const searchTerm = normalizeSearchText($('#searchInput').val());

	$('#busySchedulesTableBody tr').each(function () {
		const row = $(this);
		const timeText = normalizeSearchText(row.find('td:nth-child(2)').text());
		const reasonText = normalizeSearchText(row.find('td:nth-child(3)').text());
		let matchesSearch = true;

		// Search filter
		if (searchTerm) {
			matchesSearch = timeText.includes(searchTerm) || reasonText.includes(searchTerm);
		}

		if (matchesSearch) {
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
                            <strong>Lý do:</strong> ${window.QLPKSharedUtils.escapeHtml(schedule.reason || 'Không có lý do')}
                        </div>
                        <p class="text-danger"><small>Hành động này không thể hoàn tác!</small></p>
                    </div>
                    <div class="modal-footer">
                        <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" class="btn btn-danger" data-qlpk-call="deleteBusySchedule" data-qlpk-args='[${scheduleId}]'>
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
	$.ajax({
		url: `/api/doctor-busy-schedules/${scheduleId}`,
		method: 'DELETE',
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
