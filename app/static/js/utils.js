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
				selectElement.append(`<option value="${d.id}">${d.full_name || d.username}</option>`);
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
			scheduled: '<span class="badge bg-warning ' + className + '">Chờ xác nhận</span>',
			confirmed: '<span class="badge bg-success ' + className + '">Đã xác nhận</span>',
			in_progress: '<span class="badge bg-info ' + className + '">Đang khám</span>',
			completed: '<span class="badge bg-success ' + className + '">Đã khám</span>',
			cancelled: '<span class="badge bg-danger ' + className + '">Hủy</span>',
			no_show: '<span class="badge bg-dark ' + className + '">Không đến</span>'
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
			scheduled: 'bg-warning',
			confirmed: 'bg-success',
			completed: 'bg-success',
			cancelled: 'bg-danger',
			in_progress: 'bg-info',
			no_show: 'bg-dark'
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

// Auto login function
function autoLogin() {
	return new Promise((resolve, reject) => {
		const username = localStorage.getItem('qlpk_username');
		const password = localStorage.getItem('qlpk_password');

		if (!username || !password) {
			reject(new Error('No stored credentials'));
			return;
		}

		$.ajax({
			url: '/auth/login',
			method: 'POST',
			contentType: 'application/json',
			data: JSON.stringify({
				username: username,
				password: password
			}),
			success: function (response) {
				if (response.access_token) {
					localStorage.setItem('qlpk_token', response.access_token);
					resolve(response);
				} else {
					reject(new Error('No token in response'));
				}
			},
			error: function (xhr, status, error) {
				reject(error);
			}
		});
	});
}

// Export autoLogin function globally
window.autoLogin = autoLogin;

// =============================
// Global Ajax Auth Handling
// =============================
// Tự động gắn Authorization header cho mọi request và xử lý 401 bằng cách
// auto-login (nếu có lưu credential) hoặc gọi /api/token/refresh rồi retry request.
(function () {
	let tokenRefreshInFlight = null;

	function getStoredToken() {
		try { return localStorage.getItem('qlpk_token') || ''; } catch (e) { return ''; }
	}

	function setStoredToken(token) {
		try { if (token) localStorage.setItem('qlpk_token', token); } catch (e) { }
	}

	function refreshToken() {
		if (tokenRefreshInFlight) return tokenRefreshInFlight;
		tokenRefreshInFlight = new Promise((resolve, reject) => {
			$.getJSON('/api/token/refresh')
				.done(function (res) {
					if (res && res.token) {
						setStoredToken(res.token);
						resolve(res.token);
					} else {
						reject(new Error('No token in refresh response'));
					}
				})
				.fail(function (xhr) {
					reject(new Error('Token refresh failed: ' + (xhr && xhr.status)));
				})
				.always(function () {
					// cho phép lần sau refresh lại nếu cần
					setTimeout(function () { tokenRefreshInFlight = null; }, 0);
				});
		});
		return tokenRefreshInFlight;
	}

	function obtainTokenIfMissing() {
		const existing = getStoredToken();
		if (existing) return Promise.resolve(existing);
		// Ưu tiên autoLogin nếu có lưu credential, fallback sang refresh token ẩn danh
		return (window.autoLogin ? window.autoLogin().catch(() => null) : Promise.resolve(null))
			.then(function (res) {
				if (res && res.access_token) return res.access_token;
				return refreshToken();
			});
	}

	// Gắn Authorization trước khi gửi request
	$(document).ajaxSend(function (_evt, jqXHR, settings) {
		const token = getStoredToken();
		if (token) {
			try { jqXHR.setRequestHeader('Authorization', 'Bearer ' + token); } catch (e) { }
		}
	});

	// Bắt lỗi 401 và tự retry một lần sau khi có token mới
	$(document).ajaxError(function (_evt, jqXHR, settings) {
		if (jqXHR && jqXHR.status === 401 && !settings._retried) {
			settings._retried = true;
			obtainTokenIfMissing()
				.then(function () {
					// Retry chính request vừa lỗi
					$.ajax(settings);
				})
				.catch(function () {
					// Không lấy được token -> chuyển sang trang đăng nhập
					try { window.location.href = '/login.html'; } catch (e) { }
				});
		}
	});

	// Khi trang tải xong, nếu chưa có token thì cố gắng lấy để tránh 401 ngay từ đầu
	$(function () {
		if (!getStoredToken()) {
			obtainTokenIfMissing().catch(function () { /* im lặng, để 401 handler xử lý tiếp */ });
		}
	});

	// =============================
	// Fetch wrapper: tự gắn Authorization và retry khi 401
	// =============================
	if (typeof window.fetch === 'function') {
		const originalFetch = window.fetch.bind(window);
		window.fetch = function (input, init) {
			init = init || {};
			init.headers = init.headers || {};
			// Chuẩn hóa headers thành đối tượng đơn giản
			const headers = new Headers(init.headers);
			const token = getStoredToken();
			if (token && !headers.has('Authorization')) {
				headers.set('Authorization', 'Bearer ' + token);
			}
			init.headers = headers;

			const doRequest = () => originalFetch(input, init);

			return doRequest().then(function (res) {
				if (res && res.status === 401 && !init._retried) {
					init._retried = true;
					return obtainTokenIfMissing()
						.then(function (newToken) {
							if (newToken) {
								const hdrs = new Headers(init.headers || {});
								hdrs.set('Authorization', 'Bearer ' + newToken);
								init.headers = hdrs;
							}
							return originalFetch(input, init);
						})
						.catch(function () {
							try { window.location.href = '/login.html'; } catch (e) { }
							return res; // trả về response 401 cũ nếu không thể xử lý
						});
				}
				return res;
			});
		};
	}
})();
