(function (window) {
	'use strict';

	function getSafeSetValue(options) {
		return options && options.safeSetValue ? options.safeSetValue : function () { return false; };
	}

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function buildFullAddress(patient, options) {
		if (!patient) return '';
		if (options && options.buildFullAddressFromParts) {
			return options.buildFullAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province) || '';
		}
		return [patient.address_detail, patient.ward, patient.district, patient.province]
			.filter(function (part) { return part && String(part).trim(); })
			.join(', ');
	}

	function applyAddressFields(patient, options) {
		if (!patient) return;
		const opts = options || {};
		if (opts.isCurrentLoad?.() === false) return;
		const safeSetValue = getSafeSetValue(opts);
		const fullAddress = buildFullAddress(patient, opts) || patient.address || '';

		safeSetValue('addressDetail', patient.address_detail);
		safeSetValue('province', patient.province);
		safeSetValue('provinceHidden', patient.province);
		safeSetValue('district', patient.district);
		safeSetValue('ward', patient.ward);

		if (opts.addressFieldId !== null) {
			safeSetValue(opts.addressFieldId || 'address', fullAddress);
		}

		if (opts.summaryFieldId) {
			const summaryValue = Object.prototype.hasOwnProperty.call(opts, 'summaryValue') ? opts.summaryValue : fullAddress;
			safeSetValue(opts.summaryFieldId, summaryValue);
		}
	}

	function setInputValue(element, value) {
		if (element) {
			element.value = value || '';
		}
	}

	function triggerChange(element) {
		if (!element) return;
		element.dispatchEvent(new window.Event('change', { bubbles: true }));
	}

	async function syncProvince(patient, context) {
		const { opts, isCurrentLoad, doc, mainAddressForm } = context;
		if (!patient.province) return;
		const provinceSelect = doc.querySelector('select#province');
		if (provinceSelect) {
			if ((!provinceSelect.options || provinceSelect.options.length <= 1) && opts.loadProvinces) {
				await opts.loadProvinces();
			}
			if (!isCurrentLoad()) return false;
			provinceSelect.value = patient.province;
			triggerChange(provinceSelect);
		} else if (typeof mainAddressForm.setMainAddressProvinceValue === 'function') {
			await mainAddressForm.setMainAddressProvinceValue(patient.province, opts);
		} else {
			setInputValue(doc.querySelector('input#province'), patient.province);
		}
		if (!isCurrentLoad()) return false;
		setInputValue(doc.querySelector('#provinceHidden'), patient.province);
	}

	async function syncDistrict(patient, context) {
		const { opts, isCurrentLoad, doc } = context;
		if (!patient.district) return;
		const districtSelect = doc.querySelector('select#district');
		if (districtSelect && districtSelect.options && districtSelect.options.length > 1) {
			districtSelect.value = patient.district;
			triggerChange(districtSelect);
			if (patient.province && opts.loadWards) {
				await opts.loadWards(patient.province, patient.district);
			}
		}
		if (!isCurrentLoad()) return false;
		setInputValue(doc.querySelector('input#district'), patient.district);
	}

	async function syncWard(patient, context) {
		const { opts, isCurrentLoad, doc, mainAddressForm } = context;
		if (!patient.ward) return;
		const wardSelect = doc.querySelector('select#ward');
		if (wardSelect && wardSelect.options && wardSelect.options.length > 1) {
			wardSelect.value = patient.ward;
		} else if (typeof mainAddressForm.setMainAddressWardValue === 'function') {
			await mainAddressForm.setMainAddressWardValue(patient.ward, opts);
		}
		if (!isCurrentLoad()) return false;
		setInputValue(doc.querySelector('input#ward'), patient.ward);
	}

	async function syncAddressHierarchy(patient, options) {
		if (!patient) return;
		const opts = options || {};
		const isCurrentLoad = () => opts.isCurrentLoad?.() !== false;
		const context = {
			opts, isCurrentLoad, doc: getDocument(opts),
			mainAddressForm: window.ReceptionistAddressMainForm || {}
		};
		for (const sync of [syncProvince, syncDistrict, syncWard]) {
			if (!isCurrentLoad()) return false;
			await sync(patient, context);
		}
		if (!isCurrentLoad()) return false;
		opts.updateAddressSummary?.();
		return true;
	}

	async function applyAddressWithHierarchy(patient, options) {
		applyAddressFields(patient, options);
		try {
			return await syncAddressHierarchy(patient, options);
		} catch (error) {
			if (options?.isCurrentLoad?.() === false) return false;
			console.error((options && options.errorPrefix) || 'Error loading address hierarchy:', error);
			return false;
		}
	}

	window.ReceptionistPatientAddressPopulate = {
		applyAddressFields,
		applyAddressWithHierarchy,
		buildFullAddress,
		syncAddressHierarchy
	};
})(window);
