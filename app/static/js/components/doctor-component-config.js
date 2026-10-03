import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const REGISTRY = QLPKDoctorModuleRegistry;
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

// Shallow-merge one config section: cloned defaults, then overrides[key] when given.
function mergeSection(defaults, overrides, key) {
	return { ...clone(defaults[key]), ...((overrides && overrides[key]) || {}) };
}

function create(overrides = {}) {
	const intakeOverrides = overrides.intake || {};
	const supportOverrides = overrides.support || {};
	return {
		...clone(DOCTOR_CONFIG),
		...overrides,
		intake: {
			...mergeSection(DOCTOR_CONFIG, overrides, 'intake'),
			patient: mergeSection(DOCTOR_CONFIG.intake, intakeOverrides, 'patient'),
			visit: mergeSection(DOCTOR_CONFIG.intake, intakeOverrides, 'visit'),
			relatives: mergeSection(DOCTOR_CONFIG.intake, intakeOverrides, 'relatives'),
			documents: mergeSection(DOCTOR_CONFIG.intake, intakeOverrides, 'documents')
		},
		clinical: mergeSection(DOCTOR_CONFIG, overrides, 'clinical'),
		workspace: mergeSection(DOCTOR_CONFIG, overrides, 'workspace'),
		prescription: mergeSection(DOCTOR_CONFIG, overrides, 'prescription'),
		support: {
			...mergeSection(DOCTOR_CONFIG, overrides, 'support'),
			indications: mergeSection(DOCTOR_CONFIG.support, supportOverrides, 'indications')
		},
		services: mergeSection(DOCTOR_CONFIG, overrides, 'services'),
		history: mergeSection(DOCTOR_CONFIG, overrides, 'history')
	};
}

REGISTRY.register('doctorComponentConfig', { ...DOCTOR_CONFIG, create }, {
	owner: 'doctor/base',
	version: 2
});
