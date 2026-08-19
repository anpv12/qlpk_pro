(function (window) {
	'use strict';

	const FIELD_IDS = [
		'mainReason',
		'problemStartTime',
		'symptomProgression',
		'mainSymptoms',
		'currentBehavior',
		'severityLevel'
	];

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getSessionStorage(options) {
		return options && options.sessionStorage ? options.sessionStorage : window.sessionStorage;
	}

	function getPageLoadId(options) {
		const storage = getSessionStorage(options);
		return storage.getItem(options.pageLoadIdKey) || String(Date.now());
	}

	function readFields(options) {
		const doc = getDocument(options);
		return FIELD_IDS.reduce((data, id) => {
			data[id] = doc.getElementById(id)?.value || '';
			return data;
		}, {});
	}

	function applyFields(data, options) {
		const doc = getDocument(options);
		FIELD_IDS.forEach(id => {
			const element = doc.getElementById(id);
			if (element) {
				element.value = data && data[id] ? data[id] : '';
			}
		});
	}

	function saveDraft(options) {
		const opts = options || {};
		const data = readFields(opts);
		const loadId = getPageLoadId(opts);
		const payload = Object.assign({}, data, { loadId });
		try {
			getSessionStorage(opts).setItem(opts.draftKey, JSON.stringify(payload));
		} catch (e) { }

		return data;
	}

	function loadDraft(options) {
		const opts = options || {};
		const storage = getSessionStorage(opts);
		let raw = null;
		let data = null;
		let loadId = null;
		let hasValidDraft = false;

		raw = storage.getItem(opts.draftKey);
		loadId = storage.getItem(opts.pageLoadIdKey);

		if (raw) {
			data = JSON.parse(raw);
			hasValidDraft = !data.loadId || data.loadId === loadId;
			if (hasValidDraft) {
				applyFields(data, opts);
			}
		}

		return { raw, data, loadId, hasValidDraft };
	}

	function bindAutoSave(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		FIELD_IDS.forEach(id => {
			const element = doc.getElementById(id);
			if (element && !element._draftBound) {
				element.addEventListener('input', () => {
					try {
						saveDraft(opts);
					} catch (e) { }
				});
				element._draftBound = true;
			}
		});
	}

	window.ReceptionistMedicalInfoDraft = {
		FIELD_IDS,
		readFields,
		applyFields,
		saveDraft,
		loadDraft,
		bindAutoSave
	};
})(window);
