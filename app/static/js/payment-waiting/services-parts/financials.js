import { state } from '../state.js';
import { byId } from '../../shared/dom.js';
import { requestJson } from '../../shared/http-json.js';
import { formatCurrency, handleSmartMoneyInput } from '../output.js';

// Calculate financials
function calculateFinancials() {
	if (state.financialSummaryCache) {
		updateFinancialDisplay(
			state.financialSummaryCache.subtotalPreTax,
			state.financialSummaryCache.totalDiscount,
			state.financialSummaryCache.vat,
			state.financialSummaryCache.total
		);
		return;
	}

	// Nếu chưa có cache, tính từ bảng dịch vụ
	calculateFromServicesTable();
}

// Load financial summary từ database
async function loadFinancialSummaryFromDB(examinationId) {
	if (!window.QLPKApiTransport.hasSession()) {
		calculateFromServicesTable();
		return;
	}
	try {
		const data = await requestJson(`/api/examination-detail/${examinationId}/financial-summary`);
		const subtotalPreTax = parseFloat(data?.subtotal_pre_tax) || 0;
		const totalDiscount = parseFloat(data?.total_discount) || 0;
		const vat = parseFloat(data?.vat_amount) || 0;
		const total = parseFloat(data?.total_after_tax) || 0;
		state.financialSummaryCache = { subtotalPreTax, totalDiscount, vat, total };
		updateFinancialDisplay(subtotalPreTax, totalDiscount, vat, total);
	} catch {
		// Nếu không có dữ liệu từ DB, tính từ bảng dịch vụ
		state.financialSummaryCache = null;
		calculateFromServicesTable();
	}
}

// Tính toán từ bảng dịch vụ
function calculateFromServicesTable() {
	// Get all service rows
	const serviceRows = [...document.querySelectorAll('#servicesTableBody tr')].filter(row => !row.querySelector('td[colspan]'));
	const cellText = (row, column) => row.querySelector(`td:nth-child(${column})`)?.textContent || '';
	let subtotalPreTax = 0;  // Tổng đơn giá gốc
	let totalDiscount = 0;   // Tổng tiền chiết khấu
	let totalTax = 0;        // Tổng tiền thuế
	let totalAfterTax = 0;   // Tổng thành tiền

	serviceRows.forEach(row => {
		const unitPrice = parseFloat(cellText(row, 3).replace(/[^\d]/g, '')) || 0;
		const discountPercent = parseFloat(cellText(row, 4).replace('%', '')) || 0;
		const taxPercent = parseFloat(cellText(row, 5).replace('%', '')) || 0;
		const total = parseFloat(cellText(row, 6).replace(/[^\d]/g, '')) || 0;

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

function setText(id, text) {
	const node = byId(id);
	if (node) node.textContent = text;
}

// Cập nhật hiển thị tài chính
function updateFinancialDisplay(subtotalPreTax, totalDiscount, vat, total) {
	const advancePayment = handleSmartMoneyInput(byId('advancePayment')?.value) || 0;
	const finalAmount = total - advancePayment;
	const amountPaid = handleSmartMoneyInput(byId('amountPaid')?.value) || 0;
	const changeAmount = amountPaid - finalAmount;

	setText('subtotal', formatCurrency(subtotalPreTax));
	setText('discount', formatCurrency(totalDiscount));
	setText('vat', formatCurrency(vat));
	setText('total', formatCurrency(total));
	setText('finalAmount', formatCurrency(finalAmount));
	setText('changeAmount', formatCurrency(changeAmount));
}

export { calculateFinancials, loadFinancialSummaryFromDB };
