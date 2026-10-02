import { state as psychologistPageState } from '../psychologist-examination/page-state.js';
const PSYCHOLOGIST_HISTORY_ROOT = 'psychologistHistoryPanel';
const PSYCHOLOGIST_INTAKE_ROOT = 'psychologistReceptionistIntakePanel';
const PSYCHOLOGIST_CLINICAL_ROOT = 'psychologistClinicalDecisionPanel';

// The inline history feature files are ESM modules.  They must attach to the
// psychologist root before their actions are registered, then be initialized
// by the psychologist workspace runtime once all feature actions exist.
window.QLPKMedicalHistoryBootstrapConfig = {
	root: `#${PSYCHOLOGIST_HISTORY_ROOT}`,
		rootId: PSYCHOLOGIST_HISTORY_ROOT,
	autoInit: false,
	pageRuntime: window.QLPKDoctorPageRuntime || null,
	workbenchRootSelector: '.inline-tien-su--doctor-flat',
	isLoading: () => Boolean(psychologistPageState.isLoadingExaminationData),
	getPatientId: () => psychologistPageState.currentPatientId || null,
	normalizePayload: payload => {
		const history = payload?.medical_history || {};
		const patient = history.patient || {};
		const examination = history.examination || {};
		const previous = history.previous_examination || {};
		return {
			patientId: patient.id || null,
			physicalHistory: patient.physical_history || [],
			familyHistory: patient.family_history || [],
			allergies: Array.isArray(patient.allergies) ? patient.allergies : [],
			riskAssessment: examination.risk_assessment || {},
			previousRiskAssessment: previous.risk_assessment || {},
			substanceUseHistory: patient.substance_use_history || {},
			safetyPlan: patient.safety_plan || {}
		};
	}
};

const config = Object.freeze({
	role: 'psychologist',
	workspaceRootId: 'psychologistClinicalWorkspace',
	defaultSectionId: 'psychologistClinicalDecisionPanel',
	sections: Object.freeze([
		{ id: 'psychologistReceptionistIntakePanel', label: 'Hành chính' },
		{ id: 'psychologistHistoryPanel', label: 'Tiền sử' },
		{ id: 'psychologistClinicalDecisionPanel', label: 'Khám' },
		{ id: 'doctorServicePanel', label: 'Dịch vụ' },
		{ id: 'doctorIndicationsPanel', label: 'Chỉ định' }
	]),
	clinicalFields: Object.freeze([
		{ id: 'examinationMainReason', label: 'Lý do khai thác', section: 'tam_ly_gia_kham_form_kham', field: 'main_reason' },
		{ id: 'examDetailMedicalHistory', label: 'Bệnh sử', section: 'tam_ly_gia_kham_tien_su', field: 'medical_history' },
		{ id: 'examMentalGeneralManifestations', label: 'Đánh giá ban đầu', section: 'tam_ly_gia_kham_kham_tam_than', field: 'danh_gia_ban_dau' },
		{ id: 'examDetailGeneralExamination', label: 'Diễn tiến trong phiên khám', section: 'tam_ly_gia_kham_kham_tam_than', field: 'dien_tien_trong_phien_kham' },
		{ id: 'diagnosis', label: 'Triệu chứng và hành vi hiện tại', section: 'tam_ly_gia_kham_form_kham', field: 'trieu_chung_va_hanh_vi_hien_tai' },
		{ id: 'benhKemTheo', label: 'Nhận định chung', section: 'tam_ly_gia_kham_form_kham', field: 'nhan_dinh_chung' },
		{ id: 'treatmentPlan', label: 'Kế hoạch can thiệp', section: 'tam_ly_gia_kham_form_kham', field: 'ke_hoach_can_thiep' },
		{ id: 'examMentalOrientation', label: 'Ý thức định hướng', section: 'tam_ly_gia_kham_kham_tam_than', field: 'orientation' },
		{ id: 'examMentalEmotions', label: 'Tình cảm, cảm xúc', section: 'tam_ly_gia_kham_kham_tam_than', field: 'emotions' },
		{ id: 'examMentalPerception', label: 'Tri giác', section: 'tam_ly_gia_kham_kham_tam_than', field: 'perception' },
		{ id: 'examMentalThought', label: 'Tư duy', section: 'tam_ly_gia_kham_kham_tam_than', field: 'thought' },
		{ id: 'examMentalBehavior', label: 'Hành vi tác phong', section: 'tam_ly_gia_kham_kham_tam_than', field: 'behavior' },
		{ id: 'examMentalMemory', label: 'Trí nhớ', section: 'tam_ly_gia_kham_kham_tam_than', field: 'memory' },
		{ id: 'examMentalAttention', label: 'Tập trung - chú ý', section: 'tam_ly_gia_kham_kham_tam_than', field: 'attention' },
		{ id: 'examMentalIntelligence', label: 'Trí năng', section: 'tam_ly_gia_kham_kham_tam_than', field: 'intelligence' },
		{ id: 'examMentalNotes', label: 'Ghi chú', section: 'tam_ly_gia_kham_kham_tam_than', field: 'notes' }
	]),
	hiddenDoctorFieldIds: Object.freeze([
		'examGeneralPresentation',
		'examGeneralCirculation',
		'examGeneralDigestive',
		'examGeneralRenalUroGenital',
		'examGeneralMusculoskeletal',
		'examGeneralENT',
		'examGeneralEndocrineNutritionOthers',
		'examGeneralMental',
		'currentMedications',
		'examinationNotes'
	]),
	intake: Object.freeze({
		rootId: PSYCHOLOGIST_INTAKE_ROOT,
		patient: Object.freeze({ rootId: PSYCHOLOGIST_INTAKE_ROOT, strictRoot: true }),
		visit: Object.freeze({ rootId: PSYCHOLOGIST_INTAKE_ROOT, strictRoot: true })
	}),
	clinical: Object.freeze({ rootId: PSYCHOLOGIST_CLINICAL_ROOT }),
	services: Object.freeze({ rootId: 'doctorServicePanel', strictRoot: true }),
	indications: Object.freeze({
		rootId: 'doctorIndicationsPanel',
		strictRoot: true
	})
});

export const QLPKPsychologistComponentConfig = config;
window.QLPKDoctorModuleRegistry?.register?.('psychologistComponentConfig', config, {
	owner: 'psychologist/base',
	version: 1
});
