// Payment Waiting Management JavaScript
let currentPage = 1;
let perPage = 10;
let totalItems = 0;
let totalPages = 0;
let paymentData = [];
let filteredData = [];
let selectedItems = [];
let isConfirmInvoiceSubmitting = false;
let financialSummaryCache = null;

function getDefaultDateRange() {
	const today = new Date();
	const currentYear = today.getFullYear();
	return {
		startDateDefault: `${currentYear - 1}-01-01`,
		endDateDefault: `${currentYear}-12-31`
	};
}

function normalizeStatus(value) {
	return String(value || '').trim().toUpperCase();
}

function isPaymentPaid(payment) {
	return normalizeStatus(payment?.payment_status) === 'PAID';
}

function isExaminationConfirmed(data) {
	const examStatus = normalizeStatus(data?.status);
	const paymentStatus = normalizeStatus(data?.payment_status);
	return paymentStatus === 'PAID' || examStatus === 'COMPLETED' || examStatus === 'CONFIRMED';
}

function isInvoiceLocked() {
	return $('#examinationDetailContent').hasClass('invoice-confirmed');
}

function escapeHtml(value) {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function escapeAttr(value) {
	return escapeHtml(value).replace(/`/g, '&#96;');
}

function getSafeApiErrorMessage(xhr, fallback = 'Không thể xử lý lúc này. Vui lòng thử lại.') {
	return window.QLPKUserFeedback?.resolveError(xhr, { fallback }) || fallback;
}

function getStoredAuthToken() {
	return localStorage.getItem('qlpk_token') || localStorage.getItem('token') || sessionStorage.getItem('qlpk_token') || '';
}

function getAuthorizationHeaderValue() {
	const token = getStoredAuthToken();
	if (!token) return '';
	return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
}

async function openInvoiceWindow(examinationId) {
	const invoiceWindow = window.open('', '_blank');
	if (!invoiceWindow) {
		showCustomToast('warning', 'Trình duyệt đã chặn tab hóa đơn');
		return;
	}

	invoiceWindow.document.open();
	invoiceWindow.document.write('<!doctype html><html><head><title>Đang tải hóa đơn</title></head><body>Đang tải hóa đơn...</body></html>');
	invoiceWindow.document.close();

	try {
		const authHeader = getAuthorizationHeaderValue();
		const response = await fetch(`/payment-waiting/invoice/${encodeURIComponent(examinationId)}`, {
			headers: authHeader ? { 'Authorization': authHeader } : {}
		});

		if (!response.ok) {
			throw new Error('Không thể tải hóa đơn');
		}

		const html = await response.text();
		await window.QLPKPdfPreview.render(invoiceWindow, html);
	} catch (error) {
		showCustomToast('error', 'Không thể mở hóa đơn. Vui lòng thử lại.');
	}
}

function buildPaymentConfirmOptions({ title, text, icon = 'warning', confirmText = 'Xác nhận', cancelText = 'Hủy', variant = 'primary' }) {
	const allowedVariants = new Set(['danger', 'warning', 'primary', 'success']);
	const confirmVariant = allowedVariants.has(variant) ? variant : 'primary';
	return {
		title,
		text,
		icon,
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
	};
}

// Document ready
$(document).ready(function () {
	const { startDateDefault, endDateDefault } = getDefaultDateRange();

	// Set giá trị mặc định
	$('#startDate').val(startDateDefault);
	$('#endDate').val(endDateDefault);

	// Trigger Flatpickr to update display
	if ($('#startDate')[0] && $('#startDate')[0]._flatpickr) {
		$('#startDate')[0]._flatpickr.setDate(startDateDefault, true);
	}
	if ($('#endDate')[0] && $('#endDate')[0]._flatpickr) {
		$('#endDate')[0]._flatpickr.setDate(endDateDefault, true);
	}

	// Reset checkbox state (browser giữ sau F5)
	$('#selectAll').prop('checked', false);
	$('.payment-checkbox').prop('checked', false);
	selectedItems = [];

	// Clear other filters
	$('#searchInput').val('');
	$('#statusFilter').val('UNPAID');

	// Load initial data with default date range
	loadPaymentData();
	bindEvents();

	if (window.QLPKRealtimePageHooks) {
		window.QLPKRealtimePageHooks.register({
			types: ['appointment.changed', 'examination.changed', 'payment.changed', 'patient.changed'],
			debounceMs: 500,
			handler: function () {
				loadPaymentData();
			}
		});
	}
});

// Chuyển đổi giới tính sang tiếng Việt để hiển thị
function toVietnameseGender(gender) {
	if (!gender) return '';
	const g = String(gender).trim().toLowerCase();
	if (g === 'male' || g === 'm' || g === 'nam') return 'Nam';
	if (g === 'female' || g === 'f' || g === 'nu' || g === 'nữ') return 'Nữ';
	if (g === 'other' || g === 'khac' || g === 'khác') return 'Khác';
	// Trường hợp đã là tiếng Việt hoặc giá trị khác
	return gender;
}

// Bind all event handlers
function bindEvents() {
	// Debounce timer for search input
	let searchDebounceTimer;

	// Realtime search on input (debounced 300ms)
	$('#searchInput').on('input', function () {
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(function () {
			performSearch();
		}, 300);
	});

	// Also support Enter key for immediate search
	$('#searchInput').on('keypress', function (e) {
		if (e.which === 13) {
			clearTimeout(searchDebounceTimer);
			performSearch();
		}
	});

	// Filter functionality
	$('#statusFilter').on('change', function () {
		applyFilters();
	});

	$('#startDate').on('change', function () {
		applyFilters();
	});

	$('#endDate').on('change', function () {
		applyFilters();
	});

	// Refresh button
	$('#refreshListBtn').on('click', function () {
		const { startDateDefault, endDateDefault } = getDefaultDateRange();

		// Clear search và trả status về mặc định
		$('#searchInput').val('');
		$('#statusFilter').val('UNPAID');

		// Set lại date range mặc định
		$('#startDate').val(startDateDefault);
		$('#endDate').val(endDateDefault);

		// Trigger Flatpickr to update display
		if ($('#startDate')[0] && $('#startDate')[0]._flatpickr) {
			$('#startDate')[0]._flatpickr.setDate(startDateDefault, true);
		}
		if ($('#endDate')[0] && $('#endDate')[0]._flatpickr) {
			$('#endDate')[0]._flatpickr.setDate(endDateDefault, true);
		}

		// Reset về trang đầu tiên
		currentPage = 1;

		// Load lại data
		loadPaymentData();
	});

	// Export button
	$('#exportTableBtn').on('click', function () {
		exportPaymentData();
	});

	// Delegated handlers for dynamically rendered modal controls
	$(document).off('change', '#serviceSelect').on('change', '#serviceSelect', function () {
		const selectedOption = $(this).find('option:selected');
		const price = selectedOption.data('price') || 0;
		$('#servicePrice').val(price);
	});

	$(document).off('click', '#saveServiceBtn').on('click', '#saveServiceBtn', function () {
		saveNewService();
	});

	$(document).off('click', '.js-edit-payment').on('click', '.js-edit-payment', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) editPayment(paymentId);
	});

	$(document).off('click', '.js-delete-payment').on('click', '.js-delete-payment', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) deletePayment(paymentId);
	});

	$(document).off('click', '.js-change-page').on('click', '.js-change-page', function (e) {
		e.preventDefault();
		const page = Number($(this).data('page')) || 0;
		if (page) changePage(page);
	});

	$(document).off('click', '.js-retry-load-invoice').on('click', '.js-retry-load-invoice', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		if (paymentId) loadExaminationDetailModal(paymentId);
	});

	$(document).off('click', '.js-edit-service').on('click', '.js-edit-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) editService(serviceId);
	});

	$(document).off('click', '.js-delete-service').on('click', '.js-delete-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) deleteService(serviceId);
	});

	$(document).off('click', '.js-save-edit-service').on('click', '.js-save-edit-service', function () {
		const serviceId = Number($(this).data('service-id')) || 0;
		if (serviceId) saveEditService(serviceId);
	});

	$(document).off('click', '.js-return-action').on('click', '.js-return-action', function () {
		const paymentId = Number($(this).data('payment-id')) || 0;
		const action = $(this).data('return-action');
		if (!paymentId || !action) return;

		if (action === 'receptionist') returnToReceptionist(paymentId);
		if (action === 'doctor') returnToDoctor(paymentId);
		if (action === 'psychologist') returnToPsychologist(paymentId);
		if (action === 'appointment') returnToAppointment(paymentId);
	});

	$(document).off('click', '.js-go-login').on('click', '.js-go-login', function () {
		window.location.href = '/login.html';
	});

	// Print button
	$('#printBtn').on('click', function () {
		printInvoices();
	});

	// Select all checkbox
	$('#selectAll').on('change', function () {
		const isChecked = $(this).is(':checked');
		$('.payment-checkbox').prop('checked', isChecked);
		updateSelectedItems();
	});

	// Per page selector
	$('#perPageSelect').on('change', function () {
		perPage = parseInt($(this).val());
		currentPage = 1;
		loadPaymentData();
	});

	// Print invoice button (always active)
	$('#printInvoiceBtn').on('click', function () {
		printInvoice();
	});

	// Reload danh sách hóa đơn khi modal đóng (bind 1 lần)
	$('#examinationDetailModal').off('hidden.bs.modal').on('hidden.bs.modal', function () {
		loadPaymentData();
	});
}

// Load payment data from API
function loadPaymentData() {
	showLoading(true);

	$.ajax({
		url: '/api/payment-waiting',
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
		},
		data: {
			page: currentPage,
			per_page: perPage,
			status: $('#statusFilter').val(),
			start_date: $('#startDate').val(),
			end_date: $('#endDate').val(),
			search: $('#searchInput').val()
		},
		success: function (response) {
			paymentData = response.data || [];
			totalItems = response.total || 0;
			totalPages = Math.ceil(totalItems / perPage);

			// Backend trả về data đã filter
			filteredData = [...paymentData];

			renderPaymentTable();
			updatePagination();
			showLoading(false);
		},
		error: function (xhr, status, error) {
			showCustomToast('error', 'Có lỗi xảy ra khi tải dữ liệu');
			showLoading(false);
		}
	});
}

// Render payment table
function renderPaymentTable() {
	const tbody = $('#paymentTableBody');
	tbody.empty();

	if (filteredData.length === 0) {
		tbody.append(`
            <tr>
                <td colspan="7" class="text-center py-4">
                    <i class="bi bi-inbox text-muted pw-empty-icon"></i>
                    <p class="text-muted mt-2">Không có dữ liệu</p>
                </td>
            </tr>
        `);
		return;
	}

	filteredData.forEach(function (payment) {
		const safeId = Number(payment.id) || 0;
		const safePatientName = escapeHtml(payment.patient_name || '');
		const safePhone = escapeHtml(payment.phone_number || '');
		const safeDateTime = escapeHtml(formatDateTime(payment.examination_date));
		const safeDoctorName = escapeHtml(payment.doctor_name || '');

		const row = `
            <tr>
                <td>
                    <input type="checkbox" class="form-check-input payment-checkbox" value="${safeId}">
                </td>
                <td>${safePatientName}</td>
                <td>${safePhone}</td>
                <td>${safeDateTime}</td>
                <td>${safeDoctorName}</td>
                <td>${getStatusBadge(payment)}</td>
                <td class="text-center">
                    <div class="d-flex gap-1 justify-content-center">
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-primary js-edit-payment" data-payment-id="${safeId}" title="Chỉnh sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-danger js-delete-payment" data-payment-id="${safeId}" title="Trả lại">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
		tbody.append(row);
	});

	// [THÊM MỚI] Bơm thêm các "Fake Row" rỗng để duy trì cấu trúc Grid chuẩn chuyên nghiệp
	const emptyRowsCount = perPage - filteredData.length;
	for (let i = 0; i < emptyRowsCount; i++) {
		tbody.append(`
			<tr class="empty-row pw-empty-row">
				<td>&nbsp;</td>
				<td></td>
				<td></td>
				<td></td>
				<td></td>
				<td></td>
				<td></td>
			</tr>
		`);
	}

	// Bind checkbox events
	$('.payment-checkbox').on('change', function () {
		updateSelectedItems();
	});
}

