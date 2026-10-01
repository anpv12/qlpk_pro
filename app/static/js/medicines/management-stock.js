import { state } from './management-state.js';
import { setElementVisible, setPackagingInfoActive } from '../medicine-management.js';
import { el, replace } from '../shared/dom.js';
import { getUnitDisplay } from './management-list.js';
import { medicineSaving } from './management-form.js';
import { showImportBatchModal } from './management-batch-import.js';
import { openImportLedger } from './management-import-ledger.js';

// ========== PHASE 1: QUẢN LÝ QUY CÁCH ĐÓNG GÓI VÀ SỐ LƯỢNG TỒN KHO ==========

// Format số lượng tồn kho theo viên (hiển thị số thập phân với dấu phẩy)
function formatStockQuantity(quantity, unit = 'viên') {
	const num = Number(quantity || 0);
	return (Number.isFinite(num) ? num : 0).toLocaleString('vi-VN', {maximumFractionDigits:2}) + ' ' + (unit || 'đơn vị');
}

// Cập nhật thông tin quy cách đóng gói
function buildPackagingValue(packagingUnit, unitsPerBox, saleUnit) {
	if (!packagingUnit) return '';
	return unitsPerBox > 0 && saleUnit ? `1 ${packagingUnit} = ${unitsPerBox} ${saleUnit}` : `1 ${packagingUnit}`;
}

function capitalizeFirst(text) {
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderPackagingInfoText(packagingInfoText, packagingUnit, unitsPerBox, saleUnit) {
	if (packagingUnit && unitsPerBox > 0 && saleUnit) {
		// Ví dụ: "1 Lọ = 20 Gói" thay vì hard code "1 Hộp = 20 Gói"
		packagingInfoText.textContent = `1 ${capitalizeFirst(packagingUnit)} = ${unitsPerBox} ${capitalizeFirst(saleUnit)}`;
		setPackagingInfoActive(packagingInfoText, true);
	} else if (packagingUnit && saleUnit) {
		packagingInfoText.textContent = `Chưa xác định số ${saleUnit} trong 1 ${packagingUnit}`;
		setPackagingInfoActive(packagingInfoText, true);
	} else {
		packagingInfoText.textContent = 'Nhập đơn vị đóng gói và số đơn vị';
		setPackagingInfoActive(packagingInfoText, false);
	}
}

function updatePackagingInfo() {
	const packagingUnit = document.getElementById('packagingUnit')?.value || '';
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);
	const packagingDisplay = document.getElementById('packagingDisplay');
	const packagingInfoText = document.getElementById('packagingInfoText');
	const saleUnit = document.getElementById('saleUnit')?.value || '';

	if (!packagingDisplay) return;

	// Cập nhật hidden field để lưu vào database
	packagingDisplay.value = buildPackagingValue(packagingUnit, unitsPerBox, saleUnit);

	// Cập nhật text hiển thị quy cách: "1 [Đơn vị đóng gói] = [Số đơn vị] [Đơn vị dùng]"
	if (packagingInfoText) renderPackagingInfoText(packagingInfoText, packagingUnit, unitsPerBox, saleUnit);

	// Cập nhật hint cho số lượng tồn
	updateStockQuantityHint();

	// Cập nhật label động cho số lượng tồn kho
	updateStockQuantityLabels();

	// Nếu đã có số lượng tồn kho, tính lại số hộp và viên lẻ theo quy cách mới
	const hiddenInput = document.getElementById('stockQuantityInput');
	if (hiddenInput && hiddenInput.value) {
		updateBoxesInputFromStockQuantity(hiddenInput.value);
	}
}

// Cập nhật label động cho số lượng tồn kho
function updateStockQuantityLabels() {
	const packagingUnit = document.getElementById('packagingUnit')?.value || 'hộp';
	const saleUnit = document.getElementById('saleUnit')?.value || 'viên';

	const boxesLabel = document.getElementById('stockQuantityBoxesLabel');
	const remainingLabel = document.getElementById('stockQuantityRemainingLabel');

	if (boxesLabel) {
		boxesLabel.textContent = `${packagingUnit.charAt(0).toUpperCase() + packagingUnit.slice(1)} tồn`;
	}
	if (remainingLabel) {
		remainingLabel.textContent = `${saleUnit.charAt(0).toUpperCase() + saleUnit.slice(1)} tồn`;
	}
}

// Cập nhật input số hộp và viên từ giá trị tổng số lượng (dùng khi edit thuốc)
function updateBoxesInputFromStockQuantity(value) {
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');

	if (!boxesInput || !remainingInput) return;

	const totalUnits = parseFloat(value) || 0;

	// Tính số đơn vị mỗi hộp từ quy cách đóng gói
	// Ví dụ: 1 viên = 1 lọ, thì unitsPerBox = 1
	const unitsPerBox = parseFloat(document.getElementById('unitsPerBox')?.value || 0);

	if (unitsPerBox > 0 && totalUnits > 0) {
		// Tính số đơn vị đóng gói từ tổng số đơn vị (làm tròn xuống)
		// Ví dụ: 200,000 viên ÷ 1 viên/lọ = 200,000 lọ
		const boxes = Math.floor(totalUnits / unitsPerBox);

		boxesInput.value = boxes > 0 ? boxes : '';

		// Tính số lẻ (phần còn lại sau khi chia cho unitsPerBox)
		// Ví dụ: 200,000 viên - (200,000 lọ × 1 viên/lọ) = 0 viên
		// Ví dụ: 199,999 viên - (199,999 lọ × 1 viên/lọ) = 1 viên
		const remaining = totalUnits - (boxes * unitsPerBox);
		remainingInput.value = remaining > 0 ? remaining.toFixed(3).replace(/\.?0+$/, '') : '0';

		// Cập nhật hidden input
		const hiddenInput = document.getElementById('stockQuantityInput');
		if (hiddenInput) {
			hiddenInput.value = totalUnits > 0 ? totalUnits.toFixed(3).replace(/\.?0+$/, '') : '';
		}
	} else {
		// Nếu chưa có quy cách, để trống
		boxesInput.value = '';
		remainingInput.value = '';
	}

	// Cập nhật hint quy đổi
	updateStockQuantityHint();
}

