import { formatCurrency } from '../management-list.js';
import { el, replace } from '../../shared/dom.js';

// Tính thành tiền từng dòng trong bảng nhập kho
function calculateBatchRowTotal(rowId) {
	const row = document.getElementById(rowId);
	if (!row) return;
	const quantity = parseFloat(row.querySelector('.batch-quantity')?.value || 0);
	const price = parseFloat(row.querySelector('.batch-price')?.value || 0);
	const total = quantity * price;
	const totalElement = row.querySelector('.batch-row-total');
	if (totalElement) {
		totalElement.textContent = formatCurrency(total);
	}
}

// Tính tổng giá trị đơn hàng và hiển thị theo từng lô
function updateBatchTotal() {
	const rows = document.querySelectorAll('#batchImportTableBody tr');
	let total = 0;
	const lotTotals = {}; // Object để lưu tổng giá tiền theo từng lô

	rows.forEach(row => {
		const quantity = parseFloat(row.querySelector('.batch-quantity')?.value || 0);
		const price = parseFloat(row.querySelector('.batch-price')?.value || 0);
		const rowTotal = quantity * price;
		total += rowTotal;

		// Lấy số lô
		const batchNumber = row.querySelector('.batch-number-display')?.value?.trim() || 'Chưa có';

		// Tính tổng theo từng lô
		if (!lotTotals[batchNumber]) {
			lotTotals[batchNumber] = 0;
		}
		lotTotals[batchNumber] += rowTotal;
	});

	// Hiển thị tổng giá trị đơn hàng
	const totalElement = document.getElementById('batchTotalValue');
	if (totalElement) {
		totalElement.textContent = formatCurrency(total);
	}

	// Hiển thị breakdown theo từng lô
	const breakdownElement = document.getElementById('batchLotBreakdown');
	if (!breakdownElement) return;
	if (Object.keys(lotTotals).length === 0) {
		replace(breakdownElement, el('span', { class: 'text-muted' }, 'Chưa có dữ liệu'));
		return;
	}
	replace(breakdownElement, Object.entries(lotTotals)
		.sort((a, b) => a[0].localeCompare(b[0])) // Sắp xếp theo tên lô
		.map(([lot, lotTotal]) => el('div', { class: 'lot-item' },
			el('span', { class: 'lot-name' }, `Lô ${lot}:`), ' ',
			el('span', { class: 'lot-value fw-bold' }, formatCurrency(lotTotal)))));
}

export { calculateBatchRowTotal, updateBatchTotal };
