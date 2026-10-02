function installClinicalForm3(ctx) {
	function parseMedicationText(raw) {
		const value = ctx.textOf(raw);
		if (!value) return [];
		try {
			const parsed = JSON.parse(value);
			if (Array.isArray(parsed)) {
				return parsed.map(item => typeof item === 'string'
					? item.trim()
					: ctx.textOf(item && (item.name || item.medicine_name || item.label || item.value)))
					.filter(Boolean);
			}
		} catch (error) {
			// Plain text remains valid for the existing examination payload.
		}
		return value.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
	}

	function serializeMedicationInput(raw) {
		const items = parseMedicationText(raw);
		return items.length ? JSON.stringify(items) : '';
	}

	function serializeIcdField(doc, hiddenId) {
		if (!hiddenId) return [];
		return ctx.parseIdList(ctx.getValue(doc, hiddenId));
	}

	function readPayloadValue(field, examination, patient) {
		if (!field) return '';
		const source = field.source === 'patient' ? patient : examination;
		return source[field.sourceKey || field.payloadKey];
	}

	function isLoading() {
		return typeof ctx.state.isLoading === 'function' && ctx.state.isLoading();
	}

	function ownsField(target) {
		const root = target && target.closest ? target.closest(`#${ctx.config.rootId}`) : null;
		return Boolean(root && ctx.fieldIds.includes(target.id));
	}

	function markDirty(control) {
		if (isLoading()) return;
		const config = ctx.detailsPersistence.getConfig(control);
		if (config) ctx.DETAIL_CHANGES.mark(config.section);
		else ctx.MAIN_CHANGES.mark();
		ctx.syncDirtyState();
	}

	function handleFieldMutation(event) {
		const target = event && event.target;
		if (!target || !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || !ownsField(target)) return false;
		markDirty(target);
		return true;
	}

	Object.assign(ctx, { parseMedicationText, serializeMedicationInput, serializeIcdField, readPayloadValue, isLoading, ownsField, markDirty, handleFieldMutation });
}

function installClinicalForm4(ctx) {
	function clear(options = {}) {
		const doc = ctx.getDocument(options);
		ctx.state.contextToken += 1;
		ctx.state.appointment = null;
		ctx.state.patientId = null;
		ctx.state.examinationId = null;
		ctx.state.currentData = null;
		ctx.state.detailsLoading = false;
		ctx.state.detailsLoaded = false;
		ctx.state.detailsLoadError = null;
		ctx.state.detailsLoadPromise = null;
		ctx.state.icdLoadPromise = null;
		ctx.MAIN_CHANGES.reset();
		ctx.DETAIL_CHANGES.reset();
		ctx.icdInstances.forEach(instance => instance.clear({ silent: true }));
		ctx.fieldIds.forEach(id => ctx.setValue(doc, id, ''));
		ctx.medicationInstances.forEach(instance => instance.reset());
		ctx.syncDirtyState();
	}

	function renderClinicalFields(doc, payload = {}, token = ctx.state.contextToken) {
		const examination = payload.examination_info || {};
		const patient = payload.patient_info || {};
		Object.values(ctx.config.mainFields).forEach(field => {
			let value = ctx.readPayloadValue(field, examination, patient);
			if (field.kind === 'medication') value = ctx.serializeMedicationInput(value);
			if (field.kind === 'icd') value = '';
			ctx.setValue(doc, field.controlId, value);
			if (field.kind === 'medication') ctx.getMedicationInstance(doc, field)?.reset();
			if (field.hiddenControlId) {
				const ids = examination[field.idSourceKey];
				ctx.setValue(doc, field.hiddenControlId, JSON.stringify(ctx.parseIdList(ids)));
			}
		});
		ctx.config.detailFields.forEach(field => ctx.setValue(doc, field.controlId, ''));
		ctx.state.icdLoadPromise = Promise.all(
			Object.values(ctx.config.mainFields)
				.filter(field => field.kind === 'icd')
				.map(field => ctx.hydrateIcdField(doc, field, examination, token))
		).finally(() => {
			if (token === ctx.state.contextToken) ctx.state.icdLoadPromise = null;
		});
	}

	Object.assign(ctx, { clear, renderClinicalFields });
}

