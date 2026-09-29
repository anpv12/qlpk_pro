/* global getUnitDisplay, getUserFacingResponseMessage, loadMedicines, normalizeSearchText, setElementVisible, setPackagingInfoActive, showCustomToast, updateBoxesInputFromStockQuantity, updatePackagingInfo, updateStockQuantityHint, updateStockQuantityLabels */
/* exported confirmDelete, deleteMedicine, editMedicine, initializeAdministrationMethodAutocomplete, initializeImportedTypeAutocomplete, initializePrescriptionTypeAutocomplete, saveMedicine */

let medicineEditRevision = 0;
let medicineSaving = false;
function editMedicine(id) {
    if (window.MedicinePriceEditor?.isSaving()) return;
    if (medicineSaving) return;
    const hasSession = window.QLPKApiTransport.hasSession();
    if (!hasSession) { showCustomToast('error', 'Vui lòng đăng nhập lại!'); return; }
    resetForm();
    const requestId = ++medicineEditRevision;
    $.ajax({
        url: `/api/medicines/${id}`, method: 'GET',
        success(data) {
            if (requestId === medicineEditRevision) {
                populateMedicineForm(data, id);
            }
        },
        error(xhr) {
            if (requestId !== medicineEditRevision) return;
            showCustomToast('error', xhr.status === 401 ? 'Phiên đăng nhập đã hết hạn' : 'Không tải được thông tin thuốc mới nhất. Vui lòng thử lại.');
        }
    });
}

// Populate medicine form with data
function populateMedicineForm(medicine, id) {
	if (!medicine) {
		showCustomToast('error', 'Không tìm thấy thuốc');
		return;
	}

	$('#medicineModalLabel').text('CHỈNH SỬA THUỐC');
	$('#medicineForm').data('medicine-id', id);
	fillMedicineTextFields(medicine);
	fillMedicineChoiceFields(medicine);
	fillMedicinePackagingFields(medicine);
	$('#pillsPerUnit').val(0);

	const totalStock = medicine.stock_quantity || 0;
	const populatedRevision = medicineEditRevision;
	setTimeout(() => {
		if (populatedRevision !== medicineEditRevision) return;
		applyPopulatedStockQuantity(totalStock);
	}, 150);

	window.ClinicMedicineCatalog.setExisting(medicine);
	$('#medicineModal').modal('show');
}

function fillMedicineTextFields(medicine) {
	$('input[name="name"]').val(medicine.name);
	$('#genericNameInput').val(medicine.generic_name || '');
	$('#genericNameValue').val(medicine.generic_name || '');
	$('input[name="internal_code"]').val(medicine.internal_code || '');
	$('input[name="national_code"]').val(medicine.national_code || '');
	$('input[name="strength"]').val(medicine.strength);
	$('#stockQuantitySummaryDisplay').val(medicine.stock_quantity ?? 0);
	$('input[name="low_stock_threshold"]').val(medicine.low_stock_threshold ?? '');
	$('input[name="expiry_warning_days"]').val(medicine.expiry_warning_days ?? '');
	$('input[name="description"], textarea[name="description"]').val(medicine.description || '');
	$('input[name="packaging"]').val(medicine.packaging || '');
	$('input[name="origin"]').val(medicine.origin || '');
}

function getImportedTypeLabel(isImported) {
	if (isImported == null) return '';
	return isImported ? 'Ngoại' : 'Nội';
}

function fillMedicineChoiceFields(medicine) {
	const prescriptionTypeMap = { 'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N' };
	$('#prescriptionType').val(prescriptionTypeMap[medicine.prescription_type] || 'Cơ bản');
	$('#prescriptionTypeValue').val(medicine.prescription_type || 'BASIC');
	$('select[name="unit"]').val(medicine.unit);
	$('#importedType').val(getImportedTypeLabel(medicine.is_imported));
	$('#importedTypeValue').val(medicine.is_imported == null ? '' : String(medicine.is_imported));
	$('#administrationMethod').val(medicine.administration_method || '');
	$('#administrationMethodValue').val(medicine.administration_method || '');
	// Hiển thị và lưu trực tiếp tiếng Việt (tương thích dữ liệu cũ)
	const unitDisplay = getUnitDisplay(medicine.unit);
	$('#saleUnit').val(unitDisplay);
	$('#saleUnitValue').val(unitDisplay);
}