// Get status badge HTML
function getStatusBadge(payment) {
	if (isPaymentPaid(payment)) {
		return '<span class="qlpk-status qlpk-status--success pw-payment-status"><i class="bi bi-check-circle-fill"></i>Đã thanh toán</span>';
	}
	return '<span class="qlpk-status qlpk-status--warning pw-payment-status"><i class="bi bi-clock-fill"></i>Chờ thanh toán</span>';
}

// Update pagination
function updatePagination() {
	const pagination = $('#pagination');
	pagination.empty();

	if (totalPages <= 1) return;

	// Previous button
	const prevDisabled = currentPage === 1 ? 'disabled' : '';
	pagination.append(`
        <li class="page-item ${prevDisabled}">
            <a class="page-link js-change-page" href="#" data-page="${currentPage - 1}">Trước</a>
        </li>
    `);

	// Page numbers
	const startPage = Math.max(1, currentPage - 2);
	const endPage = Math.min(totalPages, currentPage + 2);

	for (let i = startPage; i <= endPage; i++) {
		const active = i === currentPage ? 'active' : '';
		pagination.append(`
            <li class="page-item ${active}">
                <a class="page-link js-change-page" href="#" data-page="${i}">${i}</a>
            </li>
        `);
	}

	// Next button
	const nextDisabled = currentPage === totalPages ? 'disabled' : '';
	pagination.append(`
        <li class="page-item ${nextDisabled}">
            <a class="page-link js-change-page" href="#" data-page="${currentPage + 1}">Sau</a>
        </li>
    `);

	// Update total items display
	$('#totalItems').text(totalItems);
}

// Change page
function changePage(page) {
	if (page < 1 || page > totalPages) return;
	currentPage = page;
	loadPaymentData();
}

// Perform search
function performSearch() {
	// Reload data with search query
	currentPage = 1;
	loadPaymentData();
}

// Apply filters
function applyFilters() {
	// Reload data with filters
	currentPage = 1;
	loadPaymentData();
}



// Update selected items
function updateSelectedItems() {
	selectedItems = [];
	$('.payment-checkbox:checked').each(function () {
		selectedItems.push($(this).val());
	});

	// Update select all checkbox
	const totalCheckboxes = $('.payment-checkbox').length;
	const checkedCheckboxes = $('.payment-checkbox:checked').length;

	if (checkedCheckboxes === 0) {
		$('#selectAll').prop('indeterminate', false).prop('checked', false);
	} else if (checkedCheckboxes === totalCheckboxes) {
		$('#selectAll').prop('indeterminate', false).prop('checked', true);
	} else {
		$('#selectAll').prop('indeterminate', true);
	}
}

// Edit payment - mở modal chi tiết hóa đơn
function editPayment(paymentId) {
	// Payment ID chính là Examination ID
	loadExaminationDetailModal(paymentId);
}