function installClinicalForm5(ctx) {
	function render(payload = {}, options = {}) {
		const doc = ctx.getDocument(options);
		const appointment = payload || {};
		ctx.state.contextToken += 1;
		const token = ctx.state.contextToken;
		const examination = payload.examination_info || {};
		const patient = payload.patient_info || {};
		ctx.state.appointment = appointment;
		ctx.state.patientId = ctx.textOf(patient.id || appointment.patient_id);
		ctx.state.examinationId = ctx.textOf(examination.id || appointment.examination_id);
		ctx.state.currentData = payload;
		ctx.MAIN_CHANGES.reset();
		ctx.DETAIL_CHANGES.reset();
		ctx.state.detailsLoaded = false;
		ctx.state.detailsLoadError = null;
		ctx.renderClinicalFields(doc, payload, token);
		const appointmentId = ctx.textOf(appointment.id);
		if (!appointmentId) return Promise.resolve(false);
		const detailsLoadPromise = ctx.detailsPersistence.load(doc, appointmentId, token);
		ctx.state.detailsLoadPromise = detailsLoadPromise;
		detailsLoadPromise.catch(() => {});
		return detailsLoadPromise;
	}

	function collect(options = {}) {
		const doc = ctx.getDocument(options);
		return Object.values(ctx.config.mainFields).reduce((payload, field) => {
			if (!field.payloadKey) return payload;
			if (field.kind === 'icd') payload[field.payloadKey] = ctx.serializeIcdField(doc, field.hiddenControlId);
			else if (field.kind === 'medication') payload[field.payloadKey] = ctx.serializeMedicationInput(ctx.getValue(doc, field.controlId));
			else payload[field.payloadKey] = ctx.getValue(doc, field.controlId);
			return payload;
		}, {});
	}

	function getDraftSnapshot(options = {}) {
		const doc = ctx.getDocument(options);
		const controls = {};
		ctx.fieldDefinitions.forEach(field => {
			const controlId = field.kind === 'icd' ? field.hiddenControlId : field.controlId;
			if (!controlId) return;
			const control = ctx.getElement(doc, controlId);
			if (!control) return;
			if (field.kind === 'icd') controls[controlId] = ctx.serializeIcdDraftValue(doc, field);
			else controls[controlId] = control.type === 'checkbox' ? Boolean(control.checked) : ctx.textOf(control.value);
		});
		return { controls };
	}

	Object.assign(ctx, { render, collect, getDraftSnapshot });
}

function installClinicalForm6(ctx) {
	async function restoreDraftSnapshot(snapshot = {}, options = {}) {
		const doc = ctx.getDocument(options);
		const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
		if (!isCurrent()) return { restored: 0 };
		const controls = snapshot && snapshot.controls && typeof snapshot.controls === 'object' ? snapshot.controls : {};
		let restored = 0;
		const detailSections = new Set();
		let mainRestored = false;
		Object.entries(controls).forEach(([id, value]) => {
			if (!isCurrent()) return;
			if (!ctx.fieldIds.includes(id)) return;
			const field = ctx.fieldByControlId.get(id) || ctx.fieldByHiddenControlId.get(id);
			if (field?.kind === 'icd' && id === field.controlId) return;
			const control = ctx.getElement(doc, id);
			if (!control) return;
			if (control.type === 'checkbox') control.checked = Boolean(value);
			else control.value = field?.kind === 'icd' ? JSON.stringify(ctx.parseIdList(value)) : ctx.textOf(value);
			if (field?.kind === 'medication') {
				control.value = ctx.serializeMedicationInput(value);
				ctx.getMedicationInstance(doc, field)?.reset();
			}
			const config = ctx.detailsPersistence.getConfig(control);
			if (config) detailSections.add(config.section);
			else mainRestored = true;
			restored += 1;
		});
		const token = ctx.state.contextToken;
		await Promise.all(Object.values(ctx.config.mainFields)
			.filter(field => field.kind === 'icd' && field.hiddenControlId && Object.prototype.hasOwnProperty.call(controls, field.hiddenControlId))
			.map(field => ctx.restoreIcdDraftField(doc, field, controls[field.hiddenControlId], token)));
		if (!isCurrent()) return { restored: 0 };
		if (restored) {
			if (mainRestored) ctx.MAIN_CHANGES.mark();
			detailSections.forEach(section => ctx.DETAIL_CHANGES.mark(section));
			ctx.syncDirtyState();
		}
		return { restored };
	}

	function bind(options = {}) {
		const doc = ctx.getDocument(options);
		ctx.state.isLoading = options.isLoading || ctx.state.isLoading;
		const root = ctx.getElement(doc, ctx.config.rootId);
		if (!root || ctx.bound) return Boolean(root);
		ctx.bindIcdFields(doc);
		Object.values(ctx.config.mainFields).filter(field => field.kind === 'medication')
			.forEach(field => ctx.getMedicationInstance(doc, field));
		root.addEventListener('input', ctx.handleFieldMutation);
		root.addEventListener('change', ctx.handleFieldMutation);
		ctx.bound = true;
		return true;
	}

	Object.assign(ctx, { restoreDraftSnapshot, bind });
}

export { installClinicalForm3, installClinicalForm4, installClinicalForm5, installClinicalForm6 };
