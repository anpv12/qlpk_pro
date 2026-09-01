// Order Management - Quản lý chỉ định CLS

// Configuration constants for DASS-21 survey
const DASS21_CONFIG = {
	ANSWER_MAP: {
		'0': 'Không bao giờ',
		'1': 'Đôi khi',
		'2': 'Thường xuyên',
		'3': 'Luôn luôn'
	},
	DEFAULT_ANSWER: 'Không trả lời'
};

// Global variables
let currentPage = 1;
let perPage = 50;
let totalPages = 1;
let totalOrders = 0;
let selectedOrderIds = new Set();
let currentOrderDetail = null;

// Survey realtime context for modal refresh
let lastKnownSurveyStatus = null;
let currentExaminationId = null;

// Handler reference cho noteNurseTextarea autosave (để có thể remove listener)
let noteNurseBlurHandler = null;

// Handler reference cho orderStatusSelect autosave (để có thể remove listener)
let orderStatusChangeHandler = null;

// Filter state
const filterState = {
	patient_name: '',
	from_date: '',
	to_date: '',
	status: 'sent', // Mặc định hiển thị "Chuyển thực hiện"
	location_type: '' // Thay đổi mặc định từ 'in' thành '' để hiển thị tất cả
};

const ORDER_STATUS_OPTIONS = [
	{ value: '', label: 'Tất cả trạng thái' },
	{ value: 'sent', label: 'Chuyển thực hiện' },
	{ value: 'completed', label: 'Hoàn thành' },
	{ value: 'processing', label: 'Đang xử lý' },
];
const RESULT_FILE_MAX_BYTES = 25 * 1024 * 1024;
const RESULT_FILE_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx']);
const FILTER_INPUT_DEBOUNCE_MS = 200; // Giảm từ 400ms xuống 200ms để search nhanh hơn
let filterInputTimer = null;
let patientInputHandler = null; // Store handler reference for cleanup
let patientInputKeydownHandler = null; // Store keydown handler reference for cleanup

// Helper: Get auth header
function getAuthHeader() {
	try {
		let raw = localStorage.getItem('qlpk_token') || localStorage.getItem('token') || sessionStorage.getItem('qlpk_token');
		if (!raw) return null;
		if (raw.trim().startsWith('{')) {
			const obj = JSON.parse(raw);
			const t = obj.access_token || obj.token || obj.Authorization || obj.authorization;
			return t ? `Bearer ${t.replace(/^Bearer\s+/i, '')}` : null;
		}
		return raw.startsWith('Bearer ') ? raw : `Bearer ${raw}`;
	} catch (e) {
		return null;
	}
}

// API call wrapper
function apiCall(url, options = {}) {
	const auth = getAuthHeader();
	const defaultOptions = {
		headers: {
			'Content-Type': 'application/json',
			...(auth ? { 'Authorization': auth } : {})
		}
	};

	const finalOptions = {
		...defaultOptions,
		...options,
		headers: {
			...(defaultOptions.headers || {}),
			...(options.headers || {})
		}
	};

	return fetch(url, finalOptions)
		.then(response => {
			if (response.status === 401) {
				window.location.href = '/login.html';
			}
			return response;
		});
}

// Toast notification
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

// Confirm dialog với SweetAlert2
async function showConfirmDialog({
	title = 'Xác nhận',
	text = 'Bạn có chắc chắn muốn thực hiện?',
	icon = 'warning',
	confirmText = 'Xác nhận',
	cancelText = 'Hủy bỏ',
	variant = 'danger'
} = {}) {
	if (typeof Swal === 'undefined') {
		return confirm(text);
	}

	const allowedVariants = new Set(['danger', 'warning', 'primary', 'success']);
	const confirmVariant = allowedVariants.has(variant) ? variant : 'danger';

	const result = await Swal.fire({
		title: title,
		text: text,
		icon: icon,
		showCancelButton: true,
		confirmButtonText: confirmText,
		cancelButtonText: cancelText,
		buttonsStyling: false,
		reverseButtons: true,
		focusCancel: true,
		customClass: {
			container: 'qlpk-confirm-container',
			popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${confirmVariant}`,
			icon: 'qlpk-confirm-dialog__icon',
			title: 'qlpk-confirm-dialog__title',
			htmlContainer: 'qlpk-confirm-dialog__text',
			actions: 'qlpk-confirm-dialog__actions',
			confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${confirmVariant}`,
			cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
		}
	});

	return result.isConfirmed;
}

