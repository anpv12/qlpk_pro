import { QLPKPatientInfoForm } from './patient-info-form.js';
import { QLPKPatientVisitInfoForm } from './patient-visit-info-form.js';
import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

const DEFAULT_CONFIG = {
	id: 'patient-intake',
	patient: { layoutMode: 'receptionist', rootId: '', strictRoot: false },
	visit: { layoutMode: 'receptionist', rootId: '', strictRoot: false },
	relatives: { ariaLabel: 'Người thân liên kết' },
	documents: {
		sectionId: 'patientDocumentsSection',
		headingId: 'patientDocumentsSectionHeading',
		title: 'Danh sách tập tin đính kèm'
	}
};

function mergeConfig(config = {}) {
	return {
		...DEFAULT_CONFIG,
		...config,
		patient: { ...DEFAULT_CONFIG.patient, ...(config.patient || {}) },
		visit: { ...DEFAULT_CONFIG.visit, ...(config.visit || {}) },
		relatives: { ...DEFAULT_CONFIG.relatives, ...(config.relatives || {}) },
		documents: { ...DEFAULT_CONFIG.documents, ...(config.documents || {}) }
	};
}

function resolveSubForm(factory, subConfig) {
	return factory && typeof factory.create === 'function'
		? factory.create({ config: subConfig })
		: factory;
}

function create(options = {}) {
	let config = mergeConfig(options.config);
	let contextToken = 0;
	const patientInfo = options.patientInfo || resolveSubForm(QLPKPatientInfoForm, config.patient);
	const patientVisit = options.patientVisit || resolveSubForm(QLPKPatientVisitInfoForm, config.visit);

	function ensureComponents() {
		if (!patientInfo || typeof patientInfo.populate !== 'function' || typeof patientInfo.collect !== 'function') {
			throw new Error('Thiếu component thông tin bệnh nhân');
		}
		if (!patientVisit || typeof patientVisit.populate !== 'function' || typeof patientVisit.collect !== 'function') {
			throw new Error('Thiếu component thông tin hỏi bệnh');
		}
	}

	function bind(bindOptions = {}) {
		ensureComponents();
		config = mergeConfig(bindOptions.config || config);
		patientInfo.bind({ ...bindOptions, document: bindOptions.document || document });
		patientVisit.bind({ ...bindOptions, document: bindOptions.document || document });
		return true;
	}

	function clear(clearOptions = {}) {
		contextToken += 1;
		ensureComponents();
		const doc = clearOptions.document || document;
		patientInfo.clear({ document: doc });
		patientVisit.clear({ document: doc });
	}

	function populate(payload = {}, populateOptions = {}) {
		ensureComponents();
		const token = ++contextToken;
		const isCurrentLoad = () => token === contextToken && populateOptions.isCurrentLoad?.() !== false;
		const doc = populateOptions.document || document;
		const optionsForPatient = {
			...populateOptions,
			isCurrentLoad,
			document: doc
		};
		if (!isCurrentLoad()) return false;
		const populateVisit = patientResult => {
			if (!isCurrentLoad() || patientResult === false) return false;
			const visitResult = patientVisit.populate(payload, { document: doc });
			return visitResult === false ? false : payload;
		};
		const patientResult = patientInfo.populate(payload, optionsForPatient);
		if (patientResult && typeof patientResult.then === 'function') {
			return patientResult.then(populateVisit, error => {
				if (!isCurrentLoad()) return false;
				throw error;
			});
		}
		return populateVisit(patientResult);
	}

	function collect(collectOptions = {}) {
		ensureComponents();
		const doc = collectOptions.document || document;
		return {
			...patientInfo.collect({ document: doc }),
			...patientVisit.collect({ document: doc })
		};
	}

	function updatePregnancyControls(controlOptions = {}) {
		if (patientInfo && typeof patientInfo.updatePregnancyControls === 'function') {
			return patientInfo.updatePregnancyControls(controlOptions);
		}
		return false;
	}

	return {
		bind,
		clear,
		populate,
		collect,
		updatePregnancyControls,
		getConfig: () => mergeConfig(config)
	};
}

const instance = create();
const api = {
	...instance,
	create,
	defaults: mergeConfig()
};
export const QLPKPatientIntakeForm = api;
QLPKDoctorModuleRegistry.register('patientIntakeForm', api);
