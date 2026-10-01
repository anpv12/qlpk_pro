import { state } from './management-state.js';
import { getUserFacingResponseMessage, normalizeSearchText, setElementVisible, setPackagingInfoActive, showCustomToast } from '../medicine-management.js';
import { getUnitDisplay, loadMedicines } from './management-list.js';
import { updateBoxesInputFromStockQuantity, updatePackagingInfo, updateStockQuantityHint, updateStockQuantityLabels } from './management-stock.js';
import { ClinicMedicineCatalog } from './clinic-catalog.js';
import { MedicinePriceEditor } from './price-editor.js';
import { addClass, fieldValue, focusFirst, hideModal, setFieldValue, setProp, setText, showModal } from '../shared/dom-query.js';
import { byId, el, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';

let medicineEditRevision = 0;
let medicineSaving = false;
function editMedicine(id) {
    if (MedicinePriceEditor.isSaving()) return;
    if (medicineSaving) return;
    const hasSession = window.QLPKApiTransport.hasSession();
    if (!hasSession) { showCustomToast('error', 'Vui lòng đăng nhập lại!'); return; }
    resetForm();
    const requestId = ++medicineEditRevision;
    requestJson(`/api/medicines/${id}`).then(data => {
        if (requestId === medicineEditRevision) populateMedicineForm(data, id);
    }, error => {
        if (requestId !== medicineEditRevision) return;
        showCustomToast('error', error?.status === 401 ? 'Phiên đăng nhập đã hết hạn' : 'Không tải được thông tin thuốc mới nhất. Vui lòng thử lại.');
    });
}

// Populate medicine form with data
function populateMedicineForm(medicine, id) {
	if (!medicine) {
		showCustomToast('error', 'Không tìm thấy thuốc');
		return;
	}

	setText('#medicineModalLabel', 'CHỈNH SỬA THUỐC');
	state.editingMedicineId = id;
	fillMedicineTextFields(medicine);
	fillMedicineChoiceFields(medicine);
	fillMedicinePackagingFields(medicine);
	setFieldValue('#pillsPerUnit', 0);

	const totalStock = medicine.stock_quantity || 0;
	const populatedRevision = medicineEditRevision;
	setTimeout(() => {
		if (populatedRevision !== medicineEditRevision) return;
		applyPopulatedStockQuantity(totalStock);
	}, 150);

	ClinicMedicineCatalog.setExisting(medicine);
	showModal('#medicineModal');
}

function fillMedicineTextFields(medicine) {
	setFieldValue('input[name="name"]', medicine.name);
	setFieldValue('#genericNameInput', medicine.generic_name || '');
	setFieldValue('#genericNameValue', medicine.generic_name || '');
	setFieldValue('input[name="internal_code"]', medicine.internal_code || '');
	setFieldValue('input[name="national_code"]', medicine.national_code || '');
	setFieldValue('input[name="strength"]', medicine.strength);
	setFieldValue('#stockQuantitySummaryDisplay', medicine.stock_quantity ?? 0);
	setFieldValue('input[name="low_stock_threshold"]', medicine.low_stock_threshold ?? '');
	setFieldValue('input[name="expiry_warning_days"]', medicine.expiry_warning_days ?? '');
	setFieldValue('input[name="description"], textarea[name="description"]', medicine.description || '');
	setFieldValue('input[name="packaging"]', medicine.packaging || '');
	setFieldValue('input[name="origin"]', medicine.origin || '');
}

function getImportedTypeLabel(isImported) {
	if (isImported == null) return '';
	return isImported ? 'Ngoại' : 'Nội';
}

function fillMedicineChoiceFields(medicine) {
	const prescriptionTypeMap = { 'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N' };
	setFieldValue('#prescriptionType', prescriptionTypeMap[medicine.prescription_type] || 'Cơ bản');
	setFieldValue('#prescriptionTypeValue', medicine.prescription_type || 'BASIC');
	setFieldValue('select[name="unit"]', medicine.unit);
	setFieldValue('#importedType', getImportedTypeLabel(medicine.is_imported));
	setFieldValue('#importedTypeValue', medicine.is_imported == null ? '' : String(medicine.is_imported));
	setFieldValue('#administrationMethod', medicine.administration_method || '');
	setFieldValue('#administrationMethodValue', medicine.administration_method || '');
	// Hiển thị và lưu trực tiếp tiếng Việt (tương thích dữ liệu cũ)
	const unitDisplay = getUnitDisplay(medicine.unit);
	setFieldValue('#saleUnit', unitDisplay);
	setFieldValue('#saleUnitValue', unitDisplay);
}

function fillMedicinePackagingFields(medicine) {
	if (medicine.packaging_unit) {
		setFieldValue('#packagingUnit', (medicine.packaging_unit || '').toLowerCase().trim());
	}
	if (medicine.units_per_box !== undefined && medicine.units_per_box !== null) {
		setFieldValue('#unitsPerBox', medicine.units_per_box ?? '');
		return;
	}
	if (!medicine.packaging) return;
	// Format: "Hộp 20 lọ" hoặc "Hộp 10 vỉ x 10 viên"
	const packagingMatch = medicine.packaging.match(/Hộp\s+(\d+)\s+([^\sx]+)/i);
	if (!packagingMatch) return;
	const unitsPerBox = parseInt(packagingMatch[1]) || 0;
	const packagingUnit = (packagingMatch[2] || '').toLowerCase().trim();
	if (unitsPerBox > 0 && packagingUnit) {
		setFieldValue('#unitsPerBox', unitsPerBox);
		if (!medicine.packaging_unit) setFieldValue('#packagingUnit', packagingUnit);
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

// Form fields -> API payload (catalog only: stock and purchase prices are never sent from this form)
function collectMedicinePayload() {
	const formData = new FormData(byId('medicineForm'));
	const medicineData = Object.fromEntries(formData.entries());

	// Nội/ngoại - từ autocomplete
	medicineData.is_imported = fieldValue('#importedTypeValue') === '' ? null : fieldValue('#importedTypeValue') === 'true';
	// Loại đơn thuốc - từ autocomplete
	medicineData.prescription_type = fieldValue('#prescriptionTypeValue');

	// Purchase costs belong to receipt lines, never to the catalog form.

	// Xử lý quy cách đóng gói (chỉ có đơn vị và số đơn vị trong hộp)
	const unitsPerBox = fieldValue('#unitsPerBox') === '' ? null : Number(fieldValue('#unitsPerBox'));
	const packagingUnit = fieldValue('#packagingUnit') || '';

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
	return medicineData;
}

// Save medicine
async function saveMedicine() {
    if (MedicinePriceEditor.isOpen()) return;
	if (medicineSaving) return;
	const medicineData = collectMedicinePayload();
	const medicineId = state.editingMedicineId;
	if (!validateMedicineRequiredFields(medicineData)) return;
	// Mã thuốc duy nhất (khuyến nghị có) - đã bỏ validation bắt buộc

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	const selectionError = ClinicMedicineCatalog.payload(medicineData);
	if (selectionError) {
		showMedicineFormError(selectionError);
		return;
	}
	const url = medicineId ? `/api/medicines/${medicineId}` : '/api/medicines/';
	const method = medicineId ? 'PUT' : 'POST';
	const saveRevision = medicineEditRevision;
	medicineSaving = true;
	setProp('#medicineSaveButton', 'disabled', true);

	try {
		await requestJson(url, { method, json: medicineData });
		if (saveRevision !== medicineEditRevision) return;
		medicineSaving = false;
		showCustomToast('success', medicineId ? 'Cập nhật thuốc thành công' : 'Thêm thuốc thành công');
		hideModal('#medicineModal');
		loadMedicines();
	} catch (error) {
		if (saveRevision !== medicineEditRevision) return;
		if (error?.status === 401) {
			showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		} else {
			const message = getUserFacingResponseMessage(error, [400, 409], 'Không lưu được thông tin thuốc. Hãy thử lại.');
			showMedicineFormError(message);
			showCustomToast('error', message);
		}
	} finally {
		medicineSaving = false;
		if (saveRevision === medicineEditRevision) setProp('#medicineSaveButton', 'disabled', false);
	}
}

function showMedicineFormError(message) {
	const error = byId('medicineFormError');
	error.classList.remove('d-none');
	error.textContent = message;
}

function coerceMedicineNumbers(medicineData) {
	const numericFields = ['low_stock_threshold', 'expiry_warning_days', 'units_per_box', 'pills_per_unit'];
	numericFields.forEach(f => {
		// Nếu field trống, set thành null thay vì chuỗi rỗng
		medicineData[f] = medicineData[f] !== undefined && medicineData[f] !== '' ? Number(medicineData[f]) : null;
	});
}

function resolveSelectedSaleUnit() {
	const selectedSaleUnit = fieldValue('#saleUnitValue');
	if (selectedSaleUnit) return selectedSaleUnit;
	// Nếu không có giá trị trong hidden input, lấy từ input hiển thị
	const displayUnit = fieldValue('#saleUnit');
	if (displayUnit) setFieldValue('#saleUnitValue', displayUnit); // Cập nhật hidden input
	return displayUnit || selectedSaleUnit;
}

function validateMedicineRequiredFields(medicineData) {
	// Validate prescription_type
	const validPrescriptionTypes = ['BASIC', 'H', 'N'];
	if (!medicineData.prescription_type || !validPrescriptionTypes.includes(medicineData.prescription_type)) {
		showCustomToast('error', 'Vui lòng chọn "Loại đơn thuốc" (Cơ bản, Thuốc H, Thuốc N)');
		focusFirst('#prescriptionType');
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
	state.pendingDeleteMedicineId = id;
	showModal('#confirmDeleteModal');
}

// Delete medicine
async function deleteMedicine() {
	const medicineId = state.pendingDeleteMedicineId;

	const hasSession = window.QLPKApiTransport.hasSession();
	if (!hasSession) {
		showCustomToast('error', 'Vui lòng đăng nhập lại!');
		return;
	}

	try {
		await requestJson(`/api/medicines/${medicineId}`, { method: 'DELETE' });
		showCustomToast('success', 'Xóa thuốc thành công');
		hideModal('#confirmDeleteModal');
		loadMedicines();
	} catch (error) {
		if (error?.status === 401) {
			showCustomToast('error', 'Phiên đăng nhập đã hết hạn');
		} else {
			showCustomToast('error', getUserFacingResponseMessage(error, [409], 'Không xóa được thuốc. Hãy thử lại.'));
		}
	}
}

// Reset form
function resetForm() {
	medicineEditRevision += 1;
	byId('medicineForm').reset();
	ClinicMedicineCatalog.reset();
	state.editingMedicineId = undefined;
	setText('#medicineModalLabel', 'THÊM THUỐC MỚI');
	addClass('#medicineFormError', 'd-none');

	// Reset new autocomplete fields

	setFieldValue('#prescriptionType', '');
	setFieldValue('#prescriptionTypeValue', '');
	setFieldValue('#administrationMethod', '');
	setFieldValue('#administrationMethodValue', '');
	setFieldValue('#importedType', '');
	setFieldValue('#importedTypeValue', '');
	setFieldValue('#genericNameInput', '');
	setFieldValue('#genericNameValue', '');

	// Reset quy cách đóng gói và số lượng tồn kho
	setFieldValue('#unitsPerBox', '');
	setFieldValue('#pillsPerUnit', 0);
	setFieldValue('#packagingUnit', '');
	setFieldValue('#packagingDisplay', '');

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
	replace(dropdown, options.map(option => {
		const item = el('div', { class: 'occupation-item' }, option.label);
		item.addEventListener('click', () => {
			input.value = option.label;
			hiddenInput.value = option.value;
			setElementVisible(dropdown, false);
		});
		return item;
	}));
	setElementVisible(dropdown, options.length > 0);
}

export { confirmDelete, deleteMedicine, editMedicine, initializeAdministrationMethodAutocomplete, initializeImportedTypeAutocomplete, initializePrescriptionTypeAutocomplete, medicineSaving, resetForm, saveMedicine };
