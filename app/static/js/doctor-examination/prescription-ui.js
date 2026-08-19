(function (window, document) {
	'use strict';

	const DEFAULT_DOM = {
		workspace: 'doctorClinicalWorkspace',
		usageMode: 'doctorPrescriptionUsageMode',
		medicineDays: 'doctorPrescriptionMedicineDays',
		reExamToggle: 'doctorPrescriptionReExamToggle',
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
		if (!RUNTIME) throw new Error('Thiếu prescription support runtime');
		if (!MODEL || !ROWS || !HISTORY) throw new Error('Thiếu prescription dependencies');

		const dom = { ...DEFAULT_DOM, ...(config.dom || {}) };
		const endpoints = { ...DEFAULT_ENDPOINTS, ...(config.endpoints || {}) };
		const runtimeGetElement = RUNTIME.getElement;
		const runtimeSetText = RUNTIME.setText;
		const runtimeSetValue = RUNTIME.setValue;
		const runtimeGetValue = RUNTIME.getValue;
		const runtimeSetChecked = RUNTIME.setChecked;
		const runtimeIsChecked = RUNTIME.isChecked;
		const resolveDomId = id => {
			const key = Object.keys(DEFAULT_DOM).find(name => DEFAULT_DOM[name] === id);
			return key ? dom[key] : id;
		};
		const getElement = (doc, id) => runtimeGetElement(doc, resolveDomId(id));
		const setText = (doc, id, value, options = {}) => runtimeSetText(doc, resolveDomId(id), value, options);
		const setValue = (doc, id, value) => runtimeSetValue(doc, resolveDomId(id), value);
		const getValue = (doc, id) => runtimeGetValue(doc, resolveDomId(id));
		const setChecked = (doc, id, value) => runtimeSetChecked(doc, resolveDomId(id), value);
		const isChecked = (doc, id) => runtimeIsChecked(doc, resolveDomId(id));
		const {
			getDocument,
			textOf,
			toNumber,
			normalizeId,
			escapeHtml,
			escapeAttr,
			formatCurrency,
			setDateTimePickerValue,
			setDateTimeInputDisabled,
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

	const STATE = {
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
		prescriptionHistory: [],
		prescriptionHistoryLoaded: false,
		prescriptionHistoryPanelOpen: false,
		prescriptionHistorySelectedIndex: 0,
		nextPrescriptionRowId: 1,
		medicineSearchTimer: null,
		medicineSearchToken: 0,
		medicineOptions: new Map(),
		medicineDropdownInput: null,
		medicineDropdownRowUid: '',
		medicineDropdownActiveIndex: -1
	};

	function getCurrentAppointmentId() {
		return RUNTIME.normalizeId(STATE.appointmentId)
			|| RUNTIME.normalizeId(options.getAppointmentId?.())
			|| RUNTIME.normalizeId(config.getAppointmentId?.());
	}

	function getMedicineDropdown(doc) {
		const dropdownId = 'doctorMedicineDropdown';
		let dropdown = doc.getElementById(dropdownId);
		if (dropdown) return dropdown;
		dropdown = doc.createElement('div');
		dropdown.id = dropdownId;
		dropdown.className = 'doctor-support-dropdown doctor-support-dropdown--floating';
		dropdown.dataset.prescriptionDropdown = 'true';
		dropdown.setAttribute('role', 'listbox');
		dropdown.hidden = true;
		(doc.body || doc.documentElement).appendChild(dropdown);
		return dropdown;
	}

	function updateMedicineInputState(input, expanded, dropdownId = 'doctorMedicineDropdown') {
		if (!input) return;
		input.setAttribute('aria-expanded', String(Boolean(expanded)));
		if (expanded) input.setAttribute('aria-controls', dropdownId);
		else input.removeAttribute('aria-activedescendant');
	}

	function positionMedicineDropdown(doc) {
		const dropdown = getMedicineDropdown(doc);
		const input = STATE.medicineDropdownInput;
		if (!input || dropdown.hidden || !input.isConnected) return;
		const view = doc.defaultView || window;
		const rect = input.getBoundingClientRect();
		const edge = 8;
		const gap = 4;
		const availableBelow = Math.max(0, view.innerHeight - rect.bottom - edge - gap);
		const availableAbove = Math.max(0, rect.top - edge - gap);
		const openAbove = availableBelow < 240 && availableAbove > availableBelow;
		const maxWidth = Math.max(260, view.innerWidth - (edge * 2));
		const width = Math.min(Math.max(rect.width, 320), maxWidth);
		const maxHeight = Math.max(96, Math.min(320, openAbove ? availableAbove : availableBelow));

		dropdown.style.width = `${width}px`;
		dropdown.style.maxHeight = `${maxHeight}px`;
		dropdown.style.left = `${Math.min(Math.max(edge, rect.left), Math.max(edge, view.innerWidth - width - edge))}px`;
		dropdown.style.top = openAbove
			? `${Math.max(edge, rect.top - Math.min(dropdown.offsetHeight || maxHeight, maxHeight) - gap)}px`
			: `${Math.min(view.innerHeight - edge - Math.min(dropdown.offsetHeight || maxHeight, maxHeight), rect.bottom + gap)}px`;
		dropdown.dataset.placement = openAbove ? 'above' : 'below';
	}

	function hideMedicineDropdown(doc) {
		const dropdown = getMedicineDropdown(doc);
		if (STATE.medicineSearchTimer) clearTimeout(STATE.medicineSearchTimer);
		STATE.medicineSearchTimer = null;
		STATE.medicineSearchToken += 1;
		dropdown.hidden = true;
		dropdown.innerHTML = '';
		STATE.medicineDropdownInput?.removeAttribute('aria-busy');
		updateMedicineInputState(STATE.medicineDropdownInput, false);
		STATE.medicineDropdownInput = null;
		STATE.medicineDropdownRowUid = '';
		STATE.medicineDropdownActiveIndex = -1;
	}

	function setActiveMedicineOption(doc, index) {
		const dropdown = getMedicineDropdown(doc);
		const options = Array.from(dropdown.querySelectorAll('[data-medicine-select]'));
		if (!options.length) return;
		STATE.medicineDropdownActiveIndex = Math.max(0, Math.min(index, options.length - 1));
		options.forEach((option, optionIndex) => {
			const active = optionIndex === STATE.medicineDropdownActiveIndex;
			option.classList.toggle('is-active', active);
			option.setAttribute('aria-selected', String(active));
		});
		const activeOption = options[STATE.medicineDropdownActiveIndex];
		if (activeOption) {
			updateMedicineInputState(STATE.medicineDropdownInput, true);
			STATE.medicineDropdownInput?.setAttribute('aria-activedescendant', activeOption.id);
			activeOption.scrollIntoView({ block: 'nearest' });
		}
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
		STATE.prescriptionRevision += 1;
		STATE.prescriptionDirty = true;
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
		const input = getElement(doc, 'doctorPrescriptionReExamDateTime');
		if (!input) return;
		if (!value) {
			setDateTimePickerValue(input, '');
			return;
		}
		const flatpickrInstance = input._flatpickr;
		if (!flatpickrInstance) {
			setDateTimePickerValue(input, value);
			return;
		}

		// Persisted appointments may be in the past; display them before restoring
		// the future-date constraint used for newly entered appointments.
		const minDate = flatpickrInstance.config && flatpickrInstance.config.minDate;
		const persistedDate = new Date(String(value).replace(' ', 'T'));
		const isPastPersistedDate = !Number.isNaN(persistedDate.getTime()) && persistedDate < new Date();
		if (minDate) flatpickrInstance.set('minDate', null);
		flatpickrInstance.setDate(value, false);
		if (minDate && !isPastPersistedDate) flatpickrInstance.set('minDate', minDate);
	}

	function resetContextData(doc) {
		STATE.appointmentDate = null;
		STATE.prescriptionRows = [];
		STATE.prescriptionLoaded = false;
		STATE.prescriptionDirty = false;
		STATE.prescriptionRevision = 0;
		STATE.prescriptionSaving = false;
		STATE.prescriptionUsageMode = PRESCRIPTION_USAGE_MODES.TIME_SLOTS;
		STATE.preservedGlobalUsage = '';
		STATE.prescriptionCodesByType = {};
		STATE.reExaminationAppointmentId = null;
		STATE.reExaminationDateTime = '';
		STATE.reExaminationStatus = null;
		STATE.prescriptionHistory = [];
		STATE.prescriptionHistoryLoaded = false;
		STATE.prescriptionHistoryPanelOpen = false;
		STATE.prescriptionHistorySelectedIndex = 0;
		STATE.medicineOptions.clear();
		setValue(doc, 'doctorPrescriptionMedicineDays', '');
		setChecked(doc, 'doctorPrescriptionReExamToggle', false);
		setDateTimePickerValue(getElement(doc, 'doctorPrescriptionReExamDateTime'), '');
		syncPrescriptionReExamControls(doc);
		setPrescriptionSaveStatus(doc, 'idle', 'Chưa có thay đổi');
		setPrescriptionUsageMode(doc, PRESCRIPTION_USAGE_MODES.TIME_SLOTS);
		setPrescriptionHistoryPanel(doc, false);
		renderPrescriptionRows(doc);
		renderPrescriptionHistory(doc);
		hideMedicineDropdown(doc);
	}

	function getDraftSnapshot(options = {}) {
		const doc = getDocument(options);
		return {
			rows: draftRowsWithoutRuntimeIds(STATE.prescriptionRows),
			usageMode: getCurrentPrescriptionUsageMode(doc),
			medicineDays: getValue(doc, 'doctorPrescriptionMedicineDays'),
			reExamEnabled: isChecked(doc, 'doctorPrescriptionReExamToggle'),
			reExamDateTime: getValue(doc, 'doctorPrescriptionReExamDateTime')
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
		if (!isReExaminationConfirmed()) {
			setChecked(doc, 'doctorPrescriptionReExamToggle', Boolean(snapshot.reExamEnabled));
			setPrescriptionReExamDate(doc, snapshot.reExamDateTime || '');
		}
		syncPrescriptionReExamControls(doc);
		STATE.prescriptionDirty = Boolean(options.dirty);
		if (STATE.prescriptionDirty) STATE.prescriptionRevision += 1;
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
		if (STATE.medicineSearchTimer) clearTimeout(STATE.medicineSearchTimer);
		STATE.medicineSearchTimer = null;
		STATE.medicineSearchToken += 1;
		hideMedicineDropdown(doc);
		resetContextData(doc);
	}
	function setPrescriptionSaveStatus(doc, status, label) {
		const element = getElement(doc, 'doctorPrescriptionSaveStatus');
		if (!element) return;
		element.dataset.status = status || 'idle';
		element.textContent = label || 'Chưa có thay đổi';
	}

	function getReExaminationStatus() {
		return textOf(STATE.reExaminationStatus).toUpperCase();
	}

	function isReExaminationConfirmed() {
		return getReExaminationStatus() === 'CONFIRMED';
	}

	function normalizeReExaminationDateTime(value) {
		const parsed = parseDateTimeInputValue(value);
		return parsed.date ? `${parsed.date} ${parsed.time || '09:00'}` : '';
	}

	function hasReExaminationChanges(doc) {
		const enabled = isChecked(doc, 'doctorPrescriptionReExamToggle');
		const persistedEnabled = Boolean(STATE.reExaminationAppointmentId || STATE.reExaminationDateTime);
		if (enabled !== persistedEnabled) return true;
		return normalizeReExaminationDateTime(getValue(doc, 'doctorPrescriptionReExamDateTime'))
			!== normalizeReExaminationDateTime(STATE.reExaminationDateTime);
	}

	function syncPrescriptionReExamStatus(doc) {
		const element = getElement(doc, 'doctorPrescriptionReExamStatus');
		const hint = getElement(doc, 'doctorPrescriptionReExamHint');
		if (!element) return;
		const locked = isReExaminationConfirmed();
		const persisted = Boolean(STATE.reExaminationAppointmentId);
		const enabled = locked || isChecked(doc, 'doctorPrescriptionReExamToggle');
		const date = getValue(doc, 'doctorPrescriptionReExamDateTime');
		let status = 'idle';
		let label = 'Chưa hẹn';
		if (locked) {
			status = 'confirmed';
			label = 'Đã xác nhận';
		} else if (enabled && getReExaminationStatus() === 'ERROR') {
			status = 'error';
			label = 'Lỗi tạo lịch';
		} else if (enabled && !date) {
			status = 'invalid';
			label = 'Cần ngày';
		} else if (persisted && enabled && !hasReExaminationChanges(doc)) {
			status = 'scheduled';
			label = 'Đã tạo lịch';
		} else if (enabled || (persisted && hasReExaminationChanges(doc))) {
			status = 'pending';
			label = 'Chưa lưu';
		}
		element.dataset.status = status;
		element.textContent = label;
		if (hint) {
			const message = locked
				? 'Lịch tái khám đã được xác nhận và không thể chỉnh sửa tại đây.'
				: (enabled && !date
				? 'Chọn ngày giờ tái khám để lưu đơn.'
				: (enabled && getReExaminationStatus() === 'ERROR' ? 'Lịch tái khám chưa tạo được, vui lòng kiểm tra lại.' : ''));
			hint.dataset.status = locked ? 'confirmed' : (getReExaminationStatus() === 'ERROR' ? 'error' : '');
			hint.hidden = !message;
			hint.textContent = message;
		}
	}

	function syncPrescriptionReExamControls(doc) {
		const toggle = getElement(doc, 'doctorPrescriptionReExamToggle');
		const dateInput = getElement(doc, 'doctorPrescriptionReExamDateTime');
		const value = toggle?.closest('.doctor-prescription-reexam-value');
		const locked = isReExaminationConfirmed();
		if (locked) {
			setChecked(doc, 'doctorPrescriptionReExamToggle', true);
			if (STATE.reExaminationDateTime) setPrescriptionReExamDate(doc, STATE.reExaminationDateTime);
			if (toggle) {
				toggle.disabled = true;
				toggle.setAttribute('aria-disabled', 'true');
			}
			if (dateInput) dateInput.setAttribute('aria-readonly', 'true');
			if (value) {
				value.dataset.locked = 'true';
				value.setAttribute('title', 'Lịch tái khám đã được xác nhận và không thể chỉnh sửa tại đây.');
			}
		} else {
			if (toggle) {
				toggle.disabled = false;
				toggle.removeAttribute('aria-disabled');
			}
			if (dateInput) dateInput.removeAttribute('aria-readonly');
			if (value) {
				delete value.dataset.locked;
				value.removeAttribute('title');
			}
		}
		const enabled = locked || isChecked(doc, 'doctorPrescriptionReExamToggle');
		setDateTimeInputDisabled(dateInput, locked || !enabled);
		syncPrescriptionReExamStatus(doc);
	}

	function syncReExamDateFromMedicineDays(doc) {
		const checkbox = getElement(doc, 'doctorPrescriptionReExamToggle');
		const dateTimeInput = getElement(doc, 'doctorPrescriptionReExamDateTime');
		if (isReExaminationConfirmed() || !checkbox?.checked || !dateTimeInput) return false;
		syncPrescriptionReExamControls(doc);
		const nextDateTime = calculateReExaminationDateTime(getValue(doc, 'doctorPrescriptionMedicineDays'));
		if (!nextDateTime) {
			syncPrescriptionReExamStatus(doc);
			return false;
		}
		setDateTimePickerValue(dateTimeInput, nextDateTime);
		syncPrescriptionReExamStatus(doc);
		return true;
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
			setChecked(doc, 'doctorPrescriptionReExamToggle', Boolean(STATE.reExaminationAppointmentId || STATE.reExaminationDateTime));
			setPrescriptionReExamDate(doc, STATE.reExaminationDateTime);
			syncPrescriptionReExamControls(doc);
			syncPrescriptionRowQuantities(doc, { markAllocationStale: false });
			STATE.prescriptionLoaded = true;
			STATE.prescriptionDirty = false;
			STATE.prescriptionRevision = 0;
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
		const reExamLocked = isReExaminationConfirmed();
		const reExamEnabled = reExamLocked || isChecked(doc, 'doctorPrescriptionReExamToggle');
		const reExamDateTime = parseDateTimeInputValue(
			reExamLocked && STATE.reExaminationDateTime
				? STATE.reExaminationDateTime
				: getValue(doc, 'doctorPrescriptionReExamDateTime')
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

		if (isReExaminationConfirmed()) return true;
		const reExamEnabled = isChecked(doc, 'doctorPrescriptionReExamToggle');
		const reExamDateTime = parseDateTimeInputValue(getValue(doc, 'doctorPrescriptionReExamDateTime'));
		if (!reExamEnabled || reExamDateTime.date) return true;

		syncPrescriptionReExamStatus(doc);
		const error = new Error('Vui lòng chọn ngày giờ tái khám trước khi lưu');
		error.code = 'missing-re-examination-date';
		error.module = 'prescription';
		error.moduleLabel = 'Đơn thuốc';
		setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
		throw error;
	}

	function applyReExaminationSyncState(reExamSync, submittedPayload) {
		if (reExamSync && !reExamSync.ok) {
			STATE.reExaminationStatus = 'ERROR';
			return;
		}

		const submittedDateTime = buildDateTimeInputValue(
			submittedPayload.re_examination_date,
			submittedPayload.re_examination_time
		);
		const responseStatus = textOf(reExamSync && reExamSync.status).toUpperCase();
		const appointmentId = normalizeId(reExamSync && reExamSync.appointment_id);
		if (responseStatus === 'CANCELLED' || (!submittedDateTime && !appointmentId)) {
			STATE.reExaminationAppointmentId = null;
			STATE.reExaminationDateTime = '';
			STATE.reExaminationStatus = null;
			return;
		}

		if (!appointmentId) return;
		STATE.reExaminationAppointmentId = appointmentId;
		if (submittedDateTime) STATE.reExaminationDateTime = submittedDateTime;
		STATE.reExaminationStatus = responseStatus
			|| (reExamSync && reExamSync.skipped === 'already_confirmed' ? 'CONFIRMED' : 'SCHEDULED');
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

		const revision = STATE.prescriptionRevision;
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
			applyReExaminationSyncState(reExamSync, payload);
			const hasNewChanges = revision !== STATE.prescriptionRevision;
			if (!hasNewChanges) STATE.prescriptionDirty = false;
			renderPrescriptionRows(doc);
			updatePrescriptionFooter(doc);
			const hasReExamWarning = Boolean(reExamSync && !reExamSync.ok);
			if (hasReExamWarning) {
				STATE.prescriptionDirty = true;
				setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
				const error = new Error(`Không tạo được lịch tái khám: ${reExamSync.detail || 'cần kiểm tra lại thông tin lịch'}`);
				error.code = 're-examination-sync-failed';
				error.module = 'prescription';
				error.moduleLabel = 'Đơn thuốc';
				throw error;
			}
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
			setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
			throw error;
		} finally {
			STATE.prescriptionSaving = false;
			syncPrescriptionReExamControls(doc);
		}
	}

	function renderMedicineDropdown(doc, input, row, medicines) {
		const dropdown = getMedicineDropdown(doc);
		STATE.medicineOptions.clear();
		STATE.medicineDropdownInput = input;
		STATE.medicineDropdownRowUid = row.uid;
		STATE.medicineDropdownActiveIndex = -1;
		input?.removeAttribute('aria-busy');
		updateMedicineInputState(input, true);
		if (!Array.isArray(medicines) || !medicines.length) {
			dropdown.innerHTML = '<div class="doctor-support-dropdown__empty">Không tìm thấy thuốc trong kho</div>';
			dropdown.hidden = false;
			positionMedicineDropdown(doc);
			return;
		}
		dropdown.innerHTML = medicines.map((medicine, index) => {
			const optionKey = `${row.uid}:${medicine.id}`;
			STATE.medicineOptions.set(optionKey, medicine);
			return `
				<button type="button" id="doctorMedicineOption-${escapeAttr(row.uid)}-${index}" class="doctor-support-dropdown__item" data-medicine-select="${escapeAttr(optionKey)}" role="option" aria-selected="false">
					<span class="doctor-support-dropdown__title">${escapeHtml(medicine.name)}</span>
					<span class="doctor-support-dropdown__meta">${escapeHtml([medicine.strength, medicine.unit, `Tồn kho ${medicine.stock_quantity ?? 0}`, formatCurrency(medicine.unit_price)].filter(Boolean).join(' · '))}</span>
				</button>
			`;
		}).join('');
		dropdown.hidden = false;
		positionMedicineDropdown(doc);
	}

	function scheduleMedicineSearch(input, row) {
		if (row.isExternal) return;
		const doc = STATE.document || document;
		const query = input.value.trim();
		hideMedicineDropdown(doc);
		const token = ++STATE.medicineSearchToken;
		const dropdown = getMedicineDropdown(doc);
		STATE.medicineDropdownInput = input;
		STATE.medicineDropdownRowUid = row.uid;
		STATE.medicineDropdownActiveIndex = -1;
		input.setAttribute('aria-busy', 'true');
		updateMedicineInputState(input, true);
		dropdown.innerHTML = '<div class="doctor-support-dropdown__empty">Đang tải danh sách thuốc...</div>';
		dropdown.hidden = false;
		positionMedicineDropdown(doc);
		STATE.medicineSearchTimer = window.setTimeout(async () => {
			try {
				const medicineEndpoint = typeof endpoints.medicines === 'function'
					? endpoints.medicines(query)
					: (endpoints.medicines || `/api/medicines/?search=${encodeURIComponent(query)}&per_page=8`);
				const data = await requestJson(medicineEndpoint);
				if (token !== STATE.medicineSearchToken
					|| !input.isConnected
					|| findPrescriptionRow(row.uid) !== row) return;
				renderMedicineDropdown(doc, input, row, data && data.medicines ? data.medicines : []);
			} catch (error) {
				if (token === STATE.medicineSearchToken) hideMedicineDropdown(doc);
			} finally {
				if (token === STATE.medicineSearchToken) STATE.medicineSearchTimer = null;
			}
		}, query ? 250 : 0);
	}

	function applyMedicineSelection(doc, optionKey) {
		const medicine = STATE.medicineOptions.get(optionKey);
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
		hideMedicineDropdown(doc);
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
			scheduleMedicineSearch(target, row);
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
			if ([dom.reExamToggle, dom.reExamDateTime].includes(target.id) && isReExaminationConfirmed()) {
				syncPrescriptionReExamControls(doc);
				return;
			}
			if (target.dataset.prescriptionField && handlePrescriptionInput(doc, target)) return;
			if ([dom.reExamDateTime, dom.medicineDays].includes(target.id)) {
				if (target.id === dom.medicineDays) {
					syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
					updatePrescriptionFooter(doc);
				}
				markPrescriptionDirty();
				if (target.id === dom.medicineDays && isChecked(doc, 'doctorPrescriptionReExamToggle')) {
					syncReExamDateFromMedicineDays(doc);
				}
			}
		});

		workspace.addEventListener('focusin', event => {
			const target = event.target;
			if (!target || target.tagName !== 'INPUT' || target.dataset.prescriptionField !== 'name') return;
			const rowUid = getRowUidFromTarget(target, '[data-prescription-row-id]', 'data-prescription-row-id');
			const row = findPrescriptionRow(rowUid);
			if (row && !row.isExternal) scheduleMedicineSearch(target, row);
		});

		workspace.addEventListener('keydown', event => {
			const target = event.target;
			if (!(target instanceof window.HTMLInputElement) || target.dataset.prescriptionField !== 'name') return;
			const dropdown = getMedicineDropdown(doc);
			if (event.key === 'Escape') {
				hideMedicineDropdown(doc);
				return;
			}
			if (dropdown.hidden || target !== STATE.medicineDropdownInput) return;
			const options = Array.from(dropdown.querySelectorAll('[data-medicine-select]'));
			if (!options.length) return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				const direction = event.key === 'ArrowDown' ? 1 : -1;
				const current = STATE.medicineDropdownActiveIndex;
				setActiveMedicineOption(doc, current < 0
					? (direction > 0 ? 0 : options.length - 1)
					: current + direction);
				return;
			}
			if (event.key === 'Enter' && STATE.medicineDropdownActiveIndex >= 0) {
				event.preventDefault();
				applyMedicineSelection(doc, options[STATE.medicineDropdownActiveIndex].dataset.medicineSelect);
			}
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
			if (target?.tagName === 'INPUT') {
				if ([dom.reExamToggle, dom.reExamDateTime].includes(target.id) && isReExaminationConfirmed()) {
					syncPrescriptionReExamControls(doc);
					return;
				}
				if (target.id === dom.medicineDays && isChecked(doc, 'doctorPrescriptionReExamToggle')) {
					syncReExamDateFromMedicineDays(doc);
					return;
				}
				if (target.id === dom.reExamToggle) {
					syncPrescriptionReExamControls(doc);
					if (target.checked && !getValue(doc, 'doctorPrescriptionReExamDateTime')) syncReExamDateFromMedicineDays(doc);
					if (!target.checked) setDateTimePickerValue(getElement(doc, 'doctorPrescriptionReExamDateTime'), '');
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
				&& !event.target.closest('[data-prescription-dropdown]')) hideMedicineDropdown(doc);
		});

		doc.addEventListener('scroll', () => positionMedicineDropdown(doc), true);
		(doc.defaultView || window).addEventListener('resize', () => positionMedicineDropdown(doc));

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
		isReExaminationLocked: isReExaminationConfirmed,
		getPrescriptionCodesByType: () => ({ ...STATE.prescriptionCodesByType }),
		getConfig: () => ({ ...config, dom: { ...dom }, endpoints: { ...endpoints } }),
		getState: () => STATE
	};
	}

	const doctorConfig = window.QLPKDoctorModuleRegistry.get('doctorComponentConfig');
	const getDoctorPageContext = () => window.QLPKDoctorModuleRegistry.get('doctorComponentContext')?.getCurrent?.() || null;
	const getDoctorPageState = () => getDoctorPageContext()?.stateObject || null;
	const doctorInstance = create({
		config: doctorConfig?.prescription || {},
		getAppointmentId: () => getDoctorPageState()?.currentAppointmentId || null,
		getPatientId: () => getDoctorPageState()?.currentPatientId || null,
		isLoading: () => Boolean(getDoctorPageState()?.isLoadingExaminationData),
		showToast: (type, message) => getDoctorPageContext()?.runtime?.showCustomToast?.(type, message)
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
