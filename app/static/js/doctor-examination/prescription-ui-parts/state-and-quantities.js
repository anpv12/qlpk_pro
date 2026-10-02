// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
const installers = [];
installers.push(function (inst) {
	function getCurrentAppointmentId() {
	return inst.RUNTIME.getCurrentAppointmentId(inst.STATE);
	}
	function getPrintController() {
	if (inst.printController) return inst.printController;
	const printFactory = inst.config.printFactory || inst.registry.get('doctorPrescriptionPrint');
	if (typeof printFactory !== 'function') {
		throw new Error('Thiếu bộ điều phối in đơn thuốc');
	}

	inst.printController = printFactory({
		getCurrentAppointmentId,
		getCurrentAppointmentData: appointmentId => requestJson(inst.endpoints.appointmentEdit(appointmentId)),
		collectPrescriptionFormData: () => inst.collectPrescriptionPayload(inst.STATE.document || document),
		fetchPrescriptionDataForPrint: appointmentId => requestJson(inst.endpoints.printViewModel(appointmentId)),
		getPrescriptionCodesByType: () => ({ ...inst.STATE.prescriptionCodesByType }),
		showToast
	});
	return inst.printController;
	}
	function printPrescription() {
	return getPrintController().printMainPrescription();
	}
	function requestJson(url, options = {}) {
	return inst.RUNTIME.requestJson(url, options);
	}
	function showToast(type, message, options = {}) {
	inst.RUNTIME.showToast(type, message, options);
	}
	function isCurrentToken(token, appointmentId = inst.STATE.appointmentId) {
	return inst.RUNTIME.isCurrentToken(inst.STATE, token, appointmentId);
	}
	function markPrescriptionDirty() {
	inst.CHANGES.mark();
	if (inst.STATE.document) {
		inst.setPrescriptionSaveStatus(inst.STATE.document, 'dirty', 'Chưa lưu thay đổi');
		inst.syncPrescriptionReExamControls(inst.STATE.document);
	}
	}
	function getCurrentPrescriptionUsageMode(doc) {
	const select = inst.getElement(doc, 'doctorPrescriptionUsageMode');
	return inst.ensurePrescriptionUsageMode(select ? select.value : inst.STATE.prescriptionUsageMode);
	}
	function setPrescriptionUsageMode(doc, value) {
	const mode = inst.ensurePrescriptionUsageMode(value);
	inst.STATE.prescriptionUsageMode = mode;
	const select = inst.getElement(doc, 'doctorPrescriptionUsageMode');
	if (select) select.value = mode;
	return mode;
	}
	function updatePrescriptionRowQuantityDisplay(doc, row) {
	const workspace = inst.getElement(doc, 'doctorPrescriptionWorkspace');
	const rowElement = workspace?.querySelector(`[data-prescription-row-id="${row.uid}"]`);
	const quantityInput = rowElement?.querySelector('[data-prescription-field="quantity"]');
	if (quantityInput) quantityInput.value = inst.formatDoseValue(row.quantity) || '0';
	}

	Object.assign(inst, {
		getCurrentAppointmentId, getPrintController, printPrescription, requestJson, showToast, isCurrentToken,
		markPrescriptionDirty, getCurrentPrescriptionUsageMode, setPrescriptionUsageMode,
		updatePrescriptionRowQuantityDisplay
	});
});
installers.push(function (inst) {
	function updatePrescriptionRowUsageNoteDisplay(doc, row) {
	const workspace = inst.getElement(doc, 'doctorPrescriptionWorkspace');
	const noteInput = workspace?.querySelector(
		`[data-prescription-row-id="${row.uid}"] [data-prescription-field="usageNote"]`
	);
	if (noteInput && doc.activeElement !== noteInput) noteInput.value = row.usageNote || '';
	}
	function syncBatchAllocationStaleness() {
	const totals = new Map();
	inst.STATE.prescriptionRows.forEach(row => {
		const medicineId = !row.isExternal && inst.normalizeId(row.medicineId);
		if (!medicineId) return;
		totals.set(medicineId, (totals.get(medicineId) || 0) + inst.toNumber(row.quantity, 0));
	});
	inst.STATE.prescriptionRows.forEach(row => {
		const medicineId = !row.isExternal && inst.normalizeId(row.medicineId);
		if (!medicineId) {
			row.batchAllocationStale = false;
			return;
		}
		const currentTotal = totals.get(medicineId) || 0;
		const persistedTotal = row.batchAllocation
			? inst.toNumber(row.batchAllocation.prescribed_quantity, 0)
			: 0;
		row.batchAllocationStale = Math.abs(currentTotal - persistedTotal) > 0.0001;
	});
	}
	function syncPrescriptionRowQuantities(doc, options = {}) {
	const mode = inst.getCurrentPrescriptionUsageMode(doc);
	const medicineDays = inst.getValue(doc, 'doctorPrescriptionMedicineDays');
	const preserveWhenDaysMissing = options.preserveWhenDaysMissing !== false;
	const medicineDaysMissing = inst.parseMedicineDays(medicineDays) === null;

	inst.STATE.prescriptionRows.forEach(row => {
		if (medicineDaysMissing && preserveWhenDaysMissing) return;
		const calculatedQuantity = inst.calculatePrescriptionQuantity(row, medicineDays, mode);
		row.quantity = calculatedQuantity;
		inst.updatePrescriptionRowQuantityDisplay(doc, row);
		inst.updatePrescriptionRowTotal(doc, row);
	});
	if (options.markAllocationStale !== false) {
		syncBatchAllocationStaleness();
		inst.updateBatchAllocationDisplays(doc);
	}
	syncPrescriptionUsageNotes(doc);
	}
	function syncPrescriptionUsageNotes(doc) {
	const mode = inst.getCurrentPrescriptionUsageMode(doc);
	const medicineDays = inst.getValue(doc, 'doctorPrescriptionMedicineDays');
	inst.STATE.prescriptionRows.forEach(row => {
		if (row.usageNoteMode === inst.PRESCRIPTION_USAGE_NOTE_MODES.MANUAL) return;
		if (!row.name) {
			row.usageNote = '';
			updatePrescriptionRowUsageNoteDisplay(doc, row);
			return;
		}
		row.usageNote = inst.buildMedicineUsageNote(row, medicineDays, mode);
		updatePrescriptionRowUsageNoteDisplay(doc, row);
	});
	}

	Object.assign(inst, {
		updatePrescriptionRowUsageNoteDisplay, syncBatchAllocationStaleness, syncPrescriptionRowQuantities,
		syncPrescriptionUsageNotes
	});
});
installers.push(function (inst) {
	function setPrescriptionReExamDate(doc, value) {
	inst.STATE.reExaminationDraftDateTime = value || '';
	const input = inst.getElement(doc, 'doctorPrescriptionReExamDateTime');
	if (input) {
		const parsed = inst.parseDateTimeInputValue(value);
		input.value = parsed.date ? `${parsed.date.split('-').reverse().join('/')} ${parsed.time}` : '';
	}
	}
	function resetContextData(doc) {
	inst.reExaminationCalendar?.close();
	inst.STATE.appointmentDate = null;
	inst.STATE.prescriptionRows = [];
	inst.STATE.prescriptionLoaded = false;
	inst.CHANGES.reset();
	inst.STATE.prescriptionSaving = false;
	inst.STATE.prescriptionUsageMode = inst.PRESCRIPTION_USAGE_MODES.TIME_SLOTS;
	inst.STATE.preservedGlobalUsage = '';
	inst.STATE.prescriptionCodesByType = {};
	inst.STATE.reExaminationAppointmentId = null;
	inst.STATE.reExaminationDateTime = '';
	inst.STATE.reExaminationStatus = null;
	inst.STATE.reExaminationSnapshot = null;
	inst.STATE.reExaminationDraftSelection = null;
	inst.STATE.reExaminationError = '';
	inst.STATE.prescriptionHistory = [];
	inst.STATE.prescriptionHistoryLoaded = false;
	inst.STATE.prescriptionHistoryPanelOpen = false;
	inst.STATE.prescriptionHistorySelectedIndex = 0;
	inst.setValue(doc, 'doctorPrescriptionMedicineDays', '');
	setPrescriptionReExamDate(doc, '');
	inst.syncPrescriptionReExamControls(doc);
	inst.setPrescriptionSaveStatus(doc, 'idle', 'Chưa có thay đổi');
	inst.setPrescriptionUsageMode(doc, inst.PRESCRIPTION_USAGE_MODES.TIME_SLOTS);
	inst.setPrescriptionHistoryPanel(doc, false);
	inst.renderPrescriptionRows(doc);
	inst.renderPrescriptionHistory(doc);
	inst.SEARCH.reset(doc);
	}
	function getDraftSnapshot(options = {}) {
	const doc = inst.getDocument(options);
	return {
		rows: inst.draftRowsWithoutRuntimeIds(inst.STATE.prescriptionRows),
		usageMode: inst.getCurrentPrescriptionUsageMode(doc),
		medicineDays: inst.getValue(doc, 'doctorPrescriptionMedicineDays'),
		reExamEnabled: Boolean(inst.STATE.reExaminationDraftDateTime),
		reExamDateTime: inst.STATE.reExaminationDraftDateTime,
		reExamSelection: inst.STATE.reExaminationDraftSelection
	};
	}

	Object.assign(inst, { setPrescriptionReExamDate, resetContextData, getDraftSnapshot });
});
installers.push(function (inst) {
	function restorePrescriptionRows(rows, usageMode) {
	inst.STATE.prescriptionRows = (Array.isArray(rows) ? rows : []).map(row => {
		const normalized = inst.normalizePrescriptionRow({
			medicine_id: row.medicineId,
			name: row.name,
			generic_name: row.genericName,
			quantity: row.quantity,
			unit: row.unit,
			strength: row.strength,
			route: row.route,
			unit_price: row.unitPrice,
			current_stock_quantity: row.currentStockQuantity,
			is_external: row.isExternal,
			category_type: row.categoryType,
			prescription_type: row.prescriptionType,
			batch_allocation: row.batchAllocation
		}, Boolean(row && row.isExternal));
		normalized.usageNote = inst.textOf(row && row.usageNote);
		normalized.usageNoteMode = inst.normalizeUsageNoteMode(
			row && row.usageNoteMode,
			normalized.usageNote ? inst.PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : inst.PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
		);
		normalized.schedule = inst.normalizeSchedulePayload(row && row.schedule ? row.schedule : {}, usageMode);
		normalized.batchAllocationStale = Boolean(row && row.batchAllocationStale);
		return normalized;
	});
	}
	function restoreDraftSnapshot(snapshot = {}, options = {}) {
	const doc = inst.getDocument(options);
	const usageMode = inst.ensurePrescriptionUsageMode(snapshot.usageMode);
	inst.setPrescriptionUsageMode(doc, usageMode);
	restorePrescriptionRows(snapshot.rows, usageMode);
	inst.setValue(doc, 'doctorPrescriptionMedicineDays', snapshot.medicineDays || '');
	// A CONFIRMED appointment is server-owned. A SCHEDULED appointment remains
	// editable and may therefore be restored from the local recovery copy.
	if (!isReExaminationLocked()) {
		inst.setPrescriptionReExamDate(doc, snapshot.reExamDateTime || '');
		inst.STATE.reExaminationDraftSelection = snapshot.reExamSelection || inst.STATE.reExaminationSnapshot?.selection || null;
	}
	inst.syncPrescriptionReExamControls(doc);
	inst.CHANGES.restore(options.dirty);
	inst.syncPrescriptionRowQuantities(doc);
	inst.renderPrescriptionRows(doc);
	return true;
	}
	function clear(options = {}) {
	const doc = inst.getDocument(options);
	inst.STATE.contextToken += 1;
	inst.STATE.appointmentId = null;
	inst.STATE.patientId = null;
	inst.STATE.appointmentDate = null;
	inst.SEARCH.hide(doc);
	inst.resetContextData(doc);
	}
	function setPrescriptionSaveStatus(doc, status, label) {
	const element = inst.getElement(doc, 'doctorPrescriptionSaveStatus');
	if (!element) return;
	element.dataset.status = status || 'idle';
	element.textContent = label || 'Chưa có thay đổi';
	}
	function isReExaminationLocked() {
	return inst.REEXAM.isLocked(inst.STATE);
	}

	Object.assign(inst, { restorePrescriptionRows, restoreDraftSnapshot, clear, setPrescriptionSaveStatus, isReExaminationLocked });
});
installers.push(function (inst, outer) {
	function reExaminationLockReason() {
	return inst.REEXAM.lockReason(inst.STATE);
	}
	function showReExaminationError(doc, message) {
	inst.STATE.reExaminationError = message;
	const hint = inst.getElement(doc, 'doctorPrescriptionReExamHint');
	if (hint) {
		hint.hidden = false;
		hint.dataset.status = 'error';
		hint.textContent = message;
	}
	}
	function sameReExaminationSelection(a, b) {
	return inst.REEXAM.sameSelection(a, b);
	}
	function hasReExaminationChanges() {
	return inst.REEXAM.hasChanges(inst.STATE);
	}
	function syncPrescriptionReExamStatus(doc) {
	inst.REEXAM.renderStatus({
		state: inst.STATE,
		statusElement: inst.getElement(doc, 'doctorPrescriptionReExamStatus'),
		hintElement: inst.getElement(doc, 'doctorPrescriptionReExamHint')
	});
	}
	function syncPrescriptionReExamControls(doc) {
	if (inst.isReExaminationLocked()) inst.setPrescriptionReExamDate(doc, inst.STATE.reExaminationDateTime);
	inst.REEXAM.renderButton({ state: inst.STATE, buttonElement: inst.getElement(doc, 'doctorPrescriptionReExamButton') });
	syncPrescriptionReExamStatus(doc);
	}
	function openReExaminationCalendar(doc) {
	if (inst.isReExaminationLocked() || !inst.STATE.prescriptionLoaded || inst.STATE.prescriptionSaving || inst.STATE.isLoading?.()) return;
	const token = inst.STATE.contextToken;
	const appointmentId = inst.STATE.appointmentId;
	if (!inst.reExaminationCalendar) inst.reExaminationCalendar = outer.createReExaminationCalendar({ requestJson: inst.requestJson });
	inst.reExaminationCalendar.open({
		appointmentId,
		hasSelection: Boolean(inst.STATE.reExaminationDraftDateTime),
		selection: inst.STATE.reExaminationDraftSelection,
		value: inst.STATE.reExaminationDraftDateTime || inst.calculateReExaminationDateTime(inst.getValue(doc, 'doctorPrescriptionMedicineDays')),
		onConfirm(value, selection) {
			if (!inst.isCurrentToken(token, appointmentId) || inst.isReExaminationLocked()) return;
			if (value === inst.STATE.reExaminationDraftDateTime && sameReExaminationSelection(selection, inst.STATE.reExaminationDraftSelection)) return;
			inst.STATE.reExaminationDraftSelection = selection;
			inst.STATE.reExaminationError = '';
			inst.setPrescriptionReExamDate(doc, value);
			inst.markPrescriptionDirty();
		}
	});
	}
	function normalizeStoredQuantity(rawQuantity) {
	if (rawQuantity === undefined || rawQuantity === null || rawQuantity === '') return 0;
	return inst.roundPrescriptionQuantity(inst.toNumber(rawQuantity, 0));
	}
	function resolveStoredStockQuantity(item, batchAllocation) {
	return item.current_stock_quantity ?? item.stock_quantity ?? batchAllocation?.aggregate_stock ?? null;
	}

	Object.assign(inst, {
		reExaminationLockReason, showReExaminationError, sameReExaminationSelection, hasReExaminationChanges,
		syncPrescriptionReExamStatus, syncPrescriptionReExamControls, openReExaminationCalendar,
		normalizeStoredQuantity, resolveStoredStockQuantity
	});
});
installers.push(function (inst) {
	function normalizePrescriptionRow(item = {}, externalFallback = false) {
	const medicineId = inst.normalizeId(item.medicine_id || item.id);
	const isExternal = item.is_external === undefined ? Boolean(externalFallback) : Boolean(item.is_external);
	const usagePayload = inst.parseMedicineUsage(item.usage || '', inst.STATE.prescriptionUsageMode);
	const batchAllocation = copyBatchAllocation(item.batch_allocation);
	return {
		uid: `rx-${inst.STATE.nextPrescriptionRowId++}`,
		medicineId: isExternal ? null : medicineId,
		...describeStoredMedicine(item),
		quantity: inst.normalizeStoredQuantity(item.quantity),
		...describeStoredUsage(usagePayload),
		unitPrice: inst.toNumber(item.unit_price ?? item.price, 0),
		currentStockQuantity: isExternal ? null : inst.resolveStoredStockQuantity(item, batchAllocation),
		isExternal,
		prescriptionType: inst.normalizePrescriptionType(item.prescription_type),
		batchAllocation,
		batchAllocationStale: false
	};
	}

	function copyBatchAllocation(allocation) {
	return allocation && typeof allocation === 'object' ? JSON.parse(JSON.stringify(allocation)) : null;
	}

	function describeStoredMedicine(item) {
	return {
		name: inst.textOf(item.name || item.medicine_name),
		genericName: inst.textOf(item.generic_name || item.active_ingredient),
		unit: inst.textOf(item.unit),
		strength: inst.textOf(item.strength),
		route: inst.textOf(item.route || item.administration_method),
		categoryType: inst.textOf(item.category_type || 'DRUG')
	};
	}

	function describeStoredUsage(usagePayload) {
	const modes = inst.PRESCRIPTION_USAGE_NOTE_MODES;
	return {
		usageNote: usagePayload.note || '',
		usageNoteMode: inst.normalizeUsageNoteMode(usagePayload.noteMode, usagePayload.note ? modes.MANUAL : modes.GENERATED),
		schedule: usagePayload.schedule || inst.normalizeSchedulePayload({}, inst.STATE.prescriptionUsageMode)
	};
	}

	Object.assign(inst, { normalizePrescriptionRow });
});
installers.push(function (inst) {
	function applyStockAllocationStates(states) {
	const stateByMedicineId = new Map(
		(Array.isArray(states) ? states : [])
			.map(state => [inst.normalizeId(state && state.medicine_id), state])
			.filter(([medicineId]) => medicineId)
	);
	const currentTotals = new Map();
	inst.STATE.prescriptionRows.forEach(row => {
		const medicineId = !row.isExternal && inst.normalizeId(row.medicineId);
		if (!medicineId) return;
		currentTotals.set(medicineId, (currentTotals.get(medicineId) || 0) + inst.toNumber(row.quantity, 0));
	});
	inst.STATE.prescriptionRows.forEach(row => {
		const medicineId = !row.isExternal && inst.normalizeId(row.medicineId);
		const allocation = medicineId && stateByMedicineId.get(medicineId);
		if (allocation) {
			row.batchAllocation = JSON.parse(JSON.stringify(allocation));
			if (allocation.aggregate_stock !== undefined && allocation.aggregate_stock !== null) {
				row.currentStockQuantity = allocation.aggregate_stock;
			}
			return;
		}
		if (medicineId && (currentTotals.get(medicineId) || 0) <= 0) {
			row.batchAllocation = null;
		}
	});
	inst.syncBatchAllocationStaleness();
	}
	function buildInventorySaveMessage(data) {
	const updates = Array.isArray(data && data.stock_updates) ? data.stock_updates : [];
	if (!updates.length) return 'Đã lưu đơn thuốc';
	const deducted = updates.reduce((sum, item) => sum + inst.toNumber(item.quantity_deducted, 0), 0);
	const refunded = updates.reduce((sum, item) => sum + inst.toNumber(item.quantity_refunded, 0), 0);
	const units = [...new Set(updates.map(item => inst.textOf(item.unit)).filter(Boolean))];
	const batchKeys = new Set();
	updates.forEach(item => (Array.isArray(item.batch_movements) ? item.batch_movements : []).forEach(movement => {
		batchKeys.add(`${item.medicine_id}:${movement.batch_id}`);
	}));
	const formatQuantity = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(value);
	if (units.length === 1 && deducted > 0 && refunded === 0) {
		return `Đã lưu đơn và cấp đủ ${formatQuantity(deducted)} ${units[0]} từ ${batchKeys.size} lô.`;
	}
	if (units.length === 1 && refunded > 0 && deducted === 0) {
		return `Đã lưu đơn và hoàn ${formatQuantity(refunded)} ${units[0]} về ${batchKeys.size} lô.`;
	}
	return `Đã lưu đơn và cập nhật tồn kho theo ${batchKeys.size} lô.`;
	}
	function findPrescriptionRow(uid) {
	return inst.STATE.prescriptionRows.find(row => row.uid === uid);
	}
	function getPrescriptionTotal() {
	return inst.STATE.prescriptionRows.reduce((sum, row) => {
		if (!row.name) return sum;
		return sum + getPrescriptionRowTotal(row);
	}, 0);
	}
	function getPrescriptionRowTotal(row) {
	return inst.roundPrescriptionQuantity(row.quantity) * inst.toNumber(row.unitPrice, 0);
	}

	Object.assign(inst, {
		applyStockAllocationStates, buildInventorySaveMessage, findPrescriptionRow, getPrescriptionTotal,
		getPrescriptionRowTotal
	});
});
installers.push(function (inst) {
	function updatePrescriptionFooter(doc) {
	const codes = Object.values(inst.STATE.prescriptionCodesByType || {}).filter(Boolean);
	const itemCount = inst.STATE.prescriptionRows.filter(row => row.name).length;
	const quantityRows = inst.STATE.prescriptionRows.filter(row => row.name && inst.toNumber(row.quantity, 0) > 0);
	const totalQuantity = quantityRows.reduce((sum, row) => sum + inst.roundPrescriptionQuantity(row.quantity), 0);
		const units = [...new Set(quantityRows.map(row => row.unit).filter(Boolean))];
	const quantityLabel = totalQuantity
		? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(totalQuantity)} ${units.length === 1 ? units[0] : 'đơn vị'}`
		: '0 đơn vị';
	inst.setText(doc, 'doctorPrescriptionCode', codes.length ? codes.join(' · ') : 'Chưa cấp mã');
	inst.setText(doc, 'doctorPrescriptionTotalQuantity', quantityLabel);
	inst.setText(doc, 'doctorPrescriptionGrandTotal', inst.formatCurrency(inst.getPrescriptionTotal()));
	inst.setText(doc, 'doctorPrescriptionItemsCount', itemCount);
	inst.setText(doc, 'doctorPrescriptionJumpCount', itemCount);
	inst.syncPrescriptionReExamStatus(doc);
	}
	function jumpToPrescriptionWorkspace(doc) {
	const target = inst.getElement(doc, 'doctorPrescriptionWorkspace');
	if (!target) return false;
	let scrollOwner = target.parentElement;
	while (scrollOwner) {
		const styles = getComputedStyle(scrollOwner);
		const canScroll = ['auto', 'scroll'].includes(styles.overflowY)
			&& scrollOwner.scrollHeight > scrollOwner.clientHeight;
		if (canScroll) break;
		scrollOwner = scrollOwner.parentElement;
	}
	if (!scrollOwner) return false;
	const targetRect = target.getBoundingClientRect();
	const ownerRect = scrollOwner.getBoundingClientRect();
	const scrollOffset = Number.parseFloat(getComputedStyle(scrollOwner).fontSize) * 0.75;
	const nextScrollTop = scrollOwner.scrollTop + targetRect.top - ownerRect.top - scrollOffset;
	scrollOwner.scrollTo({ top: Math.max(0, nextScrollTop), behavior: 'smooth' });
	return true;
	}
	function updatePrescriptionRowTotal(doc, row) {
	return inst.ROWS.updateRowTotal({
		document: doc,
		root: inst.getElement(doc, 'doctorPrescriptionWorkspace'),
		row,
		getRowTotal: rowValue => inst.formatCurrency(inst.getPrescriptionRowTotal(rowValue))
	});
	}

	Object.assign(inst, { updatePrescriptionFooter, jumpToPrescriptionWorkspace, updatePrescriptionRowTotal });
});

export { installers };
