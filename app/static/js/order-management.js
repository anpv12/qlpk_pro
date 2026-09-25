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
let saveCustomOrderNote = null;

// Survey realtime context for modal refresh
let lastKnownSurveyStatus = null;
let currentExaminationId = null;
let currentSurveySession = null;


// Handler reference cho orderStatusSelect autosave (để có thể remove listener)
let orderStatusChangeHandler = null;

// Filter state
const filterState = {
	patient_name: '',
	from_date: '',
	to_date: '',
	status_group: 'active',
	location_type: '' // Thay đổi mặc định từ 'in' thành '' để hiển thị tất cả
};

let ordersRequestVersion = 0;
let expiryRefreshTimer = null;
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
    const config = window.ClinicalOrderStatusUtils.getOrderStatusConfig(status);
    return `<span class="qlpk-status status-pill ${config.className} ${escapeHtml(status)}">${escapeHtml(config.label)}</span>`;
}

async function loadOrders() {
	const version = ++ordersRequestVersion;
	try {
		// Build query params
		const params = new URLSearchParams();
		if (filterState.patient_name) params.append('patient_name', filterState.patient_name);
		if (filterState.from_date) params.append('from_date', filterState.from_date);
		if (filterState.to_date) params.append('to_date', filterState.to_date);
		params.append('status_group', filterState.status_group);
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
		if (version !== ordersRequestVersion) return;
		const orders = data.chi_dinh || [];
		totalOrders = data.total || 0;
		totalPages = data.total_pages || 1;
		currentPage = data.page || 1;
		document.getElementById('ordersActiveCount').textContent = data.group_counts.active;
		document.getElementById('ordersCompletedCount').textContent = data.group_counts.completed;
		clearTimeout(expiryRefreshTimer);
		if (data.next_expiry_at) {
			const delay = Math.max(100, Math.min(2147483647, new Date(data.next_expiry_at).getTime() - Date.now() + 100));
			expiryRefreshTimer = setTimeout(async () => {
				await loadOrders();
				if (currentExaminationId) await checkSurveyStatusUpdate(currentExaminationId);
			}, delay);
		}

		renderOrdersTable(orders);
		updateSelectedCount();

	} catch (error) {
		if (version !== ordersRequestVersion) return;
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
                    <div class="om-actions">
                        ${QLPKIconSystem.renderActionButton({ action: 'edit', label: 'Chi tiết chỉ định', className: 'order-detail-btn', attrs: { 'data-order-id': orderId } })}
                        ${QLPKIconSystem.renderActionButton({ action: 'delete', label: 'Xóa chỉ định', className: 'order-delete-btn', attrs: { 'data-order-id': orderId } })}
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
            ${totalPages > 1 ? `<nav class="d-flex align-items-center gap-2" aria-label="Phân trang chỉ định">
                <button type="button" class="om-button om-button--secondary" id="ordersPrevPage" ${currentPage === 1 ? 'disabled' : ''}>Trước</button>
                <label class="d-flex align-items-center gap-2">Trang <input id="ordersPageNumber" class="form-control form-control-sm om-page-number" type="number" min="1" max="${totalPages}" value="${currentPage}"></label>
                <button type="button" class="om-button om-button--secondary" id="ordersNextPage" ${currentPage === totalPages ? 'disabled' : ''}>Sau</button>
            </nav>` : ''}
        `;
		const go = value => {
			const page = Number(value);
			if (!Number.isInteger(page) || page < 1 || page > totalPages) {
				document.getElementById('ordersPageNumber').value = currentPage;
				return;
			}
			currentPage = page;
			loadOrders();
		};
		document.getElementById('ordersPrevPage')?.addEventListener('click', () => go(currentPage - 1));
		document.getElementById('ordersNextPage')?.addEventListener('click', () => go(currentPage + 1));
		document.getElementById('ordersPageNumber')?.addEventListener('change', event => go(event.target.value));
	}
}

// Load order detail
let detailRequestVersion = 0;
let surveyLoadVersion = 0;

async function loadOrderDetail(orderId) {
    const version = ++detailRequestVersion;
    ++surveyLoadVersion;
    clearSurveyRealtimeContext();
    currentOrderDetail = null;
    saveCustomOrderNote = null;
    renderOrderSurveyContent('<p>Đang tải thông tin khảo sát…</p>');
    document.getElementById('orderSurveyActions').replaceChildren();
    try {
        const response = await apiCall(`/api/chi-dinh/${orderId}`);
        if (!response.ok) throw new Error('Không tải được chỉ định');
        const order = await response.json();
        if (version !== detailRequestVersion) return;
        currentOrderDetail = order;
        renderOrderDetailModal(order);
        const modalEl = document.getElementById('orderDetailModal');
        if (!modalEl._detailCloseHandler) {
            modalEl.addEventListener('hide.bs.modal', () => {
                modalEl._detailClosing = true;
                modalEl._closingDetailVersion = detailRequestVersion;
            });
            modalEl._detailCloseHandler = () => {
                modalEl._detailClosing = false;
                // A newer order may already be loading while the close animation ends.
                if (modalEl._closingDetailVersion === detailRequestVersion) {
                    ++detailRequestVersion;
                    ++surveyLoadVersion;
                    clearSurveyRealtimeContext();
                    currentOrderDetail = null;
                    saveCustomOrderNote = null;
                    renderOrderSurveyContent('');
                    document.getElementById('orderSurveyActions').replaceChildren();
                }
                loadOrders();
            };
            modalEl.addEventListener('hidden.bs.modal', modalEl._detailCloseHandler);
        }
        if (modalEl._detailClosing) {
            await new Promise(resolve => modalEl.addEventListener('hidden.bs.modal', resolve, {once: true}));
            if (version !== detailRequestVersion) return;
        }
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        await loadOrderSurvey();
        if (version === detailRequestVersion) await initializeSurveyRealtimeContext();
    } catch (error) {
        if (version === detailRequestVersion) showCustomToast('error', 'Không thể tải chi tiết chỉ định. Vui lòng thử lại.');
    }
}

// Render order detail modal
function renderOrderDetailModal(order) {
    document.getElementById('orderDetailName').textContent = order.order_name || 'Chỉ định';
    document.getElementById('orderSurveySection').setAttribute('aria-label', order.survey_template_id ? 'Khảo sát của chỉ định' : 'Kết quả chỉ định');
	const patient = order.patient || {};
	const doctor = order.doctor || {};
	const appointment = order.appointment || {};

	const birthYear = patient.date_of_birth ? new Date(patient.date_of_birth).getFullYear() : null;
	const age = birthYear ? new Date().getFullYear() - birthYear : null;

	// Update patient info
    const patientInfoHtml = `
        <div class="om-patient-summary">
            <div class="om-patient-identity"><span class="om-patient-name">${escapeHtml(patient.full_name || '—')}</span>
            ${age !== null ? `<span class="badge om-patient-age-badge">${age} tuổi</span>` : ''}</div>
            <dl class="om-patient-fields">
                <dt>Điện thoại</dt><dd>${escapeHtml(patient.phone || 'Chưa có')}</dd>
                <dt>Ngày sinh</dt><dd>${formatDateOnly(patient.date_of_birth)}</dd>
                <dt>Ngày ra chỉ định</dt><dd>${formatDateOnly(order.created_at)}</dd>
            </dl>
        </div>`;

	const patientInfoEl = document.getElementById('orderPatientInfo');
	if (patientInfoEl) {
		patientInfoEl.innerHTML = patientInfoHtml;
	}

	// Update order status và setup autosave listener
    document.getElementById('customOrderStatusControls').hidden = Boolean(order.survey_template_id);
	const orderStatusSelect = document.getElementById('orderStatusSelect');
	if (orderStatusSelect) {
		// Remove listener cũ nếu có (tránh duplicate)
		if (orderStatusChangeHandler) {
			orderStatusSelect.removeEventListener('change', orderStatusChangeHandler);
			orderStatusChangeHandler = null;
		}

		// Set value
		orderStatusSelect.value = order.status || 'sent';
        orderStatusSelect.disabled = Boolean(order.survey_template_id) || order.status === 'completed';
        [...orderStatusSelect.options].forEach(option => { option.hidden = ['survey_sent', 'has_result'].includes(option.value) && !order.survey_template_id; });

		// Tạo handler mới và lưu reference
		orderStatusChangeHandler = async function () {
			if (currentOrderDetail) {
				const order = currentOrderDetail;
				const version = detailRequestVersion;
				const newValue = this.value;
				const oldValue = order.status || 'sent';

				// Chỉ lưu nếu giá trị thay đổi
				if (newValue !== oldValue) {
					try {
						this.disabled = true;
						if (saveCustomOrderNote) await saveCustomOrderNote();
						if (version !== detailRequestVersion || currentOrderDetail !== order) return;
						await updateOrderNote(order.id, 'status', newValue);
						if (version !== detailRequestVersion || currentOrderDetail !== order) return;
						order.status = newValue;
						// Reload timeline để hiển thị status mới
						renderTimeline(currentOrderDetail);
					} catch (error) {
						console.error('Error auto-saving status:', error);
						// Revert về giá trị cũ nếu lỗi
						if (version === detailRequestVersion && currentOrderDetail === order) this.value = oldValue;
					} finally {
						if (version === detailRequestVersion && currentOrderDetail === order) this.disabled = order.status === 'completed';
					}
				}
			}
		};

		// Gắn listener mới
		orderStatusSelect.addEventListener('change', orderStatusChangeHandler);
	}

	// Render result files
	renderResultFiles(order.result_files || []);

	// Render timeline from the order lifecycle.
	renderTimeline(order);

	// Survey content is loaded by the detail lifecycle.
}

// Manual orders use the existing result note, independently of survey content.
function renderCustomOrderNote(order) {
    renderOrderSurveyContent(`
        <label class="view-field-label" for="customOrderResultNote">Ghi chú kết quả</label>
        <textarea id="customOrderResultNote" class="form-control" rows="8"
            aria-describedby="customOrderNoteStatus" placeholder="Nhập nội dung xử lý hoặc kết quả chỉ định..."></textarea>
        <div class="om-order-controls mt-2">
            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="qlpk-icon-text-button om-button" id="saveCustomOrderNoteBtn">Lưu ghi chú</button>
            <span id="customOrderNoteStatus" role="status" aria-live="polite">Tự lưu khi rời ô.</span>
        </div>`);
    const input = document.getElementById('customOrderResultNote');
    const feedback = document.getElementById('customOrderNoteStatus');
    const button = document.getElementById('saveCustomOrderNoteBtn');
    const version = detailRequestVersion;
    const isCurrent = () => version === detailRequestVersion && currentOrderDetail === order && input.isConnected;
    let savedValue = order.note_nurse || '';
    let pending = Promise.resolve();
    input.value = savedValue;
    const save = () => {
        const value = input.value;
        pending = pending.catch(() => {}).then(async () => {
            if (value === savedValue) {
                if (isCurrent() && input.value === savedValue) feedback.textContent = 'Đã lưu';
                return;
            }
            if (isCurrent()) feedback.textContent = 'Đang lưu…';
            try {
                await updateOrderNote(order.id, 'note_nurse', value);
                savedValue = value;
                if (isCurrent()) {
                    order.note_nurse = value;
                    feedback.textContent = input.value === value ? 'Đã lưu' : 'Chưa lưu thay đổi mới.';
                }
            } catch (error) {
                if (isCurrent()) feedback.textContent = 'Chưa lưu được. Bấm Lưu ghi chú để thử lại.';
                throw error;
            }
        });
        return pending;
    };
    saveCustomOrderNote = save;
    input.addEventListener('input', () => { feedback.textContent = 'Chưa lưu — tự lưu khi rời ô.'; });
    input.addEventListener('change', () => { save().catch(() => {}); });
    button.addEventListener('click', () => { save().catch(() => {}); });
}

// Load survey content directly as part of the order detail.
async function loadOrderSurvey() {
    const version = ++surveyLoadVersion;
    const loadingOrderId = currentOrderDetail?.id;
    const isCurrent = () => version === surveyLoadVersion && currentOrderDetail?.id === loadingOrderId;
	if (!currentOrderDetail || !currentOrderDetail.appointment) {
		renderOrderSurveyContent('<div class="text-center text-navy py-5"><p>Không có thông tin khảo sát</p></div>');
		return;
	}

	const appointment = currentOrderDetail.appointment;
	const appointmentId = appointment.id;
	if (!appointmentId) {
		renderOrderSurveyContent('<div class="text-center text-navy py-5"><p>Không có thông tin khảo sát</p></div>');
		return;
	}

	const indicationTemplateId = Number(currentOrderDetail.survey_template_id) || null;
	if (!indicationTemplateId) {
		renderCustomOrderNote(currentOrderDetail);
		return;
	}
	saveCustomOrderNote = null;



	// Show loading
	renderOrderSurveyContent(`
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
        if (!isCurrent()) return;

			// If not found, show message and return gracefully
			if (!examIdResponse.ok) {
				if (examIdResponse.status === 404) {
					renderOrderSurveyContent('<div class="text-center text-navy py-5"><p>Chưa có lịch khám nào cho chỉ định này</p></div>');
					return;
				} else {
					const errorData = await examIdResponse.json().catch(() => ({ detail: 'Lỗi không xác định' }));
        if (!isCurrent()) return;
					throw new Error(errorData.detail || errorData.error || 'Lỗi khi tải thông tin khám');
				}
			}

			const examIdData = await examIdResponse.json();
        if (!isCurrent()) return;
			examinationId = examIdData.examination_id;
		}

		if (!examinationId) {
			renderOrderSurveyContent('<div class="text-center text-navy py-5"><p>Chưa có lịch khám nào cho chỉ định này</p></div>');
			return;
		}

		await refreshCurrentOrderStatus();
        if (!isCurrent()) return;
		// The indication is the canonical source for the survey template.
		const templateResponse = await apiCall(`/api/survey-templates/${indicationTemplateId}/public`);
        if (!isCurrent()) return;
		if (!templateResponse.ok) {
			throw new Error('Lỗi khi tải mẫu khảo sát');
		}

		const templateData = await templateResponse.json();
        if (!isCurrent()) return;
		const templates = templateData.data ? [templateData.data] : [];
		if (!templates.length) {
			throw new Error('Không tìm thấy mẫu khảo sát của chỉ định');
		}

		// Get survey session status
		let surveySession = null;

		try {
			// Correct API endpoint: /api/survey-sessions/{examination_id}/status
			const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status?order_id=${currentOrderDetail.id}`);
        if (!isCurrent()) return;

			if (sessionResponse && sessionResponse.ok) {
				const sessionData = await sessionResponse.json();
        if (!isCurrent()) return;
				surveySession = sessionData.data || sessionData;

				// Check if status is 'not_started' - means no session exists yet (this is normal)
				if (surveySession && surveySession.status === 'not_started') {
					surveySession = null; // Treat as no session
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

		if (!isCurrent()) return;
		currentSurveySession = surveySession;
		renderTimeline(currentOrderDetail, surveySession);

		// Get patient info
		const patient = currentOrderDetail.patient || {};
		const patientId = patient.id;

		// Check session status - only show results if session is closed or completed
		const sessionStatus = surveySession?.status || surveySession?.data?.status;
		const hasSurveyOrder = Boolean(currentOrderDetail.survey_template_id);

		// Only fetch and display results if session is closed
		if (hasSurveyOrder) {
			// Get survey responses for this examination
			const surveyResponse = await apiCall(`/api/survey-responses/examination/${examinationId}?order_id=${currentOrderDetail.id}`);
        if (!isCurrent()) return;
			let allSurveyResponses = [];

			if (surveyResponse.ok) {
				const surveyData = await surveyResponse.json();
        if (!isCurrent()) return;
				allSurveyResponses = surveyData.data || surveyData.responses || [];


			}

			if (!isCurrent()) return;
			// If we have responses, render results
			if (allSurveyResponses.length > 0) {
				await renderSurveyResults(allSurveyResponses, templates, surveySession, appointment, isCurrent);
        if (!isCurrent()) return;
				return;
			}
		}

		// If no responses OR session not closed yet, show selection UI (with close button if session exists)
		renderSurveySelectionUI(examinationId, templates, surveySession, appointment);

	} catch (error) {
        if (!isCurrent()) return;
		console.error('Error loading survey data:', error);
		renderOrderSurveyContent(`
            <div class="text-center text-danger py-5">
                <i class="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
                <p>Không thể tải thông tin khảo sát. Vui lòng thử lại.</p>
            </div>
        `);
	}
}

// Render the survey section
function renderOrderSurveyContent(html, qrCode = '') {
    const qr = document.getElementById('orderProgressQR');
    qr.hidden = !qrCode;
    qr.innerHTML = qrCode ? `<img src="${escapeHtml(qrCode)}" alt="Mã QR mở link khảo sát" class="om-survey-qr">` : '';
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
		console.error('Error rendering survey content:', error);
	}
}

function renderSurveyActions(examinationId, patientId, hasResult = false, hasLink = false) {
    const order = currentOrderDetail;
    const target = document.getElementById('orderSurveyActions');
    if (!order?.survey_template_id) { target.replaceChildren(); return; }
    target.innerHTML = `
        ${!hasResult && order.status !== 'completed' ? `<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="qlpk-icon-text-button om-button" id="sendSurveyLinkBtn"><i class="bi bi-link-45deg qlpk-button-icon" aria-hidden="true"></i>${hasLink ? 'Tạo lại link khảo sát' : 'Tạo link khảo sát'}</button>` : ''}
        <a class="qlpk-icon-text-button om-button" id="viewSurveyResultBtn" href="/patient-survey.html?review_order_id=${order.id}" target="_blank" rel="noopener"><i class="bi bi-eye qlpk-button-icon" aria-hidden="true"></i>Xem kết quả</a>
        ${order.status !== 'completed' ? '<button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="qlpk-icon-text-button om-button om-button--danger" id="closeSurveySessionBtn"><i class="bi bi-lock qlpk-button-icon" aria-hidden="true"></i>Kết thúc khảo sát</button>' : ''}`;
    document.getElementById('sendSurveyLinkBtn')?.addEventListener('click', () => sendSurveyLink(examinationId, patientId, order.survey_template_id));
    document.getElementById('closeSurveySessionBtn')?.addEventListener('click', () => closeSurveySession());
}

// Render survey selection UI (when no survey results yet)
function renderSurveySelectionUI(examinationId, templates, surveySession, appointment) {
	const patient = currentOrderDetail.patient || {};
	const patientId = patient.id;
	const indicationTemplateId = Number(currentOrderDetail.survey_template_id) || null;

	// Get survey session details (URL and QR code)
	let surveyUrl = '';
	let qrCode = '';
	let expiresAt = '';

	if (surveySession) {
		// Get URL and QR from survey session
		surveyUrl = surveySession.survey_url || surveySession.url || '';
		qrCode = surveySession.qr_code || '';


		if (surveySession.expires_at) {
			const expDate = new Date(surveySession.expires_at);
			expiresAt = expDate.toLocaleString('vi-VN');
		}
	}

	// The template linked to this indication is the source of the displayed name.
	const linkedTemplate = templates[0];

	// Build QR and Link section HTML
	let qrAndLinkHtml = '';
	if (surveyUrl) {
		qrAndLinkHtml = `
            <div class="om-survey-access">
                    <div class="om-survey-access-link">
                        <h6 class="fw-semibold mb-3">
                            <i class="bi bi-link-45deg me-2"></i>Link khảo sát
                        </h6>
                        <div class="input-group mb-2">
                            <input type="text" class="form-control form-control-sm om-survey-link-input" id="surveyLinkInput" value="${escapeHtml(surveyUrl)}" readonly>
                            <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" class="qlpk-icon-action qlpk-icon-action--view" type="button" id="copySurveyLinkBtn" title="Sao chép link khảo sát" aria-label="Sao chép link khảo sát">
                                <i class="bi bi-clipboard" aria-hidden="true"></i>
                            </button>
                        </div>
                        ${expiresAt ? `<small class="text-navy">Hết hạn: ${expiresAt}</small>` : ''}
                    </div>
            </div>
        `;
	}

    renderSurveyActions(examinationId, patientId, false, Boolean(surveyUrl));
    const html = `
        <div class="om-survey-heading"><div><h3>Khảo sát <span id="orderSurveyStatus">${getStatusBadge(currentOrderDetail.status)}</span></h3>
            <p class="om-survey-helper-text">Mẫu: ${escapeHtml(linkedTemplate.name || '—')}</p></div></div>
        ${currentOrderDetail.status === 'completed' ? '<p class="om-survey-empty">Chưa có bài nộp. Bấm “Xem kết quả” để xem phần trả lời đã lưu.</p>' : qrAndLinkHtml || '<p class="om-survey-empty">Chưa tạo link khảo sát. Bấm “Tạo link khảo sát” để bệnh nhân bắt đầu làm bài.</p>'}
    `;

	renderOrderSurveyContent(html, currentOrderDetail.status !== 'completed' && surveyUrl ? qrCode : '');

    document.getElementById('copySurveyLinkBtn')?.addEventListener('click', copySurveyLink);
}

// Send survey link
async function sendSurveyLink(examinationId, patientId, templateId) {
    const orderId = currentOrderDetail?.id;
    if (!orderId) return;
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

		showCustomToast('info', 'Đang tạo link khảo sát...');

		// Send template_id to API so it can be included in the survey URL
		const response = await apiCall('/api/survey-sessions/generate', {
			method: 'POST',
			body: JSON.stringify({
				patient_id: patientId,
				examination_id: examinationId,
				template_id: templateId,
                order_id: orderId
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Lỗi không xác định' }));
			if (errorData.code === 'SURVEY_TEMPLATE_INVALID') {
				showCustomToast('error', 'Mẫu khảo sát chưa đủ cấu hình điểm. Vui lòng kiểm tra lại.');
				return;
			}
			throw new Error(errorData.message || 'Lỗi khi tạo link khảo sát');
		}

		const data = await response.json();
		if (data.success && data.data) {
			showCustomToast('success', 'Link khảo sát đã sẵn sàng.');


		} else {
			showCustomToast('success', 'Đã tạo link khảo sát thành công');
		}

		// Clear any previous response data and reload survey content
		// This ensures the section shows the selection UI instead of results
		if (currentOrderDetail?.id === orderId) await loadOrderSurvey();

	} catch (error) {
		console.error('Error sending survey link:', error);
		showCustomToast('error', 'Không thể tạo link khảo sát. Vui lòng thử lại.');
	}
}

// Close survey session
async function closeSurveySession(examinationId, patientId) {
	const orderId = currentOrderDetail?.id;
	if (!orderId) return;
	try {
		const confirmed = await showConfirmDialog({title: 'Kết thúc khảo sát', text: 'Chỉ định sẽ chuyển sang Hoàn thành và ngừng nhận bài nộp. Kết quả đã có vẫn được giữ nguyên.', confirmText: 'Kết thúc khảo sát', variant: 'warning'});
		if (!confirmed) {
			return;
		}

		showCustomToast('info', 'Đang kết thúc khảo sát...');

		// Call close API
		const closeResponse = await apiCall(`/api/chi-dinh/${orderId}/finish-survey`, {
			method: 'POST'
		});

		if (!closeResponse.ok) {
			const errorData = await closeResponse.json().catch(() => ({ message: 'Lỗi không xác định' }));
			throw new Error(errorData.message || 'Lỗi khi kết thúc khảo sát');
		}

		const closeData = await closeResponse.json();

		if (closeData.success) {
			showCustomToast('success', 'Khảo sát đã được kết thúc thành công');



			// Reload survey content - will now show results if available
			await loadOrders();
			if (currentOrderDetail?.id === orderId) {
				await refreshCurrentOrderStatus();
				await loadOrderSurvey();
			}
		} else {
			showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
		}

	} catch (error) {
		console.error('Error closing survey session:', error);
		showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
	}
}

// Render survey results with full UI (header + dropdown + results)
async function renderSurveyResults(surveyResponses, templates, surveySession, appointment, isCurrent = () => true) {
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


	const latestResponse = linkedResponses[0] || null;

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

    renderSurveyActions(latestResponse.examination_id, currentOrderDetail.patient?.id, true);
    let html = `<div>
        <div class="om-survey-heading"><div><h3>Kết quả khảo sát <span id="orderSurveyStatus">${getStatusBadge(currentOrderDetail.status)}</span></h3>
        <p class="om-survey-helper-text">Mẫu: ${escapeHtml(latestTemplate.name || '—')}</p></div>
        ${currentOrderDetail.status !== 'completed' && currentOrderDetail.survey_expires_at ? `<p class="om-survey-helper-text">Hết hạn: ${formatDisplayDate(currentOrderDetail.survey_expires_at)}</p>` : ''}</div>`;
	// Render chỉ 1 card cho response mới nhất
	const cardHtml = await renderSingleSurveyResultCard(latestTemplate, latestResponse);
    if (!isCurrent()) return;
	// Only add if card is not empty
	if (cardHtml && cardHtml.trim()) {
		html += cardHtml;
	}

	html += '</div>';

	renderOrderSurveyContent(html);

	// Load saved survey levels after content is in DOM
	setTimeout(() => {
		if (isCurrent()) loadSavedSurveyLevels(latestResponse.examination_id);
	}, 150);


}

function resolveSurveyAnswerText(question, answerValue) {
	const answers = question.answers || question.options || [];
	if (Array.isArray(answerValue)) return answerValue.map(value => resolveSurveyAnswerText(question, value)).join('; ');
	const normalizedValue = answerValue && typeof answerValue === 'object'
		? (answerValue.answer_id ?? answerValue.value ?? answerValue.id)
		: answerValue;
	const matchedAnswer = answers.find(answer => answer.id !== undefined && answer.id !== null && answer.id !== '' && String(answer.id) === String(normalizedValue));
	if (matchedAnswer) return matchedAnswer.text || matchedAnswer.label || String(normalizedValue);

	const numericValue = Number(normalizedValue);
	if (Number.isInteger(numericValue) && numericValue >= 0 && numericValue < answers.length) {
		const indexedAnswer = answers[numericValue];
		if (indexedAnswer && (indexedAnswer.id === undefined || indexedAnswer.id === null || indexedAnswer.id === '')) {
			return indexedAnswer.text || indexedAnswer.label || String(normalizedValue);
		}
	}
	return 'Không ghép được đáp án';
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

	const totalScores = response.total_scores || {};


	// Process all criteria dynamically from template
	Object.keys(template.questions_by_criteria).forEach(criteria => {
		const questions = template.questions_by_criteria[criteria];

		// Initialize criteria if not exists
		if (!summary.criteria[criteria]) {
			summary.criteria[criteria] = [];
		}

		// Missing score is not a zero score.
		const criteriaScore = Object.prototype.hasOwnProperty.call(totalScores, criteria)
			&& typeof totalScores[criteria] === 'number' && Number.isFinite(totalScores[criteria])
			? totalScores[criteria] : null;
		summary.scores[criteria] = criteriaScore;

		// Process questions for this criteria
		questions.forEach(question => {
			// Fix: Hỗ trợ cả grid questions (dùng question_id hoặc id)
			const rowId = question.question_id ?? question.id;
			const questionIdStr = rowId !== undefined && rowId !== null && rowId !== '' ? String(rowId) : null;

			// Match the exact question identity; never reuse another answer by group prefix.
			let answerValue = null;
			if (response.responses) {
				// Thử tìm trực tiếp bằng question_id hoặc id
				if (questionIdStr && response.responses[questionIdStr] !== undefined) {
					answerValue = response.responses[questionIdStr];
				}
			}

			if (answerValue !== undefined && answerValue !== null) {
				// Resolve both stored answer IDs and numeric answer values.
				const answerText = resolveSurveyAnswerText(question, answerValue);
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
		const score = summary.scores[criteriaName] ?? 'Chưa tính được';

		// Normalize criteria name for use as key (for saving levels)
		// Use criteria name as-is, but sanitize for HTML id
		const criteriaKey = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

		// Format title: uppercase and add prefix if needed
		const title = criteriaName.toUpperCase();

        html += `
            <div class="survey-criteria-section">
                <div class="criteria-header">${escapeHtml(title)}</div>
                <div class="criteria-left">
                    ${answers.length > 0 ? answers.map(answer => `<div class="symptom-item">• ${escapeHtml(answer.summarized)}</div>`).join('') : '<div class="text-navy">Chưa có câu trả lời ghép được với nhóm này</div>'}
                </div>
                <div class="score-display" title="Tổng số điểm ghi nhận">
                    <span class="score-label">Tổng số điểm ghi nhận:</span><span class="score-value">${score}</span>
                </div>
                <div class="level-display">
                    <label class="level-label" for="level-input-${criteriaKey}-${response.id}">Mức độ ghi nhận:</label>
                    <input type="text" class="form-control form-control-sm level-input" placeholder="Nhập mức độ"
                        data-criteria="${escapeHtml(criteriaName)}" data-criteria-key="${criteriaKey}"
                        id="level-input-${criteriaKey}-${response.id}"
                        onchange="saveSurveyLevelForOrder('${escapeHtml(criteriaName)}', '${response.examination_id}', this)"
                        oninput="updateLevelInputAlignment(this)">
                </div>
            </div>`;
	});

	return html;
}

// Render single survey result card (ONLY the "Kết quả khảo sát" card, no header)
async function renderSingleSurveyResultCard(template, response) {
	if (response.questions_by_criteria) template = {...template, questions_by_criteria: response.questions_by_criteria};
	const completionTimestamp = response.updated_at || response.created_at;
	const completedAt = completionTimestamp ? new Date(completionTimestamp) : null;

	// Only render if we have completed survey
	if (!completedAt || !template.questions_by_criteria) {
		return '';
	}

	// Render survey results by criteria (new format matching mockup)
	const criteriaResultsHtml = renderSurveyResultsByCriteria(template, response);

    return `
        <div class="survey-result-card">
            ${window.renderSurveyResultSummary?.(response.result_summary) || ''}
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
            <li class="om-file-row">
                <span class="fw-semibold text-dark om-file-name">${escapeHtml(file.original_filename || file.filename)}</span>
                <div class="om-file-meta">
                    <span class="badge ${badgeClass} bg-opacity-25 text-dark border om-file-type-badge">${escapeHtml(ext)}</span>
                    <span>Ngày tải: ${formatDateOnly(file.created_at)}</span>
                    <div class="om-actions">
                        ${QLPKIconSystem.renderActionButton({ action: 'download', label: 'Tải xuống', className: 'result-file-download', attrs: { 'data-file-id': file.id } })}
                        ${QLPKIconSystem.renderActionButton({ action: 'delete', label: 'Xóa file', className: 'result-file-delete', attrs: { 'data-file-id': file.id } })}
                    </div>
                </div>
            </li>
            `;
        }).join('');

        listContainer.innerHTML = `<ul class="om-file-list" aria-label="File kết quả đính kèm">${filesList}</ul>`;
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
function surveyClosureText(order) {
    const reason = order.completion_reason === 'expired' ? 'Hết thời hạn khảo sát' : order.completion_reason === 'doctor' ? 'Bác sĩ kết thúc khảo sát' : 'Khảo sát đã kết thúc';
    return `${reason}${order.completed_at ? ` · ${formatDisplayDate(order.completed_at)}` : ''}`;
}

function renderTimeline(order) {
    const statusBadge = document.getElementById('orderSurveyStatus');
    if (statusBadge) statusBadge.innerHTML = getStatusBadge(order.status);
    const target = document.querySelector('#orderDetailModal .timeline');
    if (!target) return;
    const states = order.survey_template_id ? ['sent', 'survey_sent', 'has_result', 'completed'] : ['sent', 'completed'];
    const current = states.indexOf(order.status);
    const timestamps = {sent: order.created_at, survey_sent: order.survey_sent_at, has_result: order.result_at, completed: order.completed_at};
    target.innerHTML = states.map((value, index) => {
        const label = window.ClinicalOrderStatusUtils.getOrderStatusConfig(value).label;
        const state = timestamps[value] ? (index === current && value !== 'completed' ? 'active' : 'done') : 'pending';
        const detail = value === 'completed' && order.status === 'completed' ? surveyClosureText(order) : timestamps[value] ? formatDisplayDate(timestamps[value]) : order.status === 'completed' && value === 'has_result' ? 'Chưa ghi nhận bài nộp hợp lệ' : '';
        return `<div class="timeline-item ${state}"><div class="fw-semibold om-timeline-step-title">${label}</div>${detail ? `<div class="om-timeline-step-sub">${detail}</div>` : ''}</div>`;
    }).join('');
}

async function refreshCurrentOrderStatus() {
    const id = currentOrderDetail?.id;
    if (!id) return;
    const response = await apiCall(`/api/chi-dinh/${id}`);
    if (!response.ok) throw new Error('Không tải được trạng thái chỉ định');
    const order = await response.json();
    if (currentOrderDetail?.id !== id) return;
    const data = order.data || order;
    Object.assign(currentOrderDetail, data);
    const select = document.getElementById('orderStatusSelect');
    if (select) select.value = data.status;
    renderTimeline(currentOrderDetail);
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
}

function selectOrderGroup(group) {
	filterState.status_group = group;
	document.querySelectorAll('[data-status-group]').forEach(button => {
		const selected = button.dataset.statusGroup === group;
		button.classList.toggle('active', selected);
		button.setAttribute('aria-selected', String(selected));
		button.tabIndex = selected ? 0 : -1;
		if (selected) document.getElementById('ordersListPanel').setAttribute('aria-labelledby', button.id);
	});
	selectedOrderIds.clear();
	applyFilters();
}

// Initialize page
function initializePage() {
	const groupTabs = [...document.querySelectorAll('[data-status-group]')];
	groupTabs.forEach((button, index) => {
		button.addEventListener('click', () => selectOrderGroup(button.dataset.statusGroup));
		button.addEventListener('keydown', event => {
			if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
			event.preventDefault();
			const next = event.key === 'Home' ? 0 : event.key === 'End' ? groupTabs.length - 1 : (index + 1) % groupTabs.length;
			groupTabs[next].focus();
			selectOrderGroup(groupTabs[next].dataset.statusGroup);
		});
	});
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

		// Update filterState
		filterState.patient_name = '';
		filterState.from_date = startDateDefault;
		filterState.to_date = endDateDefault;
		applyFilters();
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

			// Reset filter state
			filterState.patient_name = '';
			filterState.from_date = startDateDefault;
			filterState.to_date = endDateDefault;
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
    const orderId = currentOrderDetail?.id;
	if (!examinationId) {
		return;
	}

	try {
		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`);

		if (response.ok) {
			const data = await response.json();
            if (currentOrderDetail?.id !== orderId) return;
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
    const orderId = currentOrderDetail?.id;

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

	if (currentOrderDetail?.id !== orderId) return;
	currentExaminationId = examinationId;
	lastKnownSurveyStatus = null;

	await checkSurveyStatusUpdate(examinationId);
}

function clearSurveyRealtimeContext() {
	lastKnownSurveyStatus = null;
	currentExaminationId = null;
	currentSurveySession = null;
}

// Check survey status and reload if changed
async function checkSurveyStatusUpdate(examinationId) {
    const orderId = currentOrderDetail?.id;
    if (!orderId) return;
	try {
		// Check if modal is still open
		const modalEl = document.getElementById('orderDetailModal');
		if (!modalEl || !modalEl.classList.contains('show')) {
			clearSurveyRealtimeContext();
			return;
		}

		// Get current survey session status
		const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status?order_id=${orderId}`);

		if (!sessionResponse || !sessionResponse.ok) {
			// No session exists yet.
			return;
		}

		const sessionData = await sessionResponse.json();
        if (currentOrderDetail?.id !== orderId) return;
		const surveySession = sessionData.data || sessionData;

		if (!surveySession || surveySession.status === 'not_started') {
			// No active session yet.
			currentSurveySession = null;
			if (currentOrderDetail) renderTimeline(currentOrderDetail, null);
			return;
		}

		await refreshCurrentOrderStatus();
        if (currentOrderDetail?.id !== orderId) return;
		const currentStatus = currentOrderDetail.status;
		const previousStatus = lastKnownSurveyStatus;
		currentSurveySession = surveySession;
		if (currentOrderDetail) renderTimeline(currentOrderDetail, surveySession);

		// Check if status has changed
		lastKnownSurveyStatus = currentStatus;
		if (previousStatus === null) return;

        if (previousStatus !== currentStatus) {
            await loadOrderSurvey();
            if (currentOrderDetail?.id === orderId && ['has_result', 'completed'].includes(currentStatus)) {
                showCustomToast('success', currentStatus === 'has_result' ? 'Khảo sát đã có kết quả.' : 'Chỉ định đã hoàn thành.');
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