// Cập nhật hint tóm tắt tồn kho và ô tổng (đơn vị cơ bản: saleUnit)
// Tính từ 2 field: stockQuantityBoxes (đơn vị đóng gói đầy) và stockQuantityRemaining (đơn vị lẻ)
function stockFieldValue(id) {
	return document.getElementById(id)?.value;
}

function showStockConvertText(convertElement, convertTextElement, convertText) {
	if (!convertText.length) {
		setElementVisible(convertElement, false);
		return;
	}
	replace(convertTextElement, el('i', { class: 'bi bi-calculator' }), ' ', convertText);
	setElementVisible(convertElement, true);
	convertElement.classList.remove('alert-info');
	convertElement.classList.add('alert-success');
}

function updateStockQuantityHint() {
	const unitsPerBox = parseFloat(stockFieldValue('unitsPerBox') || 0);
	const packagingUnit = stockFieldValue('packagingUnit') || 'vỉ';
	const saleUnit = stockFieldValue('saleUnit') || 'viên';
	const convertElement = document.getElementById('stockQuantityConvert');
	const convertTextElement = document.getElementById('stockQuantityConvertText');

	if (!convertElement || !convertTextElement) return;

	const boxes = parseFloat(stockFieldValue('stockQuantityBoxes') || 0);
	const remaining = parseFloat(stockFieldValue('stockQuantityRemaining') || 0);

	if (unitsPerBox > 0 && (boxes > 0 || remaining > 0)) {
		const total = boxes * unitsPerBox + remaining;
		showStockConvertText(convertElement, convertTextElement, buildStockConvertText({ boxes, remaining, total, packagingUnit, saleUnit }));
		updateStockQuantitySummaryDisplay({ total });
	} else {
		setElementVisible(convertElement, false);
		updateStockQuantitySummaryDisplay({ total: '' });
	}
}

function formatStockNumber(num) {
	return num.toLocaleString('vi-VN');
}

function formatStockDecimal(num) {
	if (Number.isNaN(num)) return '';
	if (num % 1 === 0) return formatStockNumber(num);
	return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

// Ví dụ: "9 vỉ + 70 viên = 970 viên tồn"
function buildStockConvertText({ boxes, remaining, total, packagingUnit, saleUnit }) {
	const strong = text => el('strong', {}, text);
	const totalText = strong(`${formatStockDecimal(total)} ${saleUnit} tồn`);
	if (boxes > 0 && remaining > 0) {
		return [strong(`${formatStockNumber(boxes)} ${packagingUnit}`), ' + ', strong(`${formatStockDecimal(remaining)} ${saleUnit}`), ' = ', totalText];
	}
	if (boxes > 0 && remaining === 0) return [strong(`${formatStockNumber(boxes)} ${packagingUnit}`), ' = ', totalText];
	if (boxes === 0 && remaining > 0) return [strong(`${formatStockDecimal(remaining)} ${saleUnit} tồn`)];
	return [];
}

// Hiển thị tồn kho quy đổi (ô tổng read-only) dùng giá trị thô, không định dạng thousands
function updateStockQuantitySummaryDisplay({ total }) {
	const summaryInput = document.getElementById('stockQuantitySummaryDisplay');
	if (!summaryInput) return;

	if (total === '' || Number.isNaN(total)) {
		summaryInput.value = '';
		return;
	}

	// Không định dạng nhóm nghìn trong input number; chỉ cắt bớt phần thập phân thừa
	// Đảm bảo hiển thị "0" khi total = 0
	let rawTotal = '';
	if (total === 0) rawTotal = '0';
	else if (Number.isFinite(total)) rawTotal = total.toFixed(3).replace(/\.?0+$/, '');
	summaryInput.value = rawTotal;
}

function formatStockDisplay(medicine) {
	if (!medicine) return '-';
	return formatStockQuantity(medicine.stock_quantity, getUnitDisplay(medicine.unit || 'tablet'));
}

function showMedicineExpiry() {
    const trigger = document.getElementById('medicine-expiry_date');
    const medicineId = state.editingMedicineId;
    if (medicineSaving || trigger.disabled || !medicineId) return;
    const element = document.getElementById('importBatchModal');
    if (element.classList.contains('show') || element.dataset.inventoryModalLayer) return;
    showStockDetail(medicineId);
}

// Mở màn "Nhập kho theo đơn hàng" đã gộp mục Lịch sử nhập & lô, lọc theo
// đúng thuốc đang xem. Không mở modal riêng cho chi tiết tồn kho nữa.
function showStockDetail(medicineId) {
    const element = document.getElementById('importBatchModal');
    if (!element.classList.contains('show') && !element.dataset.inventoryModalLayer) {
        showImportBatchModal();
    }
    const medicineName = state.medicines.find(item => item.id === medicineId)?.name
        || state.allMedicines.find(item => item.id === medicineId)?.name || '';
    openImportLedger({medicineId, search: medicineName});
}

export { formatStockDisplay, showMedicineExpiry, showStockDetail, formatStockQuantity, updateBoxesInputFromStockQuantity, updatePackagingInfo, updateStockQuantityHint, updateStockQuantityLabels };