// Hàm hiển thị ngày giờ (dd/mm/yyyy HH:mm)
function formatDisplayDate(dateString) {
	if (!dateString) return '—';
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '—';

		// Dùng window.formatDateDisplay cho phần ngày
		const datePart = window.formatDateDisplay(date);

		// Thêm phần giờ
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${datePart} ${hours}:${minutes}`;
	} catch (e) {
		return dateString;
	}
}

// Hàm hiển thị chỉ ngày (dd/mm/yyyy)
function formatDateOnly(dateString) {
	if (!dateString) return '—';
	try {
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '—';
		return window.formatDateDisplay(date);
	} catch (e) {
		return dateString;
	}
}

// Get status badge HTML
function getStatusBadge(status) {
	const statusMap = {
		'sent': { class: 'sent', label: 'Chuyển thực hiện' },
		'processing': { class: 'processing', label: 'Đang xử lý' },
		'completed': { class: 'completed', label: 'Hoàn thành' },
		'draft': { class: 'sent', label: 'Dự thảo' }
	};

	const config = statusMap[status] || { class: 'sent', label: status };
	return `<span class="status-pill ${config.class}">${config.label}</span>`;
}

// Load danh sách chỉ định
async function loadOrders() {
	try {
		// Build query params
		const params = new URLSearchParams();
		if (filterState.patient_name) params.append('patient_name', filterState.patient_name);
		if (filterState.from_date) params.append('from_date', filterState.from_date);
		if (filterState.to_date) params.append('to_date', filterState.to_date);
		if (filterState.status) params.append('status', filterState.status);
		if (filterState.location_type) params.append('location_type', filterState.location_type);
		params.append('page', currentPage);
		params.append('per_page', perPage);

		const response = await apiCall(`/api/chi-dinh?${params.toString()}`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error('API Error Response:', response.status, errorText);
			let error;
			try {
				error = JSON.parse(errorText);
			} catch (e) {
				error = { detail: errorText || 'Lỗi không xác định' };
			}
			throw new Error(error.detail || 'Lỗi khi tải danh sách chỉ định');
		}

		const data = await response.json();
		const orders = data.chi_dinh || [];
		totalOrders = data.total || 0;
		totalPages = data.total_pages || 1;
		currentPage = data.page || 1;

		renderOrdersTable(orders);
		updateSelectedCount();

	} catch (error) {
		console.error('Error loading orders:', error);
		showCustomToast('error', 'Không thể tải danh sách chỉ định. Vui lòng thử lại.');
		renderOrdersTable([]);
	}
}

// Render orders table
function renderOrdersTable(orders) {
	const tbody = document.querySelector('#ordersTableBody');
	if (!tbody) return;

	if (orders.length === 0) {
		tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center py-4 text-navy">
                    <i class="bi bi-inbox om-empty-icon"></i>
                    <p class="mt-2 mb-0">Chưa có chỉ định nào</p>
                </td>
            </tr>
        `;
		return;
	}

	tbody.innerHTML = orders.map((order, index) => {
		const patient = order.patient || {};
		const doctor = order.doctor || {};
		const appointment = order.appointment || {};

		const patientName = patient.full_name || '—';
		const patientPhone = patient.phone || 'Chưa có';
		const orderName = order.order_name || '—';
		const doctorName = doctor.full_name || doctor.name || '—';
		const createdDate = formatDisplayDate(order.created_at);
		const statusBadge = getStatusBadge(order.status);
		const orderId = order.id;
		const isSelected = selectedOrderIds.has(orderId);

		return `
            <tr data-order-id="${orderId}">
                <td>${(currentPage - 1) * perPage + index + 1}</td>
                <td>
                    <div class="fw-semibold">
                        <a href="#" class="text-decoration-none order-detail-link" data-order-id="${orderId}">${escapeHtml(patientName)}</a>
                    </div>
                    <small class="text-navy">SĐT: ${escapeHtml(patientPhone)}</small>
                </td>
                <td>${escapeHtml(orderName)}</td>
                <td>${escapeHtml(doctorName)}</td>
                <td>${createdDate}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary btn-action-icon order-detail-btn" 
                                data-order-id="${orderId}" 
                                title="Chi tiết">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-danger btn-action-icon order-delete-btn" 
                                data-order-id="${orderId}" 
                                title="Xóa">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
	}).join('');

	// Update total count in header
	const headerCount = document.querySelector('.order-card h4');
	if (headerCount) {
		headerCount.textContent = `Danh sách chỉ định CLS (${totalOrders})`;
	}
	const statTotal = document.getElementById('stat-total');
	if (statTotal) {
		statTotal.textContent = totalOrders;
	}

	// Attach event listeners
	attachTableEventListeners();
}

// Escape HTML
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Attach event listeners to table
function attachTableEventListeners() {
	// Checkbox select
	document.querySelectorAll('.order-select').forEach(checkbox => {
		checkbox.addEventListener('change', function () {
			const orderId = parseInt(this.dataset.orderId);
			if (this.checked) {
				selectedOrderIds.add(orderId);
			} else {
				selectedOrderIds.delete(orderId);
			}
			updateSelectAllCheckbox();
			updateSelectedCount();
		});
	});

	// Detail button
	document.querySelectorAll('.order-detail-btn, .order-detail-link').forEach(btn => {
		btn.addEventListener('click', async function (e) {
			e.preventDefault();
			const orderId = parseInt(this.dataset.orderId);
			await loadOrderDetail(orderId);
		});
	});

	// Delete button
	document.querySelectorAll('.order-delete-btn').forEach(btn => {
		btn.addEventListener('click', async function (e) {
			e.preventDefault();
			const orderId = parseInt(this.dataset.orderId);
			await deleteOrder(orderId);
		});
	});
}

// Update select all checkbox
function updateSelectAllCheckbox() {
	const selectAll = document.getElementById('selectAllOrders');
	if (!selectAll) return;

	const allCheckboxes = document.querySelectorAll('.order-select');
	const checkedCount = document.querySelectorAll('.order-select:checked').length;

	selectAll.checked = allCheckboxes.length > 0 && checkedCount === allCheckboxes.length;
	selectAll.indeterminate = checkedCount > 0 && checkedCount < allCheckboxes.length;
}

// Update selected count (Legacy function name, now just updates totals)
function updateSelectedCount() {
	const footer = document.querySelector('.order-card__footer');
	if (footer) {
		footer.innerHTML = `
            <span>${totalOrders} chỉ định / ${totalPages} trang</span>
        `;
	}
}

// Load order detail
async function loadOrderDetail(orderId) {
	try {
		clearSurveyRealtimeContext();

		const response = await apiCall(`/api/chi-dinh/${orderId}`);

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi tải chi tiết chỉ định');
		}

		const order = await response.json();
		currentOrderDetail = order;

		renderOrderDetailModal(order);

		// Show modal
		const modalEl = document.getElementById('orderDetailModal');
		if (!modalEl) {
			throw new Error('Modal element not found');
		}

		const modal = new bootstrap.Modal(modalEl);

		// Setup survey tab listener after modal is shown
		modalEl.addEventListener('shown.bs.modal', function () {
			// Setup listener after modal is fully shown
			setTimeout(() => {
				setupSurveyTabListener();
				initializeSurveyRealtimeContext();
			}, 100);
		}, { once: true });

		// Clear modal realtime context when hidden and reload orders list
		modalEl.addEventListener('hidden.bs.modal', function () {
			clearSurveyRealtimeContext();

			// Reset currentOrderDetail để tránh hiển thị data cũ khi mở modal mới
			currentOrderDetail = null;
			isSurveyTabLoading = false;

			// Clear nội dung tab Khảo sát để tránh hiển thị data cũ
			const surveyContent = document.getElementById('surveyContent');
			if (surveyContent) {
				surveyContent.innerHTML = '<div class="text-center text-navy py-5"><p>Đang tải...</p></div>';
			}

			// Reset về tab "Thông tin" mặc định
			const infoTab = document.getElementById('info-tab');
			const surveyTab = document.getElementById('survey-tab');
			const infoPane = document.getElementById('info');
			const surveyPane = document.getElementById('survey');

			if (infoTab && surveyTab) {
				infoTab.classList.add('active');
				surveyTab.classList.remove('active');
			}
			if (infoPane && surveyPane) {
				infoPane.classList.add('show', 'active');
				surveyPane.classList.remove('show', 'active');
			}

			// Set filter status to "Chuyển thực hiện" (sent)
			filterState.status = 'sent';

			// Update filter select dropdown
			const statusSelect = document.getElementById('filterStatus');
			if (statusSelect) {
				statusSelect.value = 'sent';
			}

			// Reload orders list to get latest data
			loadOrders();
		}, { once: false });

		modal.show();

	} catch (error) {
		console.error('Error loading order detail:', error);
		showCustomToast('error', 'Không thể tải chi tiết chỉ định. Vui lòng thử lại.');
	}
}

// Render order detail modal
function renderOrderDetailModal(order) {
	const patient = order.patient || {};
	const doctor = order.doctor || {};
	const appointment = order.appointment || {};

	const birthYear = patient.date_of_birth ? new Date(patient.date_of_birth).getFullYear() : null;
	const age = birthYear ? new Date().getFullYear() - birthYear : null;

	// Update patient info
	const patientInfoHtml = `
		<div class="om-patient-summary">
			<div class="mb-2 d-flex align-items-center gap-2">
				<span class="om-patient-name">${escapeHtml(patient.full_name || '—')}</span>
				${age ? `<span class="badge om-patient-age-badge">${age} tuổi</span>` : ''}
			</div>
			<div class="d-flex justify-content-between mb-2">
				<span class="om-patient-meta-label">Điện thoại</span>
				<span class="om-patient-meta-value">${escapeHtml(patient.phone || 'Chưa có')}</span>
			</div>
			<div class="d-flex justify-content-between mb-2">
				<span class="om-patient-meta-label">Ngày sinh</span>
				<span class="om-patient-meta-value">${formatDateOnly(patient.date_of_birth)}</span>
			</div>
			<div class="d-flex justify-content-between mb-2">
				<span class="om-patient-meta-label">Ngày ra chỉ định</span>
				<span class="om-patient-meta-value">${formatDateOnly(order.created_at)}</span>
			</div>
			</div>
	`;

	const patientInfoEl = document.getElementById('orderPatientInfo');
	if (patientInfoEl) {
		patientInfoEl.innerHTML = patientInfoHtml;
	}

	// Update note nurse và setup autosave listener
	const noteNurseEl = document.getElementById('noteNurseTextarea');
	if (noteNurseEl) {
		// Remove listener cũ nếu có (tránh duplicate)
		if (noteNurseBlurHandler) {
			noteNurseEl.removeEventListener('blur', noteNurseBlurHandler);
			noteNurseBlurHandler = null;
		}

		// Set value
		noteNurseEl.value = order.note_nurse || '';
		noteNurseEl.dataset.orderId = order.id;

		// Tạo handler mới và lưu reference
		noteNurseBlurHandler = async function () {
			if (currentOrderDetail) {
				const newValue = this.value.trim();
				const oldValue = (currentOrderDetail.note_nurse || '').trim();

				// Chỉ lưu nếu giá trị thay đổi
				if (newValue !== oldValue) {
					try {
						await updateOrderNote(currentOrderDetail.id, 'note_nurse', newValue);
						currentOrderDetail.note_nurse = newValue;
					} catch (error) {
						console.error('Error auto-saving note_nurse:', error);
					}
				}
			}
		};

		// Gắn listener mới
		noteNurseEl.addEventListener('blur', noteNurseBlurHandler);
	}

	// Update order status và setup autosave listener
	const orderStatusSelect = document.getElementById('orderStatusSelect');
	if (orderStatusSelect) {
		// Remove listener cũ nếu có (tránh duplicate)
		if (orderStatusChangeHandler) {
			orderStatusSelect.removeEventListener('change', orderStatusChangeHandler);
			orderStatusChangeHandler = null;
		}

		// Set value
		orderStatusSelect.value = order.status || 'sent';

		// Tạo handler mới và lưu reference
		orderStatusChangeHandler = async function () {
			if (currentOrderDetail) {
				const newValue = this.value;
				const oldValue = currentOrderDetail.status || 'sent';

				// Chỉ lưu nếu giá trị thay đổi
				if (newValue !== oldValue) {
					try {
						await updateOrderNote(currentOrderDetail.id, 'status', newValue);
						currentOrderDetail.status = newValue;
						// Reload timeline để hiển thị status mới
						renderTimeline(currentOrderDetail);
					} catch (error) {
						console.error('Error auto-saving status:', error);
						// Revert về giá trị cũ nếu lỗi
						this.value = oldValue;
					}
				}
			}
		};

		// Gắn listener mới
		orderStatusSelect.addEventListener('change', orderStatusChangeHandler);
	}

	// Render result files
	renderResultFiles(order.result_files || []);

	// Render timeline (có thể từ note_nurse hoặc tạo riêng)
	renderTimeline(order);

	// Survey tab listener will be setup after modal is shown
}

// Setup survey tab listener
function setupSurveyTabListener() {
	try {
		const surveyTab = document.getElementById('survey-tab');
		const surveyContent = document.getElementById('surveyContent');

		if (!surveyTab) {
			console.warn('Survey tab element not found');
			return;
		}

		if (!surveyContent) {
			console.warn('Survey content element not found');
			return;
		}

		// Remove existing listener to avoid duplicates (use named function for proper removal)
		const existingHandler = surveyTab._surveyTabHandler;
		if (existingHandler) {
			surveyTab.removeEventListener('shown.bs.tab', existingHandler);
		}

		// Store handler reference for future removal
		surveyTab._surveyTabHandler = handleSurveyTabShow;
		surveyTab.addEventListener('shown.bs.tab', handleSurveyTabShow);
	} catch (error) {
		console.error('Error setting up survey tab listener:', error);
	}
}

// Handle survey tab show
let isSurveyTabLoading = false; // Prevent duplicate calls
async function handleSurveyTabShow() {
	// Prevent duplicate calls
	if (isSurveyTabLoading) {
		// Prevent duplicate calls
		return;
	}

	if (!currentOrderDetail || !currentOrderDetail.appointment) {
		renderSurveyTabContent('<div class="text-center text-navy py-5"><p>Không có thông tin khảo sát</p></div>');
		return;
	}

	const appointment = currentOrderDetail.appointment;
	const appointmentId = appointment.id;
	if (!appointmentId) {
		renderSurveyTabContent('<div class="text-center text-navy py-5"><p>Không có thông tin khảo sát</p></div>');
		return;
	}

	const indicationTemplateId = Number(currentOrderDetail.survey_template_id) || null;
	if (!indicationTemplateId) {
		renderSurveyTabContent('<div class="text-center text-navy py-5"><p>Chỉ định này nhập text, không gắn mẫu khảo sát.</p></div>');
		return;
	}

	isSurveyTabLoading = true;

	// Show loading
	renderSurveyTabContent(`
        <div class="text-center text-navy py-5">
            <i class="bi bi-hourglass-split display-4 mb-3 d-block"></i>
            <p>Đang tải thông tin khảo sát...</p>
        </div>
    `);

	try {
		let examinationId = null;

		// Try to get examination_id from appointment.examinations if available
		if (appointment.examinations && appointment.examinations.length > 0) {
			examinationId = appointment.examinations[0].id;
		}

		// If not found in appointment object, try API call
		if (!examinationId) {
			// Call endpoint (blueprint has no url_prefix, so route is /examinations/...)
			const examIdResponse = await apiCall(`/examinations/appointment/${appointmentId}/id`);

			// If not found, show message and return gracefully
			if (!examIdResponse.ok) {
				if (examIdResponse.status === 404) {
					renderSurveyTabContent('<div class="text-center text-navy py-5"><p>Chưa có lịch khám nào cho chỉ định này</p></div>');
					return;
				} else {
					const errorData = await examIdResponse.json().catch(() => ({ detail: 'Lỗi không xác định' }));
					throw new Error(errorData.detail || errorData.error || 'Lỗi khi tải thông tin khám');
				}
			}

			const examIdData = await examIdResponse.json();
			examinationId = examIdData.examination_id;
		}

		if (!examinationId) {
			renderSurveyTabContent('<div class="text-center text-navy py-5"><p>Chưa có lịch khám nào cho chỉ định này</p></div>');
			return;
		}

		// The indication is the canonical source for the survey template.
		const templateResponse = await apiCall(`/api/survey-templates/${indicationTemplateId}/public`);
		if (!templateResponse.ok) {
			throw new Error('Lỗi khi tải mẫu khảo sát');
		}

		const templateData = await templateResponse.json();
		const templates = templateData.data ? [templateData.data] : [];
		if (!templates.length) {
			throw new Error('Không tìm thấy mẫu khảo sát của chỉ định');
		}

		// Get survey session status
		let surveySession = null;
		let sessionDetailData = null;

		// Check if we have cached session data from recent generation
		const cachedSessionKey = `survey_session_${examinationId}`;
		const cachedData = sessionStorage.getItem(cachedSessionKey);
		if (cachedData) {
			try {
				sessionDetailData = JSON.parse(cachedData);
			} catch (e) {
				sessionStorage.removeItem(cachedSessionKey);
			}
		}

		try {
			// Correct API endpoint: /api/survey-sessions/{examination_id}/status
			const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status`);

			if (sessionResponse && sessionResponse.ok) {
				const sessionData = await sessionResponse.json();
				surveySession = sessionData.data || sessionData;

				// Check if status is 'not_started' - means no session exists yet (this is normal)
				if (surveySession && surveySession.status === 'not_started') {
					surveySession = null; // Treat as no session
				} else if (surveySession) {
					// If we have cached detail data (with URL and QR), merge it
					if (sessionDetailData) {
						surveySession.survey_url = sessionDetailData.survey_url;
						surveySession.qr_code = sessionDetailData.qr_code;
						surveySession.template_id = sessionDetailData.template_id;
					} else if (surveySession.session_token) {
						// Generate URL and QR code from session_token
						const baseUrl = window.location.origin;
						const patientId = currentOrderDetail.patient?.id;
						if (patientId) {
							const templateParam = indicationTemplateId ? `&template_id=${indicationTemplateId}` : '';
							surveySession.survey_url = `${baseUrl}/patient-survey.html?patient_id=${patientId}&examination_id=${examinationId}&session_token=${surveySession.session_token}${templateParam}`;
						}
					}
				}
			} else if (sessionResponse && sessionResponse.status === 404) {
				// 404 means endpoint not found (should not happen, but handle gracefully)
			} else {
				// Any other error - log but don't throw
				const status = sessionResponse ? sessionResponse.status : 'unknown';
				console.warn('Error getting survey session status (status:', status, ') - continuing without session');
			}
		} catch (e) {
			// Silently handle errors - no session is a valid state
			// Don't log error to console as it's expected when no session exists
			// Survey session check failed - this is ok if no session exists
		}

		// Use cached detail data if available (fallback if no session from API)
		if (!surveySession && sessionDetailData) {
			surveySession = sessionDetailData;
		}

		// Get patient info
		const patient = currentOrderDetail.patient || {};
		const patientId = patient.id;

		// Check session status - only show results if session is closed or completed
		const sessionStatus = surveySession?.status || surveySession?.data?.status;
		const isSessionClosed = sessionStatus === 'closed' || sessionStatus === 'completed';

		// Only fetch and display results if session is closed
		if (isSessionClosed) {
			// Get survey responses for this examination
			const surveyResponse = await apiCall(`/api/survey-responses/examination/${examinationId}`);
			let allSurveyResponses = [];

			if (surveyResponse.ok) {
				const surveyData = await surveyResponse.json();
				allSurveyResponses = surveyData.data || surveyData.responses || [];


			}

			// If we have responses, render results
			if (allSurveyResponses.length > 0) {
				await renderSurveyResultsWithFullUI(allSurveyResponses, templates, surveySession, appointment);
				return;
			}
		}

		// If no responses OR session not closed yet, show selection UI (with close button if session exists)
		renderSurveySelectionUI(examinationId, templates, surveySession, appointment);

	} catch (error) {
		console.error('Error loading survey data:', error);
		renderSurveyTabContent(`
            <div class="text-center text-danger py-5">
                <i class="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
                <p>Không thể tải thông tin khảo sát. Vui lòng thử lại.</p>
            </div>
        `);
	} finally {
		isSurveyTabLoading = false;
	}
}

