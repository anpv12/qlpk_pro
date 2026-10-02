(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	const listenerBindings = new Map();

	function rebindListeners(key, elements, types, handler) {
		listenerBindings.get(key)?.abort();
		const binding = new AbortController();
		listenerBindings.set(key, binding);
		elements.filter(Boolean).forEach(element => {
			types.forEach(type => element.addEventListener(type, handler, { signal: binding.signal }));
		});
	}

	function setAgeValue(doc, age) {
		const ageEl = doc.getElementById('age');
		if (ageEl) ageEl.value = age ? age : '';
	}

	function safeSetValue(options, elementId, value) {
		if (options && typeof options.safeSetValue === 'function') {
			return options.safeSetValue(elementId, value);
		}
		const element = getDocument(options).getElementById(elementId);
		if (element) {
			element.value = value || '';
			return true;
		}
		return false;
	}

	function calculateAge(dateOfBirth) {
		if (!dateOfBirth) return '';

		const today = new Date();
		const birthDate = new Date(dateOfBirth);
		if (isNaN(birthDate.getTime())) return '';

		let age = today.getFullYear() - birthDate.getFullYear();
		const monthDiff = today.getMonth() - birthDate.getMonth();
		if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
			age--;
		}
		if (isNaN(age) || age < 0) return '';
		return age;
	}

	function calculateBMI(weight, height) {
		if (!weight || !height || height === 0) return 0;
		const heightInMeters = height / 100;
		const bmi = weight / (heightInMeters * heightInMeters);
		return Math.round(bmi * 10) / 10;
	}

	function temporarilyDisableAgeCalculation(options = {}) {
		void options;
		listenerBindings.get('ageCalculation')?.abort();
	}

	function reEnableAgeCalculation(options = {}) {
		setupAgeCalculation(options);
	}

	function formatDateToISO(dateString) {
		if (!dateString) return '';
		const date = new Date(dateString);
		if (isNaN(date.getTime())) return '';
		return date.toISOString().split('T')[0];
	}

	function setDateOfBirthAndAge(dateOfBirth, ageFromAPI = null, options = {}) {
		if (dateOfBirth) {
			const formattedDate = formatDateToISO(dateOfBirth);
			const dateOfBirthEl = getDocument(options).getElementById('dateOfBirth');
			if (dateOfBirthEl && window.setDatepickerValue) {
				window.setDatepickerValue(dateOfBirthEl, formattedDate);
			} else {
				safeSetValue(options, 'dateOfBirth', formattedDate);
			}
		}

		if (ageFromAPI !== null && ageFromAPI !== undefined && ageFromAPI !== '') {
			safeSetValue(options, 'age', ageFromAPI);
		} else if (dateOfBirth) {
			const age = calculateAge(dateOfBirth);
			safeSetValue(options, 'age', age || '');
		} else {
			safeSetValue(options, 'age', '');
		}
	}

	function setupAgeCalculation(options = {}) {
		const doc = getDocument(options);
		const dateOfBirthEl = doc.getElementById('dateOfBirth');
		if (!dateOfBirthEl) {
			window.setTimeout(() => {
				const retryEl = doc.getElementById('dateOfBirth');
				if (retryEl) {
					setupAgeCalculation(options);
				}
			}, 100);
			return;
		}

		rebindListeners('ageCalculation', [dateOfBirthEl], ['change', 'input', 'blur'], () => {
			const dateOfBirth = dateOfBirthEl.value;
			setAgeValue(doc, dateOfBirth ? calculateAge(dateOfBirth) : '');
		});

		const currentValue = dateOfBirthEl.value;
		if (currentValue) {
			setAgeValue(doc, calculateAge(currentValue));
		}
	}

	function setupBMICalculation(options = {}) {
		const doc = getDocument(options);
		const weightEl = doc.getElementById('weight');
		const heightEl = doc.getElementById('height');
		rebindListeners('bmiCalculation', [weightEl, heightEl], ['input'], () => {
			const weight = parseFloat(weightEl?.value) || 0;
			const height = parseFloat(heightEl?.value) || 0;
			const bmiEl = doc.getElementById('bmi');
			if (bmiEl) bmiEl.value = calculateBMI(weight, height);
		});
	}

	function parseDateValue(value) {
		if (!value) return null;
		if (value instanceof Date) {
			return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
		}

		const raw = String(value).trim();
		let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
		if (match) {
			return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
		}

		match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
		if (match) {
			return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
		}

		const parsed = new Date(raw);
		return Number.isNaN(parsed.getTime()) ? null : parsed;
	}

	function calculatePregnancyWeek(expectedDeliveryDate) {
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

		const weeks = Math.floor(daysPregnant / 7);
		const days = daysPregnant % 7;
		if (weeks < 0) return null;

		return {
			weeks: weeks,
			days: days,
			totalDays: daysPregnant,
			display: `${weeks} tuần ${days} ngày`
		};
	}

	window.ReceptionistFormCalculations = {
		calculateAge,
		calculateBMI,
		temporarilyDisableAgeCalculation,
		reEnableAgeCalculation,
		formatDateToISO,
		setDateOfBirthAndAge,
		setupAgeCalculation,
		setupBMICalculation,
		calculatePregnancyWeek
	};
})(window);
