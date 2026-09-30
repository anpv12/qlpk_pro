/* global allMedicines, calculateBatchRowTotal, editMedicine, formatCurrency, formatDate, importLedgerMedicineId: writable, importLedgerSort: writable, loadMedicines, medicineSaving, medicines, normalizeSearchText, setElementVisible, showCustomToast, showInventoryOverlay, switchImportTab, updateBatchTotal, updateDashboard */
/* exported confirmBatchImport, importLedgerMedicineId, importLedgerSort, onBatchAmountInput, onBatchPriceInput, removeBatchRow, removeBatchRowAndUpdateTotal, showImportFromMedicineForm, updatePriceComparison, validateBatchNumber */
// Parts (nạp trước file này): batch-totals.js

// ========== FUNCTIONS CHO NHẬP KHO THEO ĐƠN HÀNG ==========
let batchRowCounter = 0;

let importFormMedicineId = null;

function showImportFromMedicineForm() {
	const medicineId = $('#medicineForm').data('medicine-id');
	if (medicineSaving || !medicineId) return;
	const element = document.getElementById('importBatchModal');
	if (element.classList.contains('show') || element.dataset.inventoryModalLayer) return;
	showImportBatchModal(medicineId);
}

function showImportBatchModal(preselectMedicineId = null) {
	importFormMedicineId = preselectMedicineId ?? null;
	// Reset form
	document.getElementById('batchSupplier').value = '';
	const batchSupplierIdInput = document.getElementById('batchSupplierId');
	if (batchSupplierIdInput) batchSupplierIdInput.value = '';
	document.getElementById('batchInvoiceNumber').value = '';
	const batchImportDate = document.getElementById('batchImportDate');
	if (batchImportDate) {
		const today = new Date();
		if (batchImportDate._flatpickr) batchImportDate._flatpickr.setDate(today, true);
		else batchImportDate.value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
	}
	const actor = window.QLPKApiTransport.userSnapshot();
	document.getElementById('batchImportUser').value = actor.full_name || actor.username || '';
	document.getElementById('batchNote').value = '';

	// Xóa tất cả dòng trong bảng
	const tbody = document.getElementById('batchImportTableBody');
	if (tbody) tbody.innerHTML = '';

	// Thêm dòng đầu tiên
	batchRowCounter = 0;
	addBatchImportRow();

	if (preselectMedicineId != null) {
		const preselect = allMedicines.find(item => item.id === preselectMedicineId)
			|| medicines.find(item => item.id === preselectMedicineId);
		const row = tbody?.lastElementChild;
		if (preselect && row) {
			row.querySelector('.batch-medicine-input').value = preselect.name;
			row.querySelector('.batch-medicine-id').value = preselect.id;
			onBatchMedicineSelect(preselect.id, row.id);
		}
	}

	// Reset tổng giá trị
	document.getElementById('batchTotalValue').textContent = '0 ₫';
	document.getElementById('batchLotBreakdown').textContent = 'Chưa có dữ liệu lô';

	// Về tab Nhập kho khi mở lại form; openImportLedger() sẽ tự chuyển sang
	// tab Lịch sử nhập nếu người gọi (showStockDetail/showMedicineExpiry) cần xem ngay.
	switchImportTab('order');
	document.getElementById('importLedgerSearch').value = '';
	document.getElementById('importLedgerStatus').value = '';
	importLedgerMedicineId = null;
	importLedgerSort = '';

	showInventoryOverlay(document.getElementById('importBatchModal'));
}

