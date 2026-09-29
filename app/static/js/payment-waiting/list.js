/* global currentPage: writable, escapeHtml, filteredData: writable, formatDateTime, isPaymentPaid, paymentData: writable, perPage, selectedItems: writable, showCustomToast, showLoading, totalItems: writable, totalPages: writable */
/* exported applyFilters, changePage, performSearch */

// Load payment data from API
function loadPaymentData() {
	showLoading(true);

	$.ajax({
		url: '/api/payment-waiting',
		method: 'GET',
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
		error: function () {
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