function fillMedicinePackagingFields(medicine) {
	if (medicine.packaging_unit) {
		$('#packagingUnit').val((medicine.packaging_unit || '').toLowerCase().trim());
	}
	if (medicine.units_per_box !== undefined && medicine.units_per_box !== null) {
		$('#unitsPerBox').val(medicine.units_per_box ?? '');
		return;
	}
	if (!medicine.packaging) return;
	// Format: "Hộp 20 lọ" hoặc "Hộp 10 vỉ x 10 viên"
	const packagingMatch = medicine.packaging.match(/Hộp\s+(\d+)\s+([^\sx]+)/i);
	if (!packagingMatch) return;
	const unitsPerBox = parseInt(packagingMatch[1]) || 0;
	const packagingUnit = (packagingMatch[2] || '').toLowerCase().trim();
	if (unitsPerBox > 0 && packagingUnit) {
		$('#unitsPerBox').val(unitsPerBox);
		if (!medicine.packaging_unit) $('#packagingUnit').val(packagingUnit);
	}
}

function setStockTotalInputs(value) {
	const stockQuantitySummaryDisplay = document.getElementById('stockQuantitySummaryDisplay');
	const stockQuantityInput = document.getElementById('stockQuantityInput');
	if (stockQuantitySummaryDisplay) stockQuantitySummaryDisplay.value = value;
	if (stockQuantityInput) stockQuantityInput.value = value;
}

// "Tổng (viên)" lấy trực tiếp từ database (kể cả khi = 0), sau đó tách lại số hộp/viên tồn
function applyPopulatedStockQuantity(totalStock) {
	updatePackagingInfo();
	updateStockQuantityLabels();
	if (totalStock > 0) {
		updateBoxesInputFromStockQuantity(totalStock);
		setStockTotalInputs(totalStock);
	} else {
		const boxesInput = document.getElementById('stockQuantityBoxes');
		const remainingInput = document.getElementById('stockQuantityRemaining');
		if (boxesInput) boxesInput.value = '0';
		if (remainingInput) remainingInput.value = '0';
		setStockTotalInputs('0');
	}
	updateStockQuantityHint();
	setStockTotalInputs(totalStock === 0 ? '0' : String(totalStock));
}

// Save medicine
function saveMedicine() {
    if (window.MedicinePriceEditor?.isOpen()) return;
	if (medicineSaving) return;
	const formData = new FormData($('#medicineForm')[0]);
	const medicineData = Object.fromEntries(formData.entries());
	const medicineId = $('#medicineForm').data('medicine-id');

	// Nội/ngoại - từ autocomplete
	medicineData.is_imported = $('#importedTypeValue').val() === '' ? null : $('#importedTypeValue').val() === 'true';
	// Loại đơn thuốc - từ autocomplete
	medicineData.prescription_type = $('#prescriptionTypeValue').val();


	// Purchase costs belong to receipt lines, never to the catalog form.

	// Xử lý quy cách đóng gói (chỉ có đơn vị và số đơn vị trong hộp)
	const unitsPerBox = $('#unitsPerBox').val() === '' ? null : Number($('#unitsPerBox').val());
	const packagingUnit = $('#packagingUnit').val() || '';

	medicineData.units_per_box = unitsPerBox;
	medicineData.pills_per_unit = 0; // Không còn sử dụng
	medicineData.packaging_unit = packagingUnit;

	// The backend builds the conversion description from the numeric fields.
	delete medicineData.packaging;

	// Tồn kho là aggregate read-only trên form danh mục.  Không gửi field này
	// để API không thể bị dùng như một đường sửa tồn trực tiếp.
	delete medicineData.stock_quantity;
	delete medicineData.import_price;
	delete medicineData.unit_price;
	delete medicineData.expiry_date;

	// Ép kiểu số - xử lý chuỗi rỗng thành null
	coerceMedicineNumbers(medicineData);

	// Validation
	// Lấy đơn vị tính từ hidden value hoặc từ input hiển thị (đã là tiếng Việt)
	const selectedSaleUnit = resolveSelectedSaleUnit();
	if (selectedSaleUnit) {
		medicineData.unit = selectedSaleUnit; // Lưu trực tiếp tiếng Việt vào database
	}

	if (!validateMedicineRequiredFields(medicineData)) return;
	// Mã thuốc duy nhất (khuyến nghị có) - đã bỏ validation bắt buộc

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const selectionError = window.ClinicMedicineCatalog.payload(medicineData);
	if (selectionError) {
		$('#medicineFormError').removeClass('d-none').text(selectionError);
		return;
	}
	const url = medicineId ? `/api/medicines/${medicineId}` : '/api/medicines/';
	const method = medicineId ? 'PUT' : 'POST';
	const saveRevision = medicineEditRevision;
	medicineSaving = true;
	$('#medicineSaveButton').prop('disabled', true);

	$.ajax({
		url: url,
		method: method,
		headers: {
			'Content-Type': 'application/json'
		},
		data: JSON.stringify(medicineData),
		success: function () {
			if (saveRevision !== medicineEditRevision) return;
			medicineSaving = false;
			showCustomToast('success', medicineId ? 'Cập nhật thuốc thành công' : 'Thêm thuốc thành công');
			$('#medicineModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr) {
			if (saveRevision !== medicineEditRevision) return;
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				const message = getUserFacingResponseMessage(xhr, [400, 409], 'Không lưu được thông tin thuốc. Hãy thử lại.');
				$('#medicineFormError').removeClass('d-none').text(message);
				showCustomToast('error', message);
			}
		},
		complete: function () {
			medicineSaving = false;
			if (saveRevision === medicineEditRevision) $('#medicineSaveButton').prop('disabled', false);
		}
	});
}