function addBatchImportRow() {
	const tbody = document.getElementById('batchImportTableBody');
	if (!tbody) return;

	batchRowCounter++;
	const rowId = `batchRow_${batchRowCounter}`;

	const row = document.createElement('tr');
	row.id = rowId;

	row.innerHTML = `
      <td>
        <div class="position-relative">
          <input type="text" class="form-control form-control-sm batch-medicine-input"
                 placeholder="Tìm và chọn thuốc" aria-label="Tên thuốc" required autocomplete="off"
                 data-row-id="${rowId}">
	          <div class="occupation-dropdown batch-medicine-dropdown mm-hidden"></div>
          <input type="hidden" class="batch-medicine-id" value="">
        </div>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-number-display"
               value=""
	               placeholder="Số lô trên bao bì" aria-label="Số lô" required maxlength="50"
               data-qlpk-call="validateBatchNumber" data-qlpk-on="focusout" data-qlpk-args='["$this"]'>
      </td>
      <td>
        <input type="text" class="form-control form-control-sm batch-expiry-date js-datepicker" placeholder="dd/mm/yyyy" aria-label="Hạn dùng" autocomplete="off" required>
      </td>
      <td>
        <div class="mm-import-qty">
          <input type="number" class="form-control form-control-sm batch-quantity" min="0" step="0.01" required
                 placeholder="0" aria-label="Số lượng"
                 data-qlpk-call="onBatchAmountInput" data-qlpk-on="input" data-qlpk-args='["${rowId}"]'>
          <small class="batch-unit"></small>
        </div>
      </td>
      <td>
        <input type="number" class="form-control form-control-sm batch-price" min="0" step="0.01" placeholder="0" aria-label="Đơn giá nhập trên một đơn vị" required
               data-qlpk-call="onBatchPriceInput" data-qlpk-on="input" data-qlpk-args='["${rowId}"]'>
      </td>
      <td>
	        <div class="batch-price-comparison">
	          <div class="batch-last-price text-muted mm-hidden"></div>
	          <div class="batch-price-diff mm-hidden"></div>
	        </div>
	      </td>
	      <td>
	        <span class="batch-row-total fw-bold">0 ₫</span>
      </td>
      <td>
        <button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" class="btn btn-sm mm-import-remove" aria-label="Xóa dòng thuốc" title="Xóa dòng thuốc" data-qlpk-call="removeBatchRowAndUpdateTotal" data-qlpk-args='["${rowId}"]'>
          <i class="bi bi-trash" aria-hidden="true"></i>
        </button>
      </td>
    `;

	tbody.appendChild(row);

	// Khởi tạo autocomplete cho input thuốc vừa tạo
	const medicineInput = row.querySelector('.batch-medicine-input');
	const dropdown = row.querySelector('.batch-medicine-dropdown');
	const hiddenId = row.querySelector('.batch-medicine-id');

	if (medicineInput && dropdown && hiddenId) {
		initializeBatchMedicineAutocomplete(medicineInput, dropdown, hiddenId, rowId);
	}

	// Khởi tạo Flatpickr cho input ngày hết hạn vừa tạo
	const expiryDateInput = row.querySelector('.batch-expiry-date');
	if (expiryDateInput && typeof window.initDatepickers === 'function') {
		window.initDatepickers(expiryDateInput);
	}
}

// Hàm validate và chuẩn hóa số lô (tùy chọn, không bắt buộc)
function validateBatchNumber(input) {
	if (!input || !input.value) return;

	const value = input.value.trim().toUpperCase();
	// Nếu người dùng nhập format LOT-XX thì giữ nguyên, nếu không thì có thể chuẩn hóa
	if (value && !value.match(/^LOT-\d+$/i)) {
		// Có thể tự động chuẩn hóa hoặc để người dùng tự nhập
		// Ở đây chỉ đảm bảo format khi tự động gen, còn người dùng có thể nhập tự do
	}
}

// Hàm autocomplete cho tên thuốc trong nhập kho
function initializeBatchMedicineAutocomplete(input, dropdown, hiddenId, rowId) {
	input.addEventListener('focus', () => {
		showBatchMedicineDropdown(input, dropdown, hiddenId, rowId);
	});

	input.addEventListener('input', () => {
		hiddenId.value = '';
		rowResetPurchasePrice(rowId);
		showBatchMedicineDropdown(input, dropdown, hiddenId, rowId);
	});

	// Đóng dropdown khi click ra ngoài
	document.addEventListener('click', (e) => {
		if (!dropdown.contains(e.target) && e.target !== input) {
			setElementVisible(dropdown, false);
		}
	});
}

function positionBatchMedicineDropdown(input, dropdown) {
	const inputRect = input.getBoundingClientRect();
	const modalContent = input.closest('.modal-content');
	if (!modalContent) {
		dropdown.classList.remove('batch-medicine-dropdown--floating');
		dropdown.removeAttribute('style');
		return;
	}

	dropdown.classList.add('batch-medicine-dropdown--floating');
	dropdown.removeAttribute('style');
	dropdown.style.setProperty('--mm-batch-dropdown-top', `${inputRect.bottom}px`);
	dropdown.style.setProperty('--mm-batch-dropdown-left', `${inputRect.left}px`);
	dropdown.style.setProperty('--mm-batch-dropdown-width', `${inputRect.width}px`);
}

