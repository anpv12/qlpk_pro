(function (window, document) {
	'use strict';

	const VISIT_FIELD_IDS = [
		'mainReason',
		'problemStartTime',
		'severityLevel',
		'symptomProgression',
		'mainSymptoms',
		'currentBehavior',
		'notes',
		'referralSource'
	];

	const DEFAULT_CONFIG = {
		rootId: '',
		strictRoot: false,
		fields: {}
	};

	function mergeConfig(config = {}) {
		return {
			...DEFAULT_CONFIG,
			...config,
			fields: { ...DEFAULT_CONFIG.fields, ...(config.fields || {}) }
		};
	}

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function valueOf(...values) {
		for (const value of values) {
			if (value !== undefined && value !== null && String(value).trim() !== '') {
				return String(value);
			}
		}
		return '';
	}

	function setValue(doc, elementId, value) {
		const element = doc.getElementById(elementId);
		if (!element) return false;
		if (elementId === 'referralSource' && window.ReferralSourceControl && typeof window.ReferralSourceControl.setValue === 'function') {
			return window.ReferralSourceControl.setValue(value || '', { document: doc });
		}
		element.value = value == null ? '' : String(value);
		return true;
	}

	function getValue(doc, elementId) {
		if (elementId === 'referralSource' && window.ReferralSourceControl && typeof window.ReferralSourceControl.getValue === 'function') {
			if (!doc.getElementById(elementId)) return '';
			return window.ReferralSourceControl.getValue({ document: doc }) || '';
		}
		const element = doc.getElementById(elementId);
		return element ? String(element.value || '').trim() : '';
	}

	function hasElement(doc, elementId) {
		return Boolean(doc.getElementById(elementId));
	}

	function normalizeSeverityValue(value) {
		const raw = valueOf(value);
		const map = {
			low: 'Nhẹ',
			medium: 'Trung bình',
			high: 'Nặng',
			urgent: 'Rất nặng'
		};
		return map[raw] || raw;
	}

	function normalizePayload(payload = {}) {
		return {
			appointment: payload.appointment || {},
			patient: payload.patient_info || {},
			examination: payload.examination_info || {}
		};
	}

	function clear(options = {}) {
		const doc = getDocument(options);
		VISIT_FIELD_IDS.forEach(fieldId => setValue(doc, fieldId, ''));
	}

	function populate(payload = {}, options = {}) {
		const doc = getDocument(options);
		const data = normalizePayload(payload);

		setValue(doc, 'mainReason', valueOf(data.examination.main_reason));
		setValue(doc, 'mainSymptoms', valueOf(data.examination.main_symptoms));
		setValue(doc, 'problemStartTime', valueOf(data.patient.problem_start_time));
		setValue(doc, 'severityLevel', normalizeSeverityValue(data.patient.severity_level));
		setValue(doc, 'symptomProgression', valueOf(data.patient.symptom_progression));
		setValue(doc, 'currentBehavior', valueOf(data.patient.current_behavior));
		setValue(doc, 'notes', valueOf(data.appointment.notes));
		setValue(doc, 'referralSource', valueOf(data.patient.referral_source));
		return true;
	}

	function collect(options = {}) {
		const doc = getDocument(options);
		const payload = {
			main_reason: getValue(doc, 'mainReason'),
			problem_start_time: getValue(doc, 'problemStartTime'),
			severity_level: getValue(doc, 'severityLevel'),
			symptom_progression: getValue(doc, 'symptomProgression'),
			main_symptoms: getValue(doc, 'mainSymptoms'),
			current_behavior: getValue(doc, 'currentBehavior')
		};
		if (hasElement(doc, 'notes')) payload.notes = getValue(doc, 'notes');
		if (hasElement(doc, 'referralSource')) payload.referral_source = getValue(doc, 'referralSource');
		return payload;
	}

	function bind(options = {}) {
		const doc = getDocument(options);
		if (window.ReferralSourceControl && typeof window.ReferralSourceControl.bind === 'function') {
			window.ReferralSourceControl.bind({ document: doc });
		}
	}

	function getScopedDocument(options = {}) {
		const config = mergeConfig(options.config);
		if (options.context?.getDocument && config.rootId) {
			return options.context.getDocument({
				rootId: config.rootId,
				strictRoot: config.strictRoot,
				fields: config.fields
			});
		}
		const scope = window.QLPKComponentDomScope;
		if (!scope || typeof scope.create !== 'function') return getDocument(options);
		return scope.create({
			document: getDocument(options),
			rootId: config.rootId,
			strictRoot: config.strictRoot,
			fields: config.fields
		});
	}

	function create(options = {}) {
		const config = mergeConfig(options.config);
		const invoke = (handler, callOptions = {}) => handler({
			...options,
			...callOptions,
			document: getScopedDocument({ ...options, ...callOptions, config })
		});
		return {
			bind: callOptions => invoke(bind, callOptions),
			clear: callOptions => invoke(clear, callOptions),
			populate: (payload, callOptions = {}) => populate(payload, {
				...options,
				...callOptions,
				document: getScopedDocument({ ...options, ...callOptions, config })
			}),
			collect: callOptions => collect({
				...options,
				...(callOptions || {}),
				document: getScopedDocument({ ...options, ...(callOptions || {}), config })
			}),
			getConfig: () => mergeConfig(config)
		};
	}

	const defaultInstance = create();
	const api = {
		...defaultInstance,
		create,
		normalizePayload,
		defaults: mergeConfig()
	};
	window.QLPKPatientVisitInfoForm = api;
	window.QLPKDoctorModuleRegistry?.register?.('patientVisitInfoForm', api);
})(window, document);
