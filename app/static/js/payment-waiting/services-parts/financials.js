/* global financialSummaryCache: writable, formatCurrency, handleSmartMoneyInput */
/* exported calculateFinancials, loadFinancialSummaryFromDB */
// services.js: calculateFinancials, loadFinancialSummaryFromDB, calculateFromServicesTable, updateFinancialDisplay (nạp trước services.js, cùng scope trang).

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
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		calculateFromServicesTable();
		return;
	}

	$.ajax({
		url: `/api/examination-detail/${examinationId}/financial-summary`,
		method: 'GET',
		success: function (data) {
			// Sử dụng dữ liệu từ database
			const subtotalPreTax = parseFloat(data.subtotal_pre_tax) || 0;
			const totalDiscount = parseFloat(data.total_discount) || 0;
			const vat = parseFloat(data.vat_amount) || 0;
			const total = parseFloat(data.total_after_tax) || 0;

			financialSummaryCache = { subtotalPreTax, totalDiscount, vat, total };
			updateFinancialDisplay(subtotalPreTax, totalDiscount, vat, total);
		},
		error: function () {
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
