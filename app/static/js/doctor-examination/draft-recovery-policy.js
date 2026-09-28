(function (window) {
	'use strict';

	const DRAFT_SCHEMA_VERSION = 1;

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

	window.QLPKDoctorModuleRegistry.register('draftRecoveryPolicy', Object.freeze({
		DRAFT_SCHEMA_VERSION,
		clone,
		isTransientClinicalControlId,
		normalizeDraftForComparison,
		sameValue,
		mergeFailedSaveDraft,
		classifyDraftRecord,
		resolveDraftRecord
	}), { owner: 'doctor/draft-recovery' });
})(window);
