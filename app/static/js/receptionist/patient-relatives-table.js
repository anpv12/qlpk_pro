import { RelativeTableManager } from '../relative-table.js';

(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getRelativeTableManager(options) {
		return options && options.RelativeTableManager ? options.RelativeTableManager : RelativeTableManager;
	}

	function getRelativeContainer(options) {
		const doc = getDocument(options);
		return doc.querySelector('.relative-table-component');
	}

	function ensureRelativeTable(currentInstance, options) {
		if (currentInstance) return currentInstance;

		const relativeContainer = getRelativeContainer(options);
		const relativeTableManager = getRelativeTableManager(options);
		if (relativeContainer && relativeTableManager) {
			return relativeTableManager.init(relativeContainer, {
				readOnly: false,
				enablePatientLinks: false
			});
		}

		return currentInstance || null;
	}

	function syncPatient(currentInstance, patientId, options) {
		const opts = options || {};
		const instance = ensureRelativeTable(currentInstance, opts);
		if (!instance) return null;

		instance.setPatientId(patientId);
		if (opts.syncAppointmentDate) {
			instance.setCurrentAppointmentDate(opts.appointmentDate || null);
		}

		return instance;
	}

	function clear(currentInstance) {
		if (currentInstance) {
			currentInstance.clear();
		}
		return currentInstance || null;
	}

	function initialize(currentInstance, options) {
		const opts = options || {};
		const instance = ensureRelativeTable(currentInstance, opts);

		if (!instance && getRelativeContainer(opts) && !getRelativeTableManager(opts) && opts.retry) {
			setTimeout(opts.retry, 100);
		}

		return instance;
	}

	function bindInitialLoad(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const run = function () {
			const currentInstance = typeof opts.getInstance === 'function' ? opts.getInstance() : null;
			const instance = initialize(currentInstance, Object.assign({}, opts, { retry: run }));
			if (typeof opts.setInstance === 'function') {
				opts.setInstance(instance);
			}
		};

		if (doc.readyState === 'loading') {
			doc.addEventListener('DOMContentLoaded', run);
		} else {
			run();
		}
	}

	window.ReceptionistPatientRelativesTable = Object.freeze({
		ensureRelativeTable,
		syncPatient,
		clear,
		initialize,
		bindInitialLoad
	});
	window.QLPKDoctorModuleRegistry?.register?.('patientRelativesTable', window.ReceptionistPatientRelativesTable);
})(window);
