/* global buildPaymentConfirmOptions, getSafeApiErrorMessage, handleSmartMoneyInput, isConfirmInvoiceSubmitting: writable, loadPaymentData, showCustomToast */
/* exported confirmInvoice, deletePayment, returnToAppointment, returnToDoctor, returnToPsychologist, returnToReceptionist, toggleAllPrescriptions */

// Confirm invoice
function confirmInvoice(examinationId) {
	if (isConfirmInvoiceSubmitting) return;
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
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
					'Content-Type': 'application/json'
				},
				data: JSON.stringify({
					advance_payment: advancePayment,
					amount_paid: amountPaid,
					actual_price: actualPrice
				}),
				success: function () {
					showCustomToast('success', 'Xác nhận hóa đơn thành công');

					// Disable tất cả form fields
					disableInvoiceForm();

					// Đổi text nút thành "Đã xác nhận"
					$('#exportInvoiceBtn').text('Đã xác nhận').prop('disabled', true);

					// Refresh danh sách sau khi xác nhận
					loadPaymentData();
				},
				error: function () {
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
	window.CustomModal.confirm(
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
        <div class="modal fade qlpk-action-selection-modal" id="actionSelectionModal" tabindex="-1" aria-labelledby="actionSelectionModalLabel" aria-hidden="true">
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

	window.CustomModal.confirm(
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

	window.CustomModal.confirm(
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

	window.CustomModal.confirm(
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

	window.CustomModal.confirm(
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

	// Sử dụng API update status trực tiếp: WAITING_TRANSFER (chờ chuyển khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'WAITING_TRANSFER'
		}),
		success: function () {
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

	// Sử dụng API update status trực tiếp: DOCTOR_EXAM (bác sĩ khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'DOCTOR_EXAM'
		}),
		success: function () {
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

	// Sử dụng API update status trực tiếp: PSYCHOLOGIST_EXAM (tâm lý gia khám)
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'PSYCHOLOGIST_EXAM'
		}),
		success: function () {
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

	// Tạm thời dùng cùng WAITING_TRANSFER như luồng trả lễ tân theo backend hiện tại.
	// Nếu backend tách trạng thái lịch hẹn riêng, cập nhật lại mapping tại đây.
	$.ajax({
		url: `/examinations/${paymentId}/status`,
		method: 'PUT',
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify({
			status: 'WAITING_TRANSFER'
		}),
		success: function () {
			showCustomToast('success', 'Trả về lịch hẹn thành công!');
			loadPaymentData(); // Reload data
		},
		error: function (xhr) {
			const errorMsg = getSafeApiErrorMessage(xhr, 'Có lỗi xảy ra khi trả về lịch hẹn');
			showCustomToast('error', errorMsg);
		}
	});
}