function showBatchMedicineDropdown(input, dropdown, hiddenId, rowId) {
	const keyword = normalizeSearchText(input.value);

	let filtered;
	if (!keyword) {
		// Nếu chưa nhập từ khóa: hiển thị danh sách đầy đủ (giới hạn 5000 thuốc để tránh quá tải UI)
		filtered = allMedicines.slice(0, 5000);
	} else {
		// Lọc theo tên thuốc khi có từ khóa
		filtered = allMedicines.filter(m => normalizeSearchText(m.name).includes(keyword));
	}

	// Hiển thị dropdown
	dropdown.innerHTML = '';
	if (filtered.length === 0) {
		setElementVisible(dropdown, false);
		return;
	}

	filtered.forEach(medicine => {
		const div = document.createElement('div');
		div.className = 'occupation-item';
		div.textContent = medicine.name;
		div.onclick = () => {
			input.value = medicine.name;
			hiddenId.value = medicine.id;
			setElementVisible(dropdown, false);
			// Gọi hàm cập nhật thông tin thuốc (bao gồm giá nhập lần trước)
			onBatchMedicineSelect(medicine.id, rowId);
		};
		dropdown.appendChild(div);
	});

	setElementVisible(dropdown, true);

	// Cập nhật vị trí dropdown
	positionBatchMedicineDropdown(input, dropdown);
}

function removeBatchRow(rowId) {
	const row = document.getElementById(rowId);
	if (row) {
		row.remove();
	}
}

function removeBatchRowAndUpdateTotal(rowId) {
	removeBatchRow(rowId);
	updateBatchTotal();
}

function onBatchAmountInput(rowId) {
	calculateBatchRowTotal(rowId);
	updateBatchTotal();
}

function onBatchPriceInput(rowId) {
	calculateBatchRowTotal(rowId);
	updateBatchTotal();
	updatePriceComparison(rowId);
}

function rowResetPurchasePrice(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    row.removeAttribute('data-last-price');
    row.querySelector('.batch-price').value = '';
    row.querySelector('.batch-unit').textContent = '';
    row.querySelector('.batch-last-price').textContent = '';
    setElementVisible(row.querySelector('.batch-price-diff'), false);
    calculateBatchRowTotal(rowId);
    updateBatchTotal();
}

async function onBatchMedicineSelect(medicineId, rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    rowResetPurchasePrice(rowId);
    row.querySelector('.batch-unit').textContent = (allMedicines.find(m => String(m.id) === String(medicineId)) || {}).unit || '';
    try {
        const response = await $.ajax({
            url: `/api/medicines/${medicineId}/batches`,
        });
        if (!row.isConnected || row.querySelector('.batch-medicine-id').value !== String(medicineId)) return;
        const latest = [...(response.batches || [])].sort((a,b) => b.import_date.localeCompare(a.import_date) || b.id - a.id)[0];
        const label = row.querySelector('.batch-last-price');
        label.textContent = latest?.import_price != null ? `Lần trước (${formatDate(latest.import_date)}): ${formatCurrency(latest.import_price)}` : 'Chưa có giá nhập trước';
        setElementVisible(label, true);
        if (latest?.import_price != null) row.dataset.lastPrice = latest.import_price;
    } catch (_) {
        if (row.isConnected && row.querySelector('.batch-medicine-id').value === String(medicineId)) {
            const label = row.querySelector('.batch-last-price');
            label.textContent = 'Không tải được giá tham khảo';
            setElementVisible(label, true);
        }
    }
}

function updatePriceComparison(rowId) {
	const row = document.getElementById(rowId);
	if (!row) return;

	const lastPrice = parseFloat(row.getAttribute('data-last-price') || 0);
	const priceInput = row.querySelector('.batch-price');
	const priceDiffElement = row.querySelector('.batch-price-diff');

	if (!lastPrice || !priceInput || !priceDiffElement) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	const currentPrice = parseFloat(priceInput.value || 0);
	if (!currentPrice) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	const diff = currentPrice - lastPrice;
	const diffPercent = lastPrice > 0 ? ((diff / lastPrice) * 100).toFixed(1) : 0;

	if (diff === 0) {
		setElementVisible(priceDiffElement, false);
		return;
	}

	setElementVisible(priceDiffElement, true);
	if (diff > 0) {
		priceDiffElement.className = 'batch-price-diff text-danger fw-bold';
		priceDiffElement.textContent = `↑ +${formatCurrency(diff)} (${diffPercent}%)`;
	} else {
		priceDiffElement.className = 'batch-price-diff text-success fw-bold';
		priceDiffElement.textContent = `↓ ${formatCurrency(diff)} (${diffPercent}%)`;
	}
}

