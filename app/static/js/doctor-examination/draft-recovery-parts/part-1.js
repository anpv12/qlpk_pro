// doctor-examination/draft-recovery.js: phần 1/2 (nạp trước draft-recovery.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/draft-recovery'] || (window.QLPKModuleParts['doctor-examination/draft-recovery'] = { state: {} });
	const moduleState = moduleParts.state;

	function getDocument(options = {}) {
		return moduleState.RUNTIME.getDocument({ document: options.document || moduleState.STATE.document });
	}
	function getCurrentUserId() {
		const session = window.QLPKApiTransport?.session;
		if (session) return moduleState.normalizeId(session.owner.snapshot().session?.user.id);
		try {
			const raw = window.localStorage && window.localStorage.getItem('qlpk_user');
			const user = raw ? JSON.parse(raw) : null;
			return moduleState.normalizeId(user && (user.id || user.user_id));
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
	function collectClinicalRestoreTargets(doc, baseline, draft, targets) {
		const baseClinical = baseline?.clinical?.controls || {};
		const draftClinical = draft?.clinical?.controls || {};
		const form = doc.getElementById('doctorClinicalForm');
		if (!form) return;
		form.querySelectorAll('input, textarea, select').forEach(control => {
			const id = control.id;
			if (!id || moduleState.isTransientClinicalControlId(id) || moduleState.sameValue(baseClinical[id], draftClinical[id])) return;
			const target = getVisibleClinicalTarget(doc, id);
			const section = target?.closest('.doctor-workspace-section');
			if (!target || !section) return;
			targets.push({ sectionId: section.id, resolve: () => target, order: targets.length });
		});
	}
	function collectHistoryRestoreTargets(baseline, draft, targets) {
		const baseHistory = baseline?.history || {};
		const draftHistory = draft?.history || {};
		moduleState.HISTORY_RESTORE_TARGETS.forEach(config => {
			if (moduleState.sameValue(baseHistory[config.key], draftHistory[config.key])) return;
			targets.push({
				sectionId: 'doctorHistoryPanel',
				workbenchTarget: config.workbenchTarget,
				resolve: currentDoc => getFirstVisibleElement(currentDoc, config.selectors),
				fallback: currentDoc => currentDoc.getElementById('doctorHistoryPanel'),
				order: targets.length
			});
		});
	}
	function collectSupportRestoreTargets(baseline, draft, targets) {
		const baseSupport = baseline?.support || {};
		const draftSupport = draft?.support || {};
		getChangedPrescriptionControls(baseSupport, draftSupport).forEach(config => {
			targets.push({
				sectionId: 'doctorClinicalDecisionPanel',
				resolve: currentDoc => currentDoc.querySelector(config.selector),
				order: targets.length
			});
		});
		if (!moduleState.sameValue((baseSupport.prescription || {}).rows, (draftSupport.prescription || {}).rows)) {
			targets.push({
				sectionId: 'doctorClinicalDecisionPanel',
				resolve: currentDoc => getFirstVisibleElement(currentDoc, moduleState.PRESCRIPTION_ROW_SELECTORS),
				fallback: currentDoc => currentDoc.getElementById('doctorPrescriptionWorkspace'),
				order: targets.length
			});
		}
		moduleState.SUPPORT_RESTORE_TARGETS.forEach(config => {
			if (moduleState.sameValue(baseSupport[config.key], draftSupport[config.key])) return;
			targets.push({
				sectionId: config.sectionId,
				resolve: currentDoc => getFirstVisibleElement(currentDoc, config.selectors),
				fallback: currentDoc => currentDoc.getElementById(config.sectionId),
				order: targets.length
			});
		});
	}
	function collectRestoreTargets(doc, baseline, draft) {
		const targets = [];
		collectClinicalRestoreTargets(doc, baseline, draft, targets);
		collectHistoryRestoreTargets(baseline, draft, targets);
		collectSupportRestoreTargets(baseline, draft, targets);
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
		if (!banner || !moduleState.STATE.pendingDraft) return;
		const message = banner.querySelector('[data-doctor-draft-message]');
		const messagePrefix = banner.querySelector('[data-doctor-draft-message-prefix]');
		const draftCount = banner.querySelector('[data-doctor-draft-count]');
		const messageSuffix = banner.querySelector('[data-doctor-draft-message-suffix]');
		const restore = banner.querySelector('[data-doctor-draft-action="restore"]');
		const discard = banner.querySelector('[data-doctor-draft-action="discard"]');
		const savedAt = formatTimestamp(moduleState.STATE.pendingDraft.savedAt);

		banner.hidden = false;
		banner.dataset.state = moduleState.STATE.restored ? 'restored' : 'available';
		if (messagePrefix && draftCount && messageSuffix) {
			messagePrefix.textContent = moduleState.STATE.restored ? 'Đang làm việc từ ' : 'Có ';
			draftCount.textContent = '1';
			messageSuffix.textContent = moduleState.STATE.restored
				? ' bản nháp chưa lưu.'
				: ` bản nháp chưa lưu${savedAt ? ` lúc ${savedAt}` : ''}.`;
		} else if (message) {
			message.textContent = moduleState.STATE.restored
				? 'Đang làm việc từ 1 bản nháp chưa lưu.'
				: `Có 1 bản nháp chưa lưu${savedAt ? ` lúc ${savedAt}` : ''}.`;
		}
		if (restore) restore.hidden = moduleState.STATE.restored;
		if (restore) restore.textContent = 'Khôi phục';
		if (discard) discard.hidden = false;
	}
	function restoreControlMarkers(doc, baseControls = {}, draftControls = {}) {
		Object.keys(draftControls).forEach(id => {
			if (moduleState.isTransientClinicalControlId(id) || moduleState.sameValue(baseControls[id], draftControls[id])) return;
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
	function getChangedPrescriptionControls(baseSupport = {}, draftSupport = {}) {
		const basePrescription = baseSupport.prescription || {};
		const draftPrescription = draftSupport.prescription || {};
		const reExamLocked = Boolean(getSupportModules()?.isReExaminationLocked?.());
		return moduleState.PRESCRIPTION_SETUP_CONTROLS.filter(config => {
			if (reExamLocked && moduleState.RE_EXAM_CONTROL_KEYS.includes(config.key)) return false;
			return !moduleState.sameValue(basePrescription[config.key], draftPrescription[config.key]);
		});
	}
	function restoreSupportControlMarkers(doc, baseSupport = {}, draftSupport = {}) {
		getChangedPrescriptionControls(baseSupport, draftSupport).forEach(config => {
			addRestoredControlMarker(doc.querySelector(config.selector));
		});
		const baseIndications = baseSupport.indications || {};
		const draftIndications = draftSupport.indications || {};
		if (!moduleState.sameValue(baseIndications.rows, draftIndications.rows)) {
			addRestoredControlMarker(doc.querySelector('#doctorIndicationsList .doctor-indications-table__empty, #doctorIndicationsList tr, #doctorIndicationName'));
		}
	}
	function getSupportRestoreOptions(base = {}, draft = {}) {
		const baseSupport = base || {};
		const draftSupport = draft || {};
		return {
			dirty: {
				prescription: !moduleState.sameValue(baseSupport.prescription, draftSupport.prescription),
				services: !moduleState.sameValue(baseSupport.services, draftSupport.services),
				indications: !moduleState.sameValue(baseSupport.indications, draftSupport.indications)
			},
			base: baseSupport
		};
	}
	async function restoreDraftOwners(doc, snapshotData, token) {
		const isCurrent = () => token === moduleState.STATE.contextToken;
		const workspace = getClinicalWorkspace();
		if (typeof workspace?.restoreDraftSnapshot === 'function') {
			await workspace.restoreDraftSnapshot(snapshotData.clinical || {}, { document: doc, isCurrent });
			if (!isCurrent()) return false;
		}
		const support = getSupportModules();
		if (typeof support?.restoreDraftSnapshot === 'function') {
			await support.restoreDraftSnapshot(snapshotData.support || {}, {
				document: doc,
				...getSupportRestoreOptions(moduleState.STATE.baseline.support, snapshotData.support)
			});
			if (!isCurrent()) return false;
			restoreSupportControlMarkers(doc, moduleState.STATE.baseline.support, snapshotData.support);
		}
		const history = getMedicalHistory();
		if (typeof history?.restoreDraftSnapshot === 'function') {
			await history.restoreDraftSnapshot(snapshotData.history || {}, {
				document: doc,
				dirty: !moduleState.sameValue(moduleState.STATE.baseline.history, snapshotData.history)
			});
		}
		return isCurrent();
	}
	async function applyDraft() {
		const doc = getDocument();
		const draft = moduleState.STATE.pendingDraft;
		if (!draft || !moduleState.STATE.baseline || moduleState.STATE.isRestoring) return false;
		const token = moduleState.STATE.contextToken;
		moduleState.STATE.isRestoring = true;
		moduleState.STATE.captureGeneration += 1;
		window.clearTimeout(moduleState.STATE.captureTimer);
		moduleState.STATE.captureTimer = null;
		try {
			const snapshotData = draft.snapshot || {};
			clearRestoredMarkers(doc);
			if (!await restoreDraftOwners(doc, snapshotData, token)) return false;

			restoreControlMarkers(
				doc,
				moduleState.STATE.baseline.clinical && moduleState.STATE.baseline.clinical.controls,
				snapshotData.clinical && snapshotData.clinical.controls
			);
			moduleState.STATE.restored = true;
			renderBanner(doc);
			revealRestoreTarget(doc, collectRestoreTargets(doc, moduleState.STATE.baseline, snapshotData)[0]);
			return true;
		} finally {
			if (token === moduleState.STATE.contextToken) moduleState.STATE.isRestoring = false;
		}
	}
	async function discardCurrent(options = {}) {
		const doc = getDocument(options);
		const context = moduleState.STATE.context;
		window.clearTimeout(moduleState.STATE.captureTimer);
		moduleState.STATE.captureTimer = null;
		moduleState.STATE.captureGeneration += 1;
		if (context) {
			try {
				await moduleState.deleteRecord(moduleState.draftKey(context));
			} catch (error) {
				if (typeof moduleState.STATE.showToast === 'function') moduleState.STATE.showToast('error', 'Không thể xóa bản nháp cục bộ');
				return false;
			}
		}
		moduleState.STATE.pendingDraft = null;
		const wasRestored = moduleState.STATE.restored;
		moduleState.STATE.restored = false;
		moduleState.STATE.recoveryMode = 'standard';
		moduleState.STATE.isRestoring = false;
		clearRestoredMarkers(doc);
		clearBanner(doc);
		if (wasRestored && options.reload !== false && typeof moduleState.STATE.reloadContext === 'function') {
			return moduleState.STATE.reloadContext();
		}
		return true;
	}
	async function rebaseAfterSave() {
		const doc = getDocument();
		if (!moduleState.STATE.context) return false;
		window.clearTimeout(moduleState.STATE.captureTimer);
		moduleState.STATE.captureTimer = null;
		moduleState.STATE.captureGeneration += 1;
		moduleState.STATE.baseline = snapshot();
		moduleState.STATE.pendingDraft = null;
		moduleState.STATE.restored = false;
		moduleState.STATE.recoveryMode = 'standard';
		moduleState.STATE.isRestoring = false;
		clearRestoredMarkers(doc);
		clearBanner(doc);
		try {
			await moduleState.deleteRecord(moduleState.draftKey(moduleState.STATE.context));
			return true;
		} catch (error) {
			return false;
		}
	}
	function canCaptureDraft() {
		if (!moduleState.STATE.context || !moduleState.STATE.baseline || moduleState.STATE.isRestoring || !isDirty()) return false;
		return !window.QLPKApiTransport?.session || getCurrentUserId() === moduleState.STATE.context.userId;
	}
	function buildDraftRecord(currentSnapshot) {
		const now = Date.now();
		return {
			key: moduleState.draftKey(moduleState.STATE.context),
			captureId: `${now}-${Math.random().toString(36).slice(2)}`,
			schemaVersion: moduleState.DRAFT_SCHEMA_VERSION,
			userId: moduleState.STATE.context.userId,
			appointmentId: moduleState.STATE.context.appointmentId,
			patientId: moduleState.STATE.context.patientId,
			baseSnapshot: moduleState.clone(moduleState.STATE.baseline),
			snapshot: moduleState.clone(currentSnapshot),
			recoveryMode: moduleState.STATE.recoveryMode,
			savedAt: now,
			expiresAt: now + moduleState.DRAFT_TTL_MS
		};
	}
	function captureScope() {
		const sessionOwner = window.QLPKApiTransport?.session?.owner;
		return {
			generation: moduleState.STATE.captureGeneration,
			context: moduleState.STATE.context,
			sessionOwner,
			sessionRevision: sessionOwner?.snapshot().revision,
		};
	}
	function isCaptureContextCurrent(scope) {
		return scope.generation === moduleState.STATE.captureGeneration && moduleState.STATE.context === scope.context;
	}
	function isCaptureSessionCurrent(scope, record) {
		const owner = scope.sessionOwner;
		if (!owner) return true;
		return window.QLPKApiTransport?.session?.owner === owner
			&& owner.snapshot().revision === scope.sessionRevision
			&& getCurrentUserId() === record.userId;
	}
	async function writeDraftRecord(record) {
		const writing = moduleState.writeRecord(record);
		moduleState.pendingWrites.set(writing, record.userId);
		try { await writing; } finally { moduleState.pendingWrites.delete(writing); }
	}

	Object.assign(moduleParts, {
		getDocument,
		getCurrentUserId,
		getClinicalWorkspace,
		getSupportModules,
		getMedicalHistory,
		isDirty,
		snapshot,
		getBanner,
		clearRestoredMarkers,
		getClinicalWorkspaceUi,
		getHistoryWorkbenchActions,
		getFirstVisibleElement,
		getFirstFocusableElement,
		markRestoreFocus,
		getVisibleClinicalTarget,
		collectClinicalRestoreTargets,
		collectHistoryRestoreTargets,
		collectSupportRestoreTargets,
		collectRestoreTargets,
		activateHistoryTarget,
		revealRestoreTarget,
		clearBanner,
		formatTimestamp,
		renderBanner,
		restoreControlMarkers,
		addRestoredControlMarker,
		getChangedPrescriptionControls,
		restoreSupportControlMarkers,
		getSupportRestoreOptions,
		restoreDraftOwners,
		applyDraft,
		discardCurrent,
		rebaseAfterSave,
		canCaptureDraft,
		buildDraftRecord,
		captureScope,
		isCaptureContextCurrent,
		isCaptureSessionCurrent,
		writeDraftRecord
	});
})(window, document);