// Load examination detail modal
function loadExaminationDetailModal(paymentId) {
	financialSummaryCache = null;

	// Check if token exists
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		$('#examinationDetailContent').html(`
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle text-danger pw-error-icon"></i>
                <h5 class="mt-3 text-danger">Lỗi xác thực</h5>
                <p class="text-muted">Vui lòng đăng nhập lại để tiếp tục</p>
                <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn btn-primary js-go-login">
                    <i class="bi bi-box-arrow-in-right me-2"></i>Đăng nhập
                </button>
            </div>
        `);
		$('#examinationDetailModal').modal('show');
		return;
	}

	$('#examinationDetailContent').html(`
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Đang tải...</span>
            </div>
            <p class="mt-3 text-muted">Đang tải thông tin hóa đơn...</p>
        </div>
    `);

	// Reset trạng thái nút "Xác nhận hoá đơn" về mặc định khi mở modal mới
	$('#exportInvoiceBtn')
		.text('Xác nhận hoá đơn')
		.prop('disabled', false)
		.removeClass('btn-secondary')
		.addClass('btn-success');

	$('#examinationDetailModal').modal('show');

	// Load examination detail data
	$.ajax({
		url: `/api/examination-detail/${paymentId}`,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (data) {
			// Lưu examination ID vào modal và global variable
			$('#examinationDetailModal').data('examination-id', paymentId);
			window.currentExaminationId = paymentId;
			renderExaminationDetailContent(data, paymentId);
		},
		error: function (xhr) {
			let errorMessage = 'Không thể tải thông tin hóa đơn';
			if (xhr.status === 401) {
				errorMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
			} else if (xhr.responseJSON?.detail) {
				errorMessage = getSafeApiErrorMessage(xhr, errorMessage);
			}
			const safeErrorMessage = escapeHtml(errorMessage);

			$('#examinationDetailContent').html(`
                <div class="text-center py-5">
                    <i class="bi bi-exclamation-triangle text-danger pw-error-icon"></i>
                    <h5 class="mt-3 text-danger">Lỗi khi tải thông tin</h5>
                    <p class="text-muted">${safeErrorMessage}</p>
                    <div class="mt-3">
                        <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-primary me-2 js-retry-load-invoice" data-payment-id="${Number(paymentId) || 0}">
                            <i class="bi bi-arrow-clockwise me-2"></i>Thử lại
                        </button>
                        <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn btn-outline-primary js-go-login">
                            <i class="bi bi-box-arrow-in-right me-2"></i>Đăng nhập lại
                        </button>
                    </div>
                </div>
            `);
		}
	});
}

function buildExaminationDetailContentHtml(viewModel) {
	const {
		safeExaminationDate,
		safeDoctorName,
		safeExaminationTime,
		safePatientName,
		safePatientGender,
		safePatientPhone,
		safePatientBirthDate,
		examinationType
	} = viewModel;
	return `
        <div id="invoiceDetailForm">
            <!-- Section I: Thông tin ca khám -->
            <div class="mb-3">
                <h5 class="section-title">I. Thông tin ca khám</h5>
                
                <div class="row g-2">
                    <div class="col-md-6">
                        <label class="form-label required-field">Ngày khám</label>
                        <input type="date" class="form-control" id="examinationDate" value="${safeExaminationDate}" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Người khám</label>
                        <input type="text" class="form-control" id="doctorName" value="${safeDoctorName}" readonly>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label required-field">Giờ khám</label>
                        <input type="time" class="form-control" id="examinationTime" value="${safeExaminationTime}" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label required-field">Loại khám</label>
                        <select class="form-select" id="examinationType" required>
                            <option value="">Chọn loại khám</option>
                            <option value="SERVICE" ${examinationType === 'SERVICE' ? 'selected' : ''}>Theo dịch vụ</option>
                            <option value="PACKAGE" ${examinationType === 'PACKAGE' ? 'selected' : ''}>Theo gói</option>
                        </select>
                    </div>
                </div>
            </div>

            <!-- Section II: Thông tin bệnh nhân -->
            <div class="mb-3">
                <h5 class="section-title">II. Thông tin bệnh nhân</h5>
                
                <div class="patient-section">
                    <div class="row g-2">
                        <div class="col-md-6">
                            <label class="form-label required-field">Họ và tên</label>
                            <input type="text" class="form-control" id="patientName" value="${safePatientName}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Giới tính</label>
                            <input type="text" class="form-control" id="patientGender" value="${safePatientGender}" readonly>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label required-field">Số điện thoại</label>
                            <input type="text" class="form-control" id="patientPhone" value="${safePatientPhone}" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label required-field">Ngày sinh</label>
                            <input type="text" class="form-control js-datepicker" id="patientBirthDate" 
                                value="${safePatientBirthDate}" 
                                data-alt-format="d/m/Y" data-date-format="Y-m-d"
                                placeholder="Chọn ngày sinh..." required>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Section III: Các dịch vụ đã sử dụng -->
            <div class="mb-3">
                <h5 class="section-title">III. Các dịch vụ đã sử dụng</h5>
                
                <div class="service-header">
                    <div class="service-controls">
                        <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn btn-primary" id="addServiceBtn">
                            <i class="bi bi-plus"></i> Thêm dịch vụ
                        </button>
                    </div>
                </div>
                
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th class="text-center pw-invoice-col-stt">STT</th>
                                <th class="pw-invoice-col-name">Tên dịch vụ</th>
                                <th class="pw-invoice-col-price">Đơn giá</th>
                                <th class="text-center pw-invoice-col-percent">Chiết khấu</th>
                                <th class="text-center pw-invoice-col-percent">Thuế GTGT</th>
                                <th class="text-end pw-invoice-col-price">Thành tiền</th>
                                <th class="text-center pw-invoice-col-actions">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody id="servicesTableBody">
                            <tr>
                                <td colspan="7" class="text-center text-muted py-4">
                                    <i class="bi bi-inbox pw-empty-icon"></i>
                                    <p class="mt-2">Chưa có dịch vụ nào</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Section IV: Đơn thuốc -->
            <div class="mb-4">
                <h5 class="section-title">IV. Đơn thuốc</h5>
                
                <div class="table-responsive">
                    <table class="table">
                        <thead>
                            <tr>
                                <th class="text-center pw-invoice-col-stt">STT</th>
                                <th class="pw-invoice-col-name">Tên thuốc</th>
                                <th class="pw-invoice-col-price">Liều lượng</th>
                                <th class="pw-invoice-col-percent">Số lượng</th>
                                <th class="pw-invoice-col-percent">Ghi chú</th>
                                <th class="pw-invoice-col-price"></th>
                            </tr>
                        </thead>
                        <tbody id="prescriptionsTableBody">
                            <tr>
                                <td colspan="6" class="text-center text-muted py-4">
                                    <i class="bi bi-inbox pw-empty-icon"></i>
                                    <p class="mt-2">Chưa có đơn thuốc nào</p>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Section V: Thông tin thanh toán -->
            <div class="mb-4">
                <h5 class="section-title">V. THÔNG TIN THANH TOÁN</h5>
            </div>

            <!-- Financial Summary -->
            <div class="financial-summary">
                <div class="pw-financial-row">Tổng tiền trước thuế: <span id="subtotal" class="pw-financial-value">0 ₫</span></div>
                <div class="pw-financial-row">Chiết khấu: <span id="discount" class="pw-financial-value">0 ₫</span></div>
                <div class="pw-financial-row">Thuế GTGT: <span id="vat" class="pw-financial-value">0 ₫</span></div>
                <div class="pw-financial-row">Tổng tiền sau thuế: <span id="total" class="pw-financial-value">0 ₫</span></div>
                <div class="pw-financial-row">Đã nhận trước: <input type="text" id="advancePayment" class="form-control form-control-sm money-input pw-money-input" placeholder="0"></div>
                <div class="pw-financial-row">Cần thanh toán: <span id="finalAmount" class="pw-financial-value">0 ₫</span></div>
                <div class="pw-financial-row">Số tiền trả: <input type="text" id="amountPaid" class="form-control form-control-sm money-input pw-money-input" placeholder="0"></div>
                <div class="pw-financial-row">Tiền thối: <span id="changeAmount" class="pw-financial-value">0 ₫</span></div>
            </div>
        </div>
    `;
}