// Render survey tab content
function renderSurveyTabContent(html) {
	try {
		const surveyContent = document.getElementById('surveyContent');
		if (!surveyContent) {
			console.warn('Survey content element not found when rendering');
			return;
		}
		// Clear content first to prevent any accumulation
		surveyContent.innerHTML = '';
		// Then set new content
		surveyContent.innerHTML = html;
	} catch (error) {
		console.error('Error rendering survey tab content:', error);
	}
}

// Render survey selection UI (when no survey results yet)
function renderSurveySelectionUI(examinationId, templates, surveySession, appointment) {
	const patient = currentOrderDetail.patient || {};
	const patientId = patient.id;
	const orderDate = currentOrderDetail.created_at;
	const indicationTemplateId = Number(currentOrderDetail.survey_template_id) || null;

	// Get survey session details (URL and QR code)
	let surveyUrl = '';
	let qrCode = '';
	let expiresAt = '';

	if (surveySession) {
		// Get URL and QR from survey session
		surveyUrl = surveySession.survey_url || surveySession.url || '';
		qrCode = surveySession.qr_code || '';

		// If no URL but have session_token, generate URL
		if (!surveyUrl && surveySession.session_token && examinationId) {
			const baseUrl = window.location.origin;
			const templateParam = indicationTemplateId ? `&template_id=${indicationTemplateId}` : '';
			surveyUrl = `${baseUrl}/patient-survey.html?patient_id=${patientId}&examination_id=${examinationId}&session_token=${surveySession.session_token}${templateParam}`;
		}

		if (surveySession.expires_at) {
			const expDate = new Date(surveySession.expires_at);
			expiresAt = expDate.toLocaleString('vi-VN');
		}
	}

	// Determine status and button states
	// hasActiveSession = true if we have surveyUrl or qrCode or session with valid status
	let hasActiveSession = !!(surveyUrl || qrCode || (surveySession && surveySession.session_token));

	let statusBadge = '';

	// Get session status for conditional rendering
	let sessionStatus = null;
	if (hasActiveSession && surveySession) {
		sessionStatus = surveySession.status || surveySession.data?.status;
		if (sessionStatus === 'pending' || sessionStatus === 'not_started') {
			statusBadge = '<span class="survey-status-badge pending small"><i class="bi bi-clock"></i> Chờ bệnh nhân điền</span>';
		} else if (sessionStatus === 'in_progress') {
			statusBadge = '<span class="survey-status-badge in-progress small"><i class="bi bi-hourglass-split"></i> Đang điền</span>';
		} else if (sessionStatus === 'closed' || sessionStatus === 'completed') {
			statusBadge = '<span class="survey-status-badge completed small"><i class="bi bi-check-circle"></i> Đã hoàn thành</span>';
		} else {
			// Session exists but no status - still consider it active (cached data)
			statusBadge = '<span class="survey-status-badge pending small"><i class="bi bi-clock"></i> Đã gửi</span>';
		}
	} else if (hasActiveSession) {
		// We have URL/QR but no surveySession object (cached only)
		statusBadge = '<span class="survey-status-badge pending small"><i class="bi bi-clock"></i> Đã gửi</span>';
	} else {
		statusBadge = '<span class="survey-status-badge pending small"><i class="bi bi-x-circle"></i> Chưa gửi</span>';
	}

	// Only the template linked to this indication is valid here.
	const linkedTemplate = templates[0];
	const templateOptions = `<option value="${linkedTemplate.id}" selected>${escapeHtml(linkedTemplate.name || '—')}</option>`;

	// Build QR and Link section HTML
	let qrAndLinkHtml = '';
	if (surveyUrl) {
		qrAndLinkHtml = `
            <div class="card-wrap">
                <div class="row g-3">
                    ${qrCode ? `
                    <div class="col-md-6">
                        <div class="text-center">
                            <h6 class="fw-semibold">
                                <i class="bi bi-qr-code me-2"></i>Mã QR
                            </h6>
                            <div class="mb-2"><img src="${qrCode}" alt="QR Code" class="img-fluid om-survey-qr"></div>
                            <small class="text-navy">Quét mã QR để truy cập khảo sát</small>
                        </div>
                    </div>
                    ` : ''}
                    <div class="${qrCode ? 'col-md-6' : 'col-md-12'}">
                        <h6 class="fw-semibold mb-3">
                            <i class="bi bi-link-45deg me-2"></i>Link khảo sát
                        </h6>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control form-control-sm om-survey-link-input" id="surveyLinkInput" value="${escapeHtml(surveyUrl)}" readonly>
                            <button class="btn btn-outline-primary btn-sm" type="button" id="copySurveyLinkBtn">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </div>
                        ${expiresAt ? `<small class="text-navy">Hết hạn: ${expiresAt}</small>` : ''}
                    </div>
                </div>
            </div>
        `;
	}

	const html = `
        <div class="mt-2">
            <div class="card-wrap mb-3">
                <div class="row g-3 align-items-center">
                    <div class="col-md-8">
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label small text-navy mb-1">Trạng thái khảo sát</label>
                                <div>${statusBadge}</div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-navy mb-1">Thời gian hoàn thành</label>
                                <div class="small">
                                    <strong>—</strong>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label small text-navy mb-1">Ngày chỉ định</label>
                                <div class="small">
                                    <strong>${formatDateOnly(orderDate)}</strong>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="d-flex gap-2">
                            <button class="btn btn-primary btn-sm flex-fill" id="sendSurveyLinkBtn">
                                <i class="bi bi-link-45deg me-1"></i>Gửi link khảo sát
                            </button>
                            ${hasActiveSession && sessionStatus !== 'closed' && sessionStatus !== 'completed' ? `
                            <button class="btn btn-danger btn-sm flex-fill" id="closeSurveySessionBtn">
                                <i class="bi bi-lock me-1"></i>Kết thúc khảo sát
                            </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
            
            <div class="card-wrap mb-3">
                <label class="view-field-label">Mẫu khảo sát</label>
                <select class="form-select om-survey-template-select" id="surveyTemplateSelect" disabled>
                    ${templateOptions}
                </select>
                <small class="text-navy d-block mt-1 om-survey-helper-text">Mẫu khảo sát lấy từ chỉ định đã chọn.</small>
            </div>
            
            ${qrAndLinkHtml}
        </div>
    `;

	renderSurveyTabContent(html);

	// The linked template is read-only; only the send action is interactive.
	try {
		const sendBtn = document.getElementById('sendSurveyLinkBtn');
		const closeBtn = document.getElementById('closeSurveySessionBtn');
		const copyBtn = document.getElementById('copySurveyLinkBtn');

		if (sendBtn) {
			sendBtn.addEventListener('click', async () => {
				try {
					await sendSurveyLink(examinationId, patientId, indicationTemplateId);
				} catch (error) {
					console.error('Error in send survey link handler:', error);
					showCustomToast('error', 'Lỗi khi gửi link khảo sát');
				}
			});
		}

		// Attach event listener for close survey session button
		if (closeBtn) {
			closeBtn.addEventListener('click', async () => {
				try {
					await closeSurveySession(examinationId, patientId);
				} catch (error) {
					console.error('Error in close survey session handler:', error);
					showCustomToast('error', 'Lỗi khi kết thúc khảo sát');
				}
			});
		}

		if (copyBtn) {
			copyBtn.addEventListener('click', () => {
				try {
					copySurveyLink();
				} catch (error) {
					console.error('Error copying survey link:', error);
					showCustomToast('error', 'Lỗi khi copy link khảo sát');
				}
			});
		}
	} catch (error) {
		console.error('Error attaching survey event listeners:', error);
	}
}

// Send survey link
async function sendSurveyLink(examinationId, patientId, templateId) {
	try {
		if (!templateId) {
			showCustomToast('error', 'Vui lòng chọn mẫu khảo sát');
			return;
		}
		const linkedTemplateId = Number(currentOrderDetail?.survey_template_id) || null;
		if (linkedTemplateId && Number(templateId) !== linkedTemplateId) {
			showCustomToast('error', 'Mẫu khảo sát không khớp với chỉ định.');
			return;
		}

		// Fix: Clear cache cũ khi đổi template để tránh render sai template
		const cachedSessionKey = `survey_session_${examinationId}`;
		sessionStorage.removeItem(cachedSessionKey);

		showCustomToast('info', 'Đang tạo link khảo sát...');

		// Send template_id to API so it can be included in the survey URL
		const response = await apiCall('/api/survey-sessions/generate', {
			method: 'POST',
			body: JSON.stringify({
				patient_id: patientId,
				examination_id: examinationId,
				template_id: templateId  // Include template_id in request
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Lỗi không xác định' }));
			throw new Error(errorData.message || 'Lỗi khi tạo link khảo sát');
		}

		const data = await response.json();
		if (data.success && data.data) {
			showCustomToast('success', 'Đã tạo link khảo sát thành công. Khảo sát đã được reset về trạng thái chưa hoàn thành.');

			// Cache session data with URL and QR code, also save template_id
			const cachedSessionKey = `survey_session_${examinationId}`;
			const sessionDataToCache = {
				...data.data,
				template_id: templateId // Save the selected template_id
			};
			sessionStorage.setItem(cachedSessionKey, JSON.stringify(sessionDataToCache));
		} else {
			showCustomToast('success', 'Đã tạo link khảo sát thành công');
		}

		// Clear any previous response data and reload survey tab
		// This ensures the tab shows the selection UI instead of results
		await handleSurveyTabShow();

	} catch (error) {
		console.error('Error sending survey link:', error);
		showCustomToast('error', 'Không thể gửi liên kết khảo sát. Vui lòng thử lại.');
	}
}

// Close survey session
async function closeSurveySession(examinationId, patientId) {
	try {
		// Get current session to get session_token
		const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status`);

		if (!sessionResponse || !sessionResponse.ok) {
			showCustomToast('error', 'Không tìm thấy phiên khảo sát để kết thúc');
			return;
		}

		const sessionData = await sessionResponse.json();
		const session = sessionData.data || sessionData;

		if (!session || session.status === 'not_started') {
			showCustomToast('error', 'Chưa có phiên khảo sát nào để kết thúc. Vui lòng tạo khảo sát trước.');
			return;
		}

		if (session.status === 'closed' || session.status === 'completed') {
			showCustomToast('info', 'Khảo sát đã được kết thúc rồi');
			return;
		}

		if (!session.session_token) {
			showCustomToast('error', 'Không tìm thấy session token để kết thúc khảo sát');
			return;
		}

		// Show confirmation using browser confirm (simple approach)
		const confirmed = confirm('Bạn có chắc chắn muốn kết thúc khảo sát? Bệnh nhân sẽ không thể chỉnh sửa hoặc gửi kết quả mới.');
		if (!confirmed) {
			return;
		}

		showCustomToast('info', 'Đang kết thúc khảo sát...');

		// Call close API
		const closeResponse = await apiCall(`/api/survey-sessions/close/${session.session_token}`, {
			method: 'POST'
		});

		if (!closeResponse.ok) {
			const errorData = await closeResponse.json().catch(() => ({ message: 'Lỗi không xác định' }));
			throw new Error(errorData.message || 'Lỗi khi kết thúc khảo sát');
		}

		const closeData = await closeResponse.json();

		if (closeData.success) {
			showCustomToast('success', 'Khảo sát đã được kết thúc thành công');

			// Clear cached session data
			const cachedSessionKey = `survey_session_${examinationId}`;
			sessionStorage.removeItem(cachedSessionKey);

			// Reload survey tab - will now show results if available
			await handleSurveyTabShow();
		} else {
			showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
		}

	} catch (error) {
		console.error('Error closing survey session:', error);
		showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
	}
}

