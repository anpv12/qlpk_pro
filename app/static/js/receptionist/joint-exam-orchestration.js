(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getBootstrap(options) {
		return options && options.bootstrap ? options.bootstrap : window.bootstrap;
	}

	function getJointExamManagerClass(options) {
		return options && options.JointExamManager ? options.JointExamManager : window.JointExamManager;
	}

	function createManager(currentInstance, options) {
		if (currentInstance) return currentInstance;

		const JointExamManager = getJointExamManagerClass(options);
		if (!JointExamManager) return null;

		const opts = options || {};
		const instance = new JointExamManager({
			getAppointmentId: opts.getAppointmentId,
			getContextToken: opts.getContextToken,
			onReloadFamilyMembers: opts.onReloadFamilyMembers,
			showToast: opts.showToast,
			apiCall: opts.apiCall,
			formatDateDisplay: opts.formatDateDisplay
		});

		instance.init();
		window.jointExamManagerInstance = instance;
		return instance;
	}

	async function loadList(instance) {
		if (instance) {
			await instance.load();
		}
	}

	function showCreateRow(instance) {
		if (instance) {
			instance.showCreateRow();
		}
	}

	async function savePendingList(instance, appointmentId, options = {}) {
		if (instance) {
			return instance.savePendingList(appointmentId, options);
		}
		return { status: 'saved' };
	}

	function clearPendingList(instance) {
		if (instance) {
			instance.clearPendingList();
		}
	}

	function cleanupPendingRow(instance) {
		if (instance && instance.pendingJointExamRow) {
			instance.pendingJointExamRow.remove();
			instance.pendingJointExamRow = null;
		}
	}

	async function openModal(instance, options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const bootstrapApi = getBootstrap(opts);
		const modalElement = doc.getElementById('jointExamModal');

		if (modalElement && bootstrapApi && bootstrapApi.Modal) {
			const modal = new bootstrapApi.Modal(modalElement);
			modal.show();
		}

		await loadList(instance);
	}

	function bindModalControls(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const getManager = opts.getManager || function () { return null; };
		const openButton = doc.getElementById('jointExamEditBtn');
		const modalElement = doc.getElementById('jointExamModal');

		if (openButton && !openButton._receptionistJointExamBound) {
			openButton.addEventListener('click', function () {
				openModal(getManager(), opts);
			});
			openButton._receptionistJointExamBound = true;
		}

		if (modalElement && !modalElement._receptionistJointExamCleanupBound) {
			modalElement.addEventListener('hidden.bs.modal', function () {
				cleanupPendingRow(getManager());
			});
			modalElement._receptionistJointExamCleanupBound = true;
		}
	}

	function bindInitialLoad(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const run = function () {
			const currentInstance = typeof opts.getInstance === 'function' ? opts.getInstance() : null;
			const instance = createManager(currentInstance, opts);
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

	window.ReceptionistJointExamOrchestration = {
		createManager,
		bindInitialLoad,
		bindModalControls,
		openModal,
		loadList,
		showCreateRow,
		savePendingList,
		clearPendingList,
		cleanupPendingRow
	};
})(window);
