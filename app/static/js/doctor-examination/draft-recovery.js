// Parts (nạp trước file này): snapshot.js, capture-and-bind.js
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/draft-recovery'] || (window.QLPKModuleParts['doctor-examination/draft-recovery'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!moduleState.RUNTIME) throw new Error('Thiếu Doctor support runtime');
	moduleState.POLICY = window.QLPKDoctorModuleRegistry.get('draftRecoveryPolicy');
	moduleState.STORE = window.QLPKDoctorModuleRegistry.get('draftRecoveryStore');
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

	window.QLPKDoctorModuleRegistry.register('draftRecovery', {
		bind: moduleParts.bind,
		setContext: moduleParts.setContext,
		clearContext: moduleParts.clearContext,
		queueCapture: moduleParts.queueCapture,
		captureNow: moduleParts.captureDraft,
		discardCurrent: moduleParts.discardCurrent,
		rebaseAfterSave: moduleParts.rebaseAfterSave,
		clearCurrentUserDrafts: moduleParts.clearCurrentUserDrafts
	});
})(window, document);