// Render survey results with full UI (header + dropdown + results)
async function renderSurveyResultsWithFullUI(surveyResponses, templates, surveySession, appointment) {
	if (!surveyResponses || surveyResponses.length === 0) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	// Debug log


	// Remove duplicate responses based on response ID
	const seenResponseIds = new Set();
	const uniqueResponses = surveyResponses.filter(response => {
		// Use response.id if available, otherwise create unique key
		const responseId = response.id ||
			`${response.survey_template_id}_${response.created_at}_${response.updated_at}` ||
			`${response.survey_template_id}_${Date.now()}_${Math.random()}`;
		if (seenResponseIds.has(responseId)) {
			return false; // Skip duplicate
		}
		seenResponseIds.add(responseId);
		return true;
	});

	// Sort ALL responses by creation date (latest first) - không phân biệt template
	uniqueResponses.sort((a, b) => {
		const dateA = new Date(a.created_at || a.updated_at || 0);
		const dateB = new Date(b.created_at || b.updated_at || 0);
		return dateB - dateA; // Latest first
	});
	const indicationTemplateId = Number(currentOrderDetail?.survey_template_id) || null;
	const linkedResponses = indicationTemplateId
		? uniqueResponses.filter(response => Number(response.survey_template_id) === indicationTemplateId)
		: [];

	// Debug: Log all responses with their template_id and total_scores


	// Tìm response mới nhất có total_scores không rỗng
	let latestResponse = null;
	for (const response of linkedResponses) {
		const hasScores = response.total_scores && Object.keys(response.total_scores).length > 0;
		if (hasScores) {
			latestResponse = response;
			break; // Dùng response đầu tiên có scores (mới nhất do đã sort)
		}
	}

	// Fallback: Nếu không có response nào có scores, dùng response mới nhất
	if (!latestResponse && linkedResponses.length > 0) {
		latestResponse = linkedResponses[0];
		console.warn(`⚠️ [FALLBACK] Không tìm thấy response có total_scores, dùng response mới nhất ID ${latestResponse.id} (total_scores: ${JSON.stringify(latestResponse.total_scores)})`);
	}

	if (!latestResponse) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	const latestTemplate = templates.find(template => Number(template.id) === indicationTemplateId);

	if (!latestTemplate) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	// Debug: Log template match

	// Render header and the read-only linked template once.
	const orderDate = currentOrderDetail.created_at;
	const completedAt = latestResponse.updated_at;

	let statusBadge = '';
	if (completedAt) {
		statusBadge = '<span class="survey-status-badge completed small"><i class="bi bi-check-circle"></i> Đã hoàn thành</span>';
	} else {
		statusBadge = '<span class="survey-status-badge pending small"><i class="bi bi-clock"></i> Chờ bệnh nhân điền</span>';
	}

	const templateOptions = `<option value="${latestTemplate.id}" selected>${escapeHtml(latestTemplate.name || '—')}</option>`;

	// Render header and the read-only linked template once.
	let html = `
        <div class="mt-2">
            <div class="row g-3 mb-4 align-items-center">
                <div class="col-md-8">
                    <div class="row g-3">
                        <div class="col-md-4">
                            <label class="form-label small text-navy mb-1">Trạng thái khảo sát</label>
                            <div>${statusBadge}</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small text-navy mb-1">Thời gian hoàn thành</label>
                            <div class="small">
                                <strong>${formatDisplayDate(completedAt)}</strong>
                            </div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small text-navy mb-1">Ngày chỉ định</label>
                            <div class="small">
                                <strong>${formatDateOnly(orderDate)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="d-flex gap-2">
                        <button class="btn btn-primary btn-sm flex-fill" id="sendSurveyLinkBtnResults">
                            <i class="bi bi-link-45deg me-1"></i>Gửi link khảo sát
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="row g-3 mb-4">
                <div class="col-md-12">
                    <label class="form-label fw-semibold">Mẫu khảo sát</label>
                    <select class="form-select" id="surveyTemplateSelectResults" disabled>
                        ${templateOptions}
                    </select>
                    <small class="text-navy d-block mt-1">Mẫu khảo sát lấy từ chỉ định đã chọn.</small>
                </div>
            </div>
    `;

	// Render chỉ 1 card cho response mới nhất
	const cardHtml = await renderSingleSurveyResultCard(latestTemplate, latestResponse);
	// Only add if card is not empty
	if (cardHtml && cardHtml.trim()) {
		html += cardHtml;
	}

	html += '</div>';

	renderSurveyTabContent(html);

	// Load saved survey levels after content is in DOM
	setTimeout(() => {
		loadSavedSurveyLevels(latestResponse.examination_id);
	}, 150);

	// Attach only the send action; the linked template is read-only.
	try {
		const sendBtnResults = document.getElementById('sendSurveyLinkBtnResults');
		const appointmentData = currentOrderDetail.appointment || {};
		const patientId = currentOrderDetail.patient?.id;
		const appointmentId = appointmentData.id;

		// Helper function to get examinationId
		const getExaminationId = async () => {
			let examId = appointmentData.examinations?.[0]?.id || null;
			if (!examId && appointmentId) {
				const examResponse = await apiCall(`/examinations/appointment/${appointmentId}/id`);
				if (examResponse.ok) {
					const examData = await examResponse.json();
					examId = examData.examination_id || examData.id;
				}
			}
			return examId;
		};

		const handleSendSurveyLink = async () => {
			const examId = await getExaminationId();
			if (examId) {
				await sendSurveyLink(examId, patientId, indicationTemplateId);
			} else {
				showCustomToast('error', 'Không tìm thấy lần khám để gửi link khảo sát');
			}
		};

		if (sendBtnResults && appointmentId && patientId) {
			sendBtnResults.addEventListener('click', async () => {
				try {
					await handleSendSurveyLink();
				} catch (error) {
					console.error('Error in send survey link handler (results view):', error);
					showCustomToast('error', 'Lỗi khi gửi link khảo sát');
				}
			});
		}
	} catch (error) {
		console.error('Error attaching event listener for results view:', error);
	}
}

