import { callVietnamAddressAPI, clearSelectOptions, collectPersonalDetailModalValues, fillMainAddressFieldFromModal, getConsole, getDocument, getElementValue, getEncodeURIComponent, getModalAddressFormValues, loadAddressHierarchy, loadDistricts, loadDistrictsModal, loadProvinces, loadProvincesForModal, loadProvincesModal, loadWards, loadWardsModal, normalizeAddressName, putPatientFields, setMainValue, setSelectByApprox, setSelectEnsureOption, setSelectValueWithFallback, tryFallbackAPI, updateAddressSummary } from './address-api.js';

async function savePersonalDetailAddressToServerIfEditing(options = {}) {
	try {
		const win = options.window || window;
		if (!win.currentPatientId) return false;
		const values = getModalAddressFormValues(options);
		const buildFullAddressFromParts = options.buildFullAddressFromParts || win.buildFullAddressFromParts;
		const address = typeof buildFullAddressFromParts === 'function'
			? buildFullAddressFromParts(values.address_detail, values.ward, values.district, values.province)
			: '';

		await putPatientFields(win.currentPatientId, {
			address_detail: values.address_detail,
			province: values.province,
			district: values.district,
			ward: values.ward,
			address
		}, options);
		return true;
	} catch (error) {
		return false;
	}
}
function ensureMainOccupationFromModal(options = {}) {
	const doc = getDocument(options);
	const occupationField = doc.getElementById('occupation');
	if (!occupationField || occupationField.value) return '';

	let modalOccupation = '';
	const win = options.window || window;
	if (win.modalOccupationAutocomplete && typeof win.modalOccupationAutocomplete.getValue === 'function') {
		modalOccupation = win.modalOccupationAutocomplete.getValue() || '';
	} else {
		modalOccupation = getElementValue('modalOccupation', options);
	}
	if (modalOccupation) occupationField.value = modalOccupation;
	return modalOccupation;
}
function clearAddressDraftCacheIfAvailable(options = {}) {
	const win = options.window || window;
	if (typeof win.clearAddressDraftCache === 'function') {
		win.clearAddressDraftCache();
		return true;
	}
	return false;
}
function saveAddressDraftToCacheIfAvailable(options = {}) {
	const win = options.window || window;
	if (typeof win.saveAddressDraftToCache === 'function') {
		win.saveAddressDraftToCache();
		return true;
	}
	return false;
}
async function handlePersonalDetailModalClose(options = {}) {
	const values = await syncPersonalDetailModalToMainForm({
		...options,
		saveToDb: options.saveToDb !== false
	});

	if (options.fillMainAddressFieldFromModal) {
		fillMainAddressFieldFromModal(options);
	}
	if (options.ensureOccupationFallback) {
		ensureMainOccupationFromModal(options);
	}

	const win = options.window || window;
	if (win.currentPatientId) {
		if (options.saveAddressToServerOnEdit) {
			await savePersonalDetailAddressToServerIfEditing(options);
		}
		if (options.clearDraftOnEdit !== false) {
			clearAddressDraftCacheIfAvailable(options);
		}
	} else if (options.saveDraftOnNew) {
		saveAddressDraftToCacheIfAvailable(options);
	} else if (options.clearDraftOnNew) {
		clearAddressDraftCacheIfAvailable(options);
	}

	return values;
}
function hasPregnancyWeeks(values) {
	return values.so_tuan_thai !== null && values.so_tuan_thai !== '';
}

// [main form field id, modal value key]
const PERSONAL_DETAIL_MAIN_FIELDS = [
	['idCard', 'id_number'], ['nationality', 'nationality'], ['religion', 'religion'], ['ethnicity', 'ethnicity'],
	['occupation', 'occupation'], ['donViCongTac', 'don_vi_cong_tac'], ['diaChiCongTy', 'dia_chi_cong_ty'],
	['educationLevel', 'education_level'], ['gender', 'gender'], ['sexualOrientation', 'sexual_orientation']
];

function copyPersonalDetailsToMainForm(values, options) {
	PERSONAL_DETAIL_MAIN_FIELDS.forEach(([fieldId, key]) => setMainValue(fieldId, values[key], options));
	setMainValue('mangThai', values.mang_thai ? '1' : '', options);
	setMainValue('ngayDuSinh', values.expected_delivery_date || '', options);
	setMainValue('soTuanThai', hasPregnancyWeeks(values) ? values.so_tuan_thai : '', options);
}