// Render examination detail content
function renderExaminationDetailContent(data, examinationId) {
	// Kiểm tra trạng thái examination/payment để khóa form
	const isConfirmed = isExaminationConfirmed(data);
	const safeExaminationDate = escapeAttr(data.examination_date?.split('T')[0] || '');
	const safeDoctorName = escapeAttr(data.doctor?.full_name || '');
	const safeExaminationTime = escapeAttr(data.examination_time || '');
	const safePatientName = escapeAttr(data.patient?.full_name || '');
	const safePatientGender = escapeAttr(toVietnameseGender(data.patient?.gender) || '');
	const safePatientPhone = escapeAttr(data.patient?.phone_number || '');
	const safePatientBirthDate = escapeAttr(data.patient?.date_of_birth?.split('T')[0] || '');

	const content = buildExaminationDetailContentHtml({
		safeExaminationDate,
		safeDoctorName,
		safeExaminationTime,
		safePatientName,
		safePatientGender,
		safePatientPhone,
		safePatientBirthDate,
		examinationType: data.examination_type
	});

	$('#examinationDetailContent').html(content);



	// Load services and prescriptions
	loadServicesForModal(examinationId);
	loadPrescriptionsForModal(examinationId);

	// Bind event handlers
	bindExaminationDetailEvents(examinationId);

	// Đảm bảo financial summary hiển thị và nạp tổng tiền 1 lần
	setTimeout(() => {
		$('.financial-summary').show();
		loadFinancialSummaryFromDB(examinationId);
	}, 100);

	// Load thông tin thanh toán từ database
	if (data.advance_payment) {
		$('#advancePayment').val(formatCurrency(data.advance_payment));
	}
	if (data.amount_paid) {
		$('#amountPaid').val(formatCurrency(data.amount_paid));
	}

	// Nếu đã xác nhận, disable form (sau khi load data)
	if (isConfirmed) {
		disableInvoiceForm();
		$('#exportInvoiceBtn').text('Đã xác nhận').prop('disabled', true).removeClass('btn-success').addClass('btn-secondary');
	}

	// ===== KHỞI TẠO FLATPICKR SAU KHI RENDER HTML XONG =====
	setTimeout(function () {
		const birthDateInput = document.getElementById('patientBirthDate');

		if (birthDateInput) {
			// Destroy Flatpickr cũ nếu có
			if (birthDateInput._flatpickr) {
				birthDateInput._flatpickr.destroy();
			}

			// Lưu giá trị hiện tại
			const currentValue = birthDateInput.value;

			// Khởi tạo Flatpickr mới
			flatpickr(birthDateInput, {
				dateFormat: 'Y-m-d',
				altInput: true,
				altFormat: 'd/m/Y',
				locale: 'vi',
				allowInput: true
			});

			// Set lại giá trị sau khi khởi tạo
			if (currentValue && birthDateInput._flatpickr) {
				birthDateInput._flatpickr.setDate(currentValue, true);
			}
		}
	}, 150);

}

// Load services for modal
function loadServicesForModal(examinationId) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		return;
	}

	$.ajax({
		url: `/api/examination-detail/${examinationId}/services`,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (data) {
			renderServicesTable(data);
			loadFinancialSummaryFromDB(examinationId);
		},
		error: function () {
			// Silent fail
		}
	});
}

// Load prescriptions for modal
function loadPrescriptionsForModal(examinationId) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		return;
	}

	$.ajax({
		url: `/api/prescription/appointment/${examinationId}`,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (data) {
			const rows = (data?.medicines || []).map(medicine => ({
				medicine_name: medicine.name || '',
				unit: medicine.unit || '',
				quantity: medicine.quantity ?? '',
				usage_instructions: medicine.usage || data.usage_instructions || ''
			}));
			renderPrescriptionsTable(rows);
		},
		error: function () {
			// Silent fail
		}
	});
}

// Bind event handlers for examination detail modal
function bindExaminationDetailEvents(examinationId) {
	// Add service button
	$('#addServiceBtn').off('click').on('click', function () {
		showAddServiceModal();
	});

	// Money input events
	$('.money-input').off('input focus blur click').on('input', function () {
		const input = $(this);
		const cursorPosition = input[0].selectionStart;
		const value = input.val();

		// Store cursor position before formatting
		const beforeFormat = value.substring(0, cursorPosition).replace(/[^\d]/g, '').length;

		// Format the value
		const formatted = formatCurrencyInput(value);
		input.val(formatted);

		// Restore cursor position after formatting
		if (formatted) {
			let newPosition = 0;
			let digitCount = 0;
			for (let i = 0; i < formatted.length; i++) {
				if (/^\d$/.test(formatted[i])) {
					digitCount++;
					if (digitCount === beforeFormat) {
						newPosition = i + 1;
						break;
					}
				}
			}
			input[0].setSelectionRange(newPosition, newPosition);
		}

		calculateFinancials();
	}).on('focus', function () {
		const input = $(this);
		const value = input.val();
		if (value && value !== '0') {
			input.select();
		}
	}).on('blur', function () {
		const input = $(this);
		const value = input.val();
		if (!value || value === '0') {
			input.val('0');
			calculateFinancials();
		}
	}).on('click', function () {
		const input = $(this);
		const value = input.val();
		if (value && value !== '0') {
			input.select();
		}
	});

	// Quick buttons for money input
	$('.quick-btn').off('click').on('click', function () {
		const value = $(this).data('value');
		const input = $(this).closest('.financial-value').find('.money-input');
		input.val(formatCurrencyInput(value.toString()));
		calculateFinancials();
	});

	// Clear buttons for money input
	$('.clear-btn').off('click').on('click', function () {
		const input = $(this).closest('.financial-value').find('.money-input');
		input.val('0').focus();
		calculateFinancials();
	});

	// Confirm invoice button
	$('#exportInvoiceBtn').off('click').on('click', function () {
		confirmInvoice(examinationId);
	});



	// Select all prescriptions
	$('#selectAllPrescriptions').off('change').on('change', function () {
		toggleAllPrescriptions();
	});
}

