// components/address-hierarchy-utils.js: phần 1/2 (nạp trước address-hierarchy-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function () {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/address-hierarchy-utils'] || (window.QLPKModuleParts['components/address-hierarchy-utils'] = { state: {} });

	function getDocument(options = {}) {
		return options.document || window.document;
	}
	function getConsole(options = {}) {
		return options.console || window.console || { error() {} };
	}
	function getApiCall(options = {}) {
		if (typeof options.apiCall === 'function') {
			return options.apiCall;
		}
		throw new Error('apiCall is required');
	}
	function getSearchParamsCtor(options = {}) {
		return options.URLSearchParams || window.URLSearchParams;
	}
	function getEncodeURIComponent(options = {}) {
		return options.encodeURIComponent || window.encodeURIComponent || encodeURIComponent;
	}
	async function callVietnamAddressAPI(endpoint, params = {}, options = {}) {
		try {
			const SearchParams = getSearchParamsCtor(options);
			const queryString = new SearchParams(params).toString();
			const url = queryString ? `${endpoint}?${queryString}` : endpoint;
			let response = await getApiCall(options)(url);

			if (response.status === 404) {
				const fallbackResponse = await tryFallbackAPI(endpoint, params, options);
				if (fallbackResponse) {
					response = fallbackResponse;
				}
			}

			return response;
		} catch (error) {
			getConsole(options).error(`Error calling Vietnam Address API ${endpoint}:`, error);
			throw error;
		}
	}
	async function fetchDistrictsByProvinceCode(provinceName, options) {
		const apiCall = getApiCall(options);
		const response = await apiCall('/api/vietnam-address/provinces');
		const payload = await response.json();
		const province = (payload.data || []).find(item =>
			item.name === provinceName || item.name?.normalize('NFC') === provinceName?.normalize('NFC')
		);
		const provinceCode = province && (province.code || province.id);
		return provinceCode ? apiCall(`/api/vietnam-address/districts/${provinceCode}`) : null;
	}
	async function fetchWardsByDistrictCode(params, options) {
		const apiCall = getApiCall(options);
		const encode = getEncodeURIComponent(options);
		let response = await apiCall(`/api/vietnam-address/districts?province=${encode(params.province)}`);
		if (response.status === 404) {
			response = await fetchDistrictsByProvinceCode(params.province, options);
		}
		if (!response) return null;
		const payload = await response.json();
		const districts = payload.data || payload || [];
		const district = districts.find(item => (item.name || item.district_name) === params.district);
		const districtCode = district && (district.code || district.id);
		return districtCode ? apiCall(`/api/vietnam-address/wards/${districtCode}`) : null;
	}
	async function tryFallbackAPI(endpoint, params = {}, options = {}) {
		try {
			if (endpoint.includes('/districts')) {
				return await fetchDistrictsByProvinceCode(params.province, options);
			}
			if (endpoint.includes('/wards')) {
				return await fetchWardsByDistrictCode(params, options);
			}
			return null;
		} catch (error) {
			getConsole(options).error('Fallback API error:', error);
			return null;
		}
	}
	function normalizeAddressName(s) {
		if (!s) return '';
		let x = `${s}`.trim();
		x = x.replace(/^t\s*p\.?\s*/i, '');
		x = x.replace(/^thành phố\s+/i, '');
		x = x.replace(/^tỉnh\s+/i, '');
		x = window.QLPKSearchNormalization?.normalizeSearchText(x)
			|| x.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
		return x.replace(/\s+/g, ' ');
	}
	function setSelectValueWithFallback(selectId, value, options = {}) {
		const select = getDocument(options).getElementById(selectId);
		if (!select || !value) return false;

		select.value = value;
		if (select.value === value) return true;

		const targetNorm = normalizeAddressName(value);
		const matchOpt = Array.from(select.options).find(opt =>
			normalizeAddressName(opt.textContent) === targetNorm
		);
		if (matchOpt) {
			select.value = matchOpt.value;
			return true;
		}
		return false;
	}
	function setSelectByApprox(selectId, targetName, type, options = {}) {
		try {
			if (!targetName) return false;
			const select = getDocument(options).getElementById(selectId);
			if (!select) return false;
			const normalize = (s) => {
				if (!s) return '';
				let t = String(s).trim();
				if (type === 'district') {
					t = t.replace(/^(Quận|Huyện|Thị\s*xã|Thành\s*phố)\s*/i, '');
				} else if (type === 'ward') {
					t = t.replace(/^(Phường|Xã|Thị\s*trấn)\s*/i, '');
				}
				return window.QLPKSearchNormalization?.normalizeSearchText(t)
					|| t.normalize('NFKD').toLowerCase().replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
			};
			const target = normalize(targetName);
			for (const opt of Array.from(select.options)) {
				if (normalize(opt.value) === target || normalize(opt.textContent) === target) {
					select.value = opt.value;
					return true;
				}
			}
			for (const opt of Array.from(select.options)) {
				if (normalize(opt.value).includes(target) || normalize(opt.textContent).includes(target)) {
					select.value = opt.value;
					return true;
				}
			}
			return false;
		} catch (e) {
			return false;
		}
	}
	function appendAddressOptions(select, items = [], options = {}) {
		const { includeCode = false, nameFields = ['name'] } = options;
		(items || []).forEach(item => {
			const name = typeof item === 'string'
				? item
				: nameFields.reduce((value, field) => value || item[field], '') || item;
			const option = getDocument(options).createElement('option');
			option.value = name;
			option.textContent = name;
			if (includeCode && typeof item === 'object' && item && (item.code || item.id)) {
				option.dataset.code = item.code || item.id;
			}
			select.appendChild(option);
		});
	}
	async function loadProvinces(options = {}) {
		try {
			const response = await getApiCall(options)('/api/vietnam-address/provinces');
			const data = await response.json();

			if (data.success && data.data) {
				const provinceSelect = getDocument(options).getElementById('province');
				provinceSelect.innerHTML = '<option value="">Chọn tỉnh/thành phố</option>';

				appendAddressOptions(provinceSelect, data.data, {
					...options,
					includeCode: false,
					nameFields: ['name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading provinces:', error);
		}
	}
	async function loadDistricts(provinceName, options = {}) {
		try {
			const response = await callVietnamAddressAPI('/api/vietnam-address/districts', { province: provinceName }, options);
			const data = await response.json();
			if (data && (data.success || Array.isArray(data))) {
				const list = data.data || data;
				const districtSelect = getDocument(options).getElementById('district');
				districtSelect.innerHTML = '<option value="">Chọn quận/huyện</option>';
				appendAddressOptions(districtSelect, list, {
					...options,
					includeCode: true,
					nameFields: ['name', 'district_name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading districts:', error);
		}
	}
	async function loadWards(provinceName, districtName, options = {}) {
		try {
			const response = await callVietnamAddressAPI('/api/vietnam-address/wards', {
				province: provinceName,
				district: districtName
			}, options);
			const data = await response.json();
			if (data && (data.success || Array.isArray(data))) {
				const list = data.data || data;
				const wardSelect = getDocument(options).getElementById('ward');
				wardSelect.innerHTML = '<option value="">Chọn phường/xã</option>';
				appendAddressOptions(wardSelect, list, {
					...options,
					includeCode: false,
					nameFields: ['name', 'ward_name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading wards:', error);
		}
	}
	async function loadProvincesModal(options = {}) {
		try {
			const response = await getApiCall(options)('/api/vietnam-address/provinces');
			const data = await response.json();
			if (data.success && data.data) {
				const provinceSelect = getDocument(options).getElementById('modalProvince');
				if (!provinceSelect) return;
				provinceSelect.innerHTML = '<option value="">Chọn tỉnh/thành phố</option>';
				appendAddressOptions(provinceSelect, data.data, {
					...options,
					includeCode: true,
					nameFields: ['name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading provinces (modal):', error);
		}
	}
	async function loadProvincesForModal(options = {}) {
		try {
			const response = await getApiCall(options)('/api/vietnam-address/provinces');
			const result = await response.json();
			const data = result.data || result;
			const modalProvinceSelect = getDocument(options).getElementById('modalProvince');
			if (modalProvinceSelect) {
				modalProvinceSelect.innerHTML = '<option value="">Chọn tỉnh/thành phố</option>';
				if (Array.isArray(data)) {
					appendAddressOptions(modalProvinceSelect, data, {
						...options,
						includeCode: false,
						nameFields: ['name']
					});
				}
			}
		} catch (error) {
			getConsole(options).error('Error loading provinces for modal:', error);
		}
	}
	async function loadDistrictsModal(provinceName, options = {}) {
		try {
			const response = await callVietnamAddressAPI('/api/vietnam-address/districts', { province: provinceName }, options);
			const data = await response.json();
			if (data && (data.success || Array.isArray(data))) {
				const list = data.data || data;
				const districtSelect = getDocument(options).getElementById('modalDistrict');
				if (!districtSelect) return;
				clearSelectOptions('modalDistrict', 'Chọn quận/huyện', options);
				appendAddressOptions(districtSelect, list, {
					...options,
					includeCode: true,
					nameFields: ['name', 'district_name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading districts (modal):', error);
		}
	}
	async function loadWardsModal(provinceName, districtName, options = {}) {
		try {
			const response = await callVietnamAddressAPI('/api/vietnam-address/wards', {
				province: provinceName,
				district: districtName
			}, options);
			const data = await response.json();
			if (data && (data.success || Array.isArray(data))) {
				const list = data.data || data;
				const wardSelect = getDocument(options).getElementById('modalWard');
				if (!wardSelect) return;
				clearSelectOptions('modalWard', 'Chọn phường/xã', options);
				appendAddressOptions(wardSelect, list, {
					...options,
					includeCode: false,
					nameFields: ['name', 'ward_name']
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading wards (modal):', error);
		}
	}
	async function loadAddressHierarchy(provinceName = null, districtName = null, wardName = null, options = {}) {
		try {
			await options.loadProvincesForModal();

			if (provinceName) {
				setSelectValueWithFallback('modalProvince', provinceName, options);
			}

			if (provinceName) {
				await options.loadDistrictsModal(provinceName);
				if (districtName) {
					setSelectValueWithFallback('modalDistrict', districtName, options);

					await options.loadWardsModal(provinceName, districtName);
					if (wardName) {
						setSelectValueWithFallback('modalWard', wardName, options);
					}
				}
			}
			return true;
		} catch (error) {
			getConsole(options).error('Error loading address hierarchy:', error);
			return false;
		}
	}
	function clearSelectOptions(selectId, placeholder, options = {}) {
		const select = getDocument(options).getElementById(selectId);
		if (select) {
			select.innerHTML = `<option value="">${placeholder}</option>`;
		}
	}
	function getElementValue(elementId, options = {}) {
		const element = getDocument(options).getElementById(elementId);
		return element?.value || '';
	}
	function getModalAddressFormValues(options = {}) {
		return {
			address_detail: getElementValue('modalAddressDetail', options),
			province: getElementValue('modalProvince', options),
			district: '',
			ward: getElementValue('modalWard', options),
			nationality: getElementValue('modalNationality', options),
			religion: getElementValue('modalReligion', options),
			ethnicity: getElementValue('modalEthnicity', options)
		};
	}
	function updateAddressSummary(options = {}) {
		const doc = getDocument(options);
		const addressDetail = doc.getElementById('addressDetail').value.trim();
		const province = doc.getElementById('province').value.trim();
		const district = doc.getElementById('district').value.trim();
		const ward = doc.getElementById('ward').value.trim();

		const addressParts = [];
		if (addressDetail) addressParts.push(addressDetail);
		if (ward) addressParts.push(ward);
		if (district) addressParts.push(district);
		if (province) addressParts.push(province);

		const fullAddress = addressParts.join(', ');
		doc.getElementById('addressSummary').value = fullAddress;
		return fullAddress;
	}
	function fillMainAddressFieldFromModal(options = {}) {
		const values = getModalAddressFormValues(options);
		const buildFullAddressFromParts = options.buildFullAddressFromParts || window.buildFullAddressFromParts;
		if (typeof buildFullAddressFromParts !== 'function') return '';
		const fullAddress = buildFullAddressFromParts(
			values.address_detail,
			values.ward,
			values.district,
			values.province
		);
		const mainAddress = getDocument(options).getElementById('address');
		if (mainAddress) mainAddress.value = fullAddress;
		return fullAddress;
	}
	function setMainValue(elementId, value, options = {}) {
		const element = getDocument(options).getElementById(elementId);
		if (element) element.value = value || '';
	}
	function setSelectEnsureOption(elementId, value, options = {}) {
		const doc = getDocument(options);
		const element = doc.getElementById(elementId);
		if (!element) return;
		const isSelect = element.tagName && element.tagName.toLowerCase() === 'select';
		if (!isSelect) {
			element.value = value || '';
			return;
		}
		const exists = Array.from(element.options).some(option => (option.value || option.textContent) === value);
		if (!exists && value) {
			const option = doc.createElement('option');
			option.value = value;
			option.textContent = value;
			element.appendChild(option);
		}
		element.value = value || '';
	}
	function getWindowAutocompleteValue(instanceName, fallbackId, options = {}) {
		const win = options.window || window;
		const instance = win[instanceName];
		if (instance && typeof instance.getValue === 'function') return instance.getValue() || '';
		return getElementValue(fallbackId, options);
	}
	function getModalOccupationValue(options = {}) {
		const win = options.window || window;
		if (win.modalOccupationAutocomplete && typeof win.modalOccupationAutocomplete.getValue === 'function') {
			return win.modalOccupationAutocomplete.getValue() || '';
		}
		const occupationField = getDocument(options).getElementById('occupation');
		return occupationField ? occupationField.value || '' : getElementValue('modalOccupation', options);
	}
	function getModalSexualOrientationValue(options = {}) {
		const win = options.window || window;
		if (win.sexualOrientationAutocomplete && typeof win.sexualOrientationAutocomplete.getValue === 'function') {
			return win.sexualOrientationAutocomplete.getValue() || '';
		}
		const sexualOrientationField = getDocument(options).getElementById('sexualOrientation');
		return sexualOrientationField ? sexualOrientationField.value || '' : getElementValue('modalSexualOrientation', options);
	}
	function calculateModalPregnancyWeek(expectedDeliveryDate, options = {}) {
		if (!expectedDeliveryDate) return null;
		const win = options.window || window;
		const calculatePregnancyWeek = options.calculatePregnancyWeek || win.calculatePregnancyWeek;
		if (typeof calculatePregnancyWeek !== 'function') return null;
		const result = calculatePregnancyWeek(expectedDeliveryDate);
		return result && result.weeks >= 0 ? result.weeks : null;
	}
	function collectPersonalDetailModalValues(options = {}) {
		const doc = getDocument(options);
		const modalNgayDuSinh = getElementValue('modalNgayDuSinh', options);
		return {
			address_detail: getElementValue('modalAddressDetail', options),
			province: getElementValue('modalProvince', options),
			district: '',
			ward: getElementValue('modalWard', options),
			id_number: getElementValue('modalIdCard', options),
			nationality: getWindowAutocompleteValue('modalNationalityAutocomplete', 'modalNationality', options),
			religion: getWindowAutocompleteValue('modalReligionAutocomplete', 'modalReligion', options),
			ethnicity: getWindowAutocompleteValue('modalEthnicityAutocomplete', 'modalEthnicity', options),
			occupation: getModalOccupationValue(options),
			don_vi_cong_tac: getElementValue('modalDonViCongTac', options),
			dia_chi_cong_ty: getElementValue('modalDiaChiCongTy', options),
			education_level: getWindowAutocompleteValue('modalEducationLevelAutocomplete', 'modalEducationLevel', options),
			gender: getElementValue('modalGender', options),
			sexual_orientation: getModalSexualOrientationValue(options),
			mang_thai: doc.getElementById('modalMangThai')?.checked || false,
			expected_delivery_date: modalNgayDuSinh,
			so_tuan_thai: calculateModalPregnancyWeek(modalNgayDuSinh, options)
		};
	}
	async function putPatientFields(patientId, body, options = {}) {
		try {
			await getApiCall(options)(`/api/patients/${patientId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		} catch (error) { console.warn('Không thể lưu địa chỉ bệnh nhân:', error); }
	}

	Object.assign(moduleParts, {
		getDocument,
		getConsole,
		getApiCall,
		getSearchParamsCtor,
		getEncodeURIComponent,
		callVietnamAddressAPI,
		fetchDistrictsByProvinceCode,
		fetchWardsByDistrictCode,
		tryFallbackAPI,
		normalizeAddressName,
		setSelectValueWithFallback,
		setSelectByApprox,
		appendAddressOptions,
		loadProvinces,
		loadDistricts,
		loadWards,
		loadProvincesModal,
		loadProvincesForModal,
		loadDistrictsModal,
		loadWardsModal,
		loadAddressHierarchy,
		clearSelectOptions,
		getElementValue,
		getModalAddressFormValues,
		updateAddressSummary,
		fillMainAddressFieldFromModal,
		setMainValue,
		setSelectEnsureOption,
		getWindowAutocompleteValue,
		getModalOccupationValue,
		getModalSexualOrientationValue,
		calculateModalPregnancyWeek,
		collectPersonalDetailModalValues,
		putPatientFields
	});
})();