// Summarize patient answers for order management (dynamic criteria support)
function summarizePatientAnswersForOrderManagement(template, response) {
	const summary = {
		criteria: {}, // Dynamic criteria storage
		scores: {}
	};

	if (!template.questions_by_criteria) {
		return summary;
	}

	const answerTextMap = DASS21_CONFIG.ANSWER_MAP;
	const totalScores = response.total_scores || {};


	// Process all criteria dynamically from template
	Object.keys(template.questions_by_criteria).forEach(criteria => {
		const questions = template.questions_by_criteria[criteria];

		// Initialize criteria if not exists
		if (!summary.criteria[criteria]) {
			summary.criteria[criteria] = [];
		}

		// Get score for this criteria (try multiple formats)
		const criteriaScore = totalScores[criteria] ||
			totalScores[criteria.toLowerCase()] ||
			totalScores[criteria.toLowerCase().replace(/\s+/g, '_')] ||
			0;



		// Store score
		summary.scores[criteria] = criteriaScore;

		// Process questions for this criteria
		questions.forEach(question => {
			// Fix: Hỗ trợ cả grid questions (dùng question_id hoặc id)
			const rowId = question.question_id || question.id;
			const questionIdStr = rowId ? String(rowId) : null;

			// Fix: Tìm answerValue - hỗ trợ cả grid format (criteria_1, criteria_2) và normal format
			let answerValue = null;
			if (response.responses) {
				// Thử tìm trực tiếp bằng question_id hoặc id
				if (questionIdStr && response.responses[questionIdStr] !== undefined) {
					answerValue = response.responses[questionIdStr];
				} else {
					// Grid format: tìm theo pattern criteria_index (ví dụ: stress_1, stress_2)
					const criteriaLower = criteria.toLowerCase();
					const matchingKey = Object.keys(response.responses).find(key => {
						// Match pattern: criteria_index hoặc criteriaIndex
						return key.startsWith(`${criteriaLower}_`) ||
							key.startsWith(`${criteria}_`) ||
							key === `${criteriaLower}${question.index || ''}` ||
							key === `${criteria}${question.index || ''}`;
					});
					if (matchingKey) {
						answerValue = response.responses[matchingKey];
					}
				}
			}

			if (answerValue !== undefined && answerValue !== null) {
				// Fix: Mapping an toàn hơn - convert sang string
				const answerValueStr = String(answerValue);
				const answerText = answerTextMap[answerValueStr] || DASS21_CONFIG.DEFAULT_ANSWER;
				const questionText = question.text || question.question || '';
				const remainingText = questionText.replace(/^Tôi\s+/, ''); // Bỏ "Tôi " ở đầu
				const summarizedAnswer = `Bệnh nhân ${answerText} ${remainingText}`;

				summary.criteria[criteria].push({
					question: questionText,
					answer: answerText,
					// Fix: Không dùng answerValue làm score, score đã có trong total_scores
					score: null, // Score per question không cần thiết, đã có criteriaScore ở trên
					summarized: summarizedAnswer
				});
			}
		});
	});

	return summary;
}

// Render survey results by criteria (dynamic criteria support)
function renderSurveyResultsByCriteria(template, response) {
	const summary = summarizePatientAnswersForOrderManagement(template, response);

	// Get all criteria dynamically from template
	const allCriteria = Object.keys(template.questions_by_criteria || {});

	if (allCriteria.length === 0) {
		return '<div class="text-navy p-3">Không có tiêu chí nào trong mẫu khảo sát</div>';
	}

	let html = '';

	// Render each criteria dynamically
	allCriteria.forEach(criteriaName => {
		const answers = summary.criteria[criteriaName] || [];
		const score = summary.scores[criteriaName] || 0;

		// Normalize criteria name for use as key (for saving levels)
		// Use criteria name as-is, but sanitize for HTML id
		const criteriaKey = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

		// Format title: uppercase and add prefix if needed
		const title = criteriaName.toUpperCase();

		html += `
            <div class="survey-criteria-section">
                <div class="criteria-header">${escapeHtml(title)}</div>
                <div class="criteria-content">
                    <div class="criteria-left">
                        ${answers.length > 0 ?
				answers.map(answer => `<div class="symptom-item">• ${escapeHtml(answer.summarized)}</div>`).join('') :
				'<div class="text-navy">Chưa có dữ liệu</div>'
			}
                    </div>
                    <div class="criteria-right">
                        <div class="scale-result">
                            <div class="score-display" title="Tổng số điểm ghi nhận">
                                <span class="score-label">Tổng số điểm ghi nhận:</span>
                                <span class="score-value">${score}</span>
                            </div>
                            <div class="level-display">
                                <span class="level-label">Mức độ ghi nhận:</span>
                                <input type="text" 
                                       class="form-control form-control-sm level-input" 
                                       placeholder="Nhập mức độ" 
                                       data-criteria="${escapeHtml(criteriaName)}" 
                                       data-criteria-key="${criteriaKey}"
                                       id="level-input-${criteriaKey}-${response.id}"
                                       onchange="saveSurveyLevelForOrder('${escapeHtml(criteriaName)}', '${response.examination_id}', this)"
                                       oninput="updateLevelInputAlignment(this)">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
	});

	return html;
}

// Render single survey result card (ONLY the "Kết quả khảo sát" card, no header)
async function renderSingleSurveyResultCard(template, response) {
	const completedAt = response.updated_at ? new Date(response.updated_at) : null;

	// Only render if we have completed survey
	if (!completedAt || !template.questions_by_criteria) {
		return '';
	}

	// Render survey results by criteria (new format matching mockup)
	const criteriaResultsHtml = renderSurveyResultsByCriteria(template, response);

	return `
        <div class="survey-result-card mt-4">
            <h6 class="fw-semibold mb-3">
                <i class="bi bi-graph-up me-2"></i>Kết quả khảo sát
            </h6>
            ${criteriaResultsHtml}
        </div>
    `;
}

// Render result files
function renderResultFiles(files) {
	const listContainer = document.getElementById('resultFilesListContainer');
	const fileCountBadge = document.getElementById('fileCountBadge');
	
	if (fileCountBadge) {
		fileCountBadge.textContent = files.length;
	}
	
	if (!listContainer) return;

	if (files.length === 0) {
		listContainer.innerHTML = '<div class="om-file-empty">Chưa có file đính kèm</div>';
	} else {
		const filesList = files.map(file => {
            const ext = (file.original_filename || file.filename || '').split('.').pop().toUpperCase();
            let badgeClass = 'bg-secondary';
            if (ext === 'PDF') badgeClass = 'bg-danger';
            if (ext === 'DOC' || ext === 'DOCX') badgeClass = 'bg-primary';
            if (ext === 'JPG' || ext === 'PNG') badgeClass = 'bg-success';
            
            return `
            <tr class="om-file-row">
                <td><span class="fw-semibold text-dark om-file-name">${escapeHtml(file.original_filename || file.filename)}</span></td>
                <td><span class="badge ${badgeClass} bg-opacity-25 text-dark border om-file-type-badge">${ext}</span></td>
                <td>${formatDateOnly(file.created_at)}</td>
                <td>
                    <button class="btn btn-sm text-secondary result-file-download" data-file-id="${file.id}" title="Tải xuống"><i class="bi bi-eye"></i></button>
                    <button class="btn btn-sm text-secondary result-file-delete" data-file-id="${file.id}" title="Xóa"><i class="bi bi-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');

		listContainer.innerHTML = `
            <table class="table table-borderless table-hover align-middle mb-0 mt-3 om-file-table">
                <thead>
                    <tr class="om-file-table-head">
                        <th class="text-uppercase om-file-table-th om-file-table-th--first">Tên tập tin</th>
                        <th class="text-uppercase om-file-table-th">Loại</th>
                        <th class="text-uppercase om-file-table-th">Ngày tải</th>
                        <th class="text-uppercase om-file-table-th om-file-table-th--last">Thao tác</th>
                    </tr>
                </thead>
                <tbody>
                    ${filesList}
                </tbody>
            </table>
        `;
	}

    // Attach event listeners for the static upload area
	const fileInput = document.getElementById('fileInput');
	const selectBtn = document.getElementById('selectFileBtn');
	const uploadArea = document.getElementById('resultFilesUploadArea');

	if (selectBtn && fileInput && !selectBtn._hasListener) {
		selectBtn.addEventListener('click', () => fileInput.click());
		fileInput.addEventListener('change', handleFileSelect);
        selectBtn._hasListener = true;
	}

	// Attach drag & drop handlers
	if (uploadArea && !uploadArea._hasListener) {
		['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
			uploadArea.addEventListener(eventName, preventDefaults, false);
		});
		['dragenter', 'dragover'].forEach(eventName => {
			uploadArea.addEventListener(eventName, highlight, false);
		});
		['dragleave', 'drop'].forEach(eventName => {
			uploadArea.addEventListener(eventName, unhighlight, false);
		});
		uploadArea.addEventListener('drop', handleDrop, false);
		uploadArea.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        uploadArea._hasListener = true;
	}

	// Attach file action listeners
	document.querySelectorAll('.result-file-download').forEach(btn => {
		btn.addEventListener('click', async function () {
			const fileId = this.dataset.fileId;
			await downloadResultFile(currentOrderDetail.id, fileId);
		});
	});

	document.querySelectorAll('.result-file-delete').forEach(btn => {
		btn.addEventListener('click', async function () {
			const fileId = this.dataset.fileId;
			await deleteResultFile(currentOrderDetail.id, fileId);
		});
	});
}

