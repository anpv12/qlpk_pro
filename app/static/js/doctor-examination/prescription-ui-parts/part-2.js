// doctor-examination/prescription-ui.js: phần 2/3 các hàm của create() (nạp trước prescription-ui.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window, document) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['doctor-examination/prescription-ui#create'] || (window.QLPKModuleParts['doctor-examination/prescription-ui#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
	function updateBatchAllocationDisplays(doc) {
		const workspace = inst.getElement(doc, 'doctorPrescriptionWorkspace');
		if (!workspace || typeof inst.ROWS.updateBatchAllocation !== 'function') return false;
		const renderedMedicineIds = new Set();
		inst.STATE.prescriptionRows.forEach(row => {
			const medicineId = !row.isExternal && inst.normalizeId(row.medicineId);
			const key = medicineId ? String(medicineId) : '';
			const showAllocation = Boolean(key) && !renderedMedicineIds.has(key);
			if (showAllocation) renderedMedicineIds.add(key);
			inst.ROWS.updateBatchAllocation({
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
		inst.STATE.prescriptionHistoryPanelOpen = open;
		if (open) inst.STATE.prescriptionHistorySelectedIndex = 0;
		return inst.HISTORY.setPanel({
			document: doc,
			root: doc,
			dom: {
				panel: inst.dom.historyPanel,
				count: inst.dom.historyCount,
				list: inst.dom.historyList
			},
			isOpen: open
		});
	}
	function renderPrescriptionHistory(doc) {
		return inst.HISTORY.render({
			document: doc,
			root: doc,
			dom: {
				panel: inst.dom.historyPanel,
				count: inst.dom.historyCount,
				list: inst.dom.historyList
			},
			history: inst.STATE.prescriptionHistory,
			isOpen: inst.STATE.prescriptionHistoryPanelOpen,
			selectedIndex: inst.STATE.prescriptionHistorySelectedIndex,
			patientName: inst.getElement(doc, 'doctorClinicalHeading')?.textContent?.trim() || ''
		});
	}
	function renderPrescriptionRows(doc) {
		const mode = inst.getCurrentPrescriptionUsageMode(doc);
		inst.setPrescriptionUsageMode(doc, mode);
		return inst.ROWS.render({
			document: doc,
			root: inst.getElement(doc, 'doctorPrescriptionWorkspace'),
			dom: {
				list: inst.dom.list,
				tableHead: inst.dom.tableHead,
				table: inst.dom.table,
				empty: inst.dom.empty
			},
			rows: inst.STATE.prescriptionRows,
			mode,
			codesByType: { ...inst.STATE.prescriptionCodesByType },
			getRowTotal: row => inst.formatCurrency(inst.getPrescriptionRowTotal(row)),
			afterRender: inst.updatePrescriptionFooter
		});
	}
	function buildPrescriptionCodeMap(data) {
		const codes = {};
		(data.prescriptions || []).forEach(prescription => {
			const prescriptionType = prescription && (prescription.type || prescription.prescription_type);
			if (prescriptionType && prescription.prescription_code) {
				codes[prescriptionType] = prescription.prescription_code;
			}
		});
		if (data.prescription_code && !Object.keys(codes).length) codes.BASIC = data.prescription_code;
		return codes;
	}
	function applyLoadedReExamination(doc, data) {
		inst.STATE.reExaminationAppointmentId = inst.normalizeId(data.re_examination_appointment_id);
		inst.STATE.reExaminationDateTime = inst.buildDateTimeInputValue(data.re_examination_date, data.re_examination_time) || '';
		inst.STATE.reExaminationStatus = inst.textOf(data.re_examination_status) || null;
		inst.STATE.reExaminationSnapshot = data.re_examination_snapshot || null;
		inst.STATE.reExaminationDraftSelection = inst.STATE.reExaminationSnapshot?.selection || null;
		inst.STATE.reExaminationError = '';
		inst.setPrescriptionReExamDate(doc, inst.STATE.reExaminationDateTime);
	}
	async function loadPrescription(context) {
		const { doc, token, appointmentId } = context;
		try {
			const data = await inst.requestJson(inst.endpoints.prescription(appointmentId));
			if (!inst.isCurrentToken(token, appointmentId)) return false;
			const usageState = inst.parseGlobalUsageInstructions(data && data.usage_instructions, inst.STATE.prescriptionUsageMode);
			inst.setPrescriptionUsageMode(doc, usageState.scheduleMode);

			inst.STATE.prescriptionRows = Array.isArray(data && data.medicines)
				? data.medicines.map(item => inst.normalizePrescriptionRow(item))
				: [];
			inst.STATE.prescriptionCodesByType = buildPrescriptionCodeMap(data);
			inst.STATE.preservedGlobalUsage = usageState.globalUsage || '';
			inst.setValue(doc, 'doctorPrescriptionMedicineDays', usageState.medicineDays || '');
			applyLoadedReExamination(doc, data);
			inst.syncPrescriptionRowQuantities(doc, { markAllocationStale: false });
			inst.STATE.prescriptionLoaded = true;
			inst.syncPrescriptionReExamControls(doc);
			inst.CHANGES.reset();
			const hasPersistedPrescription = Boolean(
				inst.STATE.prescriptionRows.length
				|| (data.prescriptions || []).length
				|| data.re_examination_date
				|| usageState.globalUsage
				|| usageState.medicineDays
			);
			inst.setPrescriptionSaveStatus(doc, hasPersistedPrescription ? 'saved' : 'idle', hasPersistedPrescription ? 'Đã lưu' : 'Chưa có thay đổi');
			renderPrescriptionRows(doc);
			return true;
		} catch (error) {
			if (inst.isCurrentToken(token, appointmentId)) {
				inst.showToast('error', 'Không thể tải đơn thuốc. Vui lòng thử lại.');
			}
			return false;
		}
	}
	function collectPrescriptionPayload(doc) {
		const appointmentId = inst.getCurrentAppointmentId();
		const reExamLocked = inst.isReExaminationLocked();
		const reExamEnabled = reExamLocked || Boolean(inst.STATE.reExaminationDraftDateTime);
		const reExamDateTime = inst.parseDateTimeInputValue(
			reExamLocked && inst.STATE.reExaminationDateTime
				? inst.STATE.reExaminationDateTime
				: inst.STATE.reExaminationDraftDateTime
		);
		const usageMode = inst.getCurrentPrescriptionUsageMode(doc);
		const medicines = inst.STATE.prescriptionRows
			.filter(row => row.name && inst.toNumber(row.quantity, 0) > 0)
			.map(row => ({
				medicine_id: row.isExternal ? null : row.medicineId,
				name: row.name,
				quantity: inst.roundPrescriptionQuantity(inst.toNumber(row.quantity, 1)) || 1,
				unit: row.unit,
				strength: row.strength,
				route: row.route,
				usage: inst.buildMedicineUsagePayload(row, usageMode),
				unit_price: inst.toNumber(row.unitPrice, 0),
				is_external: Boolean(row.isExternal),
				category_type: row.categoryType || 'DRUG',
				prescription_type: inst.normalizePrescriptionType(row.prescriptionType)
			}));
		return {
			appointment_id: appointmentId,
			medicines,
			total_amount: inst.getPrescriptionTotal(),
			usage_instructions: inst.buildGlobalUsageInstructions(
				inst.STATE.preservedGlobalUsage,
				usageMode,
				inst.getValue(doc, 'doctorPrescriptionMedicineDays')
			),
			re_examination_snapshot: inst.STATE.reExaminationSnapshot,
			re_examination_selection: reExamLocked ? inst.STATE.reExaminationSnapshot?.selection : inst.STATE.reExaminationDraftSelection,
			re_examination_date: reExamEnabled ? reExamDateTime.date : '',
			re_examination_time: reExamEnabled ? (reExamDateTime.time || '09:00') : ''
		};
	}
	function validatePrescriptionBeforeSave(doc) {
		const invalidStockRow = inst.STATE.prescriptionRows.find(row => row.name
			&& inst.toNumber(row.quantity, 0) > 0
			&& !row.isExternal
			&& !inst.normalizeId(row.medicineId));
		if (invalidStockRow) {
			const error = new Error(`Thuốc "${invalidStockRow.name}" chưa được chọn từ danh sách thuốc trong kho.`);
			error.code = 'missing-medicine-id';
			error.module = 'prescription';
			error.moduleLabel = 'Đơn thuốc';
			inst.setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
			throw error;
		}

		inst.STATE.reExaminationError = '';
		if (!inst.hasReExaminationChanges()) return true;
		const enabled = Boolean(inst.STATE.reExaminationDraftDateTime);
		const parsed = inst.parseDateTimeInputValue(inst.STATE.reExaminationDraftDateTime);
		const when = new Date(`${parsed.date || ''}T${parsed.time || '09:00'}`);
		const message = inst.isReExaminationLocked() ? inst.reExaminationLockReason()
			: enabled && (!Number.isFinite(when.getTime()) || when <= new Date())
			? 'Ngày giờ tái khám mới phải nằm trong tương lai.' : '';
		if (!message) return true;
		inst.showReExaminationError(doc, message);
		const error = new Error(message);
		error.code = 're-examination-invalid';
		error.module = 'prescription';
		error.moduleLabel = 'Đơn thuốc';
		throw error;
	}
	function applyReExaminationSyncState(reExamSync) {
		if (!reExamSync) return;
		inst.STATE.reExaminationSnapshot = reExamSync;
		inst.STATE.reExaminationAppointmentId = inst.normalizeId(reExamSync.appointment_id);
		inst.STATE.reExaminationDateTime = reExamSync.datetime || '';
		inst.STATE.reExaminationStatus = reExamSync.status || null;
	}
	function getPrescriptionSaveSkip(doc) {
		if (!inst.getCurrentAppointmentId()) return { skipped: true, reason: 'missing-appointment' };
		if (inst.STATE.isLoading && inst.STATE.isLoading()) return { skipped: true, reason: 'loading' };
		if (!inst.STATE.prescriptionLoaded) {
			const error = new Error('Chưa tải xong đơn thuốc của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			error.module = 'prescription';
			error.moduleLabel = 'Đơn thuốc';
			inst.setPrescriptionSaveStatus(doc, 'error', 'Chưa tải xong');
			throw error;
		}
		if (inst.STATE.prescriptionSaving) return { skipped: true, reason: 'saving', module: 'prescription' };
		return null;
	}
	function applySavedPrescription(doc, data, revision, options) {
		inst.STATE.prescriptionCodesByType = data && data.prescription_codes_by_type ? data.prescription_codes_by_type : inst.STATE.prescriptionCodesByType;
		inst.applyStockAllocationStates(data && data.stock_allocation_states);
		const hasNewChanges = !inst.CHANGES.settle(revision);
		applyReExaminationSyncState(data && data.re_examination_sync_result);
		if (!hasNewChanges) {
			inst.STATE.reExaminationDraftSelection = inst.STATE.reExaminationSnapshot?.selection || null;
			inst.setPrescriptionReExamDate(doc, inst.STATE.reExaminationDateTime);
		}
		inst.STATE.reExaminationError = '';
		renderPrescriptionRows(doc);
		inst.updatePrescriptionFooter(doc);

		inst.setPrescriptionSaveStatus(
			doc,
			hasNewChanges ? 'dirty' : 'saved',
			hasNewChanges ? 'Đã lưu bản trước · còn thay đổi' : 'Đã lưu'
		);
		inst.showToast(
			hasNewChanges ? 'info' : 'success',
			hasNewChanges ? 'Đã lưu đơn thuốc trước đó; có thay đổi mới cần lưu lại.' : inst.buildInventorySaveMessage(data),
			options
		);
		return {
			status: 'success',
			module: 'prescription',
			data,
			hasNewChanges,
			inventoryMessage: inst.buildInventorySaveMessage(data)
		};
	}
	function handlePrescriptionSaveError(doc, error) {
		if (String(error.code || '').startsWith('re-examination-')) {
			const current = error.payload?.re_examination_snapshot;
			if (current && error.code === 're-examination-conflict') {
				applyReExaminationSyncState(current);
				inst.STATE.reExaminationDraftSelection = current.selection || null;
				inst.setPrescriptionReExamDate(doc, current.datetime || '');
			}
			inst.showReExaminationError(doc, error.payload?.detail || error.message);
		}
		inst.setPrescriptionSaveStatus(doc, 'error', 'Lưu thất bại');
	}
	async function savePrescription(options = {}) {
		const doc = inst.getDocument(options);
		const skip = getPrescriptionSaveSkip(doc);
		if (skip) return skip;
		validatePrescriptionBeforeSave(doc);

		const revision = inst.CHANGES.capture();
		const payload = collectPrescriptionPayload(doc);
		inst.STATE.prescriptionSaving = true;
		inst.setPrescriptionSaveStatus(doc, 'saving', 'Đang lưu');
		inst.syncPrescriptionReExamStatus(doc);
		try {
			const data = await inst.requestJson(typeof inst.endpoints.save === 'function' ? inst.endpoints.save() : inst.endpoints.save, {
				method: 'POST',
				body: payload
			});
			return applySavedPrescription(doc, data, revision, options);
		} catch (error) {
			handlePrescriptionSaveError(doc, error);
			throw error;
		} finally {
			inst.STATE.prescriptionSaving = false;
			inst.syncPrescriptionReExamControls(doc);
		}
	}
	function applyMedicineSelection(doc, optionKey) {
		const medicine = inst.SEARCH.getOption(optionKey);
		if (!medicine) return false;
		const rowUid = optionKey.split(':')[0];
		const row = inst.findPrescriptionRow(rowUid);
		if (!row) return false;
		row.medicineId = inst.normalizeId(medicine.id);
		row.name = inst.textOf(medicine.name);
		row.genericName = inst.textOf(medicine.generic_name || medicine.active_ingredient);
		row.unit = inst.textOf(medicine.unit);
		row.strength = inst.textOf(medicine.strength);
		row.route = inst.textOf(medicine.administration_method);
		row.unitPrice = inst.toNumber(medicine.unit_price, 0);
		row.currentStockQuantity = medicine.stock_quantity ?? null;
		row.categoryType = inst.textOf(medicine.category_type || 'DRUG');
		row.prescriptionType = inst.normalizePrescriptionType(medicine.prescription_type);
		row.isExternal = false;
		row.batchAllocation = null;
		row.batchAllocationStale = false;
		row.usageNoteMode = inst.PRESCRIPTION_USAGE_NOTE_MODES.GENERATED;
		inst.SEARCH.hide(doc);
		inst.markPrescriptionDirty();
		inst.syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
		inst.syncPrescriptionUsageNotes(doc);
		renderPrescriptionRows(doc);
		return true;
	}
	function addPrescriptionRow(doc, isExternal) {
		inst.STATE.prescriptionRows.push(inst.normalizePrescriptionRow({ is_external: isExternal }, isExternal));
		inst.markPrescriptionDirty();
		renderPrescriptionRows(doc);
	}
	function removePrescriptionRow(doc, rowUid) {
		inst.STATE.prescriptionRows = inst.STATE.prescriptionRows.filter(row => row.uid !== rowUid);
		inst.syncBatchAllocationStaleness();
		inst.markPrescriptionDirty();
		renderPrescriptionRows(doc);
	}
	async function loadPrescriptionHistory(context) {
		const { doc, token, appointmentId, patientId } = context;
		if (!patientId) {
			renderPrescriptionHistory(doc);
			return false;
		}
		try {
			const data = await inst.requestJson(inst.endpoints.history(patientId));
			if (!inst.isCurrentToken(token, appointmentId)) return false;
			inst.STATE.prescriptionHistory = (Array.isArray(data && data.history) ? data.history : [])
				.filter(record => String(record && record.appointment_id) !== String(appointmentId));
			inst.STATE.prescriptionHistoryLoaded = true;
			renderPrescriptionHistory(doc);
			doc.dispatchEvent(new CustomEvent('qlpk:doctor-prescription-history-loaded', {
				detail: { patientId, appointmentId }
			}));
			return true;
		} catch (error) {
			if (inst.isCurrentToken(token, appointmentId)) {
				inst.STATE.prescriptionHistory = [];
				inst.STATE.prescriptionHistoryLoaded = false;
				renderPrescriptionHistory(doc);
				doc.dispatchEvent(new CustomEvent('qlpk:doctor-prescription-history-loaded', {
					detail: { patientId, appointmentId, failed: true }
				}));
			}
			return false;
		}
	}
	function getLatestPreviousVisitSnapshot() {
		if (!inst.STATE.prescriptionHistoryLoaded) return { status: 'loading' };
		const currentAppointmentTime = Date.parse(String(inst.STATE.appointmentDate || '').replace(' ', 'T'));
		const record = inst.STATE.prescriptionHistory.find(item => {
			if (!item || !item.appointment_id) return false;
			if (Number.isNaN(currentAppointmentTime)) return true;
			const recordTime = Date.parse(String(item.appointment_date_iso || '').replace(' ', 'T'));
			return Number.isNaN(recordTime) || recordTime < currentAppointmentTime;
		});
		if (!record) return { status: 'empty' };

		const medicines = (Array.isArray(record.prescriptions) ? record.prescriptions : [])
			.flatMap(prescription => Array.isArray(prescription && prescription.medicines) ? prescription.medicines : [])
			.map(medicine => inst.textOf(medicine && medicine.name))
			.filter(Boolean)
			.filter((name, index, names) => names.findIndex(item => item.toLowerCase() === name.toLowerCase()) === index);
		const medicineSummary = medicines.length > 1
			? `${medicines[0]} +${medicines.length - 1}`
			: medicines[0] || 'Chưa kê thuốc';

		return {
			status: 'ready',
			appointmentDate: inst.textOf(record.appointment_date),
			diagnosis: inst.textOf(record.diagnosis),
			medicineSummary
		};
	}
	function ensureRowSchedule(doc, row) {
		row.schedule = inst.normalizeSchedulePayload(row.schedule || {}, inst.getCurrentPrescriptionUsageMode(doc));
		return row.schedule;
	}
	function applyPrescriptionNameInput(doc, row, target) {
		row.name = target.value.trim();
		if (!row.isExternal) {
			row.medicineId = null;
			row.currentStockQuantity = null;
			row.batchAllocation = null;
			row.batchAllocationStale = false;
		}
		inst.syncBatchAllocationStaleness();
		updateBatchAllocationDisplays(doc);
		inst.SEARCH.search(target, row);
		return true;
	}
	function applyPrescriptionFieldInput(doc, row, target, field) {
		if (inst.PRESCRIPTION_TIME_SLOT_FIELDS.includes(field)) {
			ensureRowSchedule(doc, row).time_slots[field] = Math.max(0, inst.parseDoseValue(target.value, 0));
			return true;
		}
		const handler = inst.PRESCRIPTION_FIELD_HANDLERS.get(field);
		if (handler) return handler(doc, row, target);
		row[field] = target.value;
		return true;
	}
	function syncAfterPrescriptionInput(doc, field) {
		if (inst.PRESCRIPTION_SCHEDULE_FIELDS.includes(field)) {
			inst.syncPrescriptionRowQuantities(doc, { preserveWhenDaysMissing: false });
		} else if (['route', 'unit'].includes(field)) {
			inst.syncPrescriptionUsageNotes(doc);
		}
	}

		Object.assign(inst, {
			updateBatchAllocationDisplays,
			setPrescriptionHistoryPanel,
			renderPrescriptionHistory,
			renderPrescriptionRows,
			buildPrescriptionCodeMap,
			applyLoadedReExamination,
			loadPrescription,
			collectPrescriptionPayload,
			validatePrescriptionBeforeSave,
			applyReExaminationSyncState,
			getPrescriptionSaveSkip,
			applySavedPrescription,
			handlePrescriptionSaveError,
			savePrescription,
			applyMedicineSelection,
			addPrescriptionRow,
			removePrescriptionRow,
			loadPrescriptionHistory,
			getLatestPreviousVisitSnapshot,
			ensureRowSchedule,
			applyPrescriptionNameInput,
			applyPrescriptionFieldInput,
			syncAfterPrescriptionInput
		});
	});
})(window, document);
