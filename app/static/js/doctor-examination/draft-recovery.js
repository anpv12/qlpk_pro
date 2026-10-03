import { moduleState } from './draft-recovery-parts/state.js';
import { bind, captureDraft, clearContext, clearCurrentUserDrafts, queueCapture, setContext } from './draft-recovery-parts/capture-and-bind.js';
import { discardCurrent, rebaseAfterSave } from './draft-recovery-parts/snapshot.js';
import { QLPKDoctorModuleRegistry } from './module-registry.js';

moduleState.RUNTIME = QLPKDoctorModuleRegistry.get('supportRuntime');
if (!moduleState.RUNTIME) throw new Error('Thiếu Doctor support runtime');
moduleState.POLICY = QLPKDoctorModuleRegistry.get('draftRecoveryPolicy');
moduleState.STORE = QLPKDoctorModuleRegistry.get('draftRecoveryStore');
if (!moduleState.POLICY || !moduleState.STORE) throw new Error('Thiếu policy/store của bản nháp Doctor');
({ DRAFT_SCHEMA_VERSION: moduleState.DRAFT_SCHEMA_VERSION, clone: moduleState.clone, isTransientClinicalControlId: moduleState.isTransientClinicalControlId, sameValue: moduleState.sameValue, resolveDraftRecord: moduleState.resolveDraftRecord } = moduleState.POLICY);
({ DRAFT_TTL_MS: moduleState.DRAFT_TTL_MS, draftKey: moduleState.draftKey, readRecord: moduleState.readRecord, writeRecord: moduleState.writeRecord, deleteRecord: moduleState.deleteRecord, deleteRecordIfMatches: moduleState.deleteRecordIfMatches, replaceRecordIfMatches: moduleState.replaceRecordIfMatches, purgeExpiredRecords: moduleState.purgeExpiredRecords, deleteUserRecords: moduleState.deleteUserRecords } = moduleState.STORE);
// Keep a local recovery copy shortly after a user change; this never writes to the server.
moduleState.CAPTURE_DELAY_MS = 250;
moduleState.pendingWrites = new Map();

moduleState.STATE = {
	bound: false,
	contextToken: 0,
	context: null,
	baseline: null,
	pendingDraft: null,
	restored: false,
	recoveryMode: 'standard',
	captureTimer: null,
	captureGeneration: 0,
	isRestoring: false,
	document: document,
	showToast: null,
	reloadContext: null
};

({ normalizeId: moduleState.normalizeId } = moduleState.RUNTIME);

moduleState.HISTORY_RESTORE_TARGETS = [
	{ key: 'physicalHistory', workbenchTarget: 'personal', selectors: '#physHistorySearch, #physHistoryTextInput' },
	{ key: 'familyHistory', workbenchTarget: 'family', selectors: '#famHistorySearch, #famHistoryTextInput' },
	{ key: 'allergies', workbenchTarget: 'allergy', selectors: '#drugAllergyInput, #drugAllergyBody input' },
	{ key: 'substanceUseHistory', workbenchTarget: 'substance', selectors: '#substanceTableWrap input' },
	{ key: 'riskAssessment', workbenchTarget: 'risk', selectors: '#riskAssessWrap input' },
	{ key: 'safetyPlan', workbenchTarget: 'safety', selectors: '.safety-plan-fields textarea, .safety-plan-fields select' }
];

moduleState.SUPPORT_RESTORE_TARGETS = [
	{
		key: 'services',
		sectionId: 'doctorServicePanel',
		selectors: '#doctorServicePanel .is-draft-restored, #doctorServiceSelectionList input, #doctorServiceCatalogList button'
	},
	{
		key: 'indications',
		sectionId: 'doctorIndicationsPanel',
		selectors: '#doctorIndicationsPanel .is-draft-restored, #doctorIndicationName, #doctorIndicationsList'
	}
];
moduleState.PRESCRIPTION_ROW_SELECTORS = '#doctorPrescriptionWorkspace .doctor-prescription-table__body-row.is-draft-restored [data-prescription-field="name"], #doctorPrescriptionWorkspace .doctor-prescription-table__body-row [data-prescription-field="name"], #doctorPrescriptionWorkspace input, #doctorPrescriptionWorkspace textarea';

moduleState.PRESCRIPTION_SETUP_CONTROLS = [
	{ key: 'usageMode', selector: '#doctorPrescriptionUsageMode' },
	{ key: 'medicineDays', selector: '#doctorPrescriptionMedicineDays' },
	{ key: 'reExamEnabled', selector: '#doctorPrescriptionReExamButton' },
	{ key: 'reExamDateTime', selector: '#doctorPrescriptionReExamDateTime' },
	{ key: 'reExamSelection', selector: '#doctorPrescriptionReExamButton' }
];
moduleState.RE_EXAM_CONTROL_KEYS = ['reExamEnabled', 'reExamDateTime', 'reExamSelection'];

QLPKDoctorModuleRegistry.register('draftRecovery', {
	bind: bind,
	setContext: setContext,
	clearContext: clearContext,
	queueCapture: queueCapture,
	captureNow: captureDraft,
	discardCurrent: discardCurrent,
	rebaseAfterSave: rebaseAfterSave,
	clearCurrentUserDrafts: clearCurrentUserDrafts
});
