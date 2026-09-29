// components/doctor-indications-form.js: phần 2/2 các hàm của create() (nạp trước doctor-indications-form.js).
// Mỗi instance gọi installer: state instance qua inst, hằng/hàm cấp module qua outer.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/doctor-indications-form#create'] || (window.QLPKModuleParts['components/doctor-indications-form#create'] = { installers: [] });
	moduleParts.installers.push(function (inst, outer) {
		function readForm(doc) {
			const inputs = inst.readFormInputs(doc);
			const invalid = inst.validateFormInputs(inputs);
			if (invalid) return invalid;
			const { locationType } = inputs;
			const survey = inst.resolveSelectedSurvey(inputs.typedName);
			return {
				valid: true,
				data: {
					survey_template_id: survey.surveyTemplateId,
					order_name: inputs.typedName,
					location_type: locationType,
					in_house_unit_id: locationType === 'in' ? inputs.performerId : null,
					in_house_unit: locationType === 'in' ? inputs.performerName : '',
					out_facility: locationType === 'out' ? inputs.outFacilityName : '',
					scheduled_for: inputs.scheduledFor,
					source: survey.source,
					status: 'sent',
					is_completed: false
				}
			};
		}
		function markDirty() {
			inst.CHANGES.mark();
		}
		function handleSubmit(doc) {
			if (!inst.STATE.ordersLoaded) return;
			const validation = readForm(doc);
			if (!validation.valid) {
				inst.setMessage(doc, validation.message, 'warning');
				if (validation.focus && typeof validation.focus.focus === 'function') validation.focus.focus();
				return;
			}
			const existingIndex = inst.STATE.rows.findIndex(row => String(row.tempId) === String(inst.STATE.editingTempId));
			if (existingIndex >= 0) {
				const existing = inst.STATE.rows[existingIndex];
				inst.STATE.rows[existingIndex] = inst.normalizeRow({ ...existing, ...validation.data, tempId: existing.tempId, uid: existing.uid, status: existing.status, is_completed: existing.is_completed });
			} else {
				inst.STATE.rows.push(inst.normalizeRow({ ...validation.data, tempId: `ind-${Date.now()}-${inst.STATE.rows.length + 1}` }));
			}
			markDirty();
			inst.resetForm(doc);
			inst.renderCurrentRows(doc);
			inst.setFormReady(doc);
			inst.setMessage(doc, existingIndex >= 0 ? 'Đã cập nhật chỉ định trong lượt khám. Nhấn Lưu để ghi nhận.' : 'Đã thêm chỉ định vào lượt khám. Nhấn Lưu để ghi nhận.', 'success');
		}
		async function handleDelete(doc, tempId) {
			const row = inst.STATE.rows.find(item => String(item.tempId) === String(tempId));
			if (!row) return false;
			const confirmed = await outer.CONFIRMATION_DIALOG.confirm({
				title: 'Xóa chỉ định?',
				text: `Chỉ định "${row.order_name}" sẽ được xóa khi bạn nhấn Lưu.`,
				icon: 'warning',
				variant: 'danger',
				confirmText: 'Xóa chỉ định',
				cancelText: 'Hủy',
				showToast: inst.showToast,
				failureMessage: 'Không thể mở hộp thoại xác nhận. Vui lòng tải lại trang.'
			});
			if (!confirmed) return false;
			inst.STATE.rows = inst.STATE.rows.filter(item => String(item.tempId) !== String(tempId));
			if (String(inst.STATE.editingTempId) === String(tempId)) inst.resetForm(doc);
			markDirty();
			inst.renderCurrentRows(doc);
			inst.setMessage(doc, 'Đã xóa khỏi danh sách. Nhấn Lưu để ghi nhận.', 'success');
			return true;
		}
		async function loadCurrent(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await inst.requestJson(inst.endpoint('appointment', { appointmentId }), { method: 'GET' });
				if (!inst.currentToken(token, appointmentId)) return false;
				inst.STATE.rows = inst.mapServerRows(data?.chi_dinh || []);
				inst.STATE.ordersLoaded = true;
				inst.CHANGES.reset();
				inst.renderCurrentRows(doc);
				return true;
			} catch (error) {
				if (inst.currentToken(token, appointmentId)) inst.setMessage(doc, 'Không thể tải chỉ định của lượt khám. Vui lòng thử lại.', 'error');
				return false;
			}
		}
		async function refreshCurrent(options = {}) {
			const doc = inst.getDocument(options);
			if (!inst.STATE.appointmentId) return false;
			inst.STATE.realtimePending = true;
			if (!inst.STATE.ordersLoaded || inst.STATE.saving) return false;
			if (inst.STATE.ordersDirty || inst.STATE.editingTempId) {
				inst.setMessage(doc, 'Có cập nhật chỉ định. Lưu hoặc kết thúc chỉnh sửa để xem dữ liệu mới.', 'info');
				return false;
			}
			const appointmentId = inst.STATE.appointmentId;
			const token = inst.STATE.contextToken;
			const revision = inst.CHANGES.capture();
			const request = ++inst.STATE.realtimeRequest;
			try {
				const data = await inst.requestJson(inst.endpoint('appointment', { appointmentId }), { method: 'GET' });
				if (!inst.currentToken(token, appointmentId) || request !== inst.STATE.realtimeRequest) return false;
				if (inst.STATE.saving || inst.STATE.ordersDirty || inst.STATE.editingTempId || inst.CHANGES.changedSince(revision)) return false;
				inst.STATE.rows = inst.mapServerRows(data?.chi_dinh || []);
				inst.STATE.realtimePending = false;
				inst.renderCurrentRows(doc);
				return true;
			} catch (error) {
				if (inst.currentToken(token, appointmentId)) inst.setMessage(doc, 'Chưa cập nhật được chỉ định. Vui lòng thử lại.', 'error');
				return false;
			}
		}
		async function loadSurveyTemplates(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await inst.requestJson(inst.endpoint('surveyTemplates'), { method: 'GET' });
				if (!inst.currentToken(token, appointmentId)) return false;
				inst.STATE.surveyTemplates = Array.isArray(data?.data) ? data.data : [];
				inst.STATE.surveyIndex = inst.buildSurveyIndex(inst.STATE.surveyTemplates);
				inst.STATE.surveyLoaded = true;
				inst.renderNameField(doc);
				return true;
			} catch (error) {
				if (inst.currentToken(token, appointmentId)) {
					inst.STATE.surveyTemplates = [];
					inst.STATE.surveyIndex = new Map();
					inst.STATE.surveyLoaded = true;
					inst.renderNameField(doc);
				}
				return true;
			}
		}
		async function loadPerformers(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await inst.requestJson(inst.endpoint('performers'), { method: 'GET' });
				if (!inst.currentToken(token, appointmentId)) return false;
				inst.STATE.performers = Array.isArray(data) ? data : [];
				inst.STATE.performersLoaded = true;
				inst.renderPerformers(doc);
				return true;
			} catch (error) {
				if (inst.currentToken(token, appointmentId)) inst.setMessage(doc, 'Không thể tải người thực hiện. Vui lòng thử lại.', 'error');
				return false;
			}
		}
		function resetContextData(doc) {
			inst.STATE.realtimePending = false;
			inst.STATE.realtimeRequest += 1;
			inst.STATE.rows = [];
			inst.STATE.surveyTemplates = [];
			inst.STATE.surveyIndex = new Map();
			inst.STATE.selectedSurvey = null;
			inst.STATE.surveyLoaded = false;
			inst.STATE.performers = [];
			inst.STATE.performersLoaded = false;
			inst.STATE.ordersLoaded = false;
			inst.CHANGES.reset();
			inst.STATE.saving = false;
			inst.STATE.editingTempId = null;
			inst.renderNameField(doc);
			inst.renderPerformers(doc);
			inst.resetForm(doc);
			inst.renderCurrentRows(doc);
			inst.setFormReady(doc);
		}
		async function save(options = {}) {
			const doc = inst.getDocument(options);
			const appointmentId = outer.RUNTIME.getCurrentAppointmentId(inst.STATE);
			if (!appointmentId) return { skipped: true, reason: 'missing-appointment', module: 'indications' };
			if (inst.STATE.isLoading && inst.STATE.isLoading()) return { skipped: true, reason: 'loading', module: 'indications' };
			if (!inst.STATE.ordersLoaded) throw new Error('Chưa tải xong chỉ định của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			if (inst.STATE.saving) return { skipped: true, reason: 'saving', module: 'indications' };
			const revision = inst.CHANGES.capture();
			inst.STATE.saving = true;
			inst.setFormReady(doc);
			try {
				const refreshed = await outer.ORDER_STATE_UTILS.refreshSelectedOrderStatusesBeforeSave({
					apiCall: (url, requestOptions) => inst.STATE.apiCall(url, requestOptions),
					appointmentId,
					getSelectedOrders: () => inst.STATE.rows,
					setSelectedOrders: value => { inst.STATE.rows = value.map(inst.normalizeRow); },
					console,
					getCurrentAppointmentId: () => outer.RUNTIME.getCurrentAppointmentId(inst.STATE)
				});
				if (refreshed.canceled) return { skipped: true, reason: 'stale-context', module: 'indications' };
				const data = await inst.requestJson(inst.endpoint('appointment', { appointmentId }), {
					method: 'POST',
					body: { chi_dinh: inst.buildSavePayload() }
				});
				const saved = inst.CHANGES.settle(revision);
				if (saved) {
					inst.STATE.rows = inst.mapServerRows(data?.chi_dinh || []);
					inst.renderCurrentRows(doc);
				}
				inst.showToast(saved ? 'success' : 'info', saved ? 'Đã lưu chỉ định.' : 'Đã lưu chỉ định trước đó; thay đổi mới vẫn chưa lưu.', options);
				return { status: 'success', module: 'indications', data, hasNewChanges: !saved };
			} finally {
				inst.STATE.saving = false;
				inst.setFormReady(doc);
				if (inst.STATE.realtimePending && !inst.STATE.ordersDirty) refreshCurrent(options);
			}
		}
		function getDraftSnapshot() {
			return { rows: inst.draftRowsWithoutRuntimeIds(inst.STATE.rows) };
		}
		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			const doc = inst.getDocument(restoreOptions);
			inst.STATE.rows = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map(row => inst.normalizeRow(inst.cloneDraftValue(row)));
			inst.CHANGES.restore(restoreOptions.dirty);
			inst.renderCurrentRows(doc);
			inst.setFormReady(doc);
			return true;
		}
		function bind(bindOptions = {}) {
			const doc = inst.getDocument(bindOptions);
			const root = inst.el(doc, 'root');
			if (!root || inst.STATE.bound) return Boolean(root);
			inst.STATE.isLoading = bindOptions.isLoading || inst.STATE.isLoading;
			inst.STATE.apiCall = bindOptions.apiCall || inst.STATE.apiCall;
			outer.RUNTIME.configure(bindOptions);
			if (!inst.setupNameAutocomplete(doc)) {
				throw new Error('Không khởi tạo được ô tên chỉ định');
			}
			root.addEventListener('click', event => {
				const action = event.target.closest('[data-doctor-indication-action]');
				if (action) {
					const rowId = action.dataset.doctorIndicationId;
					if (action.dataset.doctorIndicationAction === 'edit') inst.startEdit(doc, rowId);
					if (action.dataset.doctorIndicationAction === 'delete') handleDelete(doc, rowId);
					return;
				}
				if (event.target.closest(`#${inst.domId('submit')}`)) handleSubmit(doc);
				if (event.target.closest(`#${inst.domId('cancelEdit')}`)) inst.resetForm(doc);
			});
			root.querySelectorAll('input[name="doctorIndicationLocation"]').forEach(input => {
				input.addEventListener('change', () => inst.updateLocationFields(doc));
			});
			inst.STATE.bound = true;
			inst.render(doc);
			return true;
		}
		function clear(options = {}) {
			inst.STATE.realtimePending = false;
			inst.STATE.realtimeRequest += 1;
			const doc = inst.getDocument(options);
			inst.STATE.contextToken += 1;
			inst.STATE.appointmentId = null;
			inst.STATE.patientId = null;
			inst.STATE.defaultDate = '';
			resetContextData(doc);
		}
		function load(context = {}) {
			const doc = inst.getDocument(context);
			const appointment = context.payload || context.appointment || {};
			const appointmentId = inst.normalizeId(context.appointmentId || appointment.id || appointment.appointment?.id);
			const patient = context.patientId || appointment.patient_id || appointment.patient_info?.id || appointment.patient?.id;
			if (!appointmentId) return Promise.resolve(false);
			inst.STATE.contextToken += 1;
			const token = inst.STATE.contextToken;
			inst.STATE.appointmentId = appointmentId;
			inst.STATE.patientId = inst.normalizeId(patient);
			inst.STATE.defaultDate = inst.normalizeDateInputValue(context.appointmentDate || appointment.appointment_date || appointment.appointment?.appointment_date);
			resetContextData(doc);
			const loadTasks = [
				loadCurrent({ doc, token, appointmentId }),
				loadPerformers({ doc, token, appointmentId }),
				loadSurveyTemplates({ doc, token, appointmentId })
			];
			return Promise.allSettled(loadTasks).then(results => {
				if (inst.currentToken(token, appointmentId)) inst.setFormReady(doc);
				if (inst.currentToken(token, appointmentId) && inst.STATE.realtimePending) refreshCurrent(context);
				return results.every(result => result.status === 'fulfilled' && result.value === true);
			});
		}

		Object.assign(inst, {
			readForm,
			markDirty,
			handleSubmit,
			handleDelete,
			loadCurrent,
			refreshCurrent,
			loadSurveyTemplates,
			loadPerformers,
			resetContextData,
			save,
			getDraftSnapshot,
			restoreDraftSnapshot,
			bind,
			clear,
			load
		});
	});
})(window);
