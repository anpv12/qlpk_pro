(function (window, document) {
	'use strict';

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

	function create(options = {}) {
		let config = mergeConfig(options.config);
		const patientInfo = options.patientInfo || (
			window.QLPKPatientInfoForm && typeof window.QLPKPatientInfoForm.create === 'function'
				? window.QLPKPatientInfoForm.create({ config: config.patient })
				: window.QLPKPatientInfoForm
		);
		const patientVisit = options.patientVisit || (
			window.QLPKPatientVisitInfoForm && typeof window.QLPKPatientVisitInfoForm.create === 'function'
				? window.QLPKPatientVisitInfoForm.create({ config: config.visit })
				: window.QLPKPatientVisitInfoForm
		);

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
			ensureComponents();
			const doc = clearOptions.document || document;
			patientInfo.clear({ document: doc });
			patientVisit.clear({ document: doc });
		}

		function populate(payload = {}, populateOptions = {}) {
			ensureComponents();
			const doc = populateOptions.document || document;
			const optionsForPatient = {
				...populateOptions,
				document: doc
			};
			const patientResult = patientInfo.populate(payload, optionsForPatient);
			if (patientResult && typeof patientResult.then === 'function') {
				return patientResult.then(() => {
					patientVisit.populate(payload, { document: doc });
					return payload;
				});
			}
			patientVisit.populate(payload, { document: doc });
			return payload;
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
	window.QLPKPatientIntakeForm = api;
	window.QLPKDoctorModuleRegistry?.register?.('patientIntakeForm', api);
})(window, document);
