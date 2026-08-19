(function (window) {
	'use strict';

	function resolveDoctorInstruction(appointmentData = {}, examination = null) {
		let doctorInstruction = null;
		if (Array.isArray(appointmentData.examinations)) {
			const doctorExam = appointmentData.examinations.find(examinationItem =>
				examinationItem && (
					examinationItem.status === 'DOCTOR_EXAM' ||
					(appointmentData.doctor && examinationItem.doctor_id === appointmentData.doctor.id)
				)
			);
			if (doctorExam) {
				doctorInstruction = doctorExam.loi_dan || '';
			}
		}

		if (!doctorInstruction && examination) {
			doctorInstruction = examination.loi_dan || '';
		}
		return doctorInstruction || '';
	}

	async function populatePsychologistExaminationFields(appointmentId, appointmentData, options = {}) {
		const examination = appointmentData && appointmentData.examination;
		if (!examination) return { status: 'missingExamination' };

		if (typeof options.populateMainReasonFromExamination === 'function') {
			await options.populateMainReasonFromExamination(examination);
		}

		const doctorInstruction = resolveDoctorInstruction(appointmentData, examination);
		if (doctorInstruction) {
			const documentRef = options.document || window.document;
			const examinationNotesField = documentRef.getElementById('examinationNotes');
			if (examinationNotesField) {
				examinationNotesField.value = doctorInstruction;
			}
		}

		if (typeof examination.main_symptoms !== 'undefined' && examination.main_symptoms !== null && typeof options.safeSetValue === 'function') {
			options.safeSetValue('mainSymptoms', examination.main_symptoms);
		}

		if (typeof options.populateVitalFields === 'function') {
			options.populateVitalFields(examination);
		}

		let formDetailResult = null;
		if (typeof options.loadFormDetailSections === 'function') {
			formDetailResult = await options.loadFormDetailSections(appointmentId, examination);
		}

		return { status: 'populated', formDetailResult };
	}

	async function loadPsychologistExaminationDataForAppointment(appointmentId, options = {}) {
		if (!appointmentId) return { status: 'missingAppointment' };

		const targetWindow = options.window || window;
		const logger = options.console || targetWindow.console;
		const fetchFn = options.fetch || (targetWindow.fetch ? targetWindow.fetch.bind(targetWindow) : null);
		const setIsLoading = typeof options.setIsLoadingExaminationData === 'function' ? options.setIsLoadingExaminationData : () => { };

		setIsLoading(true);
		try {
			if (typeof fetchFn !== 'function') return { status: 'missingFetch' };

			const appointmentResponse = await fetchFn(`/api/appointments/${appointmentId}`, {
				headers: {
					'Authorization': typeof options.getAuthHeader === 'function' ? options.getAuthHeader() : undefined
				}
			});

			if (!appointmentResponse.ok) {
				return { status: 'responseNotOk', response: appointmentResponse };
			}

			const appointmentData = await appointmentResponse.json();
			if (typeof options.populateAppointmentAdministrativeFields === 'function') {
				options.populateAppointmentAdministrativeFields(appointmentData);
			}

			let formLoadResult = null;
			if (appointmentData.examination) {
				formLoadResult = await populatePsychologistExaminationFields(appointmentId, appointmentData, options);
			}

			return { status: 'loaded', appointmentData, formLoadResult };
		} catch (error) {
			if (logger && typeof logger.error === 'function') {
				logger.error('Error loading examination form data:', error);
			}
			return { status: 'error', error };
		} finally {
			setIsLoading(false);
		}
	}

	async function loadPsychologistPatientIntoForm(patient, examination = null, appointment = null, options = {}) {
		if (!patient) return { status: 'missingPatient' };

		const targetWindow = options.window || window;
		const documentRef = options.document || targetWindow.document;
		const $ = options.$ || targetWindow.jQuery || targetWindow.$;
		const formDomUtils = targetWindow.ClinicalFormDomUtils;
		const detailModalUtils = targetWindow.ClinicalExaminationDetailModalUtils;
		const vitalUtils = targetWindow.ClinicalVitalCalculationUtils;
		const safeSetValue = typeof options.safeSetValue === 'function' ? options.safeSetValue : () => { };

		if (formDomUtils && typeof formDomUtils.hydratePatientAppointmentShell === 'function') {
			formDomUtils.hydratePatientAppointmentShell(patient, null, appointment, {
				relativeTable: options.relativeTable,
				includeAppointment: false,
				document: documentRef,
				$,
				safeSetValue,
				setDatepickerValue: options.setDatepickerValue,
				calculateAge: options.calculateAge || vitalUtils?.calculateAge,
				buildFullAddressFromParts: options.buildFullAddressFromParts,
				setCurrentPatientId: options.setCurrentPatientId,
				setCurrentPatientData: options.setCurrentPatientData
			});
		}

		if (examination) {
			safeSetValue('mainReason', examination.main_reason);
			safeSetValue('mainSymptoms', examination.main_symptoms);
			if (detailModalUtils && typeof detailModalUtils.loadMainReasonFromSection === 'function') {
				await detailModalUtils.loadMainReasonFromSection({
					$,
					examination,
					apiCall: options.apiCall,
					section: options.formSection || 'tam_ly_gia_kham_form_kham'
				});
			}
		}

		if (formDomUtils && typeof formDomUtils.hydratePatientAppointmentShell === 'function') {
			formDomUtils.hydratePatientAppointmentShell(null, examination, appointment, {
				document: documentRef,
				$,
				safeSetValue,
				vitalOptions: {
					document: documentRef,
					safeSetValue,
					clearMissingBreathing: true
				}
			});
		}

		if (typeof options.setCurrentPatientId === 'function') {
			options.setCurrentPatientId(patient.id);
		}

		if (appointment && appointment.id) {
			if (typeof options.setCurrentAppointmentId === 'function') {
				options.setCurrentAppointmentId(appointment.id);
			}
			if (typeof options.loadExaminationFormData === 'function') {
				await options.loadExaminationFormData(appointment.id);
			}
			if (detailModalUtils && typeof detailModalUtils.loadPsychologistDetailModalSections === 'function') {
				await detailModalUtils.loadPsychologistDetailModalSections({
					appointmentId: appointment.id,
					apiCall: options.apiCall,
					$,
					setTextareaValue: options.setTextareaValue
				});
			}
		}

		if (typeof options.loadPreviousVitals === 'function') {
			await options.loadPreviousVitals(patient.id);
		}
		if (typeof options.showToast === 'function') {
			options.showToast('success', `Đã tải thông tin bệnh nhân: ${patient.full_name}`);
		}

		return { status: 'loaded', patient, examination, appointment };
	}

	function clearPsychologistPatientSwitchState(options = {}) {
		const targetWindow = options.window || window;
		const logger = options.console || targetWindow.console;
		const documentRef = options.document || targetWindow.document;
		const $ = options.$ || targetWindow.jQuery || targetWindow.$;

		if (typeof options.clearMedicalHistoryTimers === 'function') {
			options.clearMedicalHistoryTimers();
		}

		try {
			if (typeof options.clearSelectedServices === 'function') {
				options.clearSelectedServices();
			}
		} catch (serviceResetError) {
			if (logger && typeof logger.warn === 'function') {
				logger.warn('Không thể reset danh sách dịch vụ trước khi tải mới:', serviceResetError);
			}
		}

		if (typeof options.clearNewLayoutFields === 'function') {
			options.clearNewLayoutFields();
		}
		if (typeof options.clearDetailModalFields === 'function') {
			options.clearDetailModalFields();
		}

		const formDomUtils = targetWindow.ClinicalFormDomUtils;
		if (formDomUtils && typeof formDomUtils.clearPatientSwitchClinicalDomFields === 'function') {
			formDomUtils.clearPatientSwitchClinicalDomFields({
				document: documentRef,
				$,
				safeSetValue: options.safeSetValue
			});
		}

		if (typeof options.clearOrdersSectionForPatientSwitch === 'function') {
			options.clearOrdersSectionForPatientSwitch();
		}

		return { status: 'cleared' };
	}

	function createPsychologistExaminationDataLoadAdapter(options = {}) {
		const targetWindow = options.window || window;
		const documentRef = options.document || targetWindow.document;
		const $ = options.$ || targetWindow.jQuery || targetWindow.$;
		const formSection = options.formSection || 'tam_ly_gia_kham_form_kham';

		function loadExaminationFormData(appointmentId) {
			return loadPsychologistExaminationDataForAppointment(appointmentId, {
				window: targetWindow,
				document: documentRef,
				fetch: options.fetch,
				console: options.console || targetWindow.console,
				getAuthHeader: options.getAuthHeader,
				setIsLoadingExaminationData: options.setIsLoadingExaminationData,
				populateAppointmentAdministrativeFields: appointmentData => targetWindow.ClinicalFormDomUtils.populateAppointmentAdministrativeFields(appointmentData, {
					document: documentRef,
					$,
					safeSetValue: options.safeSetValue,
					includeReminder: true
				}),
				populateMainReasonFromExamination: examination => targetWindow.ClinicalExaminationDetailModalUtils.populateMainReasonFromExamination({
					$,
					examination,
					apiCall: options.apiCall,
					section: formSection
				}),
				safeSetValue: options.safeSetValue,
				populateVitalFields: examination => targetWindow.ClinicalFormDomUtils.populateExaminationVitalFields(examination, {
					document: documentRef,
					safeSetValue: options.safeSetValue
				}),
				loadFormDetailSections: targetAppointmentId => targetWindow.ClinicalExaminationDetailModalUtils.loadPsychologistFormDetailSectionsFromModal({
					appointmentId: targetAppointmentId,
					apiCall: options.apiCall,
					$,
					document: documentRef,
					setTextareaValue: options.setTextareaValue,
					autoResizeTextarea: options.autoResizeTextarea,
					logError: true
				})
			});
		}

		function loadPatientIntoForm(patient, examination = null, appointment = null) {
			return loadPsychologistPatientIntoForm(patient, examination, appointment, {
				window: targetWindow,
				document: documentRef,
				$,
				relativeTable: typeof options.getRelativeTable === 'function' ? options.getRelativeTable() : options.relativeTable,
				safeSetValue: options.safeSetValue,
				setDatepickerValue: options.setDatepickerValue,
				calculateAge: options.calculateAge || targetWindow.ClinicalVitalCalculationUtils?.calculateAge,
				buildFullAddressFromParts: options.buildFullAddressFromParts,
				setCurrentPatientId: options.setCurrentPatientId,
				setCurrentPatientData: options.setCurrentPatientData,
				setCurrentAppointmentId: options.setCurrentAppointmentId,
				apiCall: options.apiCall,
				formSection,
				loadExaminationFormData,
				setTextareaValue: options.setTextareaValue,
				loadPreviousVitals: options.loadPreviousVitals,
				showToast: options.showToast
			});
		}

		function clearPatientSwitchState() {
			return clearPsychologistPatientSwitchState({
				window: targetWindow,
				document: documentRef,
				$,
				console: options.console || targetWindow.console,
				safeSetValue: options.safeSetValue,
				clearMedicalHistoryTimers: options.clearMedicalHistoryTimers,
				clearSelectedServices: options.clearSelectedServices,
				clearNewLayoutFields: options.clearNewLayoutFields,
				clearDetailModalFields: options.clearDetailModalFields,
				clearOrdersSectionForPatientSwitch: options.clearOrdersSectionForPatientSwitch
			});
		}

		return {
			loadExaminationFormData,
			loadPatientIntoForm,
			clearPatientSwitchState
		};
	}

	window.PsychologistExaminationDataLoadFlowUtils = {
		resolveDoctorInstruction,
		populatePsychologistExaminationFields,
		loadPsychologistExaminationDataForAppointment,
		loadPsychologistPatientIntoForm,
		clearPsychologistPatientSwitchState,
		createPsychologistExaminationDataLoadAdapter
	};
})(window);