// Render services table
function renderServicesTable(services) {
	const tbody = $('#servicesTableBody');
	tbody.empty();

	if (services.length === 0) {
		tbody.append(`
            <tr>
                <td colspan="7" class="text-center text-muted py-4">
                    <i class="bi bi-inbox pw-empty-icon"></i>
                    <p class="mt-2">Chưa có dịch vụ nào</p>
                </td>
            </tr>
        `);
		return;
	}

	services.forEach((service, index) => {
		const safeServiceId = Number(service.id) || 0;
		const unitPrice = parseFloat(service.unit_price) || 0;
		const discountPercent = parseFloat(service.discount_percent) || 0;
		const taxPercent = parseFloat(service.tax_percent) || 0;
		const safeServiceName = escapeHtml(service.service_name || '');
		// Tiền trước thuế sau chiết khấu
		const preTaxAmount = unitPrice * (1 - (discountPercent / 100));
		// Thuế
		const taxAmount = preTaxAmount * (taxPercent / 100);
		// Thành tiền = trước thuế + thuế
		const totalAmount = preTaxAmount + taxAmount;
		const row = `
            <tr data-pre-tax="${preTaxAmount}" data-tax="${taxAmount}" data-total-amount="${totalAmount}" data-service-id="${safeServiceId}">
                <td class="text-center pw-invoice-col-stt">${index + 1}</td>
                <td class="pw-invoice-col-name">${safeServiceName}</td>
                <td class="pw-invoice-col-price">${formatCurrency(unitPrice)}</td>
                <td class="text-center pw-invoice-col-percent">${discountPercent}%</td>
                <td class="text-center pw-invoice-col-percent">${taxPercent}%</td>
                <td class="text-end pw-invoice-col-price">${formatCurrency(totalAmount)}</td>
                <td class="text-center pw-invoice-col-actions">
                    <div class="d-flex gap-1 justify-content-center">
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-primary js-edit-service" data-service-id="${safeServiceId}" title="Chỉnh sửa">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-danger js-delete-service" data-service-id="${safeServiceId}" title="Xóa dịch vụ">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
		tbody.append(row);
	});

}

// Render prescriptions table
function renderPrescriptionsTable(prescriptions) {
	const tbody = $('#prescriptionsTableBody');
	tbody.empty();

	if (prescriptions.length === 0) {
		tbody.append(`
            <tr>
                <td colspan="6" class="text-center text-muted py-4">
                    <i class="bi bi-inbox pw-empty-icon"></i>
                    <p class="mt-2">Chưa có đơn thuốc nào</p>
                </td>
            </tr>
        `);
		return;
	}

	prescriptions.forEach((prescription, index) => {
		const safeMedicineName = escapeHtml(prescription.medicine_name || '');
		const safeUnit = escapeHtml(prescription.unit || '');
		const safeQuantity = escapeHtml(prescription.quantity || '');
		const safeUsageInstructions = escapeHtml(prescription.usage_instructions || '');
		const row = `
            <tr>
                <td class="text-center pw-invoice-col-stt">${index + 1}</td>
                <td class="pw-invoice-col-name">${safeMedicineName}</td>
                <td class="pw-invoice-col-price">${safeUnit}</td>
                <td class="pw-invoice-col-percent">${safeQuantity}</td>
                <td class="pw-invoice-col-percent">${safeUsageInstructions}</td>
                <td class="pw-invoice-col-price"></td>
            </tr>
        `;
		tbody.append(row);
	});
}

// Calculate financials
function calculateFinancials() {
	if (financialSummaryCache) {
		updateFinancialDisplay(
			financialSummaryCache.subtotalPreTax,
			financialSummaryCache.totalDiscount,
			financialSummaryCache.vat,
			financialSummaryCache.total
		);
		return;
	}

	// Nếu chưa có cache, tính từ bảng dịch vụ
	calculateFromServicesTable();
}

// Load financial summary từ database
function loadFinancialSummaryFromDB(examinationId) {
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		calculateFromServicesTable();
		return;
	}

	$.ajax({
		url: `/api/examination-detail/${examinationId}/financial-summary`,
		method: 'GET',
		headers: {
			'Authorization': `Bearer ${token}`
		},
		success: function (data) {
			// Sử dụng dữ liệu từ database
			const subtotalPreTax = parseFloat(data.subtotal_pre_tax) || 0;
			const totalDiscount = parseFloat(data.total_discount) || 0;
			const vat = parseFloat(data.vat_amount) || 0;
			const total = parseFloat(data.total_after_tax) || 0;

			financialSummaryCache = { subtotalPreTax, totalDiscount, vat, total };
			updateFinancialDisplay(subtotalPreTax, totalDiscount, vat, total);
		},
		error: function (xhr) {
			// Nếu không có dữ liệu từ DB, tính từ bảng dịch vụ
			financialSummaryCache = null;
			calculateFromServicesTable();
		}
	});
}

// Tính toán từ bảng dịch vụ
function calculateFromServicesTable() {
	// Get all service rows
	const serviceRows = $('#servicesTableBody tr').not(':has(td[colspan])');
	let subtotalPreTax = 0;  // Tổng đơn giá gốc
	let totalDiscount = 0;   // Tổng tiền chiết khấu
	let totalTax = 0;        // Tổng tiền thuế
	let totalAfterTax = 0;   // Tổng thành tiền

	serviceRows.each(function () {
		const unitPrice = parseFloat($(this).find('td:nth-child(3)').text().replace(/[^\d]/g, '')) || 0;
		const discountPercent = parseFloat($(this).find('td:nth-child(4)').text().replace('%', '')) || 0;
		const taxPercent = parseFloat($(this).find('td:nth-child(5)').text().replace('%', '')) || 0;
		const total = parseFloat($(this).find('td:nth-child(6)').text().replace(/[^\d]/g, '')) || 0;

		// Đơn giá gốc
		subtotalPreTax += unitPrice;

		// Tiền chiết khấu
		const discountAmount = unitPrice * (discountPercent / 100);
		totalDiscount += discountAmount;

		// Tiền thuế
		const priceAfterDiscount = unitPrice - discountAmount;
		const taxAmount = priceAfterDiscount * (taxPercent / 100);
		totalTax += taxAmount;

		// Thành tiền
		totalAfterTax += total;
	});

	updateFinancialDisplay(subtotalPreTax, totalDiscount, totalTax, totalAfterTax);
}

// Cập nhật hiển thị tài chính
function updateFinancialDisplay(subtotalPreTax, totalDiscount, vat, total) {
	const advancePayment = handleSmartMoneyInput($('#advancePayment').val()) || 0;
	const finalAmount = total - advancePayment;
	const amountPaid = handleSmartMoneyInput($('#amountPaid').val()) || 0;
	const changeAmount = amountPaid - finalAmount;

	$('#subtotal').text(formatCurrency(subtotalPreTax));
	$('#discount').text(formatCurrency(totalDiscount));
	$('#vat').text(formatCurrency(vat));
	$('#total').text(formatCurrency(total));
	$('#finalAmount').text(formatCurrency(finalAmount));
	$('#changeAmount').text(formatCurrency(changeAmount));
}

// Show add service modal
function showAddServiceModal() {
	// Load service options
	loadServiceOptions();
	$('#addServiceModal').modal('show');
}

// Load service options
function loadServiceOptions() {
	$.ajax({
		url: '/services/',
		method: 'GET',
		success: function (response) {
			const services = response || [];
			const select = $('#serviceSelect');
			select.empty();
			select.append('<option value="">Chọn dịch vụ</option>');

			services.forEach(service => {
				const price = service.default_price || 0;
				const safeServiceId = escapeAttr(service.id);
				const safePrice = escapeAttr(price);
				const safeServiceName = escapeHtml(service.name || '');
				const safeServiceNameAttr = escapeAttr(service.name || '');
				select.append(`<option value="${safeServiceId}" data-price="${safePrice}" data-service-name="${safeServiceNameAttr}">${safeServiceName} - ${formatCurrency(price)}</option>`);
			});
		},
		error: function (xhr) {
			showCustomToast('error', 'Không thể tải danh sách dịch vụ');
		}
	});
}

// Save new service
function saveNewService() {
	if (isInvoiceLocked()) {
		showCustomToast('warning', 'Hóa đơn đã xác nhận, không thể chỉnh sửa');
		return;
	}
	const serviceIdRaw = $('#serviceSelect').val();
	const serviceId = Number(serviceIdRaw);
	const price = parseFloat($('#servicePrice').val()) || 0;
	const discount = parseFloat($('#serviceDiscount').val()) || 0;
	const taxPercentInput = parseFloat($('#serviceTax').val()) || 0;

	if (!serviceIdRaw || !Number.isFinite(serviceId) || serviceId <= 0) {
		showCustomToast('error', 'Vui lòng chọn dịch vụ hợp lệ');
		return;
	}
	if (price <= 0) {
		showCustomToast('error', 'Đơn giá phải lớn hơn 0');
		return;
	}
	if (discount < 0 || discount > 100) {
		showCustomToast('error', 'Chiết khấu phải trong khoảng 0-100%');
		return;
	}
	if (taxPercentInput < 0) {
		showCustomToast('error', 'Thuế GTGT không được âm');
		return;
	}

	const examinationId = $('#examinationDetailModal').data('examination-id');
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin khám');
		return;
	}

	// Gọi API để lưu dịch vụ
	const priceAfterDiscount = price * (1 - (discount / 100));
	const totalAmount = priceAfterDiscount + (priceAfterDiscount * (taxPercentInput / 100));

	$.ajax({
		url: `/api/examination-detail/${examinationId}/services`,
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			service_id: Number(serviceId),
			service_name: $('#serviceSelect option:selected').data('service-name') || $('#serviceSelect option:selected').text(),
			unit_price: price,
			discount_percent: discount,
			tax_percent: taxPercentInput,
			total_amount: totalAmount,
			patient_id: null // Sẽ được lấy từ examination
		}),
		success: function (response) {
			showCustomToast('success', 'Thêm dịch vụ thành công');
			$('#addServiceModal').modal('hide');
			financialSummaryCache = null;

			// Reload services table
			loadServicesForModal(examinationId);
		},
		error: function (xhr) {
			const errorMessage = getSafeApiErrorMessage(xhr, 'Không thể thêm dịch vụ. Vui lòng kiểm tra lại.');
			showCustomToast('error', errorMessage);
		}
	});
}

// Edit service
function editService(serviceId) {
	if (isInvoiceLocked()) {
		showCustomToast('warning', 'Hóa đơn đã xác nhận, không thể chỉnh sửa');
		return;
	}
	const examinationId = $('#examinationDetailModal').data('examination-id');
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin khám');
		return;
	}

	// Tìm service trong table để lấy thông tin hiện tại
	const serviceRow = $(`tr[data-service-id="${serviceId}"]`);
	if (serviceRow.length === 0) {
		showCustomToast('error', 'Không tìm thấy thông tin dịch vụ');
		return;
	}

	// Lấy thông tin từ table
	const serviceName = serviceRow.find('td:nth-child(2)').text();
	const unitPrice = serviceRow.find('td:nth-child(3)').text().replace(/[^\d]/g, '');
	const discountPercent = serviceRow.find('td:nth-child(4)').text().replace('%', '');
	const taxPercent = serviceRow.find('td:nth-child(5)').text().replace('%', '');

	showEditServiceModal(serviceId, serviceName, unitPrice, discountPercent, taxPercent);
}

function buildEditServiceModalHtml(viewModel) {
	const {
		safeServiceId,
		safeServiceName,
		safeUnitPrice,
		safeDiscountPercent,
		safeTaxPercent
	} = viewModel;
	return `
        <div class="modal fade" id="editServiceModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Chỉnh sửa dịch vụ</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label class="form-label fw-bold">TÊN DỊCH VỤ</label>
                            <input type="text" class="form-control" id="editServiceName" value="${safeServiceName}" readonly>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">ĐƠN GIÁ</label>
                                    <input type="number" class="form-control" id="editServicePrice" value="${safeUnitPrice}" min="0" step="1000">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">CHIẾT KHẤU (%)</label>
                                    <input type="number" class="form-control" id="editServiceDiscount" value="${safeDiscountPercent}" min="0" max="100" step="1">
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">THUẾ GTGT</label>
                                    <input type="number" class="form-control" id="editServiceTax" value="${safeTaxPercent}" min="0" step="1">
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="mb-3">
                                    <label class="form-label fw-bold">THÀNH TIỀN</label>
                                    <input type="text" class="form-control pw-readonly-input" id="editServiceTotal" readonly>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
                        <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="btn btn-primary js-save-edit-service" data-service-id="${safeServiceId}">Lưu thay đổi</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Show edit service modal
function showEditServiceModal(serviceId, serviceName, unitPrice, discountPercent, taxPercent) {
	// Remove existing modal if any
	const existingModal = $('#editServiceModal');
	if (existingModal.length > 0) {
		existingModal.remove();
	}

	const modalHtml = buildEditServiceModalHtml({
		safeServiceId: Number(serviceId) || 0,
		safeServiceName: escapeAttr(serviceName),
		safeUnitPrice: escapeAttr(unitPrice),
		safeDiscountPercent: escapeAttr(discountPercent),
		safeTaxPercent: escapeAttr(taxPercent)
	});

	$('body').append(modalHtml);
	const modal = new bootstrap.Modal(document.getElementById('editServiceModal'));
	modal.show();

	// Calculate total when inputs change
	$('#editServicePrice, #editServiceDiscount, #editServiceTax').on('input', calculateEditServiceTotal);
	calculateEditServiceTotal();

	// Clean up modal when hidden
	$('#editServiceModal').on('hidden.bs.modal', function () {
		$(this).remove();
	});
}

// Calculate total for edit service modal
function calculateEditServiceTotal() {
	const price = parseFloat($('#editServicePrice').val()) || 0;
	const discountPercent = parseFloat($('#editServiceDiscount').val()) || 0;
	const taxPercent = parseFloat($('#editServiceTax').val()) || 0;

	// Tiền trước thuế sau chiết khấu
	const preTaxAmount = price * (1 - (discountPercent / 100));
	// Thuế
	const taxAmount = preTaxAmount * (taxPercent / 100);
	// Thành tiền = trước thuế + thuế
	const totalAmount = preTaxAmount + taxAmount;

	$('#editServiceTotal').val(formatCurrency(totalAmount));
}

// Save edited service
function saveEditService(serviceId) {
	if (isInvoiceLocked()) {
		showCustomToast('warning', 'Hóa đơn đã xác nhận, không thể chỉnh sửa');
		return;
	}
	const examinationId = $('#examinationDetailModal').data('examination-id');
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin khám');
		return;
	}

	const price = parseFloat($('#editServicePrice').val()) || 0;
	const discountPercent = parseFloat($('#editServiceDiscount').val()) || 0;
	const taxPercent = parseFloat($('#editServiceTax').val()) || 0;
	const serviceName = $('#editServiceName').val();


	if (price <= 0) {
		showCustomToast('error', 'Đơn giá phải lớn hơn 0');
		return;
	}

	// Gọi API để cập nhật dịch vụ
	$.ajax({
		url: `/api/examination-detail/${examinationId}/services/${serviceId}`,
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			service_name: serviceName,
			unit_price: price,
			discount_percent: discountPercent,
			tax_percent: taxPercent
		}),
		success: function () {
			showCustomToast('success', 'Cập nhật dịch vụ thành công');
			$('#editServiceModal').modal('hide');
			financialSummaryCache = null;

			// Reload services table với delay nhỏ để đảm bảo database đã được cập nhật
			setTimeout(() => {
				loadServicesForModal(examinationId);
			}, 500);
		},
		error: function (xhr) {
			const errorMessage = 'Không thể cập nhật dịch vụ. Vui lòng kiểm tra lại.';
			showCustomToast('error', errorMessage);
		}
	});
}

