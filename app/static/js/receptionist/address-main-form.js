(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getConsole(options) {
		return options && options.console ? options.console : window.console;
	}

	function getApiCall(options) {
		return options && options.apiCall ? options.apiCall : window.apiCall;
	}

	function buildFullAddressFromParts(addressDetail, ward, district, province) {
		const parts = [];
		if (addressDetail && addressDetail.trim()) parts.push(addressDetail.trim());
		if (ward && ward.trim()) parts.push(ward.trim());
		if (district && district.trim()) parts.push(district.trim());
		if (province && province.trim()) parts.push(province.trim());
		return parts.length ? parts.join(', ') : '';
	}

	function getFieldValue(doc, id) {
		return (doc.getElementById(id)?.value || '').trim();
	}

	function setFieldValue(doc, id, value) {
		const field = doc.getElementById(id);
		if (field) field.value = value || '';
	}

	const mainAddressAutocompleteState = {
		regions: [],
		units: [],
		regionsLoaded: false,
		unitProvinceCode: '',
		activeDropdown: null,
		activeInput: null,
		repositionHandler: null,
		outsideClickBound: false,
		focusCloseBound: false
	};

	function normalizeAddressQuery(value) {
		return window.QLPKSearchNormalization?.normalizeSearchText(value)
			|| String(value || '')
				.normalize('NFKD')
				.toLowerCase()
				.replace(/[\u0300-\u036f]/g, '')
				.replace(/đ/g, 'd')
				.trim();
	}

	function filterAddressItems(items, query) {
		const normalizedQuery = normalizeAddressQuery(query);
		if (!normalizedQuery) return items.slice(0, 30);
		return items.filter(item => normalizeAddressQuery(item.full_name || item.name).includes(normalizedQuery)).slice(0, 30);
	}

	async function loadMainAddressRegions(options = {}) {
		if (mainAddressAutocompleteState.regionsLoaded) return mainAddressAutocompleteState.regions;

		const response = await getApiCall(options)('/api/vietnam-address/regions');
		const data = await response.json();
		const regions = data.data || data || [];
		mainAddressAutocompleteState.regions = Array.isArray(regions) ? regions.map(region => ({
			code: region.code,
			name: region.name,
			full_name: region.full_name || region.name
		})) : [];
		mainAddressAutocompleteState.regionsLoaded = true;
		return mainAddressAutocompleteState.regions;
	}

	async function loadMainAddressUnits(provinceCode, options = {}) {
		if (!provinceCode) {
			mainAddressAutocompleteState.units = [];
			mainAddressAutocompleteState.unitProvinceCode = '';
			return [];
		}

		if (mainAddressAutocompleteState.unitProvinceCode === provinceCode) {
			return mainAddressAutocompleteState.units;
		}

		const response = await getApiCall(options)(`/api/vietnam-address/regions/${provinceCode}/units`);
		const data = await response.json();
		const units = data.data || data || [];
		mainAddressAutocompleteState.units = Array.isArray(units) ? units.map(unit => ({
			code: unit.code,
			name: unit.name,
			full_name: unit.full_name || unit.name
		})) : [];
		mainAddressAutocompleteState.unitProvinceCode = provinceCode;
		return mainAddressAutocompleteState.units;
	}

	function findAddressItemByName(items, value) {
		const target = normalizeAddressQuery(value);
		if (!target) return null;
		return items.find(item => normalizeAddressQuery(item.name) === target || normalizeAddressQuery(item.full_name) === target) || null;
	}

	async function setMainAddressProvinceValue(provinceName, options = {}) {
		if (options.isCurrentLoad?.() === false) return null;
		const doc = getDocument(options);
		const province = doc.getElementById('province');
		if (!province) return null;

		setFieldValue(doc, 'province', provinceName || '');
		setFieldValue(doc, 'provinceHidden', provinceName || '');
		if (province.dataset) province.dataset.code = '';
		mainAddressAutocompleteState.units = [];
		mainAddressAutocompleteState.unitProvinceCode = '';

		if (!provinceName) return null;

		const regions = await loadMainAddressRegions(options);
		if (options.isCurrentLoad?.() === false) return null;
		const match = findAddressItemByName(regions, provinceName);
		if (match && province.dataset) {
			province.dataset.code = match.code || '';
		}
		return match;
	}

	async function resolveMainProvinceCode(province, options) {
		const provinceCode = province && province.dataset ? province.dataset.code : '';
		if (provinceCode || !province || !province.value) return provinceCode;
		const provinceMatch = await setMainAddressProvinceValue(province.value, options);
		if (options.isCurrentLoad?.() === false) return null;
		return provinceMatch ? provinceMatch.code : '';
	}

	async function setMainAddressWardValue(wardName, options = {}) {
		if (options.isCurrentLoad?.() === false) return null;
		const doc = getDocument(options);
		const province = doc.getElementById('province');
		const ward = doc.getElementById('ward');
		if (!ward) return null;

		setFieldValue(doc, 'ward', wardName || '');
		if (ward.dataset) ward.dataset.code = '';
		if (!wardName) return null;

		const provinceCode = await resolveMainProvinceCode(province, options);
		if (!provinceCode) return null;
		const units = await loadMainAddressUnits(provinceCode, options);
		if (options.isCurrentLoad?.() === false) return null;
		const match = findAddressItemByName(units, wardName);
		if (match && ward.dataset) {
			ward.dataset.code = match.code || '';
		}
		return match;
	}

	function closeMainAddressDropdown() {
		const dropdown = mainAddressAutocompleteState.activeDropdown;
		if (!dropdown) return;

		dropdown.classList.remove('is-open');
		if (mainAddressAutocompleteState.repositionHandler) {
			window.removeEventListener('scroll', mainAddressAutocompleteState.repositionHandler, true);
			window.removeEventListener('resize', mainAddressAutocompleteState.repositionHandler);
			mainAddressAutocompleteState.repositionHandler = null;
		}

		if (dropdown.parentElement === document.body && dropdown._addressOriginalParent) {
			dropdown._addressOriginalParent.appendChild(dropdown);
			dropdown._addressOriginalParent = null;
		}
		dropdown.classList.remove('receptionist-address-dropdown--floating');
		dropdown.removeAttribute('style');
		mainAddressAutocompleteState.activeDropdown = null;
		mainAddressAutocompleteState.activeInput = null;
	}

	function positionMainAddressDropdown(input, dropdown) {
		if (!dropdown._addressOriginalParent) {
			dropdown._addressOriginalParent = dropdown.parentElement;
		}
		if (dropdown.parentElement !== document.body) {
			document.body.appendChild(dropdown);
		}
		dropdown.classList.add('receptionist-address-dropdown--floating');

		const applyPosition = () => {
			const rect = input.getBoundingClientRect();
			const gap = 6;
			const spaceBelow = window.innerHeight - rect.bottom;
			const spaceAbove = rect.top;
			const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
			const availableSpace = openAbove ? spaceAbove : spaceBelow;
			const maxHeight = Math.max(100, Math.min(220, availableSpace - gap));
			const top = openAbove ? Math.max(gap, rect.top - maxHeight - 4) : rect.bottom;

			Object.assign(dropdown.style, {
				position: 'fixed',
				top: `${top}px`,
				left: `${rect.left}px`,
				right: 'auto',
				width: `${rect.width}px`,
				maxHeight: `${maxHeight}px`,
				zIndex: '1070'
			});
		};

		applyPosition();
		if (mainAddressAutocompleteState.repositionHandler) {
			window.removeEventListener('scroll', mainAddressAutocompleteState.repositionHandler, true);
			window.removeEventListener('resize', mainAddressAutocompleteState.repositionHandler);
		}
		mainAddressAutocompleteState.repositionHandler = applyPosition;
		window.addEventListener('scroll', applyPosition, true);
		window.addEventListener('resize', applyPosition);
	}

	function renderMainAddressDropdown(input, dropdown, items, onSelect, emptyText) {
		dropdown.innerHTML = '';

		if (!items.length) {
			const empty = document.createElement('div');
			empty.className = 'receptionist-address-dropdown-empty';
			empty.textContent = emptyText;
			dropdown.appendChild(empty);
		} else {
			items.forEach(item => {
				const option = document.createElement('button');
				option.type = 'button';
				option.className = 'receptionist-address-dropdown-item';
				option.textContent = item.full_name || item.name;
				option.addEventListener('mousedown', event => event.preventDefault());
				option.addEventListener('click', () => onSelect(item));
				dropdown.appendChild(option);
			});
		}

		closeMainAddressDropdown();
		mainAddressAutocompleteState.activeInput = input;
		mainAddressAutocompleteState.activeDropdown = dropdown;
		dropdown.classList.add('is-open');
		positionMainAddressDropdown(input, dropdown);
	}

	function getMainAddressFormValues(options = {}) {
		const doc = getDocument(options);
		const address_detail = getFieldValue(doc, 'addressDetail');
		const province = getFieldValue(doc, 'province');
		const district = getFieldValue(doc, 'district');
		const ward = getFieldValue(doc, 'ward');
		const address = buildFullAddressFromParts(address_detail, ward, district, province);

		return { address_detail, province, district, ward, address };
	}

	async function loadProvinces(options = {}) {
		try {
			const regions = await loadMainAddressRegions(options);
			const doc = getDocument(options);
			const provinceSelect = doc.getElementById('province');

			if (!provinceSelect || provinceSelect.tagName !== 'SELECT') return;
			provinceSelect.innerHTML = '<option value="">Chọn tỉnh/thành phố</option>';

			regions.forEach(region => {
				const option = doc.createElement('option');
				option.value = region.name;
				option.textContent = region.name;
				option.dataset.code = region.code;
				provinceSelect.appendChild(option);
			});
		} catch (error) {
			getConsole(options).error('Error loading regions:', error);
		}
	}

	async function loadWards(provinceName, districtNameIgnored, options = {}) {
		try {
			const doc = getDocument(options);
			const provinceSelect = doc.getElementById('province');
			let provinceCode = null;

			if (!provinceCode && provinceSelect && provinceSelect.options) {
				const selectedOption = Array.from(provinceSelect.options).find(opt => opt.value === provinceName);
				if (selectedOption) {
					provinceCode = selectedOption.dataset.code;
				}
			}

			if (!provinceCode && provinceName) {
				const regions = await loadMainAddressRegions(options);
				const target = normalizeAddressQuery(provinceName);
				const match = regions.find(region => normalizeAddressQuery(region.name) === target || normalizeAddressQuery(region.full_name) === target);
				if (match) provinceCode = match.code;
			}

			if (!provinceCode) return;
			const units = await loadMainAddressUnits(provinceCode, options);

			const wardSelect = doc.getElementById('ward');
			if (wardSelect && wardSelect.tagName === 'SELECT') {
				wardSelect.innerHTML = '<option value="">Chọn Xã/Phường/Đặc khu</option>';
				units.forEach(unit => {
					const option = doc.createElement('option');
					option.value = unit.name;
					option.textContent = unit.full_name || unit.name;
					wardSelect.appendChild(option);
				});
			}
		} catch (error) {
			getConsole(options).error('Error loading units:', error);
		}
	}

	function updateAddressSummary(options = {}) {
		const doc = getDocument(options);
		const addressDetail = getFieldValue(doc, 'addressDetail');
		const province = getFieldValue(doc, 'province');
		const district = getFieldValue(doc, 'district');
		const ward = getFieldValue(doc, 'ward');
		const fullAddress = buildFullAddressFromParts(addressDetail, ward, district, province);
		setFieldValue(doc, 'addressSummary', fullAddress);
		setFieldValue(doc, 'address', fullAddress);
		setFieldValue(doc, 'provinceHidden', province);
	}

	function clearFieldValue(element) {
		if (element) {
			element.value = '';
		}
	}

	function resetSelectOptions(element, placeholder) {
		if (!element) return;
		if (element.tagName === 'SELECT') {
			element.innerHTML = `<option value="">${placeholder}</option>`;
		} else {
			element.value = '';
		}
	}

	function installMainAddressFns1(ctx) {
		const updateSummary = () => updateAddressSummary(ctx.options);

		const selectProvince = async (region) => {
			setFieldValue(ctx.doc, 'province', region.name);
			if (ctx.province.dataset) ctx.province.dataset.code = region.code || '';
			setFieldValue(ctx.doc, 'provinceHidden', region.name);
			setFieldValue(ctx.doc, 'district', '');
			setFieldValue(ctx.doc, 'ward', '');
			if (ctx.ward.dataset) ctx.ward.dataset.code = '';
			mainAddressAutocompleteState.units = [];
			mainAddressAutocompleteState.unitProvinceCode = '';
			await loadMainAddressUnits(region.code, ctx.options);
			updateSummary();
			closeMainAddressDropdown();
		};

		const selectWard = (unit) => {
			setFieldValue(ctx.doc, 'ward', unit.name);
			if (ctx.ward.dataset) ctx.ward.dataset.code = unit.code || '';
			updateSummary();
			closeMainAddressDropdown();
		};

		const showProvinceDropdown = async () => {
			const regions = await loadMainAddressRegions(ctx.options);
			renderMainAddressDropdown(
				ctx.province,
				ctx.provinceDropdown,
				filterAddressItems(regions, ctx.province.value),
				selectProvince,
				'Không tìm thấy tỉnh/thành phố'
			);
		};

		const showWardDropdown = async () => {
			let provinceCode = ctx.province.dataset ? ctx.province.dataset.code : '';
			if (!provinceCode && ctx.province.value) {
				const regions = await loadMainAddressRegions(ctx.options);
				const provinceName = normalizeAddressQuery(ctx.province.value);
				const match = regions.find(region => normalizeAddressQuery(region.name) === provinceName || normalizeAddressQuery(region.full_name) === provinceName);
				if (match) {
					provinceCode = match.code;
					ctx.province.dataset.code = provinceCode;
				}
			}

			if (!provinceCode) {
				renderMainAddressDropdown(ctx.ward, ctx.wardDropdown, [], selectWard, 'Vui lòng chọn Tỉnh/Thành phố trước');
				return;
			}

			const units = await loadMainAddressUnits(provinceCode, ctx.options);
			renderMainAddressDropdown(
				ctx.ward,
				ctx.wardDropdown,
				filterAddressItems(units, ctx.ward.value),
				selectWard,
				'Không tìm thấy phường/xã'
			);
		};

		Object.assign(ctx, { updateSummary, showProvinceDropdown, showWardDropdown });
	}

	function bindMainAddressAutocomplete(options = {}) {
		const ctx = {};
		ctx.options = options;
		installMainAddressFns1(ctx);

		ctx.doc = getDocument(ctx.options);
		ctx.province = ctx.doc.getElementById('province');
		ctx.ward = ctx.doc.getElementById('ward');
		ctx.provinceDropdown = ctx.doc.getElementById('provinceDropdown');
		ctx.wardDropdown = ctx.doc.getElementById('wardDropdown');

		if (!ctx.province || !ctx.ward || !ctx.provinceDropdown || !ctx.wardDropdown) return;
		if (ctx.province.tagName === 'SELECT' || ctx.ward.tagName === 'SELECT') return;

		if (!mainAddressAutocompleteState.outsideClickBound) {
			ctx.doc.addEventListener('mousedown', event => {
				const target = event.target;
				if (target === mainAddressAutocompleteState.activeInput) return;
				if (mainAddressAutocompleteState.activeDropdown && mainAddressAutocompleteState.activeDropdown.contains(target)) return;
				closeMainAddressDropdown();
			});
			mainAddressAutocompleteState.outsideClickBound = true;
		}

		if (!mainAddressAutocompleteState.focusCloseBound) {
			ctx.doc.addEventListener('focusin', event => {
				const target = event.target;
				if (target === mainAddressAutocompleteState.activeInput) return;
				if (target === ctx.province || target === ctx.ward) return;
				if (mainAddressAutocompleteState.activeDropdown && mainAddressAutocompleteState.activeDropdown.contains(target)) return;
				closeMainAddressDropdown();
			});
			mainAddressAutocompleteState.focusCloseBound = true;
		}

		if (!ctx.province._mainAddressAutocompleteBound) {
			ctx.province.addEventListener('focus', ctx.showProvinceDropdown);
			ctx.province.addEventListener('input', function () {
				if (this.dataset) this.dataset.code = '';
				setFieldValue(ctx.doc, 'provinceHidden', this.value);
				setFieldValue(ctx.doc, 'district', '');
				setFieldValue(ctx.doc, 'ward', '');
				if (ctx.ward.dataset) ctx.ward.dataset.code = '';
				mainAddressAutocompleteState.units = [];
				mainAddressAutocompleteState.unitProvinceCode = '';
				ctx.updateSummary();
				ctx.showProvinceDropdown();
			});
			ctx.province.addEventListener('keydown', event => {
				if (event.key === 'Escape') closeMainAddressDropdown();
			});
			ctx.province._mainAddressAutocompleteBound = true;
		}

		if (!ctx.ward._mainAddressAutocompleteBound) {
			ctx.ward.addEventListener('focus', ctx.showWardDropdown);
			ctx.ward.addEventListener('input', function () {
				if (this.dataset) this.dataset.code = '';
				ctx.updateSummary();
				ctx.showWardDropdown();
			});
			ctx.ward.addEventListener('keydown', event => {
				if (event.key === 'Escape') closeMainAddressDropdown();
			});
			ctx.ward._mainAddressAutocompleteBound = true;
		}
	}

	function bindAddressFieldChanges(options = {}) {
		bindMainAddressAutocomplete(options);
		const doc = getDocument(options);
		const addressDetail = doc.getElementById('addressDetail');
		const province = doc.getElementById('province');
		const district = doc.getElementById('district');
		const ward = doc.getElementById('ward');
		const loadWardsCallback = options.loadWards;
		const updateSummary = () => updateAddressSummary(options);

		if (addressDetail && !addressDetail._addressMainFormBound) {
			addressDetail.addEventListener('input', updateSummary);
			addressDetail._addressMainFormBound = true;
		}

		if (province && province.tagName === 'SELECT' && !province._addressMainFormBound) {
			const handleProvinceChange = function () {
				if (this.value) {
					clearFieldValue(district);
					clearFieldValue(ward);
					setFieldValue(doc, 'provinceHidden', this.value);
				} else {
					resetSelectOptions(district, 'Chọn quận/huyện');
					resetSelectOptions(ward, 'Chọn phường/xã');
					setFieldValue(doc, 'provinceHidden', '');
				}
				updateSummary();
			};
			province.addEventListener('change', handleProvinceChange);
			province.addEventListener('input', function () {
				if (this.dataset) this.dataset.code = '';
				clearFieldValue(district);
				clearFieldValue(ward);
				mainAddressAutocompleteState.units = [];
				mainAddressAutocompleteState.unitProvinceCode = '';
				setFieldValue(doc, 'provinceHidden', this.value);
				updateSummary();
			});
			province._addressMainFormBound = true;
		}

		if (district && !district._addressMainFormBound) {
			district.addEventListener('change', function () {
				const provinceValue = province ? province.value : '';
				const districtValue = this.value;
				if (provinceValue && districtValue && typeof loadWardsCallback === 'function') {
					loadWardsCallback(provinceValue, districtValue);
					clearFieldValue(ward);
				} else {
					resetSelectOptions(ward, 'Chọn phường/xã');
				}
				updateSummary();
			});
			district._addressMainFormBound = true;
		}

		if (ward && ward.tagName === 'SELECT' && !ward._addressMainFormBound) {
			ward.addEventListener('input', updateSummary);
			ward.addEventListener('change', updateSummary);
			ward._addressMainFormBound = true;
		}
	}

	window.ReceptionistAddressMainForm = {
		buildFullAddressFromParts,
		getMainAddressFormValues,
		loadProvinces,
		loadWards,
		setMainAddressProvinceValue,
		setMainAddressWardValue,
		updateAddressSummary,
		bindAddressFieldChanges
	};
})(window);
