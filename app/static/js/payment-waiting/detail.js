/* global calculateFinancials, confirmInvoice, disableInvoiceForm, escapeAttr, escapeHtml, financialSummaryCache: writable, formatCurrency, formatCurrencyInput, getSafeApiErrorMessage, isExaminationConfirmed, loadFinancialSummaryFromDB, renderPrescriptionsTable, renderServicesTable, showAddServiceModal, toVietnameseGender, toggleAllPrescriptions */
/* exported editPayment, financialSummaryCache */

// Edit payment - mở modal chi tiết hóa đơn
function editPayment(paymentId) {
	// Payment ID chính là Examination ID
	loadExaminationDetailModal(paymentId);
}

// Load examination detail modal
function loadExaminationDetailModal(paymentId) {
	financialSummaryCache = null;

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
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
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		return;
	}

	$.ajax({
		url: `/api/examination-detail/${examinationId}/services`,
		method: 'GET',
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
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		return;
	}

	$.ajax({
		url: `/api/prescription/appointment/${examinationId}`,
		method: 'GET',
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
