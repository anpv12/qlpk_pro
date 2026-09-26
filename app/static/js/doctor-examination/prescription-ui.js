import { createReExaminationCalendar } from './re-examination-calendar.js';

(function (window, document) {
	'use strict';

	const DEFAULT_DOM = {
		workspace: 'doctorClinicalWorkspace',
		usageMode: 'doctorPrescriptionUsageMode',
		medicineDays: 'doctorPrescriptionMedicineDays',
		reExamButton: 'doctorPrescriptionReExamButton',
		reExamDateTime: 'doctorPrescriptionReExamDateTime',
		reExamStatus: 'doctorPrescriptionReExamStatus',
		reExamHint: 'doctorPrescriptionReExamHint',
		saveStatus: 'doctorPrescriptionSaveStatus',
		code: 'doctorPrescriptionCode',
		totalQuantity: 'doctorPrescriptionTotalQuantity',
		grandTotal: 'doctorPrescriptionGrandTotal',
		itemsCount: 'doctorPrescriptionItemsCount',
		jumpCount: 'doctorPrescriptionJumpCount',
		tableHead: 'doctorPrescriptionTableHead',
		list: 'doctorPrescriptionList',
		table: 'doctorPrescriptionTable',
		empty: 'doctorPrescriptionEmptyState',
		historyPanel: 'doctorPrescriptionHistoryPanel',
		historyList: 'doctorPrescriptionHistoryList',
		historyCount: 'doctorPrescriptionHistoryCount',
		diagnosis: 'diagnosis'
	};

	const DEFAULT_ENDPOINTS = {
		prescription: appointmentId => `/api/prescription/appointment/${appointmentId}`,
		history: patientId => `/api/prescription/patient/${patientId}/history`,
		save: () => '/api/prescription/save',
		printViewModel: appointmentId => `/api/prescription/appointment/${appointmentId}/print-view-model`,
		appointmentEdit: appointmentId => `/api/appointments/${appointmentId}/edit`
	};
	const instances = new WeakMap();

	function create(options = {}) {
		const config = options.config || {};
		const registry = window.QLPKDoctorModuleRegistry;
		const RUNTIME = options.runtime || registry.require('supportRuntime');
		const MODEL = options.model || registry?.get('prescriptionModel');
		const ROWS = options.rows || registry?.get('prescriptionRows');
		const HISTORY = options.history || registry?.get('prescriptionHistory');
		const REEXAM = options.reExam || registry?.get('prescriptionReExam');
		const MEDICINE_SEARCH = options.medicineSearch || registry?.get('prescriptionMedicineSearch');
		if (!RUNTIME) throw new Error('Thiếu prescription support runtime');
		if (!MODEL || !ROWS || !HISTORY || !REEXAM || !MEDICINE_SEARCH) throw new Error('Thiếu prescription dependencies');

		const dom = { ...DEFAULT_DOM, ...(config.dom || {}) };
		const endpoints = { ...DEFAULT_ENDPOINTS, ...(config.endpoints || {}) };
		const runtimeGetElement = RUNTIME.getElement;
		const runtimeSetText = RUNTIME.setText;
		const runtimeSetValue = RUNTIME.setValue;
		const runtimeGetValue = RUNTIME.getValue;
		const resolveDomId = id => {
			const key = Object.keys(DEFAULT_DOM).find(name => DEFAULT_DOM[name] === id);
			return key ? dom[key] : id;
		};
		const getElement = (doc, id) => runtimeGetElement(doc, resolveDomId(id));
		const setText = (doc, id, value, options = {}) => runtimeSetText(doc, resolveDomId(id), value, options);
		const setValue = (doc, id, value) => runtimeSetValue(doc, resolveDomId(id), value);
		const getValue = (doc, id) => runtimeGetValue(doc, resolveDomId(id));
		const {
			getDocument,
			textOf,
			toNumber,
			normalizeId,
			formatCurrency,
			draftRowsWithoutRuntimeIds,
			getRowUidFromTarget
		} = RUNTIME;
		const {
			PRESCRIPTION_USAGE_MODES,
			PRESCRIPTION_USAGE_NOTE_MODES,
			normalizePrescriptionType,
			ensurePrescriptionUsageMode,
			normalizeUsageNoteMode,
			parseDoseValue,
			parseMedicineDays,
			formatDoseValue,
			roundPrescriptionQuantity,
			normalizeSchedulePayload,
			calculatePrescriptionQuantity,
			buildMedicineUsageNote,
			parseMedicineUsage,
			buildMedicineUsagePayload,
			parseGlobalUsageInstructions,
			buildGlobalUsageInstructions,
			calculateReExaminationDateTime,
			buildDateTimeInputValue,
			parseDateTimeInputValue
		} = MODEL;

	let reExaminationCalendar = null;
	const STATE = {
		reExaminationDraftDateTime: '',
		reExaminationDraftSelection: null,
		bound: false,
		contextToken: 0,
		appointmentId: null,
		appointmentDate: null,
		patientId: null,
		document: null,
		isLoading: null,
		prescriptionRows: [],
		prescriptionLoaded: false,
		prescriptionDirty: false,
		prescriptionRevision: 0,
		prescriptionSaving: false,
		prescriptionUsageMode: 'time_slots',
		preservedGlobalUsage: '',
		prescriptionCodesByType: {},
		reExaminationAppointmentId: null,
		reExaminationDateTime: '',
		reExaminationStatus: null,
		reExaminationSnapshot: null,
		reExaminationError: '',
		prescriptionHistory: [],
		prescriptionHistoryLoaded: false,
		prescriptionHistoryPanelOpen: false,
		prescriptionHistorySelectedIndex: 0,
		nextPrescriptionRowId: 1
	};
	const CHANGES = RUNTIME.createChangeTracker(STATE, { revisionKey: 'prescriptionRevision', dirtyKey: 'prescriptionDirty' });
	const SEARCH = MEDICINE_SEARCH.create({
		requestJson,
		getEndpoint: query => (typeof endpoints.medicines === 'function'
			? endpoints.medicines(query)
			: (endpoints.medicines || `/api/medicines/?search=${encodeURIComponent(query)}&per_page=8`)),
		getDocument: () => STATE.document || document,
		isRowCurrent: row => findPrescriptionRow(row.uid) === row
	});

	function getCurrentAppointmentId() {
		return RUNTIME.getCurrentAppointmentId(STATE);
	}

	let printController = null;

	function getPrintController() {
		if (printController) return printController;
		const printFactory = config.printFactory || registry.get('doctorPrescriptionPrint');
		if (typeof printFactory !== 'function') {
			throw new Error('Thiếu bộ điều phối in đơn thuốc');
		}

		printController = printFactory({
			getCurrentAppointmentId,
			getCurrentAppointmentData: appointmentId => requestJson(endpoints.appointmentEdit(appointmentId)),
			collectPrescriptionFormData: () => collectPrescriptionPayload(STATE.document || document),
			fetchPrescriptionDataForPrint: appointmentId => requestJson(endpoints.printViewModel(appointmentId)),
			getPrescriptionCodesByType: () => ({ ...STATE.prescriptionCodesByType }),
			showToast
		});
		return printController;
	}

	function printPrescription() {
		return getPrintController().printMainPrescription();
	}

	function requestJson(url, options = {}) {
		return RUNTIME.requestJson(url, options);
	}

	function showToast(type, message, options = {}) {
		RUNTIME.showToast(type, message, options);
	}

	function isCurrentToken(token, appointmentId = STATE.appointmentId) {
		return RUNTIME.isCurrentToken(STATE, token, appointmentId);
	}

	function markPrescriptionDirty() {
		CHANGES.mark();
		if (STATE.document) {
			setPrescriptionSaveStatus(STATE.document, 'dirty', 'Chưa lưu thay đổi');
			syncPrescriptionReExamControls(STATE.document);
		}
	}
	function getCurrentPrescriptionUsageMode(doc) {
		const select = getElement(doc, 'doctorPrescriptionUsageMode');
		return ensurePrescriptionUsageMode(select ? select.value : STATE.prescriptionUsageMode);
	}

	function setPrescriptionUsageMode(doc, value) {
		const mode = ensurePrescriptionUsageMode(value);
		STATE.prescriptionUsageMode = mode;
		const select = getElement(doc, 'doctorPrescriptionUsageMode');
		if (select) select.value = mode;
		return mode;
	}

	function updatePrescriptionRowQuantityDisplay(doc, row) {
		const workspace = getElement(doc, 'doctorPrescriptionWorkspace');
		const rowElement = workspace?.querySelector(`[data-prescription-row-id="${row.uid}"]`);
		const quantityInput = rowElement?.querySelector('[data-prescription-field="quantity"]');
		if (quantityInput) quantityInput.value = formatDoseValue(row.quantity) || '0';
	}

	function updatePrescriptionRowUsageNoteDisplay(doc, row) {
		const workspace = getElement(doc, 'doctorPrescriptionWorkspace');
		const noteInput = workspace?.querySelector(
			`[data-prescription-row-id="${row.uid}"] [data-prescription-field="usageNote"]`
		);
		if (noteInput && doc.activeElement !== noteInput) noteInput.value = row.usageNote || '';
	}

	function syncBatchAllocationStaleness() {
		const totals = new Map();
		STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && normalizeId(row.medicineId);
			if (!medicineId) return;
			totals.set(medicineId, (totals.get(medicineId) || 0) + toNumber(row.quantity, 0));
		});
		STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && normalizeId(row.medicineId);
			if (!medicineId) {
				row.batchAllocationStale = false;
				return;
			}
			const currentTotal = totals.get(medicineId) || 0;
			const persistedTotal = row.batchAllocation
				? toNumber(row.batchAllocation.prescribed_quantity, 0)
				: 0;
			row.batchAllocationStale = Math.abs(currentTotal - persistedTotal) > 0.0001;
		});
	}

	function syncPrescriptionRowQuantities(doc, options = {}) {
		const mode = getCurrentPrescriptionUsageMode(doc);
		const medicineDays = getValue(doc, 'doctorPrescriptionMedicineDays');
		const preserveWhenDaysMissing = options.preserveWhenDaysMissing !== false;
		const medicineDaysMissing = parseMedicineDays(medicineDays) === null;

		STATE.prescriptionRows.forEach(row => {
			if (medicineDaysMissing && preserveWhenDaysMissing) return;
			const calculatedQuantity = calculatePrescriptionQuantity(row, medicineDays, mode);
			row.quantity = calculatedQuantity;
			updatePrescriptionRowQuantityDisplay(doc, row);
			updatePrescriptionRowTotal(doc, row);
		});
		if (options.markAllocationStale !== false) {
			syncBatchAllocationStaleness();
			updateBatchAllocationDisplays(doc);
		}
		syncPrescriptionUsageNotes(doc);
	}

	function syncPrescriptionUsageNotes(doc) {
		const mode = getCurrentPrescriptionUsageMode(doc);
		const medicineDays = getValue(doc, 'doctorPrescriptionMedicineDays');
		STATE.prescriptionRows.forEach(row => {
			if (row.usageNoteMode === PRESCRIPTION_USAGE_NOTE_MODES.MANUAL) return;
			if (!row.name) {
				row.usageNote = '';
				updatePrescriptionRowUsageNoteDisplay(doc, row);
				return;
			}
			row.usageNote = buildMedicineUsageNote(row, medicineDays, mode);
			updatePrescriptionRowUsageNoteDisplay(doc, row);
		});
	}

	function setPrescriptionReExamDate(doc, value) {
		STATE.reExaminationDraftDateTime = value || '';
		const input = getElement(doc, 'doctorPrescriptionReExamDateTime');
		if (input) {
			const parsed = parseDateTimeInputValue(value);
			input.value = parsed.date ? `${parsed.date.split('-').reverse().join('/')} ${parsed.time}` : '';
		}
	}

	function resetContextData(doc) {
		reExaminationCalendar?.close();
		STATE.appointmentDate = null;
		STATE.prescriptionRows = [];
		STATE.prescriptionLoaded = false;
		CHANGES.reset();
		STATE.prescriptionSaving = false;
		STATE.prescriptionUsageMode = PRESCRIPTION_USAGE_MODES.TIME_SLOTS;
		STATE.preservedGlobalUsage = '';
		STATE.prescriptionCodesByType = {};
		STATE.reExaminationAppointmentId = null;
		STATE.reExaminationDateTime = '';
		STATE.reExaminationStatus = null;
		STATE.reExaminationSnapshot = null;
		STATE.reExaminationDraftSelection = null;
		STATE.reExaminationError = '';
		STATE.prescriptionHistory = [];
		STATE.prescriptionHistoryLoaded = false;
		STATE.prescriptionHistoryPanelOpen = false;
		STATE.prescriptionHistorySelectedIndex = 0;
		setValue(doc, 'doctorPrescriptionMedicineDays', '');
		setPrescriptionReExamDate(doc, '');
		syncPrescriptionReExamControls(doc);
		setPrescriptionSaveStatus(doc, 'idle', 'Chưa có thay đổi');
		setPrescriptionUsageMode(doc, PRESCRIPTION_USAGE_MODES.TIME_SLOTS);
		setPrescriptionHistoryPanel(doc, false);
		renderPrescriptionRows(doc);
		renderPrescriptionHistory(doc);
		SEARCH.reset(doc);
	}

	function getDraftSnapshot(options = {}) {
		const doc = getDocument(options);
		return {
			rows: draftRowsWithoutRuntimeIds(STATE.prescriptionRows),
			usageMode: getCurrentPrescriptionUsageMode(doc),
			medicineDays: getValue(doc, 'doctorPrescriptionMedicineDays'),
			reExamEnabled: Boolean(STATE.reExaminationDraftDateTime),
			reExamDateTime: STATE.reExaminationDraftDateTime,
			reExamSelection: STATE.reExaminationDraftSelection
		};
	}

	function restorePrescriptionRows(rows, usageMode) {
		STATE.prescriptionRows = (Array.isArray(rows) ? rows : []).map(row => {
			const normalized = normalizePrescriptionRow({
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
			normalized.usageNote = textOf(row && row.usageNote);
			normalized.usageNoteMode = normalizeUsageNoteMode(
				row && row.usageNoteMode,
				normalized.usageNote ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
			);
			normalized.schedule = normalizeSchedulePayload(row && row.schedule ? row.schedule : {}, usageMode);
			normalized.batchAllocationStale = Boolean(row && row.batchAllocationStale);
			return normalized;
		});
	}

	function restoreDraftSnapshot(snapshot = {}, options = {}) {
		const doc = getDocument(options);
		const usageMode = ensurePrescriptionUsageMode(snapshot.usageMode);
		setPrescriptionUsageMode(doc, usageMode);
		restorePrescriptionRows(snapshot.rows, usageMode);
		setValue(doc, 'doctorPrescriptionMedicineDays', snapshot.medicineDays || '');
		// A CONFIRMED appointment is server-owned. A SCHEDULED appointment remains
		// editable and may therefore be restored from the local recovery copy.
		if (!isReExaminationLocked()) {
			setPrescriptionReExamDate(doc, snapshot.reExamDateTime || '');
			STATE.reExaminationDraftSelection = snapshot.reExamSelection || STATE.reExaminationSnapshot?.selection || null;
		}
		syncPrescriptionReExamControls(doc);
		CHANGES.restore(options.dirty);
		syncPrescriptionRowQuantities(doc);
		renderPrescriptionRows(doc);
		return true;
	}

	function clear(options = {}) {
		const doc = getDocument(options);
		STATE.contextToken += 1;
		STATE.appointmentId = null;
		STATE.patientId = null;
		STATE.appointmentDate = null;
		SEARCH.hide(doc);
		resetContextData(doc);
	}
	function setPrescriptionSaveStatus(doc, status, label) {
		const element = getElement(doc, 'doctorPrescriptionSaveStatus');
		if (!element) return;
		element.dataset.status = status || 'idle';
		element.textContent = label || 'Chưa có thay đổi';
	}

	function isReExaminationLocked() {
		return REEXAM.isLocked(STATE);
	}

	function reExaminationLockReason() {
		return REEXAM.lockReason(STATE);
	}

	function showReExaminationError(doc, message) {
		STATE.reExaminationError = message;
		const hint = getElement(doc, 'doctorPrescriptionReExamHint');
		if (hint) {
			hint.hidden = false;
			hint.dataset.status = 'error';
			hint.textContent = message;
		}
	}

	function sameReExaminationSelection(a, b) {
		return REEXAM.sameSelection(a, b);
	}

	function hasReExaminationChanges() {
		return REEXAM.hasChanges(STATE);
	}

	function syncPrescriptionReExamStatus(doc) {
		REEXAM.renderStatus({
			state: STATE,
			statusElement: getElement(doc, 'doctorPrescriptionReExamStatus'),
			hintElement: getElement(doc, 'doctorPrescriptionReExamHint')
		});
	}

	function syncPrescriptionReExamControls(doc) {
		if (isReExaminationLocked()) setPrescriptionReExamDate(doc, STATE.reExaminationDateTime);
		REEXAM.renderButton({ state: STATE, buttonElement: getElement(doc, 'doctorPrescriptionReExamButton') });
		syncPrescriptionReExamStatus(doc);
	}

	function openReExaminationCalendar(doc) {
		if (isReExaminationLocked() || !STATE.prescriptionLoaded || STATE.prescriptionSaving || STATE.isLoading?.()) return;
		const token = STATE.contextToken;
		const appointmentId = STATE.appointmentId;
		if (!reExaminationCalendar) reExaminationCalendar = createReExaminationCalendar({ requestJson });
		reExaminationCalendar.open({
			appointmentId,
			hasSelection: Boolean(STATE.reExaminationDraftDateTime),
			selection: STATE.reExaminationDraftSelection,
			value: STATE.reExaminationDraftDateTime || calculateReExaminationDateTime(getValue(doc, 'doctorPrescriptionMedicineDays')),
			onConfirm(value, selection) {
				if (!isCurrentToken(token, appointmentId) || isReExaminationLocked()) return;
				if (value === STATE.reExaminationDraftDateTime && sameReExaminationSelection(selection, STATE.reExaminationDraftSelection)) return;
				STATE.reExaminationDraftSelection = selection;
				STATE.reExaminationError = '';
				setPrescriptionReExamDate(doc, value);
				markPrescriptionDirty();
			}
		});
	}
	function normalizePrescriptionRow(item = {}, externalFallback = false) {
		const medicineId = normalizeId(item.medicine_id || item.id);
		const isExternal = item.is_external === undefined ? Boolean(externalFallback) : Boolean(item.is_external);
		const usagePayload = parseMedicineUsage(item.usage || '', STATE.prescriptionUsageMode);
		const rawQuantity = item.quantity;
		const batchAllocation = item.batch_allocation && typeof item.batch_allocation === 'object'
			? JSON.parse(JSON.stringify(item.batch_allocation))
			: null;
		return {
			uid: `rx-${STATE.nextPrescriptionRowId++}`,
			medicineId: isExternal ? null : medicineId,
			name: textOf(item.name || item.medicine_name),
			genericName: textOf(item.generic_name || item.active_ingredient),
			quantity: rawQuantity === undefined || rawQuantity === null || rawQuantity === ''
				? 0
				: roundPrescriptionQuantity(toNumber(rawQuantity, 0)),
			unit: textOf(item.unit),
			strength: textOf(item.strength),
			route: textOf(item.route || item.administration_method),
			usageNote: usagePayload.note || '',
			usageNoteMode: normalizeUsageNoteMode(
				usagePayload.noteMode,
				usagePayload.note ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
			),
			schedule: usagePayload.schedule || normalizeSchedulePayload({}, STATE.prescriptionUsageMode),
			unitPrice: toNumber(item.unit_price ?? item.price, 0),
			currentStockQuantity: isExternal
				? null
				: (item.current_stock_quantity ?? item.stock_quantity ?? batchAllocation?.aggregate_stock ?? null),
			isExternal,
			categoryType: textOf(item.category_type || 'DRUG'),
			prescriptionType: normalizePrescriptionType(item.prescription_type),
			batchAllocation,
			batchAllocationStale: false
		};
	}

	function applyStockAllocationStates(states) {
		const stateByMedicineId = new Map(
			(Array.isArray(states) ? states : [])
				.map(state => [normalizeId(state && state.medicine_id), state])
				.filter(([medicineId]) => medicineId)
		);
		const currentTotals = new Map();
		STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && normalizeId(row.medicineId);
			if (!medicineId) return;
			currentTotals.set(medicineId, (currentTotals.get(medicineId) || 0) + toNumber(row.quantity, 0));
		});
		STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && normalizeId(row.medicineId);
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
		syncBatchAllocationStaleness();
	}

	function buildInventorySaveMessage(data) {
		const updates = Array.isArray(data && data.stock_updates) ? data.stock_updates : [];
		if (!updates.length) return 'Đã lưu đơn thuốc';
		const deducted = updates.reduce((sum, item) => sum + toNumber(item.quantity_deducted, 0), 0);
		const refunded = updates.reduce((sum, item) => sum + toNumber(item.quantity_refunded, 0), 0);
		const units = [...new Set(updates.map(item => textOf(item.unit)).filter(Boolean))];
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
		return STATE.prescriptionRows.find(row => row.uid === uid);
	}

	function getPrescriptionTotal() {
		return STATE.prescriptionRows.reduce((sum, row) => {
			if (!row.name) return sum;
			return sum + getPrescriptionRowTotal(row);
		}, 0);
	}

	function getPrescriptionRowTotal(row) {
		return roundPrescriptionQuantity(row.quantity) * toNumber(row.unitPrice, 0);
	}

	function updatePrescriptionFooter(doc) {
		const codes = Object.values(STATE.prescriptionCodesByType || {}).filter(Boolean);
		const itemCount = STATE.prescriptionRows.filter(row => row.name).length;
		const quantityRows = STATE.prescriptionRows.filter(row => row.name && toNumber(row.quantity, 0) > 0);
		const totalQuantity = quantityRows.reduce((sum, row) => sum + roundPrescriptionQuantity(row.quantity), 0);
			const units = [...new Set(quantityRows.map(row => row.unit).filter(Boolean))];
		const quantityLabel = totalQuantity
			? `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(totalQuantity)} ${units.length === 1 ? units[0] : 'đơn vị'}`
			: '0 đơn vị';
		setText(doc, 'doctorPrescriptionCode', codes.length ? codes.join(' · ') : 'Chưa cấp mã');
		setText(doc, 'doctorPrescriptionTotalQuantity', quantityLabel);
		setText(doc, 'doctorPrescriptionGrandTotal', formatCurrency(getPrescriptionTotal()));
		setText(doc, 'doctorPrescriptionItemsCount', itemCount);
		setText(doc, 'doctorPrescriptionJumpCount', itemCount);
		syncPrescriptionReExamStatus(doc);
	}

	function jumpToPrescriptionWorkspace(doc) {
		const target = getElement(doc, 'doctorPrescriptionWorkspace');
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
		return ROWS.updateRowTotal({
			document: doc,
			root: getElement(doc, 'doctorPrescriptionWorkspace'),
			row,
			getRowTotal: rowValue => formatCurrency(getPrescriptionRowTotal(rowValue))
		});
	}

	function updateBatchAllocationDisplays(doc) {
		const workspace = getElement(doc, 'doctorPrescriptionWorkspace');
		if (!workspace || typeof ROWS.updateBatchAllocation !== 'function') return false;
		const renderedMedicineIds = new Set();
		STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && normalizeId(row.medicineId);
			const key = medicineId ? String(medicineId) : '';
			const showAllocation = Boolean(key) && !renderedMedicineIds.has(key);
			if (showAllocation) renderedMedicineIds.add(key);
			ROWS.updateBatchAllocation({
				document: doc,
				root: workspace,
				row,
				showAllocation
			});
		});
		return true;
	}

	function setPrescriptionHistoryPanel(doc, isOpen) {
		const open = Boolean(isOpen);
		STATE.prescriptionHistoryPanelOpen = open;
		if (open) STATE.prescriptionHistorySelectedIndex = 0;
		return HISTORY.setPanel({
			document: doc,
			root: doc,
			dom: {
				panel: dom.historyPanel,
				count: dom.historyCount,
				list: dom.historyList
			},
			isOpen: open
		});
	}

	function renderPrescriptionHistory(doc) {
		return HISTORY.render({
			document: doc,
			root: doc,
			dom: {
				panel: dom.historyPanel,
				count: dom.historyCount,
				list: dom.historyList
			},
			history: STATE.prescriptionHistory,
			isOpen: STATE.prescriptionHistoryPanelOpen,
			selectedIndex: STATE.prescriptionHistorySelectedIndex,
			patientName: getElement(doc, 'doctorClinicalHeading')?.textContent?.trim() || ''
		});
	}

	function renderPrescriptionRows(doc) {
		const mode = getCurrentPrescriptionUsageMode(doc);
		setPrescriptionUsageMode(doc, mode);
		return ROWS.render({
			document: doc,
			root: getElement(doc, 'doctorPrescriptionWorkspace'),
			dom: {
				list: dom.list,
				tableHead: dom.tableHead,
				table: dom.table,
				empty: dom.empty
			},
			rows: STATE.prescriptionRows,
			mode,
			codesByType: { ...STATE.prescriptionCodesByType },
			getRowTotal: row => formatCurrency(getPrescriptionRowTotal(row)),
			afterRender: updatePrescriptionFooter
		});
	}

	async function loadPrescription(context) {
		const { doc, token, appointmentId } = context;
		try {
			const data = await requestJson(endpoints.prescription(appointmentId));
			if (!isCurrentToken(token, appointmentId)) return false;
			const usageState = parseGlobalUsageInstructions(data && data.usage_instructions, STATE.prescriptionUsageMode);
			setPrescriptionUsageMode(doc, usageState.scheduleMode);

			STATE.prescriptionRows = Array.isArray(data && data.medicines)
				? data.medicines.map(item => normalizePrescriptionRow(item))
				: [];
			STATE.prescriptionCodesByType = {};
			(data.prescriptions || []).forEach(prescription => {
				const prescriptionType = prescription && (prescription.type || prescription.prescription_type);
				if (prescriptionType && prescription.prescription_code) {
					STATE.prescriptionCodesByType[prescriptionType] = prescription.prescription_code;
				}
			});
			if (data.prescription_code && !Object.keys(STATE.prescriptionCodesByType).length) {
				STATE.prescriptionCodesByType.BASIC = data.prescription_code;
			}
			STATE.preservedGlobalUsage = usageState.globalUsage || '';
			setValue(doc, 'doctorPrescriptionMedicineDays', usageState.medicineDays || '');
			STATE.reExaminationAppointmentId = normalizeId(data.re_examination_appointment_id);
			STATE.reExaminationDateTime = buildDateTimeInputValue(data.re_examination_date, data.re_examination_time) || '';
			STATE.reExaminationStatus = textOf(data.re_examination_status) || null;
			STATE.reExaminationSnapshot = data.re_examination_snapshot || null;
			STATE.reExaminationDraftSelection = STATE.reExaminationSnapshot?.selection || null;
			STATE.reExaminationError = '';
			setPrescriptionReExamDate(doc, STATE.reExaminationDateTime);
			syncPrescriptionRowQuantities(doc, { markAllocationStale: false });
			STATE.prescriptionLoaded = true;
			syncPrescriptionReExamControls(doc);
			CHANGES.reset();
			const hasPersistedPrescription = Boolean(
				STATE.prescriptionRows.length
				|| (data.prescriptions || []).length
				|| data.re_examination_date
				|| usageState.globalUsage
				|| usageState.medicineDays
			);
			setPrescriptionSaveStatus(doc, hasPersistedPrescription ? 'saved' : 'idle', hasPersistedPrescription ? 'Đã lưu' : 'Chưa có thay đổi');
			renderPrescriptionRows(doc);
			return true;
		} catch (error) {
			if (isCurrentToken(token, appointmentId)) {
				showToast('error', 'Không thể tải đơn thuốc. Vui lòng thử lại.');
			}
			return false;
		}
	}

	function collectPrescriptionPayload(doc) {
		const appointmentId = getCurrentAppointmentId();
		const reExamLocked = isReExaminationLocked();
		const reExamEnabled = reExamLocked || Boolean(STATE.reExaminationDraftDateTime);
		const reExamDateTime = parseDateTimeInputValue(
			reExamLocked && STATE.reExaminationDateTime
				? STATE.reExaminationDateTime
				: STATE.reExaminationDraftDateTime
		);
		const usageMode = getCurrentPrescriptionUsageMode(doc);
		const medicines = STATE.prescriptionRows
			.filter(row => row.name && toNumber(row.quantity, 0) > 0)
			.map(row => ({
				medicine_id: row.isExternal ? null : row.medicineId,
				name: row.name,
				quantity: roundPrescriptionQuantity(toNumber(row.quantity, 1)) || 1,
				unit: row.unit,
				strength: row.strength,
				route: row.route,
				usage: buildMedicineUsagePayload(row, usageMode),
				unit_price: toNumber(row.unitPrice, 0),
				is_external: Boolean(row.isExternal),
				category_type: row.categoryType || 'DRUG',
				prescription_type: normalizePrescriptionType(row.prescriptionType)
			}));
		return {
			appointment_id: appointmentId,
			medicines,
			total_amount: getPrescriptionTotal(),
			usage_instructions: buildGlobalUsageInstructions(
				STATE.preservedGlobalUsage,
				usageMode,
				getValue(doc, 'doctorPrescriptionMedicineDays')
			),
			re_examination_snapshot: STATE.reExaminationSnapshot,
			re_examination_selection: reExamLocked ? STATE.reExaminationSnapshot?.selection : STATE.reExaminationDraftSelection,
			re_examination_date: reExamEnabled ? reExamDateTime.date : '',
			re_examination_time: reExamEnabled ? (reExamDateTime.time || '09:00') : ''
		};
	}

	function validatePrescriptionBeforeSave(doc) {
		const invalidStockRow = STATE.prescriptionRows.find(row => row.name
			&& toNumber(row.quantity, 0) > 0
			&& !row.isExternal
			&& !normalizeId(row.medicineId));
		if (invalidStockRow) {
			const error = new Error(`Thuốc "${invalidStockRow.name}" chưa được chọn từ danh sách thuốc trong kho.`);
			error.code = 'missing-medicine-id';
			error.module = 'prescription';
			error.moduleLabel = 'Đơn thuốc';
			setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
			throw error;
		}

		STATE.reExaminationError = '';
		if (!hasReExaminationChanges()) return true;
		const enabled = Boolean(STATE.reExaminationDraftDateTime);
		const parsed = parseDateTimeInputValue(STATE.reExaminationDraftDateTime);
		const when = new Date(`${parsed.date || ''}T${parsed.time || '09:00'}`);
		const message = isReExaminationLocked() ? reExaminationLockReason()
			: enabled && (!Number.isFinite(when.getTime()) || when <= new Date())
			? 'Ngày giờ tái khám mới phải nằm trong tương lai.' : '';
		if (!message) return true;
		showReExaminationError(doc, message);
		const error = new Error(message);
		error.code = 're-examination-invalid';
		error.module = 'prescription';
		error.moduleLabel = 'Đơn thuốc';
		throw error;
	}

	function applyReExaminationSyncState(reExamSync) {
		if (!reExamSync) return;
		STATE.reExaminationSnapshot = reExamSync;
		STATE.reExaminationAppointmentId = normalizeId(reExamSync.appointment_id);
		STATE.reExaminationDateTime = reExamSync.datetime || '';
		STATE.reExaminationStatus = reExamSync.status || null;
	}

	async function savePrescription(options = {}) {
		const doc = getDocument(options);
		const appointmentId = getCurrentAppointmentId();
		if (!appointmentId) return { skipped: true, reason: 'missing-appointment' };
		if (STATE.isLoading && STATE.isLoading()) return { skipped: true, reason: 'loading' };
		if (!STATE.prescriptionLoaded) {
			const error = new Error('Chưa tải xong đơn thuốc của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			error.module = 'prescription';
			error.moduleLabel = 'Đơn thuốc';
			setPrescriptionSaveStatus(doc, 'error', 'Chưa tải xong');
			throw error;
		}
		if (STATE.prescriptionSaving) return { skipped: true, reason: 'saving', module: 'prescription' };
		validatePrescriptionBeforeSave(doc);

		const revision = CHANGES.capture();
		const payload = collectPrescriptionPayload(doc);
		STATE.prescriptionSaving = true;
		setPrescriptionSaveStatus(doc, 'saving', 'Đang lưu');
		syncPrescriptionReExamStatus(doc);
		try {
			const data = await requestJson(typeof endpoints.save === 'function' ? endpoints.save() : endpoints.save, {
				method: 'POST',
				body: payload
			});
			STATE.prescriptionCodesByType = data && data.prescription_codes_by_type ? data.prescription_codes_by_type : STATE.prescriptionCodesByType;
			applyStockAllocationStates(data && data.stock_allocation_states);
			const reExamSync = data && data.re_examination_sync_result;
			const hasNewChanges = !CHANGES.settle(revision);
			applyReExaminationSyncState(reExamSync);
			if (!hasNewChanges) {
				STATE.reExaminationDraftSelection = STATE.reExaminationSnapshot?.selection || null;
				setPrescriptionReExamDate(doc, STATE.reExaminationDateTime);
			}
			STATE.reExaminationError = '';
			renderPrescriptionRows(doc);
			updatePrescriptionFooter(doc);

			setPrescriptionSaveStatus(
				doc,
				hasNewChanges ? 'dirty' : 'saved',
				hasNewChanges ? 'Đã lưu bản trước · còn thay đổi' : 'Đã lưu'
			);
			showToast(
				hasNewChanges ? 'info' : 'success',
				hasNewChanges ? 'Đã lưu đơn thuốc trước đó; có thay đổi mới cần lưu lại.' : buildInventorySaveMessage(data),
				options
			);
			return {
				status: 'success',
				module: 'prescription',
				data,
				hasNewChanges,
				inventoryMessage: buildInventorySaveMessage(data)
			};
		} catch (error) {
			if (String(error.code || '').startsWith('re-examination-')) {
				const current = error.payload?.re_examination_snapshot;
				if (current && error.code === 're-examination-conflict') {
					applyReExaminationSyncState(current);
					STATE.reExaminationDraftSelection = current.selection || null;
					setPrescriptionReExamDate(doc, current.datetime || '');
				}
				showReExaminationError(doc, error.payload?.detail || error.message);
			}
			setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
			throw error;
		} finally {
			STATE.prescriptionSaving = false;
			syncPrescriptionReExamControls(doc);
		}
	}

	function applyMedicineSelection(doc, optionKey) {
		const medicine = SEARCH.getOption(optionKey);
		if (!medicine) return false;
		const rowUid = optionKey.split(':')[0];
		const row = findPrescriptionRow(rowUid);
		if (!row) return false;
		row.medicineId = normalizeId(medicine.id);
		row.name = textOf(medicine.name);
		row.genericName = textOf(medicine.generic_name || medicine.active_ingredient);
		row.unit = textOf(medicine.unit);
		row.strength = textOf(medicine.strength);
		row.route = textOf(medicine.administration_method);
		row.unitPrice = toNumber(medicine.unit_price, 0);
		row.currentStockQuantity = medicine.stock_quantity ?? null;
		row.categoryType = textOf(medicine.category_type || 'DRUG');
		row.prescriptionType = normalizePrescriptionType(medicine.prescription_type);
		row.isExternal = false;
		row.batchAllocation = null;
		row.batchAllocationStale = false;
		row.usageNoteMode = PRESCRIPTION_USAGE_NOTE_MODES.GENERATED;
		SEARCH.hide(doc);
		markPrescriptionDirty();
		syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
		syncPrescriptionUsageNotes(doc);
		renderPrescriptionRows(doc);
		return true;
	}

	function addPrescriptionRow(doc, isExternal) {
		STATE.prescriptionRows.push(normalizePrescriptionRow({ is_external: isExternal }, isExternal));
		markPrescriptionDirty();
		renderPrescriptionRows(doc);
	}

	function removePrescriptionRow(doc, rowUid) {
		STATE.prescriptionRows = STATE.prescriptionRows.filter(row => row.uid !== rowUid);
		syncBatchAllocationStaleness();
		markPrescriptionDirty();
		renderPrescriptionRows(doc);
	}

	async function loadPrescriptionHistory(context) {
		const { doc, token, appointmentId, patientId } = context;
		if (!patientId) {
			renderPrescriptionHistory(doc);
			return false;
		}
		try {
			const data = await requestJson(endpoints.history(patientId));
			if (!isCurrentToken(token, appointmentId)) return false;
			STATE.prescriptionHistory = (Array.isArray(data && data.history) ? data.history : [])
				.filter(record => String(record && record.appointment_id) !== String(appointmentId));
			STATE.prescriptionHistoryLoaded = true;
			renderPrescriptionHistory(doc);
			doc.dispatchEvent(new CustomEvent('qlpk:doctor-prescription-history-loaded', {
				detail: { patientId, appointmentId }
			}));
			return true;
		} catch (error) {
			if (isCurrentToken(token, appointmentId)) {
				STATE.prescriptionHistory = [];
				STATE.prescriptionHistoryLoaded = false;
				renderPrescriptionHistory(doc);
				doc.dispatchEvent(new CustomEvent('qlpk:doctor-prescription-history-loaded', {
					detail: { patientId, appointmentId, failed: true }
				}));
			}
			return false;
		}
	}

	function getLatestPreviousVisitSnapshot() {
		if (!STATE.prescriptionHistoryLoaded) return { status: 'loading' };
		const currentAppointmentTime = Date.parse(String(STATE.appointmentDate || '').replace(' ', 'T'));
		const record = STATE.prescriptionHistory.find(item => {
			if (!item || !item.appointment_id) return false;
			if (Number.isNaN(currentAppointmentTime)) return true;
			const recordTime = Date.parse(String(item.appointment_date_iso || '').replace(' ', 'T'));
			return Number.isNaN(recordTime) || recordTime < currentAppointmentTime;
		});
		if (!record) return { status: 'empty' };

		const medicines = (Array.isArray(record.prescriptions) ? record.prescriptions : [])
			.flatMap(prescription => Array.isArray(prescription && prescription.medicines) ? prescription.medicines : [])
			.map(medicine => textOf(medicine && medicine.name))
			.filter(Boolean)
			.filter((name, index, names) => names.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index);
		const medicineSummary = medicines.length > 1
			? `${medicines[0]} +${medicines.length - 1}`
			: medicines[0] || 'Chưa kê thuốc';

		return {
			status: 'ready',
			appointmentDate: textOf(record.appointment_date),
			diagnosis: textOf(record.diagnosis),
			medicineSummary
		};
	}
	function handlePrescriptionInput(doc, target) {
		const rowUid = getRowUidFromTarget(target, '[data-prescription-row-id]', 'data-prescription-row-id');
		const row = findPrescriptionRow(rowUid);
		if (!row) return false;
		const field = target.dataset.prescriptionField;
		if (!field) return false;
		if (field === 'name') {
			row.name = target.value.trim();
			if (!row.isExternal) {
				row.medicineId = null;
				row.currentStockQuantity = null;
				row.batchAllocation = null;
				row.batchAllocationStale = false;
			}
			syncBatchAllocationStaleness();
			updateBatchAllocationDisplays(doc);
			SEARCH.search(target, row);
		} else if (field === 'quantity') {
			return false;
		} else if (field === 'unit') {
			if (!row.isExternal) return false;
			row.unit = target.value.trim();
		} else if (field === 'unitPrice') {
			row.unitPrice = Math.max(0, toNumber(target.value, 0));
			updatePrescriptionRowTotal(doc, row);
		} else if (field === 'prescriptionType') {
			row.prescriptionType = normalizePrescriptionType(target.value);
		} else if (field === 'qtyPerTime') {
			row.schedule = normalizeSchedulePayload(row.schedule || {}, getCurrentPrescriptionUsageMode(doc));
			row.schedule.times_per_day.qty_per_time = Math.max(0.001, parseDoseValue(target.value, 1) || 1);
		} else if (field === 'timesPerDay') {
			row.schedule = normalizeSchedulePayload(row.schedule || {}, getCurrentPrescriptionUsageMode(doc));
			row.schedule.times_per_day.times_per_day = Math.max(1, toNumber(target.value, 1));
		} else if (['morning', 'noon', 'afternoon', 'evening'].includes(field)) {
			row.schedule = normalizeSchedulePayload(row.schedule || {}, getCurrentPrescriptionUsageMode(doc));
			row.schedule.time_slots[field] = Math.max(0, parseDoseValue(target.value, 0));
		} else if (field === 'usageNote') {
			row.usageNote = target.value;
			row.usageNoteMode = PRESCRIPTION_USAGE_NOTE_MODES.MANUAL;
		} else {
			row[field] = target.value;
		}
		if (['qtyPerTime', 'timesPerDay', 'morning', 'noon', 'afternoon', 'evening'].includes(field)) {
			syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
		} else if (['route', 'unit'].includes(field)) {
			syncPrescriptionUsageNotes(doc);
		}
		markPrescriptionDirty();
		updatePrescriptionFooter(doc);
		return true;
	}

	function bind(options = {}) {
		const doc = getDocument(options);
		STATE.document = doc;
		STATE.isLoading = options.isLoading || STATE.isLoading;
		RUNTIME.configure(options);
		const workspace = getElement(doc, 'doctorClinicalWorkspace');
		if (!workspace || STATE.bound) return Boolean(workspace);

		doc.addEventListener('click', event => {
			const prescriptionNavigation = event.target.closest('[data-prescription-navigation]');
			if (prescriptionNavigation) {
				event.preventDefault();
				if (prescriptionNavigation.dataset.prescriptionNavigation === 'jump') jumpToPrescriptionWorkspace(doc);
				return;
			}

			const prescriptionAction = event.target.closest('[data-prescription-action]');
			if (prescriptionAction) {
				event.preventDefault();
				const action = prescriptionAction.dataset.prescriptionAction;
				if (action === 're-examination-calendar') openReExaminationCalendar(doc);
				if (action === 'add-stock-row') addPrescriptionRow(doc, false);
				if (action === 'print') printPrescription().catch(() => showToast('error', 'Không thể in đơn thuốc. Vui lòng thử lại.'));
				return;
			}

			const prescriptionRowAction = event.target.closest('[data-prescription-row-action]');
			if (prescriptionRowAction) {
				event.preventDefault();
				const rowUid = getRowUidFromTarget(prescriptionRowAction, '[data-prescription-row-id]', 'data-prescription-row-id');
				const rowAction = prescriptionRowAction.dataset.prescriptionRowAction;
				if (rowAction === 'remove') removePrescriptionRow(doc, rowUid);
				return;
			}

			const prescriptionHistoryAction = event.target.closest('[data-prescription-history-action]');
			if (prescriptionHistoryAction) {
				event.preventDefault();
				const action = prescriptionHistoryAction.dataset.prescriptionHistoryAction;
				if (action === 'toggle') {
					const shouldOpen = !STATE.prescriptionHistoryPanelOpen;
					if (shouldOpen) STATE.prescriptionHistorySelectedIndex = 0;
					setPrescriptionHistoryPanel(doc, shouldOpen);
					renderPrescriptionHistory(doc);
					return;
				}
				if (action === 'close') {
					setPrescriptionHistoryPanel(doc, false);
					renderPrescriptionHistory(doc);
					return;
				}
				const visits = HISTORY.getVisits(STATE.prescriptionHistory);
				const index = Number(prescriptionHistoryAction.dataset.prescriptionHistoryIndex);
				if (!Number.isInteger(index) || !visits[index]) return;
				if (action === 'select') {
					STATE.prescriptionHistorySelectedIndex = index;
					renderPrescriptionHistory(doc);
					return;
				}
				if (action === 'reuse') {
					const visit = visits[index];
					STATE.prescriptionRows = visit.prescriptions
						.flatMap(prescription => prescription.medicines || [])
						.map(item => normalizePrescriptionRow(item));
					syncPrescriptionRowQuantities(doc);
					markPrescriptionDirty();
					renderPrescriptionRows(doc);
					setPrescriptionHistoryPanel(doc, false);
					renderPrescriptionHistory(doc);
					showToast('info', 'Đã đưa đơn cũ vào đơn hiện tại. Vui lòng kiểm tra trước khi lưu.');
				}
			}
		});

		doc.addEventListener('keydown', event => {
			if (event.key !== 'Escape' || !STATE.prescriptionHistoryPanelOpen) return;
			event.preventDefault();
			setPrescriptionHistoryPanel(doc, false);
			renderPrescriptionHistory(doc);
		});

		doc.addEventListener('input', event => {
			const target = event.target;
			if (!target || !['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

			if (target.dataset.prescriptionField && handlePrescriptionInput(doc, target)) return;
			if (target.id === dom.medicineDays) {
				if (target.id === dom.medicineDays) {
					syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
					updatePrescriptionFooter(doc);
				}
				markPrescriptionDirty();

			}
		});

		workspace.addEventListener('focusin', event => {
			const target = event.target;
			if (!target || target.tagName !== 'INPUT' || target.dataset.prescriptionField !== 'name') return;
			const rowUid = getRowUidFromTarget(target, '[data-prescription-row-id]', 'data-prescription-row-id');
			const row = findPrescriptionRow(rowUid);
			if (row && !row.isExternal) SEARCH.search(target, row);
		});

		workspace.addEventListener('keydown', event => {
			const target = event.target;
			if (!(target instanceof window.HTMLInputElement) || target.dataset.prescriptionField !== 'name') return;
			const optionKey = SEARCH.handleKeydown(doc, event);
			if (optionKey) applyMedicineSelection(doc, optionKey);
		});

		doc.addEventListener('input', event => {
			if (event.target && event.target.id === dom.diagnosis) updatePrescriptionFooter(doc);
		});
		doc.addEventListener('change', event => {
			if (event.target && event.target.id === dom.diagnosis) updatePrescriptionFooter(doc);
		});

		doc.addEventListener('change', event => {
			const target = event.target;
			if (target?.tagName === 'SELECT') {
				if (target.dataset.prescriptionField && handlePrescriptionInput(doc, target)) return;
				if (target.id === dom.usageMode) {
					setPrescriptionUsageMode(doc, target.value);
					syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
					renderPrescriptionRows(doc);
					markPrescriptionDirty();
				}
			}
		});

		doc.addEventListener('click', event => {
			const medicineSelect = event.target.closest('[data-medicine-select]');
			if (medicineSelect) {
				event.preventDefault();
				applyMedicineSelection(doc, medicineSelect.dataset.medicineSelect);
				return;
			}
			if (!event.target.closest('.doctor-prescription-cell__input--search')
				&& !event.target.closest('[data-prescription-dropdown]')) SEARCH.hide(doc);
		});

		doc.addEventListener('scroll', () => SEARCH.position(doc), true);
		(doc.defaultView || window).addEventListener('resize', () => SEARCH.position(doc));

		STATE.bound = true;
		return true;
	}

	function load(context = {}) {
		const doc = getDocument(context);
		const appointment = context.payload || context.appointment || {};
		const appointmentId = normalizeId(context.appointmentId || appointment.id || (appointment.appointment && appointment.appointment.id));
		const patient = appointment.patient_info || appointment.patient || {};
		const patientId = normalizeId(context.patientId || patient.id || appointment.patient_id);
		if (!appointmentId) return Promise.resolve(false);

		STATE.contextToken += 1;
		const token = STATE.contextToken;
		STATE.appointmentId = appointmentId;
		STATE.patientId = patientId;
		resetContextData(doc);
		STATE.appointmentDate = textOf(appointment.appointment_date || (appointment.appointment && appointment.appointment.appointment_date));

		return Promise.allSettled([
			loadPrescription({ doc, token, appointmentId, patientId }),
			loadPrescriptionHistory({ doc, token, appointmentId, patientId })
		]).then(results => results.every(result => result.status === 'fulfilled' && result.value === true));
	}

	function hasUnsavedChanges() {
		return Boolean(STATE.prescriptionDirty);
	}

	return {
		bind,
		clear,
		load,
		save: savePrescription,
		getDraftSnapshot,
		restoreDraftSnapshot,
		hasUnsavedChanges,
		isLoading: () => Boolean(STATE.isLoading && STATE.isLoading()),
		getLatestPreviousVisitSnapshot,
		isReExaminationLocked: isReExaminationLocked,
		getPrescriptionCodesByType: () => ({ ...STATE.prescriptionCodesByType }),
		getConfig: () => ({ ...config, dom: { ...dom }, endpoints: { ...endpoints } }),
		getState: () => STATE
	};
	}

	const doctorConfig = window.QLPKDoctorModuleRegistry.get('doctorComponentConfig');
	const doctorInstance = create({
		config: doctorConfig?.prescription || {}
	});

	function getOrCreate(options = {}) {
		const rootId = options.config?.rootId;
		if (!rootId) return doctorInstance;
		const root = (options.document || document).getElementById(rootId);
		if (!root) return null;
		const existing = instances.get(root);
		if (existing) return existing;
		const instance = create(options);
		instances.set(root, instance);
		return instance;
	}

	const doctorRoot = document.getElementById(doctorConfig?.prescription?.rootId || DEFAULT_DOM.workspace);
	if (doctorRoot) instances.set(doctorRoot, doctorInstance);
	window.QLPKDoctorModuleRegistry.register('prescriptionForm', { create, getOrCreate }, {
		owner: 'doctor/prescription',
		version: 2
	});
})(window, document);