async function savePersonalDetails(patientId, values, options) {
	await putPatientFields(patientId, {
		occupation: values.occupation,
		don_vi_cong_tac: values.don_vi_cong_tac,
		dia_chi_cong_ty: values.dia_chi_cong_ty,
		education_level: values.education_level
	}, options);
	await putPatientFields(patientId, {
		id_number: values.id_number,
		nationality: values.nationality,
		religion: values.religion,
		ethnicity: values.ethnicity
	}, options);
	await putPatientFields(patientId, {
		gender: values.gender,
		sexual_orientation: values.sexual_orientation,
		mang_thai: values.mang_thai,
		expected_delivery_date: values.expected_delivery_date || null,
		so_tuan_thai: hasPregnancyWeeks(values) ? values.so_tuan_thai : null
	}, options);
}

async function syncPersonalDetailModalToMainForm(options = {}) {
	try {
		const win = options.window || window;
		const values = collectPersonalDetailModalValues(options);
		const buildFullAddressFromParts = options.buildFullAddressFromParts || win.buildFullAddressFromParts;

		if ((values.province || values.address_detail) && typeof buildFullAddressFromParts === 'function') {
			const full = buildFullAddressFromParts(values.address_detail, values.ward, values.district, values.province);
			setMainValue('addressDetail', values.address_detail, options);
			setSelectEnsureOption('province', values.province, options);
			setSelectEnsureOption('district', values.district, options);
			setSelectEnsureOption('ward', values.ward, options);
			setMainValue('address', full, options);
		}

		copyPersonalDetailsToMainForm(values, options);

		const mainGenderSelect = getDocument(options).getElementById('gender');
		if (mainGenderSelect && values.gender) mainGenderSelect.value = values.gender;

		if (options.saveToDb && win.currentPatientId) {
			await savePersonalDetails(win.currentPatientId, values, options);
		}
		return values;
	} catch (error) {
		return null;
	}
}
function hasPersonalDetailModalAddressData(options = {}) {
	return Boolean(
		getElementValue('modalAddressDetail', options) ||
		getElementValue('modalProvince', options) ||
		getElementValue('modalDistrict', options) ||
		getElementValue('modalWard', options)
	);
}
async function syncPersonalDetailModalIfNeeded(options = {}) {
	try {
		const currentAppointmentId = typeof options.getCurrentAppointmentId === 'function'
			? options.getCurrentAppointmentId()
			: options.currentAppointmentId;
		if (currentAppointmentId || !hasPersonalDetailModalAddressData(options)) return false;
		if (typeof options.syncModalDataToMainForm === 'function') {
			await options.syncModalDataToMainForm();
		} else {
			await syncPersonalDetailModalToMainForm(options);
		}
		return true;
	} catch (error) {
		return false;
	}
}
async function handleProvinceChange(provinceName, options = {}) {
	if (provinceName) {
		await options.loadDistrictsModal(provinceName);
	} else {
		clearSelectOptions('modalDistrict', 'Chọn quận/huyện', options);
		clearSelectOptions('modalWard', 'Chọn phường/xã', options);
	}
}
async function handleDistrictChange(provinceName, districtName, options = {}) {
	if (provinceName && districtName) {
		await options.loadWardsModal(provinceName, districtName);
	} else {
		clearSelectOptions('modalWard', 'Chọn phường/xã', options);
	}
}
function setupMainAddressChangeHandlers(options = {}) {
	const doc = getDocument(options);
	const addressDetailEl = doc.getElementById('addressDetail');
	const provinceEl = doc.getElementById('province');
	const districtEl = doc.getElementById('district');
	const wardEl = doc.getElementById('ward');
	const updateSummary = () => updateAddressSummary(options);

	if (addressDetailEl && !addressDetailEl._mainAddressSummaryBound) {
		addressDetailEl.addEventListener('input', updateSummary);
		addressDetailEl._mainAddressSummaryBound = true;
	}

	if (provinceEl && !provinceEl._mainAddressProvinceBound) {
		provinceEl.addEventListener('change', function () {
			const provinceName = this.value;
			if (provinceName) {
				if (typeof options.loadDistricts === 'function') options.loadDistricts(provinceName);
				if (districtEl) districtEl.value = '';
				if (wardEl) wardEl.value = '';
			} else {
				if (districtEl) districtEl.replaceChildren(new Option('Chọn quận/huyện', ''));
				if (wardEl) wardEl.replaceChildren(new Option('Chọn phường/xã', ''));
			}
			updateSummary();
		});
		provinceEl._mainAddressProvinceBound = true;
	}

	if (districtEl && !districtEl._mainAddressDistrictBound) {
		districtEl.addEventListener('change', function () {
			const provinceName = provinceEl ? provinceEl.value : '';
			const districtName = this.value;
			if (provinceName && districtName) {
				if (typeof options.loadWards === 'function') options.loadWards(provinceName, districtName);
				if (wardEl) wardEl.value = '';
			} else if (wardEl) {
				wardEl.replaceChildren(new Option('Chọn phường/xã', ''));
			}
			updateSummary();
		});
		districtEl._mainAddressDistrictBound = true;
	}

	if (wardEl && !wardEl._mainAddressWardBound) {
		wardEl.addEventListener('change', updateSummary);
		wardEl._mainAddressWardBound = true;
	}
}
function createAddressHierarchyAdapter(options = {}) {
	const adapter = {};
	const baseOptions = () => ({
		apiCall: options.apiCall,
		document: getDocument(options),
		console: getConsole(options),
		encodeURIComponent: getEncodeURIComponent(options),
		URLSearchParams: options.URLSearchParams || window.URLSearchParams
	});

	adapter.callVietnamAddressAPI = (endpoint, params = {}) => callVietnamAddressAPI(endpoint, params, baseOptions());
	adapter.tryFallbackAPI = (endpoint, params = {}) => tryFallbackAPI(endpoint, params, baseOptions());
	adapter.normalizeAddressName = normalizeAddressName;
	adapter.setSelectValueWithFallback = (selectId, value) => setSelectValueWithFallback(selectId, value, baseOptions());
	adapter.setSelectByApprox = (selectId, targetName, type) => setSelectByApprox(selectId, targetName, type, baseOptions());
	adapter.loadProvinces = () => loadProvinces(baseOptions());
	adapter.loadDistricts = provinceName => loadDistricts(provinceName, baseOptions());
	adapter.loadWards = (provinceName, districtName) => loadWards(provinceName, districtName, baseOptions());
	adapter.loadProvincesModal = () => loadProvincesModal(baseOptions());
	adapter.loadProvincesForModal = () => loadProvincesForModal(baseOptions());
	adapter.loadDistrictsModal = provinceName => loadDistrictsModal(provinceName, baseOptions());
	adapter.loadWardsModal = (provinceName, districtName) => loadWardsModal(provinceName, districtName, baseOptions());
	adapter.loadAddressHierarchy = (provinceName = null, districtName = null, wardName = null) => loadAddressHierarchy(provinceName, districtName, wardName, {
		...baseOptions(),
		loadProvincesForModal: adapter.loadProvincesForModal,
		loadDistrictsModal: adapter.loadDistrictsModal,
		loadWardsModal: adapter.loadWardsModal
	});
	adapter.clearSelectOptions = (selectId, placeholder) => clearSelectOptions(selectId, placeholder, baseOptions());
	adapter.getModalAddressFormValues = () => getModalAddressFormValues(baseOptions());
	adapter.updateAddressSummary = () => updateAddressSummary(baseOptions());
	adapter.syncPersonalDetailModalToMainForm = (saveToDb = false, extraOptions = {}) => syncPersonalDetailModalToMainForm({
		...baseOptions(),
		...extraOptions,
		window: options.window || window,
		saveToDb
	});
	adapter.syncPersonalDetailModalIfNeeded = (extraOptions = {}) => syncPersonalDetailModalIfNeeded({
		...baseOptions(),
		...extraOptions,
		window: options.window || window
	});
	adapter.savePersonalDetailAddressToServerIfEditing = (extraOptions = {}) => savePersonalDetailAddressToServerIfEditing({
		...baseOptions(),
		...extraOptions,
		window: options.window || window
	});
	adapter.handlePersonalDetailModalClose = (extraOptions = {}) => handlePersonalDetailModalClose({
		...baseOptions(),
		...extraOptions,
		window: options.window || window
	});
	adapter.fillMainAddressFieldFromModal = (buildFullAddressFromParts) => fillMainAddressFieldFromModal({
		...baseOptions(),
		buildFullAddressFromParts
	});
	adapter.handleProvinceChange = provinceName => handleProvinceChange(provinceName, {
		...baseOptions(),
		loadDistrictsModal: adapter.loadDistrictsModal
	});
	adapter.handleDistrictChange = (provinceName, districtName) => handleDistrictChange(provinceName, districtName, {
		...baseOptions(),
		loadWardsModal: adapter.loadWardsModal
	});
	adapter.setupMainAddressChangeHandlers = () => setupMainAddressChangeHandlers({
		...baseOptions(),
		loadDistricts: adapter.loadDistricts,
		loadWards: adapter.loadWards
	});

	return adapter;
}

export { clearAddressDraftCacheIfAvailable, createAddressHierarchyAdapter, ensureMainOccupationFromModal, handleDistrictChange, handlePersonalDetailModalClose, handleProvinceChange, hasPersonalDetailModalAddressData, saveAddressDraftToCacheIfAvailable, savePersonalDetailAddressToServerIfEditing, setupMainAddressChangeHandlers, syncPersonalDetailModalIfNeeded, syncPersonalDetailModalToMainForm };
