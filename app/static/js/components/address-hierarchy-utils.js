(function () {
	'use strict';

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

	async function tryFallbackAPI(endpoint, params = {}, options = {}) {
		try {
			const apiCall = getApiCall(options);
			const encode = getEncodeURIComponent(options);
			if (endpoint.includes('/districts')) {
				const provRes = await apiCall('/api/vietnam-address/provinces');
				const provData = await provRes.json();
				const match = (provData.data || []).find(p =>
					p.name === params.province ||
					p.name?.normalize('NFC') === params.province?.normalize('NFC')
				);
				if (match && (match.code || match.id)) {
					return await apiCall(`/api/vietnam-address/districts/${match.code || match.id}`);
				}
			} else if (endpoint.includes('/wards')) {
				const distRes = await apiCall(`/api/vietnam-address/districts?province=${encode(params.province)}`);
				if (distRes.status === 404) {
					const provRes = await apiCall('/api/vietnam-address/provinces');
					const provData = await provRes.json();
					const matchProv = (provData.data || []).find(p =>
						p.name === params.province ||
						p.name?.normalize('NFC') === params.province?.normalize('NFC')
					);
					if (matchProv && (matchProv.code || matchProv.id)) {
						const distRes2 = await apiCall(`/api/vietnam-address/districts/${matchProv.code || matchProv.id}`);
						const distData = await distRes2.json();
						const distList = distData.data || distData || [];
						const matchDist = distList.find(d =>
							(d.name || d.district_name) === params.district
						);
						if (matchDist && (matchDist.code || matchDist.id)) {
							return await apiCall(`/api/vietnam-address/wards/${matchDist.code || matchDist.id}`);
						}
					}
				}
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
			const apiCall = getApiCall(options);
			const encode = getEncodeURIComponent(options);
			let response = await apiCall(`/api/vietnam-address/districts?province=${encode(provinceName)}`);
			if (response.status === 404) {
				const provRes = await apiCall('/api/vietnam-address/provinces');
				const provData = await provRes.json();
				const match = (provData.data || []).find(p => p.name === provinceName || p.name.normalize('NFC') === provinceName.normalize('NFC'));
				if (match && (match.code || match.id)) {
					const code = match.code || match.id;
					response = await apiCall(`/api/vietnam-address/districts/${code}`);
				}
			}
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
			const apiCall = getApiCall(options);
			const encode = getEncodeURIComponent(options);
			let response = await apiCall(`/api/vietnam-address/wards?province=${encode(provinceName)}&district=${encode(districtName)}`);
			if (response.status === 404) {
				let distRes = await apiCall(`/api/vietnam-address/districts?province=${encode(provinceName)}`);
				if (distRes.status === 404) {
					const provRes = await apiCall('/api/vietnam-address/provinces');
					const provData = await provRes.json();
					const matchProv = (provData.data || []).find(p => p.name === provinceName || p.name.normalize('NFC') === provinceName.normalize('NFC'));
					if (matchProv && (matchProv.code || matchProv.id)) {
						distRes = await apiCall(`/api/vietnam-address/districts/${matchProv.code || matchProv.id}`);
					}
				}
				const distData = await distRes.json();
				const distList = distData.data || distData || [];
				const matchDist = (distList || []).find(d => (d.name || d.district_name) === districtName);
				const distCode = matchDist ? (matchDist.code || matchDist.id) : undefined;
				if (distCode) {
					response = await apiCall(`/api/vietnam-address/wards/${distCode}`);
				}
			}
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
		} catch (error) { }
	}

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

			setMainValue('idCard', values.id_number, options);
			setMainValue('nationality', values.nationality, options);
			setMainValue('religion', values.religion, options);
			setMainValue('ethnicity', values.ethnicity, options);
			setMainValue('occupation', values.occupation, options);
			setMainValue('donViCongTac', values.don_vi_cong_tac, options);
			setMainValue('diaChiCongTy', values.dia_chi_cong_ty, options);
			setMainValue('educationLevel', values.education_level, options);
			setMainValue('gender', values.gender, options);
			setMainValue('sexualOrientation', values.sexual_orientation, options);
			setMainValue('mangThai', values.mang_thai ? '1' : '', options);
			setMainValue('ngayDuSinh', values.expected_delivery_date || '', options);
			setMainValue('soTuanThai', values.so_tuan_thai !== null && values.so_tuan_thai !== '' ? values.so_tuan_thai : '', options);

			const mainGenderSelect = getDocument(options).getElementById('gender');
			if (mainGenderSelect && values.gender) mainGenderSelect.value = values.gender;

			if (options.saveToDb && win.currentPatientId) {
				const patientId = win.currentPatientId;
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
			$: options.$ || window.$,
			loadDistricts: adapter.loadDistricts,
			loadWards: adapter.loadWards
		});

		return adapter;
	}

	window.ClinicalAddressHierarchyUtils = {
		callVietnamAddressAPI,
		tryFallbackAPI,
		normalizeAddressName,
		setSelectValueWithFallback,
		setSelectByApprox,
		loadProvinces,
		loadDistricts,
		loadWards,
		loadProvincesModal,
		loadProvincesForModal,
		loadDistrictsModal,
		loadWardsModal,
		loadAddressHierarchy,
		clearSelectOptions,
		getModalAddressFormValues,
		updateAddressSummary,
		fillMainAddressFieldFromModal,
		collectPersonalDetailModalValues,
		savePersonalDetailAddressToServerIfEditing,
		handlePersonalDetailModalClose,
		syncPersonalDetailModalToMainForm,
		hasPersonalDetailModalAddressData,
		syncPersonalDetailModalIfNeeded,
		handleProvinceChange,
		handleDistrictChange,
		setupMainAddressChangeHandlers,
		createAddressHierarchyAdapter
	};
})();