// Delete service
function deleteService(serviceId) {
	if (isInvoiceLocked()) {
		showCustomToast('warning', 'Hóa đơn đã xác nhận, không thể chỉnh sửa');
		return;
	}
	const examinationId = $('#examinationDetailModal').data('examination-id');
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin khám');
		return;
	}

	Swal.fire(buildPaymentConfirmOptions({
		title: 'Xác nhận xóa?',
		text: 'Bạn có chắc chắn muốn xóa dịch vụ này?',
		icon: 'warning',
		confirmText: 'Xóa',
		cancelText: 'Hủy',
		variant: 'danger'
	})).then((result) => {
		if (result.isConfirmed) {
			$.ajax({
				url: `/api/examination-detail/${examinationId}/services/${serviceId}`,
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`
				},
				success: function (response) {
					showCustomToast('success', 'Xóa dịch vụ thành công');
					financialSummaryCache = null;
					// Reload services table
					loadServicesForModal(examinationId);
				},
				error: function (xhr) {
					const errorMessage = 'Không thể xóa dịch vụ. Vui lòng thử lại.';
					showCustomToast('error', errorMessage);
				}
			});
		}
	});
}

// Confirm invoice
function confirmInvoice(examinationId) {
	if (isConfirmInvoiceSubmitting) return;
	const token = localStorage.getItem('qlpk_token');
	if (!token) {
		showCustomToast('error', 'Vui lòng đăng nhập lại');
		return;
	}

	// Lấy thông tin thanh toán từ form
	const advancePayment = handleSmartMoneyInput($('#advancePayment').val()) || 0;
	const amountPaid = handleSmartMoneyInput($('#amountPaid').val()) || 0;
	const actualPrice = handleSmartMoneyInput($('#total').text()) || 0; // Tổng tiền sau thuế
	const finalAmount = handleSmartMoneyInput($('#finalAmount').text()) || 0;
	const changeAmount = handleSmartMoneyInput($('#changeAmount').text()) || 0;

	if (advancePayment < 0 || amountPaid < 0 || actualPrice < 0) {
		showCustomToast('error', 'Số tiền không được âm');
		return;
	}
	if (advancePayment > actualPrice) {
		showCustomToast('error', 'Đã nhận trước không được lớn hơn tổng tiền');
		return;
	}
	if (amountPaid < finalAmount) {
		showCustomToast('error', 'Số tiền trả chưa đủ để xác nhận hóa đơn');
		return;
	}
	if (changeAmount < 0) {
		showCustomToast('error', 'Tiền thối không hợp lệ');
		return;
	}

	// Hiển thị confirm dialog
	Swal.fire(buildPaymentConfirmOptions({
		title: 'Xác nhận hóa đơn?',
		text: 'Bạn có chắc chắn muốn xác nhận hóa đơn này? Sau khi xác nhận, không thể chỉnh sửa nữa.',
		icon: 'question',
		confirmText: 'Xác nhận',
		cancelText: 'Hủy',
		variant: 'success'
	})).then((result) => {
		if (result.isConfirmed) {
			isConfirmInvoiceSubmitting = true;
			$('#exportInvoiceBtn').prop('disabled', true);

			// Gọi API để xác nhận
			$.ajax({
				url: `/api/payment-waiting/${examinationId}/confirm`,
				method: 'PUT',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Content-Type': 'application/json'
				},
				data: JSON.stringify({
					advance_payment: advancePayment,
					amount_paid: amountPaid,
					actual_price: actualPrice
				}),
				success: function (response) {
					showCustomToast('success', 'Xác nhận hóa đơn thành công');

					// Disable tất cả form fields
					disableInvoiceForm();

					// Đổi text nút thành "Đã xác nhận"
					$('#exportInvoiceBtn').text('Đã xác nhận').prop('disabled', true).removeClass('btn-success').addClass('btn-secondary');

					// Refresh danh sách sau khi xác nhận
					loadPaymentData();
				},
				error: function (xhr) {
					$('#exportInvoiceBtn').prop('disabled', false);
					showCustomToast('error', 'Có lỗi xảy ra khi xác nhận hóa đơn');
				},
				complete: function () {
					isConfirmInvoiceSubmitting = false;
				}
			});
		}
	});
}

// Disable tất cả form fields trong invoice
function disableInvoiceForm() {
	// Disable các input fields chính + financial summary
	$('#examinationDetailContent #examinationDate, #examinationDetailContent #examinationTime, #examinationDetailContent #examinationType').prop('disabled', true);
	$('#examinationDetailContent #patientName, #examinationDetailContent #patientPhone, #examinationDetailContent #patientBirthDate').prop('disabled', true);
	$('#examinationDetailContent #advancePayment, #examinationDetailContent #amountPaid').prop('disabled', true);

	// Disable tất cả buttons trong nội dung modal
	$('#examinationDetailContent button').prop('disabled', true);
	$('#addServiceBtn').prop('disabled', true);

	// Disable checkboxes
	$('#examinationDetailContent input[type="checkbox"]').prop('disabled', true);

	// Disable select dropdowns
	$('#examinationDetailContent select').prop('disabled', true);

	// Thêm class để hiển thị trạng thái disabled
	$('#examinationDetailContent').addClass('invoice-confirmed');
}


// Toggle all prescriptions
function toggleAllPrescriptions() {
	const isChecked = $('#selectAllPrescriptions').is(':checked');
	$('.prescription-checkbox').prop('checked', isChecked);
}


// Delete payment - hiển thị modal chọn hành động trả lại
function deletePayment(paymentId) {
	// Hiển thị modal với các options trả lại
	CustomModal.confirm(
		'Bạn muốn thực hiện hành động gì?',
		'Chọn hành động'
	).then((confirmed) => {
		if (confirmed) {
			// Hiển thị modal chọn hành động
			showActionSelectionModal(paymentId);
		}
	});
}

function buildActionSelectionModalHtml(safePaymentId) {
	return `
        <div class="modal fade" id="actionSelectionModal" tabindex="-1" aria-labelledby="actionSelectionModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Chọn hành động</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="d-grid gap-2">
                            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-warning js-return-action" data-return-action="receptionist" data-payment-id="${safePaymentId}">
                                <i class="bi bi-arrow-left-circle"></i> Trả về lễ tân
                            </button>
                            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-info js-return-action" data-return-action="doctor" data-payment-id="${safePaymentId}">
                                <i class="bi bi-arrow-left-circle"></i> Trả về bác sĩ
                            </button>
                            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-secondary js-return-action" data-return-action="psychologist" data-payment-id="${safePaymentId}">
                                <i class="bi bi-arrow-left-circle"></i> Trả về tâm lý gia
                            </button>
                            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" class="btn btn-danger js-return-action" data-return-action="appointment" data-payment-id="${safePaymentId}">
                                <i class="bi bi-arrow-left"></i> Trả về lịch hẹn
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Hiển thị modal chọn hành động trả lại
function showActionSelectionModal(paymentId) {
	const safePaymentId = Number(paymentId) || 0;
	// Tạo lại modal mỗi lần để tránh giữ paymentId cũ
	$('#actionSelectionModal').remove();

	const modalHtml = buildActionSelectionModalHtml(safePaymentId);
	$('body').append(modalHtml);

	// Hiển thị modal
	const modal = new bootstrap.Modal(document.getElementById('actionSelectionModal'));
	modal.show();
}

// Trả về lễ tân
function returnToReceptionist(paymentId) {
	// Đóng modal
	const modal = bootstrap.Modal.getInstance(document.getElementById('actionSelectionModal'));
	modal.hide();

	CustomModal.confirm(
		'Bạn có chắc chắn muốn trả bệnh nhân này về lễ tân?',
		'Trả về lễ tân'
	).then((confirmed) => {
		if (confirmed) {
			executeReturnToReceptionist(paymentId);
		}
	});
}

// Trả về bác sĩ
function returnToDoctor(paymentId) {
	// Đóng modal
	const modal = bootstrap.Modal.getInstance(document.getElementById('actionSelectionModal'));
	modal.hide();

	CustomModal.confirm(
		'Bạn có chắc chắn muốn trả bệnh nhân này về bác sĩ?',
		'Trả về bác sĩ'
	).then((confirmed) => {
		if (confirmed) {
			executeReturnToDoctor(paymentId);
		}
	});
}

// Trả về tâm lý gia
function returnToPsychologist(paymentId) {
	// Đóng modal
	const modal = bootstrap.Modal.getInstance(document.getElementById('actionSelectionModal'));
	modal.hide();

	CustomModal.confirm(
		'Bạn có chắc chắn muốn trả bệnh nhân này về tâm lý gia?',
		'Trả về tâm lý gia'
	).then((confirmed) => {
		if (confirmed) {
			executeReturnToPsychologist(paymentId);
		}
	});
}

// Trả về lịch hẹn
function returnToAppointment(paymentId) {
	// Đóng modal
	const modal = bootstrap.Modal.getInstance(document.getElementById('actionSelectionModal'));
	modal.hide();

	CustomModal.confirm(
		'Bạn có chắc chắn muốn trả bệnh nhân này về lịch hẹn?',
		'Trả về lịch hẹn'
	).then((confirmed) => {
		if (confirmed) {
			executeReturnToAppointment(paymentId);
		}
	});
}

// Thực hiện trả về lễ tân
function executeReturnToReceptionist(paymentId) {
	const token = localStorage.getItem('qlpk_token');

	// Sử dụng API update status trực tiếp: WAITING_TRANSFER (chờ chuyển khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'WAITING_TRANSFER'
		}),
		success: function (response) {
			showCustomToast('success', 'Trả về lễ tân thành công!');
			loadPaymentData(); // Reload data
		},
		error: function (xhr) {
			const errorMsg = getSafeApiErrorMessage(xhr, 'Có lỗi xảy ra khi trả về lễ tân');
			showCustomToast('error', errorMsg);
		}
	});
}

// Thực hiện trả về bác sĩ
function executeReturnToDoctor(paymentId) {
	const token = localStorage.getItem('qlpk_token');

	// Sử dụng API update status trực tiếp: DOCTOR_EXAM (bác sĩ khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'DOCTOR_EXAM'
		}),
		success: function (response) {
			showCustomToast('success', 'Trả về bác sĩ thành công!');
			loadPaymentData(); // Reload data
		},
		error: function (xhr) {
			const errorMsg = getSafeApiErrorMessage(xhr, 'Có lỗi xảy ra khi trả về bác sĩ');
			showCustomToast('error', errorMsg);
		}
	});
}