function coerceMedicineNumbers(medicineData) {
	const numericFields = ['low_stock_threshold', 'expiry_warning_days', 'units_per_box', 'pills_per_unit'];
	numericFields.forEach(f => {
		// Nếu field trống, set thành null thay vì chuỗi rỗng
		medicineData[f] = medicineData[f] !== undefined && medicineData[f] !== '' ? Number(medicineData[f]) : null;
	});
}

function resolveSelectedSaleUnit() {
	const selectedSaleUnit = $('#saleUnitValue').val();
	if (selectedSaleUnit) return selectedSaleUnit;
	// Nếu không có giá trị trong hidden input, lấy từ input hiển thị
	const displayUnit = $('#saleUnit').val();
	if (displayUnit) $('#saleUnitValue').val(displayUnit); // Cập nhật hidden input
	return displayUnit || selectedSaleUnit;
}

function validateMedicineRequiredFields(medicineData) {
	// Validate prescription_type
	const validPrescriptionTypes = ['BASIC', 'H', 'N'];
	if (!medicineData.prescription_type || !validPrescriptionTypes.includes(medicineData.prescription_type)) {
		showCustomToast('error', 'Vui lòng chọn "Loại đơn thuốc" (Cơ bản, Thuốc H, Thuốc N)');
		$('#prescriptionType').focus();
		return false;
	}
	// Validate các trường bắt buộc khác
	// Cho phép đơn giá vốn nhập = 0 và tồn kho = 0
	if (!medicineData.name || !medicineData.unit) {
		showCustomToast('error', 'Hãy chọn thuốc DAV và đơn vị quản lý trước khi lưu.');
		return false;
	}
	return true;
}

// Confirm delete
function confirmDelete(id) {
	$('#confirmDeleteBtn').data('medicine-id', id);
	$('#confirmDeleteModal').modal('show');
}

// Delete medicine
function deleteMedicine() {
	const medicineId = $('#confirmDeleteBtn').data('medicine-id');

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	$.ajax({
		url: `/api/medicines/${medicineId}`,
		method: 'DELETE',
		success: function () {
			showCustomToast('success', 'Xóa thuốc thành công');
			$('#confirmDeleteModal').modal('hide');
			loadMedicines();
		},
		error: function (xhr) {
			if (xhr.status === 401) {
				showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
			} else {
				showCustomToast('error', getUserFacingResponseMessage(xhr, [409], 'Không xóa được thuốc. Hãy thử lại.'));
			}
		}
	});
}

