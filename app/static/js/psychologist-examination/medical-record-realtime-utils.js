(function (window) {
	'use strict';

	function buildLoadedRecordOptions(options, selectedPatient) {
		return {
			clinicInfo: options.getClinicInfoConfig(),
			patient: selectedPatient,
			history: { ...(window.currentLoadedHistory || {}), ...(window.currentLoadedExaminationDetail || {}) },
			examinationDetailsBySection: window.currentLoadedExaminationDetailsBySection || {},
			prescriptionData: window.currentLoadedPrescriptionData || null,
			relatives: window.currentLoadedRelatives || [],
			appointment: window.currentLoadedAppointment || null
		};
	}

	function updateMedicalRecordTab(options = {}) {
		const documentRef = options.document || window.document;
		const logger = options.console || window.console;
		const medicalRecordTab = documentRef.getElementById('medical-record-content');
		if (!medicalRecordTab || !medicalRecordTab.classList.contains('active')) {
			return false;
		}

		const selectedPatient = typeof options.getSelectedPatient === 'function' ? options.getSelectedPatient() : null;
		if (!selectedPatient) return false;

		try {
			const medicalRecordHtml = options.buildMedicalRecordHTML(buildLoadedRecordOptions(options, selectedPatient));

			medicalRecordTab.innerHTML = medicalRecordHtml;
			if (typeof options.createBarcodesInElement === 'function') {
				options.createBarcodesInElement(medicalRecordTab);
			}
			return true;
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error('Error updating medical record tab realtime:', error);
			}
			return false;
		}
	}

	function delegate(documentRef, types, selector, handler) {
		types.forEach(type => documentRef.addEventListener(type, event => {
			const target = event.target && typeof event.target.closest === 'function' ? event.target.closest(selector) : null;
			if (target) handler.call(target, event);
		}));
	}

	function bindRealtimeUpdates(options = {}) {
		const documentRef = options.document || window.document;

		const updateFieldAndRefresh = (field, value) => {
			const selectedPatient = typeof options.getSelectedPatient === 'function' ? options.getSelectedPatient() : null;
			if (!selectedPatient || selectedPatient[field] === value) return false;
			selectedPatient[field] = value;
			if (typeof options.syncWindowState === 'function') options.syncWindowState();
			if (typeof options.updateMedicalRecordTab === 'function') options.updateMedicalRecordTab();
			return true;
		};

		delegate(documentRef, ['change'], '#maritalStatus', function () {
			updateFieldAndRefresh('marital_status', this.value);
		});

		delegate(documentRef, ['change'], '#modalMaritalStatus', function () {
			const value = this.value;
			const mainElement = documentRef.getElementById('maritalStatus');
			if (mainElement && mainElement.value !== value) mainElement.value = value;
			updateFieldAndRefresh('marital_status', value);
		});

		delegate(documentRef, ['change', 'input'], '#educationLevel', function () {
			updateFieldAndRefresh('education_level', this.value);
		});

		delegate(documentRef, ['change', 'input'], '#modalEducationLevel', function () {
			const value = this.value;
			const mainElement = documentRef.getElementById('educationLevel');
			if (mainElement && mainElement.value !== value) mainElement.value = value;
			updateFieldAndRefresh('education_level', value);
		});

		return true;
	}

	function createMedicalRecordRealtimeAdapter(options = {}) {
		const adapter = {};
		adapter.updateMedicalRecordTab = () => updateMedicalRecordTab(options);
		adapter.bindRealtimeUpdates = () => bindRealtimeUpdates({
			...options,
			updateMedicalRecordTab: adapter.updateMedicalRecordTab
		});
		return adapter;
	}

	window.PsychologistMedicalRecordRealtimeUtils = {
		updateMedicalRecordTab,
		bindRealtimeUpdates,
		createMedicalRecordRealtimeAdapter
	};
})(window);