// Thực hiện trả về tâm lý gia
function executeReturnToPsychologist(paymentId) {
	const token = localStorage.getItem('qlpk_token');

	// Sử dụng API update status trực tiếp: PSYCHOLOGIST_EXAM (tâm lý gia khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'PSYCHOLOGIST_EXAM'
		}),
		success: function (response) {
			showCustomToast('success', 'Trả về tâm lý gia thành công!');
			loadPaymentData(); // Reload data
		},
		error: function (xhr) {
			const errorMsg = getSafeApiErrorMessage(xhr, 'Có lỗi xảy ra khi trả về tâm lý gia');
			showCustomToast('error', errorMsg);
		}
	});
}

// Thực hiện trả về lịch hẹn
function executeReturnToAppointment(paymentId) {
	const token = localStorage.getItem('qlpk_token');

	// Tạm thời dùng cùng WAITING_TRANSFER như luồng trả lễ tân theo backend hiện tại.
	// Nếu backend tách trạng thái lịch hẹn riêng, cập nhật lại mapping tại đây.
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Authorization': `Bearer ${token}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'WAITING_TRANSFER'
		}),
		success: function (response) {
			showCustomToast('success', 'Trả về lịch hẹn thành công!');
			loadPaymentData(); // Reload data
		},
		error: function (xhr) {
			const errorMsg = getSafeApiErrorMessage(xhr, 'Có lỗi xảy ra khi trả về lịch hẹn');
			showCustomToast('error', errorMsg);
		}
	});
}

