// components/address-hierarchy-utils.js: phần 2/2 (nạp trước address-hierarchy-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/address-hierarchy-utils'] || (window.QLPKModuleParts['components/address-hierarchy-utils'] = { state: {} });

	async function savePersonalDetailAddressToServerIfEditing(options = {}) {
		try {
			const win = options.window || window;
			if (!win.currentPatientId) return false;
			const values = moduleParts.getModalAddressFormValues(options);
			const buildFullAddressFromParts = options.buildFullAddressFromParts || win.buildFullAddressFromParts;
			const address = typeof buildFullAddressFromParts === 'function'
				? buildFullAddressFromParts(values.address_detail, values.ward, values.district, values.province)
				: '';

			await moduleParts.putPatientFields(win.currentPatientId, {
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
		const doc = moduleParts.getDocument(options);
		const occupationField = doc.getElementById('occupation');
		if (!occupationField || occupationField.value) return '';

		let modalOccupation = '';
		const win = options.window || window;
		if (win.modalOccupationAutocomplete && typeof win.modalOccupationAutocomplete.getValue === 'function') {
			modalOccupation = win.modalOccupationAutocomplete.getValue() || '';
		} else {
			modalOccupation = moduleParts.getElementValue('modalOccupation', options);
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
			moduleParts.fillMainAddressFieldFromModal(options);
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
	async function syncPersonalDetailModalToMainForm(options = {}) {
		try {
			const win = options.window || window;
			const values = moduleParts.collectPersonalDetailModalValues(options);
			const buildFullAddressFromParts = options.buildFullAddressFromParts || win.buildFullAddressFromParts;

			if ((values.province || values.address_detail) && typeof buildFullAddressFromParts === 'function') {
				const full = buildFullAddressFromParts(values.address_detail, values.ward, values.district, values.province);
				moduleParts.setMainValue('addressDetail', values.address_detail, options);
				moduleParts.setSelectEnsureOption('province', values.province, options);
				moduleParts.setSelectEnsureOption('district', values.district, options);
				moduleParts.setSelectEnsureOption('ward', values.ward, options);
				moduleParts.setMainValue('address', full, options);
			}

			moduleParts.setMainValue('idCard', values.id_number, options);
			moduleParts.setMainValue('nationality', values.nationality, options);
			moduleParts.setMainValue('religion', values.religion, options);
			moduleParts.setMainValue('ethnicity', values.ethnicity, options);
			moduleParts.setMainValue('occupation', values.occupation, options);
			moduleParts.setMainValue('donViCongTac', values.don_vi_cong_tac, options);
			moduleParts.setMainValue('diaChiCongTy', values.dia_chi_cong_ty, options);
			moduleParts.setMainValue('educationLevel', values.education_level, options);
			moduleParts.setMainValue('gender', values.gender, options);
			moduleParts.setMainValue('sexualOrientation', values.sexual_orientation, options);
			moduleParts.setMainValue('mangThai', values.mang_thai ? '1' : '', options);
			moduleParts.setMainValue('ngayDuSinh', values.expected_delivery_date || '', options);
			moduleParts.setMainValue('soTuanThai', values.so_tuan_thai !== null && values.so_tuan_thai !== '' ? values.so_tuan_thai : '', options);

			const mainGenderSelect = moduleParts.getDocument(options).getElementById('gender');
			if (mainGenderSelect && values.gender) mainGenderSelect.value = values.gender;

			if (options.saveToDb && win.currentPatientId) {
				const patientId = win.currentPatientId;
				await moduleParts.putPatientFields(patientId, {
					occupation: values.occupation,
					don_vi_cong_tac: values.don_vi_cong_tac,
					dia_chi_cong_ty: values.dia_chi_cong_ty,
					education_level: values.education_level
				}, options);
				await moduleParts.putPatientFields(patientId, {
					id_number: values.id_number,
					nationality: values.nationality,
					religion: values.religion,
					ethnicity: values.ethnicity
				}, options);
				await moduleParts.putPatientFields(patientId, {
					gender: values.gender,
					sexual_orientation: values.sexual_orientation,
					mang_thai: values.mang_thai,
					expected_delivery_date: values.expected_delivery_date || null,
					so_tuan_thai: values.so_tuan_thai !== null && values.so_tuan_thai !== '' ? values.so_tuan_thai : null
				}, options);
			}
			return values;
		} catch (error) {
			return null;
		}
	}
	function hasPersonalDetailModalAddressData(options = {}) {
		return Boolean(
			moduleParts.getElementValue('modalAddressDetail', options) ||
			moduleParts.getElementValue('modalProvince', options) ||
			moduleParts.getElementValue('modalDistrict', options) ||
			moduleParts.getElementValue('modalWard', options)
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
			moduleParts.clearSelectOptions('modalDistrict', 'Chọn quận/huyện', options);
			moduleParts.clearSelectOptions('modalWard', 'Chọn phường/xã', options);
		}
	}
	async function handleDistrictChange(provinceName, districtName, options = {}) {
		if (provinceName && districtName) {
			await options.loadWardsModal(provinceName, districtName);
		} else {
			moduleParts.clearSelectOptions('modalWard', 'Chọn phường/xã', options);
		}
	}
	function setupMainAddressChangeHandlers(options = {}) {
		const doc = moduleParts.getDocument(options);
		const addressDetailEl = doc.getElementById('addressDetail');
		const provinceEl = doc.getElementById('province');
		const districtEl = doc.getElementById('district');
		const wardEl = doc.getElementById('ward');
		const updateSummary = () => moduleParts.updateAddressSummary(options);

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
					if (districtEl) districtEl.innerHTML = '<option value="">Chọn quận/huyện</option>';
					if (wardEl) wardEl.innerHTML = '<option value="">Chọn phường/xã</option>';
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
					wardEl.innerHTML = '<option value="">Chọn phường/xã</option>';
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
			document: moduleParts.getDocument(options),
			console: moduleParts.getConsole(options),
			encodeURIComponent: moduleParts.getEncodeURIComponent(options),
			URLSearchParams: options.URLSearchParams || window.URLSearchParams
		});

		adapter.callVietnamAddressAPI = (endpoint, params = {}) => moduleParts.callVietnamAddressAPI(endpoint, params, baseOptions());
		adapter.tryFallbackAPI = (endpoint, params = {}) => moduleParts.tryFallbackAPI(endpoint, params, baseOptions());
		adapter.normalizeAddressName = moduleParts.normalizeAddressName;
		adapter.setSelectValueWithFallback = (selectId, value) => moduleParts.setSelectValueWithFallback(selectId, value, baseOptions());
		adapter.setSelectByApprox = (selectId, targetName, type) => moduleParts.setSelectByApprox(selectId, targetName, type, baseOptions());
		adapter.loadProvinces = () => moduleParts.loadProvinces(baseOptions());
		adapter.loadDistricts = provinceName => moduleParts.loadDistricts(provinceName, baseOptions());
		adapter.loadWards = (provinceName, districtName) => moduleParts.loadWards(provinceName, districtName, baseOptions());
		adapter.loadProvincesModal = () => moduleParts.loadProvincesModal(baseOptions());
		adapter.loadProvincesForModal = () => moduleParts.loadProvincesForModal(baseOptions());
		adapter.loadDistrictsModal = provinceName => moduleParts.loadDistrictsModal(provinceName, baseOptions());
		adapter.loadWardsModal = (provinceName, districtName) => moduleParts.loadWardsModal(provinceName, districtName, baseOptions());
		adapter.loadAddressHierarchy = (provinceName = null, districtName = null, wardName = null) => moduleParts.loadAddressHierarchy(provinceName, districtName, wardName, {
			...baseOptions(),
			loadProvincesForModal: adapter.loadProvincesForModal,
			loadDistrictsModal: adapter.loadDistrictsModal,
			loadWardsModal: adapter.loadWardsModal
		});
		adapter.clearSelectOptions = (selectId, placeholder) => moduleParts.clearSelectOptions(selectId, placeholder, baseOptions());
		adapter.getModalAddressFormValues = () => moduleParts.getModalAddressFormValues(baseOptions());
		adapter.updateAddressSummary = () => moduleParts.updateAddressSummary(baseOptions());
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
		adapter.fillMainAddressFieldFromModal = (buildFullAddressFromParts) => moduleParts.fillMainAddressFieldFromModal({
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
			$: options.$ || window.$,
			loadDistricts: adapter.loadDistricts,
			loadWards: adapter.loadWards
		});

		return adapter;
	}

	Object.assign(moduleParts, {
		savePersonalDetailAddressToServerIfEditing,
		ensureMainOccupationFromModal,
		clearAddressDraftCacheIfAvailable,
		saveAddressDraftToCacheIfAvailable,
		handlePersonalDetailModalClose,
		syncPersonalDetailModalToMainForm,
		hasPersonalDetailModalAddressData,
		syncPersonalDetailModalIfNeeded,
		handleProvinceChange,
		handleDistrictChange,
		setupMainAddressChangeHandlers,
		createAddressHierarchyAdapter
	});
})();
