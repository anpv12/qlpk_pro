// Utility functions để tránh trùng lặp code

window.QLPKSharedUtils = window.QLPKSharedUtils || {};

window.QLPKSharedUtils.escapeHtml = function (value) {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
};

const AppointmentUtils = {
	// Hàm load doctors chung
	loadDoctors: function (selectElement, callback) {
		$.get('/users?role=doctor', function (res) {
			const doctors = res.items || res;
			selectElement.empty();
			selectElement.append('<option value="">Chọn bác sĩ</option>');
			doctors.forEach(d => {
				selectElement.append(`<option value="${d.id}">${window.QLPKHtml.escape(d.full_name || d.username)}</option>`);
			});
			if (typeof callback === 'function') callback();
		});
	},

	// Hàm format datetime
	formatDateTime: function (dateTimeStr) {
		const d = new Date(dateTimeStr);
		return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
	},

	// Hàm format date
	formatDate: function (dateStr) {
		const d = new Date(dateStr);
		return d.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });
	},

	// Hàm lấy status badge HTML
	getStatusBadge: function (status, className = '') {
		const statusMap = {
			scheduled: '<span class="badge qlpk-status--warning ' + className + '">Chờ xác nhận</span>',
			confirmed: '<span class="badge qlpk-status--success ' + className + '">Đã xác nhận</span>',
			in_progress: '<span class="badge qlpk-status--info ' + className + '">Đang khám</span>',
			completed: '<span class="badge qlpk-status--success ' + className + '">Đã khám</span>',
			cancelled: '<span class="badge qlpk-status--error ' + className + '">Hủy</span>',
			no_show: '<span class="badge qlpk-status--neutral ' + className + '">Không đến</span>'
		};
		return statusMap[status] || statusMap.scheduled;
	},

	// Hàm lấy status color
	getStatusColor: function (status) {
		const colorMap = {
			scheduled: '#6b7280',
			confirmed: '#059669',
			completed: '#2563eb',
			cancelled: '#dc2626',
			in_progress: '#ea580c',
			no_show: '#1f2937'
		};
		return colorMap[status] || colorMap.scheduled;
	},

	// Hàm lấy status text
	getStatusText: function (status) {
		const textMap = {
			scheduled: 'Chờ xác nhận',
			confirmed: 'Đã xác nhận',
			completed: 'Đã khám',
			cancelled: 'Hủy',
			in_progress: 'Quá hạn',
			no_show: 'Không đến'
		};
		return textMap[status] || textMap.scheduled;
	},

	// Hàm lấy status icon
	getStatusIcon: function (status) {
		const iconMap = {
			scheduled: '⏰',
			confirmed: '✅',
			completed: '🏁',
			cancelled: '❌',
			in_progress: '🔄',
			no_show: '🚫'
		};
		return iconMap[status] || iconMap.scheduled;
	},

	// Hàm lấy status badge class
	getStatusBadgeClass: function (status) {
		const classMap = {
			scheduled: 'qlpk-status--warning',
			confirmed: 'qlpk-status--success',
			completed: 'qlpk-status--success',
			cancelled: 'qlpk-status--error',
			in_progress: 'qlpk-status--info',
			no_show: 'qlpk-status--neutral'
		};
		return classMap[status] || classMap.scheduled;
	},

	// Hàm show toast notification
	showToast: function (type, message) {
		return window.QLPKUserFeedback?.show(type, message);
	},

	// Hàm parse local datetime
	parseLocalDateTime: function (dateTimeStr) {
		if (!dateTimeStr) return null;
		const d = new Date(dateTimeStr);
		const pad = n => String(Math.floor(Math.abs(n))).padStart(2, '0');
		return d.getFullYear() + '-' +
			pad(d.getMonth() + 1) + '-' +
			pad(d.getDate()) + 'T' +
			pad(d.getHours()) + ':' +
			pad(d.getMinutes()) + ':' +
			pad(d.getSeconds());
	},

	// Hàm format hiển thị ngày (dd/mm/yyyy) với zero-padding
	formatDateDisplay: function (value) {
		if (!value) return '';

		try {
			let dateObj;

			// Parse từ nhiều format
			if (typeof value === 'string' && value.includes('/')) {
				// Format dd/mm/yyyy hoặc d/m/yyyy
				const parts = value.split('/');
				if (parts.length === 3) {
					const day = parseInt(parts[0], 10);
					const month = parseInt(parts[1], 10);
					const year = parseInt(parts[2], 10);
					dateObj = new Date(year, month - 1, day);
				} else {
					return value; // Không parse được
				}
			} else if (typeof value === 'string' && value.includes('-')) {
				// Format YYYY-MM-DD
				dateObj = new Date(value);
			} else if (value instanceof Date) {
				dateObj = value;
			} else {
				return value; // Không parse được
			}

			// Validate date
			if (!dateObj || Number.isNaN(dateObj.getTime())) {
				return value; // Return original nếu invalid
			}

			// LUÔN format lại với zero padding (dd/mm/yyyy)
			const day = String(dateObj.getDate()).padStart(2, '0');
			const month = String(dateObj.getMonth() + 1).padStart(2, '0');
			const year = dateObj.getFullYear();

			return `${day}/${month}/${year}`;
		} catch (error) {
			console.error('formatDateDisplay error:', error, value);
			return value; // Return original nếu có lỗi
		}
	}
};

// Export cho sử dụng global
window.AppointmentUtils = AppointmentUtils;
window.formatDateDisplay = AppointmentUtils.formatDateDisplay;

if (typeof $ === "function") window.QLPKApiTransport.installJQuery($);