// Export payment data
function exportPaymentData() {
	if (selectedItems.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một bản ghi trên trang hiện tại để xuất');
		return;
	}

	$.ajax({
		url: '/api/payment-waiting/export',
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${localStorage.getItem('qlpk_token')}`,
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			payment_ids: selectedItems
		}),
		success: function (response) {
			// Create download link
			const link = document.createElement('a');
			link.href = response.download_url;
			link.download = `payment_data_${new Date().toISOString().split('T')[0]}.xlsx`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);

			showCustomToast('success', 'Xuất dữ liệu thành công');
		},
		error: function (xhr, status, error) {
			showCustomToast('error', 'Có lỗi xảy ra khi xuất dữ liệu');
		}
	});
}

// Print invoices
function printInvoices() {
	if (selectedItems.length === 0) {
		showCustomToast('warning', 'Vui lòng chọn ít nhất một hóa đơn trên trang hiện tại để in');
		return;
	}
	selectedItems.forEach((id) => {
		openInvoiceWindow(id);
	});
	showCustomToast('info', 'Đang mở hóa đơn trong tab mới');
}

// Show/hide loading spinner
function showLoading(show) {
	if (show) {
		$('#loadingSpinner').show();
		$('#paymentTable').hide();
	} else {
		$('#loadingSpinner').hide();
		$('#paymentTable').show();
	}
}

// Hàm hiển thị ngày giờ (dd/mm/yyyy HH:mm:ss)
function formatDateTime(dateString) {
	if (!dateString) return '';
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return '';

	const fallbackDate = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
	const dateFormatted = typeof window.formatDateDisplay === 'function'
		? window.formatDateDisplay(date)
		: fallbackDate;

	// Thêm phần giờ
	const hours = String(date.getHours()).padStart(2, '0');
	const minutes = String(date.getMinutes()).padStart(2, '0');
	const seconds = String(date.getSeconds()).padStart(2, '0');

	return `${hours}:${minutes}:${seconds} ${dateFormatted}`;
}



// Format currency
function formatCurrency(amount) {
	const numeric = Number(amount) || 0;
	return new Intl.NumberFormat('vi-VN', {
		style: 'currency',
		currency: 'VND'
	}).format(numeric);
}

// Print invoice function
function printInvoice() {
	try {
		let examinationId = $('#examinationDetailModal').data('examination-id');
		if (!examinationId) {
			const urlParams = new URLSearchParams(window.location.search);
			examinationId = urlParams.get('examination_id');
		}
		if (!examinationId && window.currentExaminationId) {
			examinationId = window.currentExaminationId;
		}
		if (!examinationId) {
			const apiUrl = window.location.href;
			const match = apiUrl.match(/\/examination-detail\/(\d+)/);
			if (match) {
				examinationId = match[1];
			}
		}
		if (!examinationId) {
			showCustomToast('error', 'Không tìm thấy thông tin hóa đơn');
			return;
		}
		openInvoiceWindow(examinationId);
	} catch (error) {
		showCustomToast('error', 'Không thể tạo hóa đơn. Vui lòng thử lại.');
	}
}

// Helper function to parse currency input
function parseCurrencyInput(input) {
	if (!input) return 0;
	// Remove all non-digit characters (including dots used as thousand separators)
	const cleaned = input.replace(/[^\d]/g, '');
	return parseInt(cleaned) || 0;
}

// Helper function to format currency input
function formatCurrencyInput(input) {
	if (!input) return '';
	// Remove all non-digit characters
	const cleaned = input.replace(/[^\d]/g, '');
	if (!cleaned) return '';
	const value = parseInt(cleaned);
	if (value === 0) return '';
	return new Intl.NumberFormat('vi-VN').format(value);
}

// Helper function to handle smart money input
function handleSmartMoneyInput(input) {
	if (input === null || input === undefined) return 0;
	let value = String(input).trim();
	if (!value) return 0;

	const lower = value.toLowerCase();
	if (lower.endsWith('k') || lower.endsWith('m') || lower.endsWith('t')) {
		const suffix = lower.slice(-1);
		const numericPart = lower.slice(0, -1).replace(/,/g, '.').replace(/\s+/g, '');
		const parsed = parseFloat(numericPart);
		if (!Number.isFinite(parsed)) return 0;
		if (suffix === 'k') return parsed * 1000;
		if (suffix === 'm') return parsed * 1000000;
		if (suffix === 't') return parsed * 1000000000;
	}

	const parsedCurrency = parseCurrencyInput(value);
	return Number.isFinite(parsedCurrency) ? parsedCurrency : 0;
}

// Show custom toast
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}
