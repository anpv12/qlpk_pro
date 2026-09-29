(function (window, document) {
	'use strict';

	const PATIENT_FIELD_IDS = [
		'patientId', 'fullName', 'gender', 'dateOfBirth', 'age', 'phoneNumber', 'nickname',
		'maritalStatus', 'idCard', 'occupation', 'donViCongTac', 'diaChiCongTy',
		'sexualOrientation', 'sexualOrientationValue', 'nationality', 'nationalityValue',
		'religion', 'religionValue', 'ethnicity', 'ethnicityValue', 'educationLevel',
		'educationLevelValue', 'addressDetail', 'province', 'provinceHidden', 'district',
		'ward', 'address', 'addressSummary', 'ngayDuSinh', 'soTuanThai', 'breathing',
		'pulse', 'bloodPressure', 'temperature', 'weight', 'height', 'bmi',
		'prevBreathing', 'prevPulse', 'prevBloodPressure', 'prevTemperature', 'prevWeight',
		'prevHeight', 'prevBmi'
	];

	function mergeConfig(config = {}) {
		return window.QLPKComponentDomScope.mergeScopedConfig(config);
	}

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function valueOf(...values) {
		for (const value of values) {
			if (value !== undefined && value !== null && value !== '') return value;
		}
		return '';
	}

	function buildAddressFromParts(addressDetail, ward, district, province) {
		return [addressDetail, ward, district, province]
			.filter(part => part !== undefined && part !== null && String(part).trim())
			.join(', ');
	}

	function setValue(doc, elementId, value) {
		const element = doc.getElementById(elementId);
		if (!element) return false;
		if (element.type === 'checkbox') {
			element.checked = normalizeBoolean(value);
			return true;
		}
		if (element._flatpickr && typeof window.setDatepickerValue === 'function') {
			window.setDatepickerValue(element, value || null, false);
			return true;
		}
		element.value = value == null ? '' : String(value);
		if (element.tagName === 'SMALL') {
			element.textContent = value == null ? '' : String(value);
		}
		return true;
	}

	function getValue(doc, elementId) {
		const element = doc.getElementById(elementId);
		if (!element) return '';
		if (element.type === 'checkbox') return element.checked;
		if (element._flatpickr && element._flatpickr.selectedDates && element._flatpickr.selectedDates.length > 0) {
			return element._flatpickr.formatDate(element._flatpickr.selectedDates[0], element.dataset.dateFormat || 'Y-m-d');
		}
		return String(element.value || '').trim();
	}

	function normalizeBoolean(value) {
		if (value === true || value === 1) return true;
		const raw = String(value || '').trim().toLowerCase();
		return ['1', 'true', 'yes', 'y', 'co', 'có'].includes(raw);
	}

	function normalizeGender(value) {
		const raw = String(value || '').trim().toLowerCase();
		const map = {
			nam: 'male',
			male: 'male',
			'1': 'male',
			'nữ': 'female',
			nu: 'female',
			female: 'female',
			'2': 'female',
			khac: 'other',
			'khác': 'other',
			other: 'other'
		};
		return map[raw] || '';
	}

	function calculateAge(dateValue) {
		if (!dateValue) return '';
		const raw = String(dateValue);
		const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
		const birthDate = match
			? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
			: new Date(raw);
		if (Number.isNaN(birthDate.getTime())) return '';
		const today = new Date();
		let age = today.getFullYear() - birthDate.getFullYear();
		const monthDelta = today.getMonth() - birthDate.getMonth();
		if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) {
			age -= 1;
		}
		return age >= 0 ? age : '';
	}

	function parseDateValue(value) {
		if (!value) return null;
		if (value instanceof Date) {
			return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
		}

		const raw = String(value).trim();
		let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

		match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
		if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));

		const parsed = new Date(raw);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function calculatePregnancyWeek(expectedDeliveryDate) {
		if (window.ReceptionistFormCalculations && typeof window.ReceptionistFormCalculations.calculatePregnancyWeek === 'function') {
			return window.ReceptionistFormCalculations.calculatePregnancyWeek(expectedDeliveryDate);
		}
		if (!expectedDeliveryDate) return null;

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const edd = parseDateValue(expectedDeliveryDate);
		if (!edd) return null;
		edd.setHours(0, 0, 0, 0);

		const daysUntilDelivery = Math.ceil((edd - today) / (1000 * 60 * 60 * 24));
		if (daysUntilDelivery > 280) return null;
		const daysPregnant = 280 - daysUntilDelivery;
		if (daysPregnant < 0) return null;
		return {
			weeks: Math.floor(daysPregnant / 7),
			days: daysPregnant % 7,
			totalDays: daysPregnant
		};
	}

	function normalizePayload(payload = {}) {
		const patientInfo = payload.patient_info || {};
		const examinationInfo = payload.examination_info || {};
		const patient = {
			id: patientInfo.id,
			full_name: patientInfo.full_name,
			gender: patientInfo.gender,
			date_of_birth: patientInfo.date_of_birth,
			phone: patientInfo.phone,
			nickname: patientInfo.nickname,
			marital_status: patientInfo.marital_status,
			id_number: patientInfo.id_number,
			occupation: patientInfo.occupation,
			don_vi_cong_tac: patientInfo.don_vi_cong_tac,
			dia_chi_cong_ty: patientInfo.dia_chi_cong_ty,
			sexual_orientation: patientInfo.sexual_orientation,
			nationality: patientInfo.nationality,
			religion: patientInfo.religion,
			ethnicity: patientInfo.ethnicity,
			education_level: patientInfo.education_level,
			mang_thai: patientInfo.mang_thai,
			expected_delivery_date: patientInfo.expected_delivery_date,
			so_tuan_thai: patientInfo.so_tuan_thai,
			address_detail: patientInfo.address_detail,
			address: patientInfo.address,
			province: patientInfo.province,
			district: patientInfo.district,
			ward: patientInfo.ward
		};

		return {
			appointment: payload.appointment || {},
			patient,
			examination: examinationInfo
		};
	}

	function setAutocompleteValue(name, value) {
		const autocomplete = window[name];
		if (autocomplete && typeof autocomplete.setValue === 'function') {
			autocomplete.setValue(value || '');
		}
	}

	function clear(options = {}) {
		const doc = getDocument(options);
		PATIENT_FIELD_IDS.forEach(fieldId => setValue(doc, fieldId, ''));
		setValue(doc, 'mangThai', false);
		setValue(doc, 'reExaminationCheck', false);
		setAutocompleteValue('occupationAutocomplete', '');
		setAutocompleteValue('sexualOrientationAutocomplete', '');
	}

	function populate(payload = {}, options = {}) {
		const doc = getDocument(options);
		const { appointment, patient, examination } = normalizePayload(payload);
		const birthDate = patient.date_of_birth || '';

		setValue(doc, 'patientId', patient.id);
		setValue(doc, 'fullName', patient.full_name);
		setValue(doc, 'gender', normalizeGender(patient.gender));
		setValue(doc, 'dateOfBirth', birthDate);
		setValue(doc, 'age', birthDate ? calculateAge(birthDate) : '');
		setValue(doc, 'phoneNumber', patient.phone);
		setValue(doc, 'nickname', patient.nickname);
		setValue(doc, 'maritalStatus', patient.marital_status);
		setValue(doc, 'idCard', patient.id_number);
		setValue(doc, 'occupation', patient.occupation);
		setValue(doc, 'donViCongTac', patient.don_vi_cong_tac);
		setValue(doc, 'diaChiCongTy', patient.dia_chi_cong_ty);
		setValue(doc, 'sexualOrientation', patient.sexual_orientation);
		setValue(doc, 'sexualOrientationValue', patient.sexual_orientation);
		setValue(doc, 'nationality', patient.nationality);
		setValue(doc, 'nationalityValue', patient.nationality);
		setValue(doc, 'religion', patient.religion);
		setValue(doc, 'religionValue', patient.religion);
		setValue(doc, 'ethnicity', patient.ethnicity);
		setValue(doc, 'ethnicityValue', patient.ethnicity);
		setValue(doc, 'educationLevel', patient.education_level);
		setValue(doc, 'educationLevelValue', patient.education_level);
		setAutocompleteValue('occupationAutocomplete', patient.occupation);
		setAutocompleteValue('sexualOrientationAutocomplete', patient.sexual_orientation);
		setValue(doc, 'mangThai', patient.mang_thai);
		setValue(doc, 'ngayDuSinh', patient.expected_delivery_date);
		setValue(doc, 'soTuanThai', patient.so_tuan_thai);
		setValue(doc, 'addressDetail', patient.address_detail || '');
		setValue(doc, 'province', patient.province);
		setValue(doc, 'provinceHidden', patient.province);
		setValue(doc, 'district', patient.district);
		setValue(doc, 'ward', patient.ward);
		const fullAddress = valueOf(
			patient.address,
			buildAddressFromParts(patient.address_detail, patient.ward, patient.district, patient.province)
		);
		setValue(doc, 'address', fullAddress);
		setValue(doc, 'addressSummary', fullAddress);

		setValue(doc, 'breathing', examination.breathing);
		setValue(doc, 'pulse', examination.pulse);
		setValue(doc, 'bloodPressure', examination.blood_pressure);
		setValue(doc, 'temperature', examination.temperature);
		setValue(doc, 'weight', examination.weight);
		setValue(doc, 'height', examination.height);
		setValue(doc, 'bmi', examination.bmi);

		const reExaminationCheck = doc.getElementById('reExaminationCheck');
		if (reExaminationCheck) reExaminationCheck.checked = appointment.appointment_category === 'RE_EXAMINATION';
		updatePregnancyControls({ document: doc });

		if (options.syncAddressHierarchy && window.ReceptionistPatientAddressPopulate &&
			typeof window.ReceptionistPatientAddressPopulate.applyAddressWithHierarchy === 'function') {
			const addressOptions = options.addressOptions || {};
			return window.ReceptionistPatientAddressPopulate.applyAddressWithHierarchy(patient, {
				...addressOptions,
				isCurrentLoad: () => options.isCurrentLoad?.() !== false && addressOptions.isCurrentLoad?.() !== false,
				document: doc,
				buildFullAddressFromParts: buildAddressFromParts,
				safeSetValue: (elementId, value) => setValue(doc, elementId, value),
				summaryFieldId: 'addressSummary'
			});
		}

		return true;
	}

	function collect(options = {}) {
		const doc = getDocument(options);
		const expectedDeliveryDate = getValue(doc, 'ngayDuSinh') || null;
		const pregnancyWeek = expectedDeliveryDate ? calculatePregnancyWeek(expectedDeliveryDate) : null;
		return {
			full_name: getValue(doc, 'fullName'),
			nickname: getValue(doc, 'nickname'),
			gender: getValue(doc, 'gender'),
			date_of_birth: getValue(doc, 'dateOfBirth'),
			phone: getValue(doc, 'phoneNumber'),
			id_number: getValue(doc, 'idCard'),
			occupation: getValue(doc, 'occupation'),
			don_vi_cong_tac: getValue(doc, 'donViCongTac'),
			dia_chi_cong_ty: getValue(doc, 'diaChiCongTy'),
			marital_status: getValue(doc, 'maritalStatus'),
			sexual_orientation: getValue(doc, 'sexualOrientation'),
			nationality: getValue(doc, 'nationality'),
			religion: getValue(doc, 'religion'),
			ethnicity: getValue(doc, 'ethnicity'),
			education_level: getValue(doc, 'educationLevel'),
			mang_thai: Boolean(getValue(doc, 'mangThai')),
			expected_delivery_date: expectedDeliveryDate,
			so_tuan_thai: pregnancyWeek && pregnancyWeek.weeks >= 0 ? pregnancyWeek.weeks : null,
			address_detail: getValue(doc, 'addressDetail'),
			province: getValue(doc, 'province'),
			district: getValue(doc, 'district'),
			ward: getValue(doc, 'ward'),
			address: getValue(doc, 'address') || buildAddress(doc),
			breathing: getValue(doc, 'breathing'),
			pulse: getValue(doc, 'pulse'),
			blood_pressure: getValue(doc, 'bloodPressure'),
			temperature: getValue(doc, 'temperature'),
			weight: getValue(doc, 'weight'),
			height: getValue(doc, 'height'),
			bmi: getValue(doc, 'bmi')
		};
	}

	function buildAddress(doc) {
		if (window.ReceptionistAddressMainForm && typeof window.ReceptionistAddressMainForm.getMainAddressFormValues === 'function') {
			return window.ReceptionistAddressMainForm.getMainAddressFormValues({ document: doc }).address || '';
		}
		return [
			getValue(doc, 'addressDetail'),
			getValue(doc, 'ward'),
			getValue(doc, 'district'),
			getValue(doc, 'province')
		].filter(Boolean).join(', ');
	}

	function bindInlineDetailPanels(options = {}) {
		const doc = getDocument(options);
		doc.querySelectorAll('[data-receptionist-inline-toggle]').forEach(toggle => {
			if (!toggle || toggle._patientInfoInlineBound) return;
			const panelId = toggle.dataset.receptionistInlineToggle;
			const panel = panelId ? doc.getElementById(panelId) : null;
			if (!panel) return;

			const icon = toggle.querySelector('i');
			const setOpen = isOpen => {
				panel.hidden = !isOpen;
				panel.classList.toggle('is-open', isOpen);
				toggle.setAttribute('aria-expanded', String(isOpen));
				if (icon) {
					icon.classList.toggle('bi-chevron-down', !isOpen);
					icon.classList.toggle('bi-chevron-up', isOpen);
				}
			};

			toggle.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				setOpen(panel.hidden);
			});

			toggle._patientInfoInlineBound = true;
		});
	}

	function updatePregnancyControls(options = {}) {
		const doc = getDocument(options);
		const gender = doc.getElementById('gender');
		const mangThai = doc.getElementById('mangThai');
		const ngayDuSinh = doc.getElementById('ngayDuSinh');
		const soTuanThai = doc.getElementById('soTuanThai');
		if (!gender || !mangThai || !ngayDuSinh || !soTuanThai) return;

		const isFemale = gender.value === 'female';
		const enabled = isFemale && mangThai.checked;
		mangThai.disabled = !isFemale;
		if (!isFemale) {
			mangThai.checked = false;
			setValue(doc, 'ngayDuSinh', '');
			setValue(doc, 'soTuanThai', '');
		}
		ngayDuSinh.disabled = !enabled;
		soTuanThai.disabled = !enabled;
		if (!enabled) {
			setValue(doc, 'ngayDuSinh', '');
			setValue(doc, 'soTuanThai', '');
			return;
		}
		updatePregnancyWeek(options);
	}

	function updatePregnancyWeek(options = {}) {
		const doc = getDocument(options);
		const result = calculatePregnancyWeek(getValue(doc, 'ngayDuSinh'));
		setValue(doc, 'soTuanThai', result && result.weeks >= 0 ? result.weeks : '');
	}

	function setExpectedDeliveryMinDate(options = {}) {
		const doc = getDocument(options);
		const ngayDuSinh = doc.getElementById('ngayDuSinh');
		if (!ngayDuSinh) return;
		const today = new Date();
		const value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
		ngayDuSinh.setAttribute('min', value);
		if (ngayDuSinh._flatpickr) ngayDuSinh._flatpickr.set('minDate', value);
	}

	function bindPregnancyControls(options = {}) {
		const doc = getDocument(options);
		const gender = doc.getElementById('gender');
		const mangThai = doc.getElementById('mangThai');
		const ngayDuSinh = doc.getElementById('ngayDuSinh');

		if (gender && !gender._patientInfoPregnancyBound) {
			gender.addEventListener('change', () => updatePregnancyControls(options));
			gender._patientInfoPregnancyBound = true;
		}
		if (mangThai && !mangThai._patientInfoPregnancyBound) {
			mangThai.addEventListener('change', () => updatePregnancyControls(options));
			mangThai._patientInfoPregnancyBound = true;
		}
		if (ngayDuSinh && !ngayDuSinh._patientInfoPregnancyBound) {
			ngayDuSinh.addEventListener('change', () => updatePregnancyWeek(options));
			ngayDuSinh.addEventListener('input', () => updatePregnancyWeek(options));
			ngayDuSinh._patientInfoPregnancyBound = true;
		}

		setExpectedDeliveryMinDate(options);
		updatePregnancyControls(options);
	}

	function bind(options = {}) {
		const doc = getDocument(options);
		bindInlineDetailPanels(options);
		bindPregnancyControls(options);
		if (typeof window.initDatepickers === 'function') window.initDatepickers('.js-datepicker');
		if (window.ReceptionistProfileAutocomplete && typeof window.ReceptionistProfileAutocomplete.initializeAutocomplete === 'function') {
			window.ReceptionistProfileAutocomplete.initializeAutocomplete({ document: doc });
		}
		if (window.ReceptionistAddressMainForm && typeof window.ReceptionistAddressMainForm.bindAddressFieldChanges === 'function') {
			window.ReceptionistAddressMainForm.bindAddressFieldChanges({ document: doc, apiCall: options.apiCall });
		}
	}

	function create(options = {}) {
		const config = mergeConfig(options.config);
		return {
			...window.QLPKComponentDomScope.createScopedComponent(options, config, { bind, clear, populate, collect, updatePregnancyControls }),
			getConfig: () => mergeConfig(config)
		};
	}

	const defaultInstance = create();
	const api = {
		...defaultInstance,
		create,
		normalizePayload,
		calculateAge,
		calculatePregnancyWeek,
		updatePregnancyWeek,
		updatePregnancyControls,
		defaults: mergeConfig()
	};
	window.QLPKPatientInfoForm = api;
	window.QLPKDoctorModuleRegistry?.register?.('patientInfoForm', api);
})(window, document);