// Xác nhận nhập kho theo đơn hàng
let isImportingBatch = false;
function isValidBatchQuantity(value) {
	return Number.isFinite(value) && value > 0;
}

// One import line from a table row, or null when any required field is missing or invalid.
function batchRowValue(row, selector) {
	return row.querySelector(selector)?.value;
}

function isValidBatchPrice(raw, price) {
	return Boolean(raw?.trim()) && Number.isFinite(price) && price >= 0;
}

function readBatchImportRow(row, note) {
	const medicineId = batchRowValue(row, '.batch-medicine-id');
	const batchNumber = batchRowValue(row, '.batch-number-display')?.trim();
	const expiryDate = batchRowValue(row, '.batch-expiry-date');
	const quantity = parseFloat(batchRowValue(row, '.batch-quantity') || 0);
	const importPriceRaw = batchRowValue(row, '.batch-price');
	const importPrice = Number(importPriceRaw);
	const controlsValid = Array.from(row.querySelectorAll('input')).every(input => input.checkValidity());
	const fieldsPresent = Boolean(medicineId && batchNumber && expiryDate);
	if (!controlsValid || !fieldsPresent || !isValidBatchQuantity(quantity) || !isValidBatchPrice(importPriceRaw, importPrice)) return null;
	return {
		medicine_id: parseInt(medicineId),
		batch_number: batchNumber || null,
		expiry_date: expiryDate,
		quantity: quantity,
		import_price: importPrice,
		notes: note
	};
}

function refreshAfterBatchImport() {
	// Đóng modal
	const modal = bootstrap.Modal.getInstance(document.getElementById('importBatchModal'));
	if (modal) modal.hide();

	// Reload danh sách thuốc
	loadMedicines();
	updateDashboard();

	if (importFormMedicineId && $('#medicineForm').data('medicine-id') === importFormMedicineId
		&& document.getElementById('medicineModal').classList.contains('show')) {
		editMedicine(importFormMedicineId);
	}
}

async function confirmBatchImport() {
	if (isImportingBatch) return;
	const supplierIdValue = document.getElementById('batchSupplierId')?.value || '';
	const supplierId = supplierIdValue ? parseInt(supplierIdValue) : null;
	const invoiceNumber = document.getElementById('batchInvoiceNumber').value.trim();
	const importDate = document.getElementById('batchImportDate').value;
	const note = document.getElementById('batchNote').value.trim();

	// Chỉ bắt buộc Nhà cung cấp và Ngày nhập kho; Người thực hiện là tùy chọn
	if (!supplierId || !importDate) {
		showCustomToast('error', 'Vui lòng chọn Nhà cung cấp từ danh sách và điền Ngày nhập kho');
		return;
	}

	const tbody = document.getElementById('batchImportTableBody');
	if (!tbody) return;

	const rows = tbody.querySelectorAll('tr');
	if (rows.length === 0) {
		showCustomToast('error', 'Vui lòng thêm ít nhất một thuốc vào danh sách');
		return;
	}

	const items = [];
	let hasError = false;

	rows.forEach((row) => {
		const item = readBatchImportRow(row, note);
		if (item) items.push(item);
		else hasError = true;
	});

	if (hasError || items.length === 0) {
		showCustomToast('error', 'Vui lòng điền đầy đủ thông tin cho tất cả các thuốc (Tên thuốc, Số lô, Hạn sử dụng, Số lượng, Đơn giá nhập)');
		return;
	}

	// Gọi API nhập kho
	isImportingBatch = true;
	$('#confirmImportBatchBtn').prop('disabled', true);
	try {
		const response = await $.ajax({
			url: '/api/medicine-batches/import-order',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			dataType: 'json',
			data: JSON.stringify({
				supplier_id: supplierId,
				invoice_number: invoiceNumber || null,
				import_date: importDate,
				items: items,
				notes: note
			})
		});

		refreshAfterBatchImport();

		// Hiển thị thông báo thành công
		showCustomToast('success', `Nhập kho thành công! Đã lưu ${response.total_batches} dòng nhập và đơn giá riêng.`);
	} catch (error) {
		console.error('Lỗi khi nhập kho:', error);
		window.QLPKUserFeedback.reportError(error, {fallback: 'Không thể nhập kho. Vui lòng kiểm tra dữ liệu và thử lại.'});
	} finally {
		isImportingBatch = false;
		$('#confirmImportBatchBtn').prop('disabled', false);
	}
}
