/* global buildPaymentConfirmOptions, escapeAttr, escapeHtml, financialSummaryCache: writable, formatCurrency, getSafeApiErrorMessage, isInvoiceLocked, loadServicesForModal, showCustomToast */
/* exported deleteService, editService, financialSummaryCache, renderPrescriptionsTable, renderServicesTable, saveEditService, saveNewService, showAddServiceModal */
// Parts (nạp trước file này): financials.js

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
                        <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm js-edit-service" data-service-id="${safeServiceId}" title="Chỉnh sửa">
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
		error: function () {
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
		success: function () {
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
        <div class="modal fade qlpk-edit-service-modal" id="editServiceModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
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
		error: function () {
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
				success: function () {
					showCustomToast('success', 'Xóa dịch vụ thành công');
					financialSummaryCache = null;
					// Reload services table
					loadServicesForModal(examinationId);
				},
				error: function () {
					const errorMessage = 'Không thể xóa dịch vụ. Vui lòng thử lại.';
					showCustomToast('error', errorMessage);
				}
			});
		}
	});
}
