(function (window) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const DOCTOR_INTAKE_ROOT = 'doctorReceptionistIntakePanel';
	const getPageContext = () => REGISTRY?.get('doctorComponentContext')?.getCurrent?.() || null;
	const getPageState = () => getPageContext()?.stateObject || null;
	const isPageLoading = () => {
		const state = getPageState();
		return Boolean(state?.isLoadingExaminationData);
	};
	const getPagePatientId = () => {
		const state = getPageState();
		return state?.currentPatientId || null;
	};
	const DOCTOR_CONFIG = {
		intake: {
			id: 'doctor-intake',
			patient: {
				rootId: DOCTOR_INTAKE_ROOT,
				strictRoot: true,
				layout_mode: 'receptionist',
				title: 'Thông tin hành chính',
				show_reexam: true,
				show_detail_actions: true,
				show_joint_action: true,
				vitals_caption: 'Nhập tại tiếp nhận'
			},
			visit: {
				rootId: DOCTOR_INTAKE_ROOT,
				strictRoot: true,
				layout_mode: 'receptionist',
				title: 'Thông tin hỏi bệnh',
				heading_id: 'doctorReceptionistVisitHeading',
				section_id: 'doctorReceptionistMedicalInfoSection',
				show_admin: true,
				show_reason: true,
				show_main_symptoms: true
			},
			relatives: { aria_label: 'Người thân liên kết' },
			documents: {
				section_id: 'doctorDocumentsSection',
				heading_id: 'doctorDocumentsHeading',
				title: 'Danh sách tập tin đính kèm'
			}
		},
		history: {
			rootId: 'doctorHistoryPanel',
			workbenchRootSelector: '.inline-tien-su--doctor-flat',
			pageRuntime: REGISTRY?.get('pageRuntime') || null,
			isLoading: isPageLoading,
			getPatientId: getPagePatientId,
			normalizePayload: payload => {
				const history = payload?.medical_history || {};
				const historyPatient = history.patient || {};
				const historyExamination = history.examination || {};
				const previousExamination = history.previous_examination || {};
				return {
					patientId: historyPatient.id || null,
					physicalHistory: historyPatient.physical_history || [],
					familyHistory: historyPatient.family_history || [],
					allergies: Array.isArray(historyPatient.allergies) ? historyPatient.allergies : [],
					riskAssessment: historyExamination.risk_assessment || {},
					previousRiskAssessment: previousExamination.risk_assessment || {},
					substanceUseHistory: historyPatient.substance_use_history || {},
					safetyPlan: historyPatient.safety_plan || {}
				};
			},
			modeConfig: {
				physHistory: { containerId: 'physHistoryContainer', textInputId: 'physHistoryTextInput', hiddenId: 'patientPhysicalHistory', fieldName: 'physical_history' },
				famHistory: { containerId: 'famHistoryContainer', textInputId: 'famHistoryTextInput', hiddenId: 'patientFamilyHistory', fieldName: 'family_history' }
			}
		},
		clinical: {
			rootId: 'doctorClinicalDecisionPanel',
			medicationSearchEndpoint: '/api/medicine-reference-catalog'
		},
		workspace: {
			rootId: 'doctorClinicalWorkspace',
			defaultSectionId: 'doctorClinicalDecisionPanel',
			externalFieldSelector: '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel, #doctorIndicationsPanel',
			draftExcludedSelector: '#doctorPrescriptionWorkspace, #doctorServicePanel, #doctorHistoryPanel, #doctorIndicationsPanel'
		},
		prescription: {
			rootId: 'doctorPrescriptionWorkspace',
			isLoading: isPageLoading
		},
		support: {
			rootId: 'doctorClinicalWorkspace',
			indications: { rootId: 'doctorIndicationsPanel', strictRoot: true }
		},
		services: { rootId: 'doctorServicePanel', strictRoot: true }
	};

	function clone(value) {
		if (Array.isArray(value)) return value.map(clone);
		if (!value || typeof value !== 'object') return value;
		return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
	}

	function create(overrides = {}) {
		return {
			...clone(DOCTOR_CONFIG),
			...overrides,
			intake: {
				...clone(DOCTOR_CONFIG.intake),
				...(overrides.intake || {}),
				patient: { ...clone(DOCTOR_CONFIG.intake.patient), ...(overrides.intake?.patient || {}) },
				visit: { ...clone(DOCTOR_CONFIG.intake.visit), ...(overrides.intake?.visit || {}) },
				relatives: { ...clone(DOCTOR_CONFIG.intake.relatives), ...(overrides.intake?.relatives || {}) },
				documents: { ...clone(DOCTOR_CONFIG.intake.documents), ...(overrides.intake?.documents || {}) }
			},
			clinical: { ...clone(DOCTOR_CONFIG.clinical), ...(overrides.clinical || {}) },
			workspace: { ...clone(DOCTOR_CONFIG.workspace), ...(overrides.workspace || {}) },
			prescription: { ...clone(DOCTOR_CONFIG.prescription), ...(overrides.prescription || {}) },
			support: {
				...clone(DOCTOR_CONFIG.support),
				...(overrides.support || {}),
				indications: { ...clone(DOCTOR_CONFIG.support.indications), ...(overrides.support?.indications || {}) }
			},
			services: { ...clone(DOCTOR_CONFIG.services), ...(overrides.services || {}) },
			history: { ...clone(DOCTOR_CONFIG.history), ...(overrides.history || {}) }
		};
	}

	REGISTRY.register('doctorComponentConfig', { ...DOCTOR_CONFIG, create }, {
		owner: 'doctor/base',
		version: 2
	});
})(window);
