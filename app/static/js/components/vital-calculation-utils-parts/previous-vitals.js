import { moduleState } from './state.js';
import { getDocument } from './bmi-and-age.js';

function resetPreviousVitalHints(options = {}) {
	const doc = getDocument(options);
	moduleState.PREVIOUS_VITAL_FIELDS.forEach(field => {
		const el = doc.getElementById(field.elId);
		if (el) {
			el.style.display = 'none';
			el.textContent = '';
		}
	});
}
function hasPreviousVitalValue(value) {
	return value !== null && value !== undefined && value !== 0 && value !== '' && value !== '0';
}
function applyPreviousVitals(examinations, options = {}) {
	const doc = getDocument(options);
	const currentAppointmentId = typeof options.getCurrentAppointmentId === 'function'
		? options.getCurrentAppointmentId()
		: options.currentAppointmentId;
	const source = Array.isArray(examinations) ? examinations : [];
	const filtered = source.filter(exam => exam.appointment_id !== currentAppointmentId);

	moduleState.PREVIOUS_VITAL_FIELDS.forEach(field => {
		const el = doc.getElementById(field.elId);
		if (!el) return;
		for (const exam of filtered) {
			const value = exam[field.key];
			if (hasPreviousVitalValue(value)) {
				el.textContent = `Last: ${value}`;
				el.style.display = 'block';
				if (field.key === 'bmi' && typeof options.onLastBmi === 'function') {
					options.onLastBmi(value);
				}
				break;
			}
		}
	});
}
async function loadPreviousVitals(patientId, options = {}) {
	const logger = options.console || window.console;
	const isCurrentLoad = typeof options.isCurrentLoad === 'function'
		? options.isCurrentLoad
		: () => true;

	resetPreviousVitalHints(options);
	if (typeof options.onReset === 'function') {
		options.onReset();
	}

	if (!patientId) return;
	try {
		const response = await options.apiCall(`/api/patients/${patientId}/examinations?limit=10`);
		if (!isCurrentLoad()) return;
		if (!response.ok) return;

		const data = await response.json();
		if (!isCurrentLoad()) return;
		applyPreviousVitals(data.examinations || [], options);
		if (typeof options.onLoaded === 'function') {
			options.onLoaded();
		}
	} catch (error) {
		if (!isCurrentLoad()) return;
		if (logger && typeof logger.warn === 'function') {
			logger.warn('Error loading previous vitals:', error);
		}
	}
}
function createPreviousVitalsLoader(options = {}) {
	function resolveIsCurrentLoad(context) {
		if (typeof options.getIsCurrentLoad === 'function') {
			return () => options.getIsCurrentLoad(context);
		}
		return typeof options.isCurrentLoad === 'function' ? options.isCurrentLoad : undefined;
	}

	function load(patientId, context = null) {
		return loadPreviousVitals(patientId, {
			document: options.document,
			apiCall: options.apiCall,
			console: options.console,
			isCurrentLoad: resolveIsCurrentLoad(context),
			getCurrentAppointmentId: options.getCurrentAppointmentId,
			onReset: options.onReset,
			onLastBmi: options.onLastBmi,
			onLoaded: options.onLoaded
		});
	}

	return { loadPreviousVitals: load };
}
function initVitalSignsTab(options = {}) {
	const doc = getDocument(options);
	const vitalSignsTab = doc.getElementById('vital-signs-tab');
	if (vitalSignsTab) {
		vitalSignsTab.addEventListener('shown.bs.tab', function () {
			setTimeout(() => {
				const chart = typeof options.getChart === 'function' ? options.getChart() : null;
				if (chart) {
					chart.resize();
				}
			}, 100);
		});
	}
}

export { applyPreviousVitals, createPreviousVitalsLoader, hasPreviousVitalValue, initVitalSignsTab, loadPreviousVitals, resetPreviousVitalHints };