// Reset form
function resetForm() {
	medicineEditRevision += 1;
	$('#medicineForm')[0].reset();
	window.ClinicMedicineCatalog.reset();
	$('#medicineForm').removeData('medicine-id');
	$('#medicineModalLabel').text('THÊM THUỐC MỚI');
	$('#medicineFormError').addClass('d-none');

	// Reset new autocomplete fields

	$('#prescriptionType').val('');
	$('#prescriptionTypeValue').val('');
	$('#administrationMethod').val('');
	$('#administrationMethodValue').val('');
	$('#importedType').val('');
	$('#importedTypeValue').val('');
	$('#genericNameInput').val('');
	$('#genericNameValue').val('');

	// Reset quy cách đóng gói và số lượng tồn kho
	$('#unitsPerBox').val('');
	$('#pillsPerUnit').val(0);
	$('#packagingUnit').val('');
	$('#packagingDisplay').val('');

	// Reset input số hộp và viên lẻ cho số lượng tồn kho
	const boxesInput = document.getElementById('stockQuantityBoxes');
	const remainingInput = document.getElementById('stockQuantityRemaining');
	if (boxesInput) boxesInput.value = '';
	if (remainingInput) remainingInput.value = '';
	const hiddenInput = document.getElementById('stockQuantityInput');
	if (hiddenInput) hiddenInput.value = '';
	const summaryInput = document.getElementById('stockQuantitySummaryDisplay');
	if (summaryInput) summaryInput.value = '0';

	// Reset hint
	const convertElement = document.getElementById('stockQuantityConvert');
	setElementVisible(convertElement, false);

	// Reset quy cách hiển thị
	const packagingInfoText = document.getElementById('packagingInfoText');
	if (packagingInfoText) {
		packagingInfoText.textContent = 'Nhập đơn vị đóng gói và số đơn vị';
		setPackagingInfoActive(packagingInfoText, false);
	}

	// Cập nhật label động
	updateStockQuantityLabels();
}

// Autocomplete functions for new fields
function initializePrescriptionTypeAutocomplete() {
	const input = document.getElementById('prescriptionType');
	const dropdown = document.getElementById('prescriptionTypeDropdown');
	const hiddenInput = document.getElementById('prescriptionTypeValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'H', label: 'Thuốc H' },
		{ value: 'N', label: 'Thuốc N' },
		{ value: 'BASIC', label: 'Cơ bản' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = '';
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	// Hide dropdown when clicking outside
	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function initializeAdministrationMethodAutocomplete() {
	const input = document.getElementById('administrationMethod');
	const dropdown = document.getElementById('administrationMethodDropdown');
	const hiddenInput = document.getElementById('administrationMethodValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'Uống', label: 'Uống' },
		{ value: 'Tiêm', label: 'Tiêm' },
		{ value: 'Truyền', label: 'Truyền' },
		{ value: 'Bôi', label: 'Bôi' },
		{ value: 'Nhỏ', label: 'Nhỏ' },
		{ value: 'Hít', label: 'Hít' },
		{ value: 'Ngậm', label: 'Ngậm' },
		{ value: 'Đặt', label: 'Đặt' },
		{ value: 'Súc', label: 'Súc' },
		{ value: 'Rửa', label: 'Rửa' },
		{ value: 'Xịt', label: 'Xịt' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = this.value;
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function initializeImportedTypeAutocomplete() {
	const input = document.getElementById('importedType');
	const dropdown = document.getElementById('importedTypeDropdown');
	const hiddenInput = document.getElementById('importedTypeValue');
	if (!input || !dropdown || !hiddenInput) return;

	const options = [
		{ value: 'false', label: 'Nội' },
		{ value: 'true', label: 'Ngoại' }
	];

	input.addEventListener('input', function () {
		hiddenInput.value = '';
		const query = normalizeSearchText(this.value);
		const filtered = options.filter(option =>
			normalizeSearchText(option.label).includes(query)
		);
		showDropdown(dropdown, filtered, input, hiddenInput);
	});

	input.addEventListener('focus', function () {
		showDropdown(dropdown, options, input, hiddenInput);
	});

	document.addEventListener('click', function (e) {
		if (!input.contains(e.target) && !dropdown.contains(e.target)) {
			setElementVisible(dropdown, false);
		}
	});
}

function showDropdown(dropdown, options, input, hiddenInput) {
	dropdown.innerHTML = '';

	if (options.length === 0) {
		setElementVisible(dropdown, false);
		return;
	}

	options.forEach(option => {
		const item = document.createElement('div');
		item.className = 'occupation-item';
		item.textContent = option.label;
		item.addEventListener('click', function () {
			input.value = option.label;
			hiddenInput.value = option.value;
			setElementVisible(dropdown, false);
		});
		dropdown.appendChild(item);
	});

	setElementVisible(dropdown, true);
}
