/* global allMedicines, escapeHtml, getUnitDisplay, medicineSaving, medicines, openImportLedger, setElementVisible, setPackagingInfoActive, showImportBatchModal */
/* exported formatStockDisplay, showInventoryOverlay, showMedicineExpiry, updatePackagingInfo */

// ========== PHASE 1: QUẢN LÝ QUY CÁCH ĐÓNG GÓI VÀ SỐ LƯỢNG TỒN KHO ==========

// Format số lượng tồn kho theo viên (hiển thị số thập phân với dấu phẩy)
function formatStockQuantity(quantity, unit = 'viên') {
	const num = Number(quantity || 0);
	return (Number.isFinite(num) ? num : 0).toLocaleString('vi-VN', {maximumFractionDigits:2}) + ' ' + escapeHtml(unit || 'đơn vị');
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
	if (!convertText) {
		setElementVisible(convertElement, false);
		return;
	}
	convertTextElement.innerHTML = `<i class="bi bi-calculator"></i> ${convertText}`;
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
	const totalText = `<strong>${formatStockDecimal(total)} ${window.QLPKHtml.escape(saleUnit)} tồn</strong>`;
	if (boxes > 0 && remaining > 0) {
		return `<strong>${formatStockNumber(boxes)} ${window.QLPKHtml.escape(packagingUnit)}</strong> + <strong>${formatStockDecimal(remaining)} ${window.QLPKHtml.escape(saleUnit)}</strong> = ${totalText}`;
	}
	if (boxes > 0 && remaining === 0) return `<strong>${formatStockNumber(boxes)} ${window.QLPKHtml.escape(packagingUnit)}</strong> = ${totalText}`;
	if (boxes === 0 && remaining > 0) return `<strong>${formatStockDecimal(remaining)} ${window.QLPKHtml.escape(saleUnit)} tồn</strong>`;
	return '';
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


// Keep the editing context visible while reusing the existing inventory dialogs.
function showInventoryOverlay(element) {
    if (element.classList.contains('show')) return;
    const parent = [...document.querySelectorAll('.modal.show')].reverse().find(node =>
        node !== element && !node.inert && ['medicineModal', 'importBatchModal'].includes(node.id));
    const modal = bootstrap.Modal.getOrCreateInstance(element);
    if (!parent) { modal.show(); return; }
    const parentModal = bootstrap.Modal.getOrCreateInstance(parent);
    const trigger = document.activeElement;
    const parentHidden = parent.getAttribute('aria-hidden');
    const parentModalAttribute = parent.getAttribute('aria-modal');
    const bodyOverflow = document.body.style.overflow;
    const bodyPadding = document.body.style.paddingRight;
    const scrollbarAttributes = ['data-bs-overflow', 'data-bs-padding-right'].map(name => [name, document.body.getAttribute(name)]);
    const level = Number(parent.dataset.inventoryModalLayer || 0) + 1;
    const existingBackdrops = new Set(document.querySelectorAll('.modal-backdrop'));
    element.dataset.inventoryModalLayer = String(level);
    // Bootstrap 5.3.2 shares focus-trap listeners across modal instances.
    // Deactivate the parent before opening, then reactivate it after dismissal.
    parentModal._focustrap.deactivate();
    parent.inert = true;
    $(element).one('shown.bs.modal.inventoryOverlay', () => {
        parent.setAttribute('aria-hidden', 'true');
        parent.removeAttribute('aria-modal');
    });
    $(element).one('hidden.bs.modal.inventoryOverlay', () => {
        delete element.dataset.inventoryModalLayer;
        parent.inert = false;
        if (!parent.classList.contains('show')) return;
        if (parentHidden == null) parent.removeAttribute('aria-hidden');
        else parent.setAttribute('aria-hidden', parentHidden);
        if (parentModalAttribute == null) parent.removeAttribute('aria-modal');
        else parent.setAttribute('aria-modal', parentModalAttribute);
        document.body.classList.add('modal-open');
        document.body.style.overflow = bodyOverflow;
        document.body.style.paddingRight = bodyPadding;
        scrollbarAttributes.forEach(([name, value]) => {
            if (value == null) document.body.removeAttribute(name);
            else document.body.setAttribute(name, value);
        });
        parentModal._focustrap.activate();
        if (trigger?.isConnected && parent.contains(trigger)) trigger.focus();
    });
    modal.show();
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        if (!existingBackdrops.has(backdrop)) backdrop.dataset.inventoryModalLayer = String(level);
    });
}

function showMedicineExpiry() {
    const trigger = document.getElementById('medicine-expiry_date');
    const medicineId = $('#medicineForm').data('medicine-id');
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
    const medicineName = medicines.find(item => item.id === medicineId)?.name
        || allMedicines.find(item => item.id === medicineId)?.name || '';
    openImportLedger({medicineId, search: medicineName});
}
