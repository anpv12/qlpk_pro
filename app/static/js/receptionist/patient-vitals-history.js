const vitalLoads = new WeakMap();

const DEFAULT_FIELDS = [
	{ elId: 'prevBreathing', key: 'breathing' },
	{ elId: 'prevPulse', key: 'pulse' },
	{ elId: 'prevBloodPressure', key: 'blood_pressure' },
	{ elId: 'prevTemperature', key: 'temperature' },
	{ elId: 'prevWeight', key: 'weight' },
	{ elId: 'prevHeight', key: 'height' },
	{ elId: 'prevBmi', key: 'bmi' }
];

function getDocument(options) {
	return options && options.document ? options.document : window.document;
}

function getApiCall(options) {
	return options?.apiCall;
}

function isValidHintValue(value) {
	return value !== null && value !== undefined && value !== 0 && value !== '' && value !== '0';
}

function formatVitalDate(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	const day = String(date.getDate()).padStart(2, '0');
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
	}

	function getVitalDate(examination) {
	return formatVitalDate(examination && (examination.examination_date || examination.appointment_date));
}

function buildVitalHintText(value, examination) {
	const dateText = getVitalDate(examination);
	if (dateText) {
		return `Đo gần nhất ngày ${dateText}: ${value}`;
		}
		return `Đo gần nhất: ${value}`;
	}

	function resetVitalsHints(options) {
	const opts = options || {};
	const doc = getDocument(opts);
	vitalLoads.set(doc, {});
	const fields = opts.fields || DEFAULT_FIELDS;

	fields.forEach(function (field) {
		const element = doc.getElementById(field.elId);
		if (element) {
			element.textContent = '';
		}
	});
}

function renderVitalsHints(examinations, options) {
	const opts = options || {};
	const doc = getDocument(opts);
	const fields = opts.fields || DEFAULT_FIELDS;

	fields.forEach(function (field) {
		const element = doc.getElementById(field.elId);
		if (!element) return;

		for (const examination of examinations || []) {
			const value = examination[field.key];
			if (isValidHintValue(value)) {
				element.textContent = buildVitalHintText(value, examination);
				break;
			}
		}
	});
}

async function loadPreviousVitals(patientId, options) {
	const opts = options || {};
	const apiCall = getApiCall(opts);

	resetVitalsHints(opts);
	const doc = getDocument(opts);
	const requestToken = vitalLoads.get(doc);
	const contextToken = opts.getContextToken?.();
	const isCurrentContext = () => vitalLoads.get(doc) === requestToken
		&& contextToken === opts.getContextToken?.()
		&& (!opts.getCurrentPatientId || patientId === opts.getCurrentPatientId());

	if (!patientId || !apiCall) return;

	try {
		const response = await apiCall(`/api/patients/${patientId}/examinations?limit=10`);
			if (!isCurrentContext() || !response.ok) return;

		const data = await response.json();
		if (!isCurrentContext()) return;
		renderVitalsHints(data.examinations || [], opts);
	} catch (error) {
		if (!isCurrentContext()) return;
		console.warn('Error loading previous vitals:', error);
	}
}

export const ReceptionistPatientVitalsHistory = {
	loadPreviousVitals,
	renderVitalsHints,
	resetVitalsHints,
	isValidHintValue,
	formatVitalDate,
	buildVitalHintText
};
