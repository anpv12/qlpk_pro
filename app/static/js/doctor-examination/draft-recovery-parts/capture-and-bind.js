import { moduleState } from './state.js';
import { applyDraft, buildDraftRecord, canCaptureDraft, captureScope, clearBanner, clearRestoredMarkers, discardCurrent, getBanner, getCurrentUserId, getDocument, isCaptureContextCurrent, isCaptureSessionCurrent, rebaseAfterSave, renderBanner, snapshot, writeDraftRecord } from './snapshot.js';

async function captureDraft(options = {}) {
	window.clearTimeout(moduleState.STATE.captureTimer);
	moduleState.STATE.captureTimer = null;
	moduleState.STATE.captureGeneration += 1;
	if (!canCaptureDraft()) return false;
	const scope = captureScope();
	if (options.recoveryMode === 'failed-save') moduleState.STATE.recoveryMode = 'failed-save';
	const currentSnapshot = snapshot();
	if (moduleState.sameValue(moduleState.STATE.baseline, currentSnapshot)) {
		return rebaseAfterSave();
	}
	const record = buildDraftRecord(currentSnapshot);
	try {
		await writeDraftRecord(record);
		const isCurrentCapture = isCaptureContextCurrent(scope)
			&& record.key === moduleState.draftKey(moduleState.STATE.context)
			&& isCaptureSessionCurrent(scope, record);
		if (!isCurrentCapture) {
			await moduleState.deleteRecordIfMatches(record);
			return false;
		}
		moduleState.STATE.pendingDraft = record;
		return true;
	} catch (error) {
		if (isCaptureContextCurrent(scope) && !options.silent && typeof moduleState.STATE.showToast === 'function') {
			moduleState.STATE.showToast('error', 'Không thể lưu bản nháp phục hồi trên thiết bị này');
		}
		return false;
	}
}
function queueCapture() {
	if (!moduleState.STATE.context || moduleState.STATE.isRestoring) return;
	window.clearTimeout(moduleState.STATE.captureTimer);
	moduleState.STATE.captureGeneration += 1;
	moduleState.STATE.captureTimer = window.setTimeout(() => captureDraft(), moduleState.CAPTURE_DELAY_MS);
}
async function setContext(context = {}) {
	const doc = getDocument(context);
	const appointmentId = moduleState.normalizeId(context.appointmentId);
	const patientId = moduleState.normalizeId(context.patientId);
	const userId = window.QLPKApiTransport?.session ? getCurrentUserId() : moduleState.normalizeId(context.userId) || getCurrentUserId();
	window.clearTimeout(moduleState.STATE.captureTimer);
	moduleState.STATE.captureTimer = null;
	moduleState.STATE.captureGeneration += 1;
	const token = moduleState.STATE.contextToken + 1;
	moduleState.STATE.contextToken = token;
	moduleState.STATE.context = null;
	moduleState.STATE.baseline = null;
	moduleState.STATE.pendingDraft = null;
	moduleState.STATE.restored = false;
	moduleState.STATE.recoveryMode = 'standard';
	moduleState.STATE.isRestoring = false;
	clearRestoredMarkers(doc);
	clearBanner(doc);
	if (!appointmentId || !patientId || !userId) return false;

	moduleState.STATE.context = { appointmentId, patientId, userId };
	moduleState.STATE.baseline = snapshot();
	try {
		await moduleState.purgeExpiredRecords();
		const record = await moduleState.readRecord(moduleState.draftKey(moduleState.STATE.context));
		if (token !== moduleState.STATE.contextToken || !record) return false;
		const resolution = moduleState.resolveDraftRecord(record, moduleState.STATE.context, moduleState.STATE.baseline);
		if (resolution.action === 'delete') {
			await moduleState.deleteRecordIfMatches(record);
			return false;
		}
		const pendingRecord = resolution.record;
		if (resolution.action === 'replace') {
			const replaced = await moduleState.replaceRecordIfMatches(record, pendingRecord);
			if (!replaced || token !== moduleState.STATE.contextToken) return false;
		}
		moduleState.STATE.pendingDraft = pendingRecord;
		moduleState.STATE.recoveryMode = 'standard';
		renderBanner(doc);
		return true;
	} catch (error) {
		return false;
	}
}
function clearContext(options = {}) {
	window.clearTimeout(moduleState.STATE.captureTimer);
	moduleState.STATE.captureTimer = null;
	moduleState.STATE.contextToken += 1;
	moduleState.STATE.captureGeneration += 1;
	moduleState.STATE.context = null;
	moduleState.STATE.baseline = null;
	moduleState.STATE.pendingDraft = null;
	moduleState.STATE.restored = false;
	moduleState.STATE.recoveryMode = 'standard';
	moduleState.STATE.isRestoring = false;
	const doc = getDocument(options);
	clearRestoredMarkers(doc);
	clearBanner(doc);
}
function bind(options = {}) {
	const doc = getDocument(options);
	moduleState.STATE.document = doc;
	moduleState.STATE.showToast = options.showToast || moduleState.STATE.showToast;
	moduleState.STATE.reloadContext = options.reloadContext || moduleState.STATE.reloadContext;
	const workspace = doc.getElementById('doctorClinicalWorkspace');
	if (!workspace || moduleState.STATE.bound) return Boolean(workspace);

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
	doc.addEventListener('qlpk:logout:confirmed', event => {
		const cleanup = clearCurrentUserDrafts(event.detail);
		if (Array.isArray(event.detail?.pendingCleanup)) event.detail.pendingCleanup.push(cleanup);
	});
	moduleState.STATE.bound = true;
	return true;
}
async function clearCurrentUserDrafts(confirmation) {
	const userId = confirmation?.confirmed === true ? moduleState.normalizeId(confirmation.userId) : getCurrentUserId();
	if (!userId) return false;
	if (moduleState.STATE.context?.userId === userId) clearContext();
	try {
		await Promise.allSettled(Array.from(moduleState.pendingWrites).filter(([, ownerId]) => ownerId === userId).map(([writing]) => writing));
		await moduleState.deleteUserRecords(userId);
		return true;
	} catch (error) {
		return false;
	}
}

export { bind, captureDraft, clearContext, clearCurrentUserDrafts, queueCapture, setContext };