// Drag & drop helper functions
function preventDefaults(e) {
	e.preventDefault();
	e.stopPropagation();
}

function highlight(e) {
	const uploadArea = document.getElementById('resultFilesUploadArea');
	if (uploadArea) {
		uploadArea.classList.add('drag-over');
	}
}

function unhighlight(e) {
	const uploadArea = document.getElementById('resultFilesUploadArea');
	if (uploadArea) {
		uploadArea.classList.remove('drag-over');
	}
}

async function handleDrop(e) {
	const dt = e.dataTransfer;
	const files = dt.files;

	if (files.length === 0) return;

	if (!currentOrderDetail || !currentOrderDetail.id) {
		showCustomToast('error', 'Vui lòng chọn chỉ định trước');
		return;
	}

	// Process first file only
	const file = files[0];

	if (!validateResultFile(file)) return;

	await uploadResultFile(currentOrderDetail.id, file);
}

// Format file size
function formatFileSize(bytes) {
	if (!bytes) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function validateResultFile(file) {
	const extension = String(file?.name || '').split('.').pop().toLowerCase();
	if (!RESULT_FILE_EXTENSIONS.has(extension)) {
		showCustomToast('error', 'Loại file không được hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX');
		return false;
	}
	if (Number(file?.size || 0) > RESULT_FILE_MAX_BYTES) {
		showCustomToast('error', 'File không được vượt quá 25MB');
		return false;
	}
	return true;
}

// Handle file select
async function handleFileSelect(event) {
	const file = event.target.files[0];
	if (!file) return;

	if (!currentOrderDetail || !currentOrderDetail.id) {
		showCustomToast('error', 'Vui lòng chọn chỉ định trước');
		return;
	}
	if (!validateResultFile(file)) return;

	await uploadResultFile(currentOrderDetail.id, file);
	event.target.value = ''; // Reset input
}

// Upload result file
async function uploadResultFile(orderId, file) {
	try {
		const formData = new FormData();
		formData.append('file', file);

		const auth = getAuthHeader();
		const response = await fetch(`/api/chi-dinh/${orderId}/upload-result`, {
			method: 'POST',
			headers: {
				...(auth ? { 'Authorization': auth } : {})
			},
			body: formData
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi upload file');
		}

		const data = await response.json();
		showCustomToast('success', 'Upload file thành công');

		// Update danh sách file ngay từ response
		if (data.chi_dinh && data.chi_dinh.result_files) {
			// Cập nhật currentOrderDetail
			if (currentOrderDetail) {
				currentOrderDetail.result_files = data.chi_dinh.result_files;
			}
			// Render lại danh sách file từ dữ liệu mới
			renderResultFiles(data.chi_dinh.result_files);
		} else {
			// Fallback: refresh lại file list từ API nếu response không có đủ dữ liệu
			try {
				const refreshResponse = await apiCall(`/api/chi-dinh/${orderId}`);
				if (refreshResponse.ok) {
					const order = await refreshResponse.json();
					if (currentOrderDetail) {
						currentOrderDetail.result_files = order.result_files || [];
					}
					renderResultFiles(order.result_files || []);
				}
			} catch (error) {
				console.error('Error refreshing result files:', error);
			}
		}

	} catch (error) {
		console.error('Error uploading file:', error);
		showCustomToast('error', 'Không thể tải tệp lên. Vui lòng thử lại.');
	}
}

// Delete result file
async function deleteResultFile(orderId, fileId) {
	const confirmed = await showConfirmDialog({
		title: 'Xóa file kết quả',
		text: 'Bạn có chắc muốn xóa file này?',
		confirmText: 'Xóa',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall(`/api/chi-dinh/${orderId}/result-files/${fileId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa file');
		}

		showCustomToast('success', 'Xóa file thành công');

		// Update result files list without reloading entire modal
		if (currentOrderDetail && currentOrderDetail.result_files) {
			currentOrderDetail.result_files = currentOrderDetail.result_files.filter(f => f.id !== fileId);
			renderResultFiles(currentOrderDetail.result_files);
		} else {
			// Fallback: reload order detail if currentOrderDetail is not available
			await loadOrderDetail(orderId);
		}

	} catch (error) {
		console.error('Error deleting file:', error);
		showCustomToast('error', 'Không thể xóa tệp. Vui lòng thử lại.');
	}
}

// Download result file
async function downloadResultFile(orderId, fileId) {
	try {
		const auth = getAuthHeader();
		const response = await fetch(`/api/chi-dinh/${orderId}/result-files/${fileId}/download`, {
			headers: {
				...(auth ? { 'Authorization': auth } : {})
			}
		});

		if (!response.ok) {
			throw new Error('Lỗi khi tải file');
		}

		const blob = await response.blob();
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		// Get filename from response headers
		const contentDisposition = response.headers.get('Content-Disposition');
		let filename = 'download';
		if (contentDisposition) {
			const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
			if (filenameMatch) {
				filename = filenameMatch[1];
			}
		}

		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

	} catch (error) {
		console.error('Error downloading file:', error);
		showCustomToast('error', 'Lỗi khi tải file');
	}
}

// Render timeline
function renderTimeline(order) {
	const timelineEl = document.querySelector('#orderDetailModal .timeline');
	if (!timelineEl) return;

	const timeOnly = order.created_at ? formatDisplayDate(order.created_at).split(' ')[1] : '';

	const isSurveyOrder = Number(order.survey_template_id) > 0;
	const steps = isSurveyOrder
		? [
			{ title: 'Tạo chỉ định', sub: timeOnly ? `Hoàn thành lúc ${timeOnly}` : '', status: 'done' },
			{ title: 'Gửi khảo sát', sub: 'Chưa gửi', status: 'active' },
			{ title: 'Bệnh nhân hoàn thành', sub: '', status: 'pending' },
			{ title: 'Có kết quả', sub: '', status: 'pending' },
		]
		: [
			{ title: 'Tạo chỉ định', sub: timeOnly ? `Hoàn thành lúc ${timeOnly}` : '', status: 'done' },
			{ title: 'Chuyển thực hiện', sub: order.status === 'processing' ? 'Đang xử lý' : 'Đã chuyển', status: order.status === 'processing' ? 'active' : 'done' },
			{ title: 'Có kết quả', sub: '', status: 'pending' },
		];

	if (isSurveyOrder && order.status === 'completed') {
		const updateTimeOnly = order.updated_at ? formatDisplayDate(order.updated_at).split(' ')[1] : '';
		steps[1] = { title: 'Gửi khảo sát', sub: 'Hoàn thành', status: 'done' };
		steps[2] = { title: 'Bệnh nhân hoàn thành', sub: 'Hoàn thành', status: 'done' };
		steps[3] = { title: 'Có kết quả', sub: updateTimeOnly ? `Lúc ${updateTimeOnly}` : '', status: 'done' };
	}
	if (!isSurveyOrder && order.status === 'completed') {
		const updateTimeOnly = order.updated_at ? formatDisplayDate(order.updated_at).split(' ')[1] : '';
		steps[1] = { title: 'Chuyển thực hiện', sub: 'Hoàn thành', status: 'done' };
		steps[2] = { title: 'Có kết quả', sub: updateTimeOnly ? `Lúc ${updateTimeOnly}` : '', status: 'done' };
	}

	timelineEl.innerHTML = steps.map(step => `
		<div class="timeline-item ${step.status}">
			<div class="fw-semibold om-timeline-step-title">${step.title}</div>
			${step.sub ? `<div class="om-timeline-step-sub">${step.sub}</div>` : ''}
		</div>
	`).join('');
}

// Update order note
async function updateOrderNote(orderId, noteType, noteValue) {
	try {
		const updateData = {};
		updateData[noteType] = noteValue;


		const response = await apiCall(`/api/chi-dinh/${orderId}`, {
			method: 'PUT',
			body: JSON.stringify(updateData)
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi cập nhật');
		}

		const result = await response.json();

		// Hiển thị message phù hợp với từng loại update
		if (noteType === 'status') {
			showCustomToast('success', 'Cập nhật trạng thái thành công');
		} else if (noteType === 'note_nurse') {
			showCustomToast('success', 'Đã lưu ghi chú xử lý');
		} else {
			showCustomToast('success', 'Cập nhật thành công');
		}

		return result;

	} catch (error) {
		console.error(`❌ Error updating ${noteType}:`, error);
		showCustomToast('error', 'Không thể cập nhật chỉ định. Vui lòng thử lại.');
		throw error; // Re-throw để caller có thể handle
	}
}

// Delete order
async function deleteOrder(orderId) {
	const confirmed = await showConfirmDialog({
		title: 'Xóa chỉ định',
		text: 'Bạn có chắc muốn xóa chỉ định này?',
		confirmText: 'Xóa',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall(`/api/chi-dinh/${orderId}`, {
			method: 'DELETE'
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa chỉ định');
		}

		showCustomToast('success', 'Xóa chỉ định thành công');
		selectedOrderIds.delete(orderId);
		await loadOrders();

	} catch (error) {
		console.error('Error deleting order:', error);
		showCustomToast('error', 'Không thể xóa chỉ định. Vui lòng thử lại.');
	}
}

// Batch delete
async function batchDeleteOrders() {
	if (selectedOrderIds.size === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một chỉ định để xóa');
		return;
	}

	const confirmed = await showConfirmDialog({
		title: 'Xóa nhiều chỉ định',
		text: `Bạn có chắc muốn xóa ${selectedOrderIds.size} chỉ định đã chọn?`,
		confirmText: 'Xóa tất cả',
		icon: 'warning'
	});
	if (!confirmed) return;

	try {
		const response = await apiCall('/api/chi-dinh/batch-delete', {
			method: 'POST',
			body: JSON.stringify({
				ids: Array.from(selectedOrderIds)
			})
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ detail: 'Lỗi không xác định' }));
			throw new Error(error.detail || 'Lỗi khi xóa chỉ định');
		}

		showCustomToast('success', `Đã xóa ${selectedOrderIds.size} chỉ định thành công`);
		selectedOrderIds.clear();
		await loadOrders();

	} catch (error) {
		console.error('Error batch deleting:', error);
		showCustomToast('error', 'Không thể xóa chỉ định. Vui lòng thử lại.');
	}
}

// Apply filters
function applyFilters() {
	const patientNameValue = document.getElementById('filterPatientName')?.value || '';
	filterState.patient_name = patientNameValue;
	filterState.from_date = document.getElementById('filterFromDate')?.value || '';
	filterState.to_date = document.getElementById('filterToDate')?.value || '';
	filterState.status = document.getElementById('filterStatus')?.value || '';
	filterState.location_type = ''; // Thay đổi từ 'in' thành '' để không filter mặc định

	currentPage = 1;
	loadOrders();
}

function scheduleFilterApply() {
	if (filterInputTimer) {
		clearTimeout(filterInputTimer);
	}
	filterInputTimer = setTimeout(() => {
		applyFilters();
	}, FILTER_INPUT_DEBOUNCE_MS);
}

// Handle Enter key để search ngay lập tức (không cần chờ debounce)
function handlePatientInputKeydown(event) {
	if (event.key === 'Enter') {
		// Cancel debounce timer
		if (filterInputTimer) {
			clearTimeout(filterInputTimer);
			filterInputTimer = null;
		}
		// Search ngay lập tức
		applyFilters();
		// Prevent form submission nếu có
		event.preventDefault();
	}
}

function setupAutoFilterListeners() {
	const patientInput = document.getElementById('filterPatientName');
	const fromDateInput = document.getElementById('filterFromDate');
	const toDateInput = document.getElementById('filterToDate');
	const statusSelect = document.getElementById('filterStatus');


	if (patientInput) {
		// Remove existing listener if any
		if (patientInputHandler) {
			patientInput.removeEventListener('input', patientInputHandler);
		}
		if (patientInputKeydownHandler) {
			patientInput.removeEventListener('keydown', patientInputKeydownHandler);
		}
		// Create new handlers
		patientInputHandler = scheduleFilterApply;
		patientInputKeydownHandler = handlePatientInputKeydown;
		patientInput.addEventListener('input', patientInputHandler);
		// Thêm Enter key để search ngay lập tức
		patientInput.addEventListener('keydown', patientInputKeydownHandler);
	} else {
		console.error('[Filter Setup] filterPatientName element not found!');
	}
	if (fromDateInput) {
		fromDateInput.addEventListener('change', applyFilters);
	}
	if (toDateInput) {
		toDateInput.addEventListener('change', applyFilters);
	}
	if (statusSelect) {
		statusSelect.addEventListener('change', applyFilters);
	}
}

function populateStatusFilterOptions() {
	const select = document.getElementById('filterStatus');
	if (!select) return;
	select.innerHTML = '';

	ORDER_STATUS_OPTIONS.forEach(option => {
		const opt = document.createElement('option');
		opt.value = option.value;
		opt.textContent = option.label;
		select.appendChild(opt);
	});

	select.value = filterState.status || '';
}

// Initialize page
function initializePage() {
	populateStatusFilterOptions();
	setupAutoFilterListeners();
	// Set giá trị mặc định: đầu năm - cuối năm hiện tại
	const today = new Date();
	const currentYear = today.getFullYear();
	const startDateDefault = `${currentYear}-01-01`;
	const endDateDefault = `${currentYear}-12-31`;

	const fromDateInput = document.getElementById('filterFromDate');
	const toDateInput = document.getElementById('filterToDate');

	// Đợi Flatpickr init xong rồi mới set giá trị
	setTimeout(function () {
		// Clear Tên bệnh nhân
		const patientNameInput = document.getElementById('filterPatientName');
		if (patientNameInput) {
			patientNameInput.value = '';
		}

		// Set giá trị mặc định cho From Date
		if (fromDateInput) {
			fromDateInput.value = startDateDefault;
			// Trigger Flatpickr to update display
			if (fromDateInput._flatpickr) {
				fromDateInput._flatpickr.setDate(startDateDefault, true);
			}
		}

		// Set giá trị mặc định cho To Date
		if (toDateInput) {
			toDateInput.value = endDateDefault;
			// Trigger Flatpickr to update display
			if (toDateInput._flatpickr) {
				toDateInput._flatpickr.setDate(endDateDefault, true);
			}
		}

		// Set Trạng thái về "Chuyển thực hiện"
		const statusSelect = document.getElementById('filterStatus');
		if (statusSelect) {
			statusSelect.value = 'sent';
		}

		// Update filterState
		filterState.patient_name = '';
		filterState.from_date = startDateDefault;
		filterState.to_date = endDateDefault;
		filterState.status = 'sent';
	}, 200);

	// Select all checkbox
	const selectAll = document.getElementById('selectAllOrders');
	if (selectAll) {
		selectAll.addEventListener('change', function () {
			const checkboxes = document.querySelectorAll('.order-select');
			checkboxes.forEach(cb => {
				cb.checked = this.checked;
				const orderId = parseInt(cb.dataset.orderId);
				if (this.checked) {
					selectedOrderIds.add(orderId);
				} else {
					selectedOrderIds.delete(orderId);
				}
			});
			updateSelectedCount();
		});
	}

	// Refresh button - reset tất cả filter và reload
	const refreshBtn = document.getElementById('refreshBtn');
	if (refreshBtn) {
		refreshBtn.addEventListener('click', () => {
			// Reset filter fields
			const patientNameInput = document.getElementById('filterPatientName');
			const fromDateInput = document.getElementById('filterFromDate');
			const toDateInput = document.getElementById('filterToDate');
			const statusSelect = document.getElementById('filterStatus');

			// Clear Tên bệnh nhân
			if (patientNameInput) {
				patientNameInput.value = '';
			}

			// Reset Từ ngày về đầu năm hiện tại
			const currentYear = new Date().getFullYear();
			const startDateDefault = `${currentYear}-01-01`;
			const endDateDefault = `${currentYear}-12-31`;

			if (fromDateInput) {
				fromDateInput.value = startDateDefault;
				if (fromDateInput._flatpickr) {
					fromDateInput._flatpickr.setDate(startDateDefault, true);
				}
			}

			// Reset Đến ngày về cuối năm hiện tại
			if (toDateInput) {
				toDateInput.value = endDateDefault;
				if (toDateInput._flatpickr) {
					toDateInput._flatpickr.setDate(endDateDefault, true);
				}
			}

			// Reset Trạng thái về "Chuyển thực hiện"
			if (statusSelect) {
				statusSelect.value = 'sent';
			}

			// Reset filter state
			filterState.patient_name = '';
			filterState.from_date = startDateDefault;
			filterState.to_date = endDateDefault;
			filterState.status = 'sent'; // Reset về "Chuyển thực hiện"
			filterState.location_type = '';

			// Reload danh sách
			currentPage = 1;
			loadOrders();
			showCustomToast('success', 'Đã làm mới bộ lọc và danh sách');
		});
	}

	// Batch delete button
	const batchDeleteBtn = document.getElementById('batchDeleteBtn');
	if (batchDeleteBtn) {
		batchDeleteBtn.addEventListener('click', batchDeleteOrders);
	}

	// Modal event listeners - chỉ setup một lần khi page load
	// Note: Event listener cho noteNurseTextarea sẽ được setup trong renderOrderDetailModal
	// để đảm bảo luôn có currentOrderDetail và tránh duplicate listeners

	// Load initial data
	loadOrders();

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['order.changed', 'examination.changed', 'survey.changed', 'catalog.changed'],
			debounceMs: 500,
			handler: async function (event) {
				loadOrders();
				if (event.type === 'catalog.changed' && currentExaminationId) {
					await checkSurveyStatusUpdate(currentExaminationId);
					return;
				}
				if (currentExaminationId && (!event.payload || !event.payload.examination_id || Number(event.payload.examination_id) === Number(currentExaminationId))) {
					await checkSurveyStatusUpdate(currentExaminationId);
				}
			}
		});
	}

	// ✅ Reload khi tab được focus lại để đồng bộ dữ liệu với các trang khác
	let lastReloadTime = 0;
	const MIN_RELOAD_INTERVAL_MS = 2000; // Tối thiểu 2 giây giữa các lần reload

	// Reload khi tab được focus lại
	document.addEventListener('visibilitychange', () => {
		if (!document.hidden) {
			// Tab được focus lại
			const now = Date.now();
			if (now - lastReloadTime > MIN_RELOAD_INTERVAL_MS) {
				lastReloadTime = now;
				loadOrders();
			}
		}
	});

	// Reload khi window được focus lại (khi chuyển tab trình duyệt)
	window.addEventListener('focus', () => {
		const now = Date.now();
		if (now - lastReloadTime > MIN_RELOAD_INTERVAL_MS) {
			lastReloadTime = now;
			loadOrders();
		}
	});
}

// Function để cập nhật alignment của input dựa trên giá trị (số thì căn phải, text thì căn trái)
window.updateLevelInputAlignment = function (inputElement) {
	if (!inputElement) return;

	const value = inputElement.value.trim();

	// Kiểm tra nếu là số (có thể parse thành số và không chứa chữ cái)
	// Cho phép số nguyên, số thập phân, có thể có dấu + hoặc - ở đầu
	const isNumber = /^[\+\-]?\d+(\.\d+)?$/.test(value);

	if (isNumber && value !== '') {
		inputElement.classList.add('number-aligned');
	} else {
		inputElement.classList.remove('number-aligned');
	}
}

// Function để lưu mức độ ghi nhận cho từng tiêu chí (dynamic criteria support)
async function saveSurveyLevelForOrder(criteriaName, examinationId, inputElement) {
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin lượt khám');
		return;
	}

	if (!inputElement) {
		return;
	}

	// Tránh gọi API liên tục khi đang lưu
	if (inputElement.dataset.saving === '1') {
		return;
	}

	const levelValue = inputElement.value.trim();
	// Nếu bỏ trống thì không lưu, tránh spam toast
	if (!levelValue) {
		return;
	}

	try {
		inputElement.dataset.saving = '1';

		// Use criteria name (from data-criteria attribute) to create field name
		// Normalize criteria name for field_name: lowercase, replace spaces with underscores
		const normalizedCriteriaName = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
		const fieldName = `survey_level_${normalizedCriteriaName}`;

		const data = {
			[fieldName]: levelValue,
			criteria_name: criteriaName // Store original criteria name for reference
		};

		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (response.ok) {
			showCustomToast('success', `Đã lưu mức độ ghi nhận: ${levelValue}`);
		} else {
			showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
		}
	} catch (error) {
		console.error('Error saving survey level:', error);
		showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
	} finally {
		delete inputElement.dataset.saving;
	}
}

// Function để lưu mức độ ghi nhận (old format - keep for backward compatibility)
async function saveSurveyLevel(buttonElement) {
	const inputElement = document.getElementById('level-input-survey');
	if (!inputElement) {
		showCustomToast('error', 'Không tìm thấy ô nhập mức độ');
		return;
	}

	const levelValue = inputElement.value.trim();
	if (!levelValue) {
		showCustomToast('error', 'Vui lòng nhập mức độ ghi nhận');
		return;
	}

	// Lấy examination_id từ response
	let examinationId = null;
	if (currentOrderDetail && currentOrderDetail.appointment) {
		const appointment = currentOrderDetail.appointment;
		if (appointment.examinations && appointment.examinations.length > 0) {
			examinationId = appointment.examinations[0].id;
		}
	}

	// Nếu không có, thử lấy từ API
	if (!examinationId && currentOrderDetail && currentOrderDetail.appointment) {
		try {
			const appointmentId = currentOrderDetail.appointment.id;
			const examResponse = await apiCall(`/examinations/appointment/${appointmentId}/id`);
			if (examResponse.ok) {
				const examData = await examResponse.json();
				examinationId = examData.examination_id || examData.id;
			}
		} catch (error) {
			console.error('Error getting examination ID:', error);
		}
	}

	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin lượt khám');
		return;
	}

	// Disable button để tránh double click
	const button = buttonElement;
	button.disabled = true;
	button.textContent = 'Đang lưu...';

	try {
		const data = {
			'survey_level': levelValue
		};

		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (response.ok) {
			showCustomToast('success', `Đã lưu mức độ ghi nhận: ${levelValue}`);
		} else {
			showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
		}
	} catch (error) {
		console.error('Error saving survey level:', error);
		showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
	} finally {
		button.disabled = false;
		button.textContent = 'Nhập';
	}
}

// Function để load mức độ ghi nhận đã lưu (dynamic criteria support)
async function loadSavedSurveyLevels(examinationId) {
	if (!examinationId) {
		return;
	}

	try {
		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`);

		if (response.ok) {
			const data = await response.json();
			if (data && data.data && Array.isArray(data.data)) {
				// Load old format (survey_level) for backward compatibility
				const surveyLevelItem = data.data.find(item => item.field_name === 'survey_level');
				if (surveyLevelItem) {
					const inputElement = document.getElementById('level-input-survey');
					if (inputElement) {
						inputElement.value = surveyLevelItem.field_value;
						// Update alignment sau khi set value
						updateLevelInputAlignment(inputElement);
					}
				}

				// Load all survey_level_* fields dynamically
				// Find all fields that start with "survey_level_"
				const surveyLevelFields = data.data.filter(item =>
					item.field_name && item.field_name.startsWith('survey_level_')
				);

				surveyLevelFields.forEach(fieldItem => {
					// Extract criteria key from field_name (e.g., "survey_level_depression" -> "depression")
					const criteriaKey = fieldItem.field_name.replace(/^survey_level_/, '');

					// Find all input elements for this criteria
					// Match by data-criteria-key attribute or id pattern
					const inputElements = document.querySelectorAll(
						`input[data-criteria-key="${criteriaKey}"], input[id^="level-input-${criteriaKey}-"]`
					);

					inputElements.forEach(input => {
						input.value = fieldItem.field_value;
						// Update alignment sau khi set value
						updateLevelInputAlignment(input);
					});
				});
			}
		}
	} catch (error) {
		console.error('Error loading saved survey levels:', error);
		// Không hiển thị lỗi vì có thể chưa có dữ liệu
	}
}

// Copy survey link to clipboard
function copySurveyLink() {
	const urlInput = document.getElementById('surveyLinkInput');
	if (!urlInput || !urlInput.value) {
		showCustomToast('error', 'Không có link để copy');
		return;
	}

	urlInput.select();
	urlInput.setSelectionRange(0, 99999); // For mobile devices

	try {
		document.execCommand('copy');
		showCustomToast('success', 'Đã copy link khảo sát!');
	} catch (err) {
		// Fallback for modern browsers
		navigator.clipboard.writeText(urlInput.value).then(function () {
			showCustomToast('success', 'Đã copy link khảo sát!');
		}).catch(function () {
			showCustomToast('error', 'Không thể copy link');
		});
	}
}

// Initialize survey context for realtime status updates
async function initializeSurveyRealtimeContext() {
	clearSurveyRealtimeContext();

	// Get examination_id from current order detail
	if (!currentOrderDetail || !currentOrderDetail.appointment) {
		return;
	}

	const appointment = currentOrderDetail.appointment;
	const appointmentId = appointment.id;

	if (!appointmentId) {
		return;
	}

	// Get examination_id
	let examinationId = null;
	if (appointment.examinations && appointment.examinations.length > 0) {
		examinationId = appointment.examinations[0].id;
	} else {
		try {
			const examIdResponse = await apiCall(`/examinations/appointment/${appointmentId}/id`);
			if (examIdResponse.ok) {
				const examIdData = await examIdResponse.json();
				examinationId = examIdData.examination_id || examIdData.id;
			}
		} catch (error) {
			console.error('Error getting examination ID for survey realtime context:', error);
			return;
		}
	}

	if (!examinationId) {
		return;
	}

	currentExaminationId = examinationId;
	lastKnownSurveyStatus = null;

	await checkSurveyStatusUpdate(examinationId);
}

function clearSurveyRealtimeContext() {
	lastKnownSurveyStatus = null;
	currentExaminationId = null;
}

// Check survey status and reload if changed
async function checkSurveyStatusUpdate(examinationId) {
	try {
		// Check if modal is still open
		const modalEl = document.getElementById('orderDetailModal');
		if (!modalEl || !modalEl.classList.contains('show')) {
			clearSurveyRealtimeContext();
			return;
		}

		// Get current survey session status
		const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status`);

		if (!sessionResponse || !sessionResponse.ok) {
			// No session exists yet.
			return;
		}

		const sessionData = await sessionResponse.json();
		const surveySession = sessionData.data || sessionData;

		if (!surveySession || surveySession.status === 'not_started') {
			// No active session yet.
			return;
		}

		const currentStatus = surveySession.status;

		// Check if status has changed
		if (lastKnownSurveyStatus === null) {
			// First check - just store the status
			const previousStatus = lastKnownSurveyStatus;
			lastKnownSurveyStatus = currentStatus;
			return;
		}

		// If status changed to completed or closed, reload survey tab
		if (lastKnownSurveyStatus !== currentStatus) {
			lastKnownSurveyStatus = currentStatus;

			// If status is now completed or closed, reload survey tab
			if (currentStatus === 'completed' || currentStatus === 'closed') {
				// Check if survey tab is currently active
				const surveyTab = document.getElementById('survey-tab');
				const isSurveyTabActive = surveyTab && surveyTab.classList.contains('active');

				// Fix: Reset loading flag TRƯỚC KHI gọi handleSurveyTabShow() để tránh race condition
				isSurveyTabLoading = false;

				// Reload survey tab content
				if (isSurveyTabActive) {
					// Tab is active, reload it
					await handleSurveyTabShow();
					showCustomToast('success', 'Đã cập nhật kết quả khảo sát mới!');
				} else {
					// Tab is not active, show notification
					showCustomToast('info', 'Bệnh nhân đã hoàn thành khảo sát. Vui lòng mở tab "Khảo sát" để xem kết quả.');
				}

				clearSurveyRealtimeContext();
			} else if (currentStatus === 'in_progress' && previousStatus === 'pending') {
				// Status changed from pending to in_progress - patient started filling
				// Update status badge if survey tab is visible
				const surveyTab = document.getElementById('survey-tab');
				if (surveyTab && surveyTab.classList.contains('active')) {
					// Fix: Reset loading flag TRƯỚC KHI gọi handleSurveyTabShow()
					isSurveyTabLoading = false;
					await handleSurveyTabShow();
				}
			}
		}

	} catch (error) {
		// Silently handle errors - don't spam console.
	}
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initializePage);
} else {
	initializePage();
}
