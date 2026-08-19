(function (window) {
	'use strict';

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function getWindow(options = {}) {
		return options.window || window;
	}

	function getElementValue(elementId, defaultValue = '', options = {}) {
		const doc = getDocument(options);
		const win = getWindow(options);

		if (elementId === 'referralSource' && win.ReferralSourceControl) {
			return win.ReferralSourceControl.getValue({ document: doc }) || defaultValue;
		}

		const element = doc.getElementById(elementId);
		if (!element) {
			const logger = options.console || win.console;
			if (logger && typeof logger.warn === 'function') {
				logger.warn(`Element with ID "${elementId}" not found`);
			}
			return defaultValue;
		}

		if (element.type === 'checkbox') {
			return element.checked;
		}

		if (element.type === 'radio') {
			const checked = doc.querySelector(`input[name="${element.name}"]:checked`);
			return checked ? checked.value : defaultValue;
		}

		if (element._flatpickr) {
			const instance = element._flatpickr;
			if (instance.selectedDates && instance.selectedDates.length > 0) {
				return instance.formatDate(instance.selectedDates[0], element.dataset.dateFormat || 'Y-m-d');
			}
		}

		return element.value || defaultValue;
	}

	function safeSetValue(elementId, value, options = {}) {
		const doc = getDocument(options);
		const win = getWindow(options);

		if (elementId === 'referralSource' && win.ReferralSourceControl) {
			return win.ReferralSourceControl.setValue(value, { document: doc });
		}

		const element = doc.getElementById(elementId);
		if (element) {
			if (element.type === 'checkbox') {
				element.checked = value === true || value === '1' || value === 'true';
				return true;
			}
			if (element._flatpickr) {
				if (typeof win.setDatepickerValue === 'function') {
					win.setDatepickerValue(element, value || null, false);
				} else {
					element._flatpickr.setDate(value || null, false);
				}
				return true;
			}
			element.value = value || '';
			return true;
		}
		return false;
	}

	function toInteger(value, fallback = null) {
		if (!value || value === '') return fallback;
		const parsed = parseInt(value);
		return isNaN(parsed) ? fallback : parsed;
	}

	function toFloat(value, fallback = 0) {
		return value ? parseFloat(value) : fallback;
	}

	function collectFormData(options = {}) {
		const doc = getDocument(options);
		const win = getWindow(options);
		const servicePackage = options.servicePackage || win.ReceptionistServicePackage;
		const patientIntakeForm = win.QLPKPatientIntakeForm;
		if (!patientIntakeForm || typeof patientIntakeForm.collect !== 'function') {
			throw new Error('Shared patient intake component is not available');
		}

		const servicePackageSelection = servicePackage.readSelectionFromDocument(doc);
		const getValue = (elementId, defaultValue = '') => getElementValue(elementId, defaultValue, options);
		const patientData = patientIntakeForm.collect({ document: doc });

		return {
			...patientData,

			reminder: doc.getElementById('reminderCheck')?.checked || false,
			reminder_time: doc.getElementById('reminderTime')?.value || '',

			breathing: toFloat(patientData.breathing),
			weight: toFloat(patientData.weight),
			height: toFloat(patientData.height),
			bmi: toFloat(patientData.bmi),
			pulse: toFloat(patientData.pulse),
			blood_pressure: patientData.blood_pressure || '',
			temperature: toFloat(patientData.temperature),

			appointment_date: getValue('appointmentDate'),
			appointment_time: getValue('appointmentTime'),
			doctor_id: toInteger(getValue('doctorId')),
			service_id: servicePackageSelection.service_id,
			package_id: servicePackageSelection.package_id,
			appointment_type: servicePackageSelection.appointment_type,
			is_re_exam: doc.getElementById('reExaminationCheck')?.checked || false,
			original_appointment_id: doc.getElementById('originalAppointmentId')?.value || null
		};
	}

	window.ReceptionistFormDataUtils = {
		getElementValue,
		safeSetValue,
		collectFormData
	};
})(window);
