(function (window, document) {
	'use strict';

	const RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const DATABASE_NAME = 'qlpk_doctor_draft_recovery';
	const DATABASE_VERSION = 1;
	const STORE_NAME = 'clinical_drafts';
	const DRAFT_SCHEMA_VERSION = 1;
	const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
	// Keep a local recovery copy shortly after a user change; this never writes to the server.
	const CAPTURE_DELAY_MS = 250;

	const STATE = {
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

	function getDocument(options = {}) {
		return RUNTIME.getDocument({ document: options.document || STATE.document });
	}

	const { normalizeId } = RUNTIME;

	function clone(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	const TRANSIENT_CLINICAL_CONTROL_IDS = new Set(['diagnosis', 'benhKemTheo']);

	function isTransientClinicalControlId(id) {
		return TRANSIENT_CLINICAL_CONTROL_IDS.has(String(id || ''));
	}

	function normalizeDraftForComparison(value) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
		const normalized = clone(value);
		[
			normalized,
			normalized?.prescription,
			normalized?.support?.prescription
		].forEach(candidate => {
			if (candidate && typeof candidate === 'object') delete candidate.usageInstructions;
		});
		const controls = normalized?.clinical?.controls;
		if (controls && typeof controls === 'object') {
			TRANSIENT_CLINICAL_CONTROL_IDS.forEach(id => delete controls[id]);
		}
		return normalized;
	}

	function normalizeForComparison(value) {
		if (Array.isArray(value)) return value.map(normalizeForComparison);
		if (value && typeof value === 'object') {
			return Object.keys(value).sort().reduce((result, key) => {
				if (value[key] !== undefined) result[key] = normalizeForComparison(value[key]);
				return result;
			}, {});
		}
		return value === undefined || value === null ? '' : value;
	}

	function sameValue(left, right) {
		return JSON.stringify(normalizeForComparison(normalizeDraftForComparison(left)))
			=== JSON.stringify(normalizeForComparison(normalizeDraftForComparison(right)));
	}

	function isPlainObject(value) {
		return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
	}

	function mergeDraftValue(base, draft, current) {
		if (sameValue(draft, base) || sameValue(current, draft)) return clone(current);
		if (sameValue(current, base)) return clone(draft);
		if (!isPlainObject(base) || !isPlainObject(draft) || !isPlainObject(current)) {
			return clone(current);
		}
		return [...new Set([...Object.keys(base), ...Object.keys(draft), ...Object.keys(current)])]
			.reduce((result, key) => {
				result[key] = mergeDraftValue(base[key], draft[key], current[key]);
				return result;
			}, {});
	}

	function mergeFailedSaveDraft(base, draft, current) {
		return mergeDraftValue(
			normalizeDraftForComparison(base),
			normalizeDraftForComparison(draft),
			normalizeDraftForComparison(current)
		);
	}

	function classifyDraftRecord(record, context, baseline, now = Date.now()) {
		const valid = record
			&& record.schemaVersion === DRAFT_SCHEMA_VERSION
			&& record.userId === context.userId
			&& record.appointmentId === context.appointmentId
			&& record.patientId === context.patientId
			&& record.expiresAt > now
			&& Object.prototype.hasOwnProperty.call(record, 'baseSnapshot')
			&& record.baseSnapshot && typeof record.baseSnapshot === 'object'
			&& Object.prototype.hasOwnProperty.call(record, 'snapshot')
			&& record.snapshot && typeof record.snapshot === 'object';
		if (!valid) return 'invalid';
		if (sameValue(baseline, record.snapshot)) return 'redundant';
		if (!sameValue(baseline, record.baseSnapshot)) return 'superseded';
		return 'recoverable';
	}

	function resolveDraftRecord(record, context, baseline, now = Date.now()) {
		const disposition = classifyDraftRecord(record, context, baseline, now);
		if (disposition === 'invalid' || disposition === 'redundant') return { action: 'delete', disposition };
		if (disposition === 'superseded' && record.recoveryMode !== 'failed-save') {
			return { action: 'delete', disposition };
		}
		if (record.recoveryMode !== 'failed-save') return { action: 'recover', disposition, record };

		const rebasedSnapshot = disposition === 'superseded'
			? mergeFailedSaveDraft(record.baseSnapshot, record.snapshot, baseline)
			: clone(record.snapshot);
		if (sameValue(baseline, rebasedSnapshot)) return { action: 'delete', disposition: 'redundant' };
		return {
			action: 'replace',
			disposition,
			record: {
				...record,
				captureId: `${now}-${Math.random().toString(36).slice(2)}`,
				baseSnapshot: clone(baseline),
				snapshot: rebasedSnapshot,
				recoveryMode: 'standard'
			}
		};
	}

	function getCurrentUserId() {
		try {
			const raw = window.localStorage && window.localStorage.getItem('qlpk_user');
			const user = raw ? JSON.parse(raw) : null;
			return normalizeId(user && (user.id || user.user_id));
		} catch (error) {
			return null;
		}
	}

	function getClinicalWorkspace() {
		return window.QLPKDoctorModuleRegistry.get('clinicalWorkspace') || null;
	}

	function getSupportModules() {
		return window.QLPKDoctorModuleRegistry.get('supportModulesUi') || null;
	}

	function getMedicalHistory() {
		return window.QLPKDoctorModuleRegistry.get('medicalHistoryBridge') || null;
	}

	function isDirty() {
		const workspace = getClinicalWorkspace();
		return Boolean(workspace && typeof workspace.hasUnsavedChanges === 'function' && workspace.hasUnsavedChanges());
	}

	function snapshot() {
		const doc = getDocument();
		const workspace = getClinicalWorkspace();
		const support = getSupportModules();
		const history = getMedicalHistory();
		return {
			clinical: workspace && typeof workspace.getDraftSnapshot === 'function'
				? workspace.getDraftSnapshot({ document: doc })
				: {},
			support: support && typeof support.getDraftSnapshot === 'function'
				? support.getDraftSnapshot({ document: doc })
				: {},
			history: history && typeof history.getDraftSnapshot === 'function'
				? history.getDraftSnapshot({ document: doc })
				: {}
		};
	}

	function openDatabase() {
		return new Promise((resolve, reject) => {
			if (!window.indexedDB) {
				reject(new Error('IndexedDB không khả dụng trên trình duyệt này'));
				return;
			}
			const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
			request.onerror = () => reject(request.error || new Error('Không mở được kho nháp cục bộ'));
			request.onupgradeneeded = () => {
				const database = request.result;
				const store = database.objectStoreNames.contains(STORE_NAME)
					? request.transaction.objectStore(STORE_NAME)
					: database.createObjectStore(STORE_NAME, { keyPath: 'key' });
				if (!store.indexNames.contains('expiresAt')) store.createIndex('expiresAt', 'expiresAt', { unique: false });
				if (!store.indexNames.contains('userId')) store.createIndex('userId', 'userId', { unique: false });
			};
			request.onsuccess = () => resolve(request.result);
		});
	}

	async function withStore(mode, callback) {
		const database = await openDatabase();
		try {
			return await new Promise((resolve, reject) => {
				const transaction = database.transaction(STORE_NAME, mode);
				const store = transaction.objectStore(STORE_NAME);
				let result;
				try {
					result = callback(store, transaction);
				} catch (error) {
					reject(error);
					return;
				}
				transaction.oncomplete = () => resolve(result);
				transaction.onerror = () => reject(transaction.error || new Error('Không thể cập nhật kho nháp'));
				transaction.onabort = () => reject(transaction.error || new Error('Đã hủy cập nhật kho nháp'));
			});
		} finally {
			database.close();
		}
	}

	function readRecord(key) {
		return withStore('readonly', store => new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onsuccess = () => resolve(request.result || null);
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp'));
		}));
	}

	function writeRecord(record) {
		return withStore('readwrite', store => store.put(record));
	}

	function deleteRecord(key) {
		return withStore('readwrite', store => store.delete(key));
	}

	function deleteRecordIfMatches(record) {
		if (!record?.key) return Promise.resolve(false);
		return withStore('readwrite', store => new Promise((resolve, reject) => {
			const request = store.get(record.key);
			request.onsuccess = () => {
				const current = request.result;
				const matches = Boolean(current && (record.captureId
					? current.captureId === record.captureId
					: current.schemaVersion === record.schemaVersion && current.savedAt === record.savedAt));
				if (matches) store.delete(record.key);
				resolve(matches);
			};
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp để kiểm tra race'));
		}));
	}

	function replaceRecordIfMatches(record, replacement) {
		if (!record?.key || !replacement?.key || record.key !== replacement.key) return Promise.resolve(false);
		return withStore('readwrite', store => new Promise((resolve, reject) => {
			const request = store.get(record.key);
			request.onsuccess = () => {
				const current = request.result;
				const matches = Boolean(current && (record.captureId
					? current.captureId === record.captureId
					: current.schemaVersion === record.schemaVersion && current.savedAt === record.savedAt));
				if (matches) store.put(replacement);
				resolve(matches);
			};
			request.onerror = () => reject(request.error || new Error('Không đọc được bản nháp để cập nhật an toàn'));
		}));
	}

	async function purgeExpiredRecords() {
		const now = Date.now();
		await withStore('readwrite', store => {
			const index = store.index('expiresAt');
			const request = index.openCursor(IDBKeyRange.upperBound(now));
			request.onsuccess = event => {
				const cursor = event.target.result;
				if (!cursor) return;
				cursor.delete();
				cursor.continue();
			};
		});
	}

	function draftKey(context) {
		return `doctor-clinical:${context.userId}:${context.appointmentId}`;
	}

	function getBanner(doc) {
		return doc.getElementById('doctorDraftRecoveryBanner');
	}

	function clearRestoredMarkers(doc) {
		doc.querySelectorAll('.is-draft-restored').forEach(element => {
			element.classList.remove('is-draft-restored');
			element.classList.remove('is-draft-restored-focus');
			element.removeAttribute('data-draft-restored');
			element.removeAttribute('data-draft-restored-focus');
		});
	}

	const HISTORY_RESTORE_TARGETS = [
		{ key: 'physicalHistory', workbenchTarget: 'personal', selectors: '#physHistorySearch, #physHistoryTextInput' },
		{ key: 'familyHistory', workbenchTarget: 'family', selectors: '#famHistorySearch, #famHistoryTextInput' },
		{ key: 'allergies', workbenchTarget: 'allergy', selectors: '#drugAllergyInput, #drugAllergyBody input' },
		{ key: 'substanceUseHistory', workbenchTarget: 'substance', selectors: '#substanceTableWrap input' },
		{ key: 'riskAssessment', workbenchTarget: 'risk', selectors: '#riskAssessWrap input' },
		{ key: 'safetyPlan', workbenchTarget: 'safety', selectors: '.safety-plan-fields textarea, .safety-plan-fields select' }
	];

	function getClinicalWorkspaceUi() {
		return window.QLPKDoctorModuleRegistry.get('clinicalWorkspace') || null;
	}

	function getHistoryWorkbenchActions() {
		return window.QLPKDoctorModuleRegistry.get('medicalHistoryForm')?.getActive?.()?.actions || null;
	}

	function getFirstVisibleElement(doc, selectors, root = doc) {
		return String(selectors || '').split(',').map(selector => selector.trim()).filter(Boolean)
			.map(selector => root.querySelector(selector))
			.find(element => element && !element.hidden && element.getClientRects().length) || null;
	}

	function getFirstFocusableElement(root) {
		if (!root) return null;
		if (root.matches?.('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])')
			&& root.getClientRects().length) return root;
		return root.querySelector('input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
	}

	function markRestoreFocus(element) {
		if (!element) return null;
		const target = element.matches?.('input, textarea, select, button')
			? element
			: getFirstFocusableElement(element) || element;
		target.classList.add('is-draft-restored-focus');
		target.dataset.draftRestoredFocus = 'true';
		target.setAttribute('title', 'Đây là vị trí đầu tiên được khôi phục từ bản nháp và chưa lưu.');
		return target;
	}

	function getVisibleClinicalTarget(doc, controlId) {
		const control = doc.getElementById(controlId);
		if (!control) return null;
		if (control.type !== 'hidden' && !control.hidden) return control;
		const visibleId = {
			currentMedications: 'currentMedicationSearch',
			diagnosisIds: 'diagnosis',
			benhKemTheoIds: 'benhKemTheo'
		}[controlId];
		return visibleId ? doc.getElementById(visibleId) : null;
	}

	function collectRestoreTargets(doc, baseline, draft) {
		const targets = [];
		const baseClinical = baseline?.clinical?.controls || {};
		const draftClinical = draft?.clinical?.controls || {};
		const form = doc.getElementById('doctorClinicalForm');
		if (form) {
			form.querySelectorAll('input, textarea, select').forEach(control => {
				const id = control.id;
				if (!id || isTransientClinicalControlId(id) || sameValue(baseClinical[id], draftClinical[id])) return;
				const target = getVisibleClinicalTarget(doc, id);
				const section = target?.closest('.doctor-workspace-section');
				if (!target || !section) return;
				targets.push({ sectionId: section.id, resolve: () => target, order: targets.length });
			});
		}

		const baseHistory = baseline?.history || {};
		const draftHistory = draft?.history || {};
		HISTORY_RESTORE_TARGETS.forEach(config => {
			if (sameValue(baseHistory[config.key], draftHistory[config.key])) return;
			targets.push({
				sectionId: 'doctorHistoryPanel',
				workbenchTarget: config.workbenchTarget,
				resolve: currentDoc => getFirstVisibleElement(currentDoc, config.selectors),
				fallback: currentDoc => currentDoc.getElementById('doctorHistoryPanel'),
				order: targets.length
			});
		});

		const baseSupport = baseline?.support || {};
		const draftSupport = draft?.support || {};
		const basePrescription = baseSupport.prescription || {};
		const draftPrescription = draftSupport.prescription || {};
		const support = getSupportModules();
		const reExamLocked = Boolean(support?.isReExaminationLocked?.());
		[
			{ key: 'usageMode', selector: '#doctorPrescriptionUsageMode' },
			{ key: 'medicineDays', selector: '#doctorPrescriptionMedicineDays' },
			{ key: 'reExamEnabled', selector: '#doctorPrescriptionReExamButton' },
			{ key: 'reExamDateTime', selector: '#doctorPrescriptionReExamDateTime' },
			{ key: 'reExamSelection', selector: '#doctorPrescriptionReExamButton' }
		].forEach(config => {
			if (reExamLocked && ['reExamEnabled', 'reExamDateTime', 'reExamSelection'].includes(config.key)) return;
			if (sameValue(basePrescription[config.key], draftPrescription[config.key])) return;
			targets.push({
				sectionId: 'doctorClinicalDecisionPanel',
				resolve: currentDoc => currentDoc.querySelector(config.selector),
				order: targets.length
			});
		});
		if (!sameValue(basePrescription.rows, draftPrescription.rows)) {
			targets.push({
				sectionId: 'doctorClinicalDecisionPanel',
				resolve: currentDoc => getFirstVisibleElement(
					currentDoc,
					'#doctorPrescriptionWorkspace .doctor-prescription-table__body-row.is-draft-restored [data-prescription-field="name"], #doctorPrescriptionWorkspace .doctor-prescription-table__body-row [data-prescription-field="name"], #doctorPrescriptionWorkspace input, #doctorPrescriptionWorkspace textarea'
				),
				fallback: currentDoc => currentDoc.getElementById('doctorPrescriptionWorkspace'),
				order: targets.length
			});
		}
		if (!sameValue(baseSupport.services, draftSupport.services)) {
			targets.push({
				sectionId: 'doctorServicePanel',
				resolve: currentDoc => getFirstVisibleElement(currentDoc, '#doctorServicePanel .is-draft-restored, #doctorServiceSelectionList input, #doctorServiceCatalogList button'),
				fallback: currentDoc => currentDoc.getElementById('doctorServicePanel'),
				order: targets.length
			});
		}
		if (!sameValue(baseSupport.indications, draftSupport.indications)) {
			targets.push({
				sectionId: 'doctorIndicationsPanel',
				resolve: currentDoc => getFirstVisibleElement(currentDoc, '#doctorIndicationsPanel .is-draft-restored, #doctorIndicationName, #doctorIndicationsList'),
				fallback: currentDoc => currentDoc.getElementById('doctorIndicationsPanel'),
				order: targets.length
			});
		}
		return targets;
	}

	function activateHistoryTarget(workbenchTarget) {
		if (!workbenchTarget) return;
		const actions = getHistoryWorkbenchActions();
		if (typeof actions?.activateWorkbenchTarget === 'function') actions.activateWorkbenchTarget(workbenchTarget);
	}

	function revealRestoreTarget(doc, target) {
		if (!target) return false;
		const workspace = getClinicalWorkspaceUi();
		if (typeof workspace?.activateSection === 'function') workspace.activateSection(doc, target.sectionId);
		activateHistoryTarget(target.workbenchTarget);
		const element = target.resolve(doc) || target.fallback?.(doc);
		if (!element) return false;
		const focusTarget = markRestoreFocus(element);
		const reveal = () => {
			if (typeof element.scrollIntoView === 'function') {
				element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
			}
			if (focusTarget && typeof focusTarget.focus === 'function') {
				try {
					focusTarget.focus({ preventScroll: true });
				} catch (error) {
					focusTarget.focus();
				}
			}
		};
		if (typeof window.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
		} else {
			window.setTimeout(reveal, 0);
		}
		return true;
	}

	function clearBanner(doc) {
		const banner = getBanner(doc);
		if (!banner) return;
		banner.hidden = true;
		banner.dataset.state = '';
		const message = banner.querySelector('[data-doctor-draft-message]');
		const messagePrefix = banner.querySelector('[data-doctor-draft-message-prefix]');
		const draftCount = banner.querySelector('[data-doctor-draft-count]');
		const messageSuffix = banner.querySelector('[data-doctor-draft-message-suffix]');
		if (messagePrefix && draftCount && messageSuffix) {
			messagePrefix.textContent = '';
			draftCount.textContent = '';
			messageSuffix.textContent = '';
		} else if (message) {
			message.textContent = '';
		}
	}

	function formatTimestamp(value) {
		try {
			return new Date(value).toLocaleString('vi-VN', {
				hour: '2-digit',
				minute: '2-digit',
				day: '2-digit',
				month: '2-digit'
			});
		} catch (error) {
			return '';
		}
	}

	function renderBanner(doc) {
		const banner = getBanner(doc);
		if (!banner || !STATE.pendingDraft) return;
		const message = banner.querySelector('[data-doctor-draft-message]');
		const messagePrefix = banner.querySelector('[data-doctor-draft-message-prefix]');
		const draftCount = banner.querySelector('[data-doctor-draft-count]');
		const messageSuffix = banner.querySelector('[data-doctor-draft-message-suffix]');
		const restore = banner.querySelector('[data-doctor-draft-action="restore"]');
		const discard = banner.querySelector('[data-doctor-draft-action="discard"]');
		const savedAt = formatTimestamp(STATE.pendingDraft.savedAt);

		banner.hidden = false;
		banner.dataset.state = STATE.restored ? 'restored' : 'available';
		if (messagePrefix && draftCount && messageSuffix) {
			messagePrefix.textContent = STATE.restored ? 'Đang làm việc từ ' : 'Có ';
			draftCount.textContent = '1';
			messageSuffix.textContent = STATE.restored
				? ' bản nháp chưa lưu.'
				: ` bản nháp chưa lưu${savedAt ? ` lúc ${savedAt}` : ''}.`;
		} else if (message) {
			message.textContent = STATE.restored
				? 'Đang làm việc từ 1 bản nháp chưa lưu.'
				: `Có 1 bản nháp chưa lưu${savedAt ? ` lúc ${savedAt}` : ''}.`;
		}
		if (restore) restore.hidden = STATE.restored;
		if (restore) restore.textContent = 'Khôi phục';
		if (discard) discard.hidden = false;
	}

	function restoreControlMarkers(doc, baseControls = {}, draftControls = {}) {
		Object.keys(draftControls).forEach(id => {
			if (isTransientClinicalControlId(id) || sameValue(baseControls[id], draftControls[id])) return;
			const control = doc.getElementById(id);
			if (!control) return;
			control.classList.add('is-draft-restored');
			control.dataset.draftRestored = 'true';
			const field = control.closest('label, .doctor-field, .doctor-clinical-detail-field');
			if (field) {
				field.classList.add('is-draft-restored');
				field.dataset.draftRestored = 'true';
				field.setAttribute('title', 'Giá trị này được khôi phục từ bản nháp và chưa lưu.');
			}
		});
	}

	function addRestoredControlMarker(control) {
		if (!control) return;
		control.classList.add('is-draft-restored');
		control.dataset.draftRestored = 'true';
		control.setAttribute('title', 'Giá trị này được khôi phục từ bản nháp và chưa lưu.');
	}

	function restoreSupportControlMarkers(doc, baseSupport = {}, draftSupport = {}) {
		const basePrescription = baseSupport.prescription || {};
		const draftPrescription = draftSupport.prescription || {};
		const support = getSupportModules();
		const reExamLocked = Boolean(support?.isReExaminationLocked?.());
		[
			{ key: 'usageMode', selector: '#doctorPrescriptionUsageMode' },
			{ key: 'medicineDays', selector: '#doctorPrescriptionMedicineDays' },
			{ key: 'reExamEnabled', selector: '#doctorPrescriptionReExamButton' },
			{ key: 'reExamDateTime', selector: '#doctorPrescriptionReExamDateTime' },
			{ key: 'reExamSelection', selector: '#doctorPrescriptionReExamButton' }
		].forEach(config => {
			if (reExamLocked && ['reExamEnabled', 'reExamDateTime', 'reExamSelection'].includes(config.key)) return;
			if (sameValue(basePrescription[config.key], draftPrescription[config.key])) return;
			addRestoredControlMarker(doc.querySelector(config.selector));
		});
		const baseIndications = baseSupport.indications || {};
		const draftIndications = draftSupport.indications || {};
		if (!sameValue(baseIndications.rows, draftIndications.rows)) {
			addRestoredControlMarker(doc.querySelector('#doctorIndicationsList .doctor-indications-table__empty, #doctorIndicationsList tr, #doctorIndicationName'));
		}
	}

	function getSupportRestoreOptions(base = {}, draft = {}) {
		const baseSupport = base || {};
		const draftSupport = draft || {};
		return {
			dirty: {
				prescription: !sameValue(baseSupport.prescription, draftSupport.prescription),
				services: !sameValue(baseSupport.services, draftSupport.services),
				indications: !sameValue(baseSupport.indications, draftSupport.indications)
			},
			base: baseSupport
		};
	}

	async function applyDraft() {
		const doc = getDocument();
		const draft = STATE.pendingDraft;
		if (!draft || !STATE.baseline || STATE.isRestoring) return false;
		const token = STATE.contextToken;
		STATE.isRestoring = true;
		STATE.captureGeneration += 1;
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		try {
			const workspace = getClinicalWorkspace();
			const support = getSupportModules();
			const history = getMedicalHistory();
			const snapshotData = draft.snapshot || {};
			const isCurrentRestore = () => token === STATE.contextToken;
			clearRestoredMarkers(doc);

			if (workspace && typeof workspace.restoreDraftSnapshot === 'function') {
				await workspace.restoreDraftSnapshot(snapshotData.clinical || {}, {
					document: doc,
					isCurrent: isCurrentRestore
				});
			}
			if (token !== STATE.contextToken) return false;
			if (support && typeof support.restoreDraftSnapshot === 'function') {
				await support.restoreDraftSnapshot(snapshotData.support || {}, {
					document: doc,
					...getSupportRestoreOptions(STATE.baseline.support, snapshotData.support)
				});
				if (token !== STATE.contextToken) return false;
				restoreSupportControlMarkers(doc, STATE.baseline.support, snapshotData.support);
			}
			if (token !== STATE.contextToken) return false;
			if (history && typeof history.restoreDraftSnapshot === 'function') {
				await history.restoreDraftSnapshot(snapshotData.history || {}, {
					document: doc,
					dirty: !sameValue(STATE.baseline.history, snapshotData.history)
				});
				if (token !== STATE.contextToken) return false;
			}
			if (token !== STATE.contextToken) return false;

			restoreControlMarkers(
				doc,
				STATE.baseline.clinical && STATE.baseline.clinical.controls,
				snapshotData.clinical && snapshotData.clinical.controls
			);
			STATE.restored = true;
			renderBanner(doc);
			revealRestoreTarget(doc, collectRestoreTargets(doc, STATE.baseline, snapshotData)[0]);
			return true;
		} finally {
			if (token === STATE.contextToken) STATE.isRestoring = false;
		}
	}

	async function discardCurrent(options = {}) {
		const doc = getDocument(options);
		const context = STATE.context;
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		STATE.captureGeneration += 1;
		if (context) {
			try {
				await deleteRecord(draftKey(context));
			} catch (error) {
				if (typeof STATE.showToast === 'function') STATE.showToast('error', 'Không thể xóa bản nháp cục bộ');
				return false;
			}
		}
		STATE.pendingDraft = null;
		const wasRestored = STATE.restored;
		STATE.restored = false;
		STATE.recoveryMode = 'standard';
		STATE.isRestoring = false;
		clearRestoredMarkers(doc);
		clearBanner(doc);
		if (wasRestored && options.reload !== false && typeof STATE.reloadContext === 'function') {
			return STATE.reloadContext();
		}
		return true;
	}

	async function rebaseAfterSave() {
		const doc = getDocument();
		if (!STATE.context) return false;
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		STATE.captureGeneration += 1;
		STATE.baseline = snapshot();
		STATE.pendingDraft = null;
		STATE.restored = false;
		STATE.recoveryMode = 'standard';
		STATE.isRestoring = false;
		clearRestoredMarkers(doc);
		clearBanner(doc);
		try {
			await deleteRecord(draftKey(STATE.context));
			return true;
		} catch (error) {
			return false;
		}
	}

	async function captureDraft(options = {}) {
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		STATE.captureGeneration += 1;
		if (!STATE.context || !STATE.baseline || STATE.isRestoring || !isDirty()) return false;
		if (options.recoveryMode === 'failed-save') STATE.recoveryMode = 'failed-save';
		const captureGeneration = STATE.captureGeneration;
		const captureContext = STATE.context;
		const currentSnapshot = snapshot();
		if (sameValue(STATE.baseline, currentSnapshot)) {
			return rebaseAfterSave();
		}
		const now = Date.now();
		const record = {
			key: draftKey(STATE.context),
			captureId: `${now}-${Math.random().toString(36).slice(2)}`,
			schemaVersion: DRAFT_SCHEMA_VERSION,
			userId: STATE.context.userId,
			appointmentId: STATE.context.appointmentId,
			patientId: STATE.context.patientId,
			baseSnapshot: clone(STATE.baseline),
			snapshot: clone(currentSnapshot),
			recoveryMode: STATE.recoveryMode,
			savedAt: now,
			expiresAt: now + DRAFT_TTL_MS
		};
		try {
			await writeRecord(record);
			const isCurrentCapture = captureGeneration === STATE.captureGeneration
				&& STATE.context === captureContext
				&& record.key === draftKey(STATE.context);
			if (!isCurrentCapture) {
				await deleteRecordIfMatches(record);
				return false;
			}
			STATE.pendingDraft = record;
			return true;
		} catch (error) {
			const isCurrentCapture = captureGeneration === STATE.captureGeneration
				&& STATE.context === captureContext;
			if (isCurrentCapture && !options.silent && typeof STATE.showToast === 'function') {
				STATE.showToast('error', 'Không thể lưu bản nháp phục hồi trên thiết bị này');
			}
			return false;
		}
	}

	function queueCapture() {
		if (!STATE.context || STATE.isRestoring) return;
		window.clearTimeout(STATE.captureTimer);
		STATE.captureGeneration += 1;
		STATE.captureTimer = window.setTimeout(() => captureDraft(), CAPTURE_DELAY_MS);
	}

	async function setContext(context = {}) {
		const doc = getDocument(context);
		const appointmentId = normalizeId(context.appointmentId);
		const patientId = normalizeId(context.patientId);
		const userId = normalizeId(context.userId) || getCurrentUserId();
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		STATE.captureGeneration += 1;
		const token = STATE.contextToken + 1;
		STATE.contextToken = token;
		STATE.context = null;
		STATE.baseline = null;
		STATE.pendingDraft = null;
		STATE.restored = false;
		STATE.recoveryMode = 'standard';
		STATE.isRestoring = false;
		clearRestoredMarkers(doc);
		clearBanner(doc);
		if (!appointmentId || !patientId || !userId) return false;

		STATE.context = { appointmentId, patientId, userId };
		STATE.baseline = snapshot();
		try {
			await purgeExpiredRecords();
			const record = await readRecord(draftKey(STATE.context));
			if (token !== STATE.contextToken || !record) return false;
			const resolution = resolveDraftRecord(record, STATE.context, STATE.baseline);
			if (resolution.action === 'delete') {
				await deleteRecordIfMatches(record);
				return false;
			}
			const pendingRecord = resolution.record;
			if (resolution.action === 'replace') {
				const replaced = await replaceRecordIfMatches(record, pendingRecord);
				if (!replaced || token !== STATE.contextToken) return false;
			}
			STATE.pendingDraft = pendingRecord;
			STATE.recoveryMode = 'standard';
			renderBanner(doc);
			return true;
		} catch (error) {
			return false;
		}
	}

	function clearContext(options = {}) {
		window.clearTimeout(STATE.captureTimer);
		STATE.captureTimer = null;
		STATE.contextToken += 1;
		STATE.captureGeneration += 1;
		STATE.context = null;
		STATE.baseline = null;
		STATE.pendingDraft = null;
		STATE.restored = false;
		STATE.recoveryMode = 'standard';
		STATE.isRestoring = false;
		const doc = getDocument(options);
		clearRestoredMarkers(doc);
		clearBanner(doc);
	}

	function bind(options = {}) {
		const doc = getDocument(options);
		STATE.document = doc;
		STATE.showToast = options.showToast || STATE.showToast;
		STATE.reloadContext = options.reloadContext || STATE.reloadContext;
		const workspace = doc.getElementById('doctorClinicalWorkspace');
		if (!workspace || STATE.bound) return Boolean(workspace);

		workspace.addEventListener('input', queueCapture);
		workspace.addEventListener('change', queueCapture);
		workspace.addEventListener('click', event => {
			if (event.target.closest('[data-doctor-draft-action]')) return;
			queueCapture();
		});
		const banner = getBanner(doc);
		if (banner) {
			banner.addEventListener('click', event => {
				const action = event.target.closest('[data-doctor-draft-action]');
				if (!action) return;
				event.preventDefault();
				if (action.dataset.doctorDraftAction === 'restore') applyDraft();
				if (action.dataset.doctorDraftAction === 'discard') discardCurrent({ document: doc });
			});
		}
		doc.addEventListener('click', event => {
			if (!event.target.closest('#logoutBtn, #qlpkHeaderLogoutBtn')) return;
			clearCurrentUserDrafts();
		});
		STATE.bound = true;
		return true;
	}

	async function clearCurrentUserDrafts() {
		const userId = getCurrentUserId();
		if (!userId) return false;
		try {
			await withStore('readwrite', store => {
				const index = store.index('userId');
				const request = index.openCursor(IDBKeyRange.only(userId));
				request.onsuccess = event => {
					const cursor = event.target.result;
					if (!cursor) return;
					cursor.delete();
					cursor.continue();
				};
			});
			return true;
		} catch (error) {
			return false;
		}
	}

	window.QLPKDoctorModuleRegistry.register('draftRecovery', {
		bind,
		setContext,
		clearContext,
		queueCapture,
		captureNow: captureDraft,
		discardCurrent,
		rebaseAfterSave,
		clearCurrentUserDrafts
	});
})(window, document);
