(function (window) {
	'use strict';

	function setElementValue(document, elementId, value) {
		const element = document.getElementById(elementId);
		if (element) {
			element.value = value || '';
		}
	}

	async function loadPatientMedicalData(patientId, options = {}) {
		try {
			const response = await options.apiCall(`/api/patients/${patientId}`);
			if (!response.ok) return false;

			const responseData = await response.json();
			const patient = responseData.data || responseData;
			const doc = options.document || window.document;
			const safeSetValue = typeof options.safeSetValue === 'function'
				? options.safeSetValue
				: setElementValue.bind(null, doc);

			safeSetValue('referralSource', patient.referral_source);
			setElementValue(doc, 'problemStartTime', patient.problem_start_time);
			setElementValue(doc, 'symptomProgression', patient.symptom_progression);

			if (typeof options.populateAfterProgression === 'function') {
				options.populateAfterProgression(patient);
			}

			setElementValue(doc, 'familyHistory', patient.family_history);
			setElementValue(doc, 'currentBehavior', patient.current_behavior);
			setElementValue(doc, 'severityLevel', patient.severity_level);
			return true;
		} catch (error) {
			if (options.console?.error) {
				options.console.error('Error loading patient medical data:', error);
			}
			return false;
		}
	}

	window.ClinicalPatientMedicalDataUtils = {
		loadPatientMedicalData
	};
})(window);
