(function (window) {
	'use strict';

	function getSafeSetValue(options) {
		return options && options.safeSetValue ? options.safeSetValue : function () { return false; };
	}

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getJquery(options) {
		return options && options.$ ? options.$ : window.$;
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

	function triggerChange(element, jquery) {
		if (!element) return;
		if (jquery) {
			jquery(element).trigger('change');
		} else if (typeof window.Event === 'function') {
			element.dispatchEvent(new window.Event('change', { bubbles: true }));
		}
	}

	async function syncAddressHierarchy(patient, options) {
		if (!patient) return;
		const opts = options || {};
		const doc = getDocument(opts);
		const jquery = getJquery(opts);
		const mainAddressForm = window.ReceptionistAddressMainForm || {};

		if (patient.province) {
			const provinceSelect = doc.querySelector('select#province');
			if (provinceSelect) {
				if ((!provinceSelect.options || provinceSelect.options.length <= 1) && opts.loadProvinces) {
					await opts.loadProvinces();
				}
				provinceSelect.value = patient.province;
				triggerChange(provinceSelect, jquery);
			} else if (typeof mainAddressForm.setMainAddressProvinceValue === 'function') {
				await mainAddressForm.setMainAddressProvinceValue(patient.province, opts);
			} else {
				setInputValue(doc.querySelector('input#province'), patient.province);
			}
			setInputValue(doc.querySelector('#provinceHidden'), patient.province);
		}

		if (patient.district) {
			const districtSelect = doc.querySelector('select#district');
			if (districtSelect && districtSelect.options && districtSelect.options.length > 1) {
				districtSelect.value = patient.district;
				triggerChange(districtSelect, jquery);
				if (patient.province && opts.loadWards) {
					await opts.loadWards(patient.province, patient.district);
				}
			}
			setInputValue(doc.querySelector('input#district'), patient.district);
		}

		if (patient.ward) {
			const wardSelect = doc.querySelector('select#ward');
			if (wardSelect && wardSelect.options && wardSelect.options.length > 1) {
				wardSelect.value = patient.ward;
			} else if (typeof mainAddressForm.setMainAddressWardValue === 'function') {
				await mainAddressForm.setMainAddressWardValue(patient.ward, opts);
			}
			setInputValue(doc.querySelector('input#ward'), patient.ward);
		}

		if (opts.updateAddressSummary) {
			opts.updateAddressSummary();
		}
	}

	async function applyAddressWithHierarchy(patient, options) {
		applyAddressFields(patient, options);
		try {
			await syncAddressHierarchy(patient, options);
		} catch (error) {
			console.error((options && options.errorPrefix) || 'Error loading address hierarchy:', error);
		}
	}

	window.ReceptionistPatientAddressPopulate = {
		applyAddressFields,
		applyAddressWithHierarchy,
		buildFullAddress,
		syncAddressHierarchy
	};
})(window);
