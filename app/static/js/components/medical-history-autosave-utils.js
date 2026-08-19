(function (window) {
	'use strict';

	function buildMedicalHistoryUpdatePayload(fieldName, value, options = {}) {
		const updateData = {};
		const arrayFieldNames = options.arrayFieldNames || [];
		const arrayFieldSet = new Set(arrayFieldNames);

		if (fieldName === 'main_reason') {
			updateData.main_reason = value || '';
		} else if (fieldName === 'main_symptoms') {
			updateData[fieldName] = value || '';
		} else if (arrayFieldSet.has(fieldName)) {
			updateData[fieldName] = Array.isArray(value) ? value : [];
		} else {
			updateData[fieldName] = value || '';
		}

		return updateData;
	}

	function createMedicalHistoryAutosaveAdapter(options = {}) {
		const timers = {};
		const pendingFields = {};
		const inFlight = new Set();
		const targetWindow = options.window || window;
		const logger = options.console || targetWindow.console;
		const setTimeoutFn = options.setTimeout || targetWindow.setTimeout.bind(targetWindow);
		const clearTimeoutFn = options.clearTimeout || targetWindow.clearTimeout.bind(targetWindow);
		const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 600;

		function shouldSkipSave() {
			return typeof options.shouldSkipSave === 'function' && options.shouldSkipSave();
		}

		function getAppointmentId() {
			return typeof options.getCurrentAppointmentId === 'function'
				? options.getCurrentAppointmentId()
				: options.currentAppointmentId;
		}

		function showIndicator(status) {
			if (typeof options.showAutoSaveIndicator === 'function') {
				options.showAutoSaveIndicator(status);
			}
		}

		function clearTimers() {
			Object.keys(timers).forEach(fieldName => {
				clearTimeoutFn(timers[fieldName]);
				delete timers[fieldName];
			});
			Object.keys(pendingFields).forEach(fieldName => delete pendingFields[fieldName]);
		}

		function hasPendingChanges() {
			return Boolean(Object.keys(pendingFields).length || inFlight.size);
		}

		function persistField(fieldName) {
			const pending = pendingFields[fieldName];
			if (!pending) return Promise.resolve({ status: 'skipped' });
			clearTimeoutFn(timers[fieldName]);
			delete timers[fieldName];
			delete pendingFields[fieldName];
			if (shouldSkipSave()) return Promise.resolve({ status: 'skipped' });
			if (!pending.appointmentId || getAppointmentId() !== pending.appointmentId) {
				return Promise.resolve({ status: 'stale' });
			}

			const task = (async () => {
				try {
					showIndicator('saving');
					const response = await options.apiCall(`/api/appointments/${pending.appointmentId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(buildMedicalHistoryUpdatePayload(pending.fieldName, pending.value, {
							arrayFieldNames: options.arrayFieldNames
						}))
					});

					if (getAppointmentId() !== pending.appointmentId) return { status: 'stale' };
					if (!response || !response.ok) {
						const responseText = response && typeof response.text === 'function' ? await response.text() : '';
						throw new Error(responseText || `Không lưu được trường ${pending.fieldName}`);
					}

					showIndicator('success');
					if (typeof options.syncMedicalHistoryToHiddenFields === 'function') {
						options.syncMedicalHistoryToHiddenFields();
					}
					return { status: 'success', fieldName: pending.fieldName };
				} catch (error) {
					if (logger && typeof logger.error === 'function') {
						logger.error(`Không lưu được tiền sử ${pending.fieldName}:`, error);
					}
					showIndicator('error');
					throw error;
				}
			})();
			inFlight.add(task);
			task.then(
				() => inFlight.delete(task),
				() => inFlight.delete(task)
			);
			return task;
		}

		function autoSaveField(fieldId, fieldName, value) {
			if (shouldSkipSave()) return { status: 'skipped' };

			const appointmentId = getAppointmentId();
			if (!appointmentId) return { status: 'missingAppointment' };

			clearTimeoutFn(timers[fieldName]);
			pendingFields[fieldName] = { fieldId, fieldName, value, appointmentId };
			timers[fieldName] = setTimeoutFn(() => {
				persistField(fieldName).catch(() => {});
			}, debounceMs);

			return { status: 'scheduled', appointmentId, fieldId, fieldName };
		}

		async function flushPendingChanges() {
			const pendingTasks = Object.keys(pendingFields).map(fieldName => persistField(fieldName));
			const activeTasks = Array.from(inFlight);
			if (!pendingTasks.length && !activeTasks.length) return { status: 'skipped', reason: 'clean' };
			const results = await Promise.all([...new Set([...pendingTasks, ...activeTasks])]);
			return { status: 'success', results };
		}

		return {
			autoSaveField,
			clearTimers,
			hasPendingChanges,
			flushPendingChanges
		};
	}

	window.ClinicalMedicalHistoryAutosaveUtils = {
		buildMedicalHistoryUpdatePayload,
		createMedicalHistoryAutosaveAdapter
	};
})(window);
