import { formatCurrency } from './management-list.js';
import { showCustomToast } from '../medicine-management.js';

// ========== DASHBOARD TỔNG QUAN ==========
function updateDashboard() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		return;
	}

	// Tạo AbortController cho timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 giây timeout

	fetch('/api/medicines/dashboard', {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json'
		},
		signal: controller.signal
	}).then(response => {
		clearTimeout(timeoutId);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		return response.json();
	}).then(response => {
		// Cập nhật tổng số thuốc
		const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
		if (totalMedicinesEl) {
			totalMedicinesEl.textContent = response.total_medicines || 0;
		}

		// Cập nhật tổng giá trị tồn kho
		const totalValueEl = document.getElementById('dashboardTotalValue');
		if (totalValueEl) {
			const totalValue = response.total_value || 0;
			try {
				totalValueEl.textContent = formatCurrency(totalValue);
			} catch (e) {
				totalValueEl.textContent = '0 ₫';
			}
		}

		// Cập nhật số cảnh báo
		const warningsEl = document.getElementById('dashboardWarnings');
		if (warningsEl) {
			warningsEl.textContent = response.warning_count || 0;
		}

		// Cập nhật tổng số lô
		const totalBatchesEl = document.getElementById('dashboardMissingImportPrice');
		if (totalBatchesEl) {
			totalBatchesEl.textContent = response.missing_import_price_count || 0;
		}
	}).catch(error => {
		clearTimeout(timeoutId);
		console.error('Error loading dashboard:', error);

		// Hiển thị giá trị mặc định nếu có lỗi
		const totalMedicinesEl = document.getElementById('dashboardTotalMedicines');
		const totalValueEl = document.getElementById('dashboardTotalValue');
		const warningsEl = document.getElementById('dashboardWarnings');
		const totalBatchesEl = document.getElementById('dashboardMissingImportPrice');

		if (totalMedicinesEl) totalMedicinesEl.textContent = '0';
		if (totalValueEl) totalValueEl.textContent = '0 ₫';
		if (warningsEl) warningsEl.textContent = '0';
		if (totalBatchesEl) totalBatchesEl.textContent = '0';
	});
}

// ========== XUẤT DỮ LIỆU ==========
// Xuất danh sách thuốc ra Excel
async function exportMedicineListExcel() {
	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		// Gọi API để xuất Excel
		const response = await fetch('/api/medicines/export/excel', {
			method: 'GET',
		});

		if (!response.ok) {
			throw new Error('Lỗi khi xuất dữ liệu');
		}

		// Lấy blob từ response
		const blob = await response.blob();

		// Tạo URL tạm thời và tải file
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;

		const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
		a.download = `danh_sach_thuoc_${dateStr}.xlsx`;

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);

		showCustomToast('success', 'Đã xuất file Excel thành công!');

	} catch (error) {
		console.error('Error exporting to Excel:', error);
		showCustomToast('error', 'Không thể xuất dữ liệu thuốc. Vui lòng thử lại.');
	}
}

export { exportMedicineListExcel, updateDashboard };
