// Doctor busy schedule: the signed-in doctor's own busy periods — quick presets, create/edit form with
// conflict reporting, reason suggestions, filtered list, delete confirmation, realtime refresh.
// Shared page runtime (formerly classic script tags), in page order.
import './app-version-check.js';
import './flatpickr-vn.js';
import './sidebar-dry-loader.js';
import './datepicker-init.js';
import './custom-modal.js';
import './realtime-page-hooks.js';
import { byId, delegate, el, icon, on, replace } from './shared/dom.js';
import { HttpError, requestJson } from './shared/http-json.js';
import { formatDateTime, formatTimeRangeReadable, statusIndicator } from './doctor-busy-schedule/format.js';
import { setQuickTime, setQuickTimeSelection, setRange } from './doctor-busy-schedule/quick-time.js';
import { QLPKSearchNormalization } from './shared/search-normalization.js';
import { QLPKRealtimePageHooks } from './realtime-page-hooks.js';
import { QLPKUserFeedback } from './shared/user-feedback.js';

const DEFAULT_REASONS = ['Họp định kỳ', 'Nghỉ phép', 'Khám ngoài', 'Đào tạo', 'Hội nghị', 'Nghỉ ốm', 'Công tác', 'Nghỉ lễ'];
const state = { user: null, schedules: [], revision: 0, reasons: null, reasonsTime: null, editingId: null };
const showAlert = (message, type = 'info') => QLPKUserFeedback?.show(type, message, { duration: 5000 });
const normalize = value => QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const field = name => document.querySelector(`input[name="${name}"]`);
const submitLabel = editing => [icon(editing ? 'bi-check-lg' : 'bi-plus-lg', 'me-2'), editing ? 'Cập nhật lịch bận' : 'Tạo lịch bận'];
const setSubmitLabels = editing => document.querySelectorAll('button[type="submit"]').forEach(button => replace(button, submitLabel(editing)));

async function loadUserInfo() {
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = 'login.html';
		return;
	}
	try {
		state.user = await requestJson('/check/me');
		if (byId('sidebarUserName')) byId('sidebarUserName').textContent = state.user.full_name || 'N/A';
		if (byId('sidebarUserRole')) byId('sidebarUserRole').textContent = state.user.role || 'N/A';
	} catch (error) {
		if (error instanceof HttpError && error.status === 401) window.location.href = 'login.html';
		else showAlert('Không thể tải thông tin người dùng', 'error');
	}
}

function validateDateTimeInputs() {
	const startVal = field('start_datetime').value;
	const endVal = field('end_datetime').value;
	if (!startVal || !endVal) return;
	const startTime = new Date(startVal);
	const endTime = new Date(endVal);
	if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) return;
	const toast = (type, message) => QLPKUserFeedback?.show(type, message);
	if (startTime >= endTime) toast('error', 'Thời gian kết thúc phải sau thời gian bắt đầu');
	else if (endTime < new Date()) toast('error', 'Không thể tạo lịch bận trong quá khứ');
	else toast('success', `Thời gian bận: ${Math.round((endTime - startTime) / (1000 * 60 * 60))} giờ`);
}

function displayReasonSuggestions(suggestions) {
	const container = byId('reasonSuggestionsContainer');
	if (!suggestions || !suggestions.length) {
		replace(container, el('small', { class: 'text-muted' }, 'Không có gợi ý'));
		return;
	}
	replace(container, el('span', { class: 'text-muted me-2' }, `(${suggestions.length} lý do):`), ' ',
		suggestions.map(reason => el('span', { class: 'suggestion-badge', title: 'Click để chọn' }, reason)));
}

async function showReasonSuggestions() {
	replace(byId('reasonSuggestionsContainer'), el('small', { class: 'text-muted' }, 'Đang tải gợi ý...'));
	const now = Date.now();
	if (state.reasons && state.reasonsTime && now - state.reasonsTime < 300000) {
		displayReasonSuggestions(state.reasons);
		return;
	}
	try {
		const response = await requestJson('/api/doctor-busy-schedules/busy-reasons');
		if (!response.success || !response.reasons) throw new Error('no reasons');
		Object.assign(state, { reasons: response.reasons, reasonsTime: now });
		displayReasonSuggestions(response.reasons);
	} catch {
		displayReasonSuggestions(DEFAULT_REASONS);
	}
}

function scheduleRow(schedule) {
	const startTime = new Date(schedule.start_datetime);
	const endTime = new Date(schedule.end_datetime);
	const actions = schedule.status === 'active'
		? [el('button', { 'data-qlpk-button': 'edit', 'data-qlpk-button-variant': 'soft', class: 'btn btn-outline-warning btn-sm', dataset: { busyAction: 'edit', busyId: schedule.id }, title: 'Chỉnh sửa' }, icon('bi-pencil')), ' ',
			el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', class: 'btn btn-sm', dataset: { busyAction: 'delete', busyId: schedule.id }, title: 'Xóa' }, icon('bi-trash'))]
		: el('button', { class: 'btn btn-outline-secondary btn-sm', disabled: true, title: 'Không thể chỉnh sửa lịch bận đã hủy' }, icon('bi-lock'));
	return el('tr', {},
		el('td', {}, el('div', { class: 'status-indicator' }, statusIndicator(startTime, endTime, schedule.status))),
		el('td', {}, el('div', { class: 'fw-semibold' }, formatTimeRangeReadable(startTime, endTime))),
		el('td', {}, el('span', { class: 'reason-badge' }, schedule.reason || 'Không có lý do')),
		el('td', {}, el('span', { class: 'text-muted' }, formatDateTime(new Date(schedule.created_at)))),
		el('td', {}, el('div', { class: 'btn-group btn-group-sm', role: 'group' }, actions)));
}

function renderBusySchedulesTable(schedules) {
	state.schedules = schedules;
	const body = byId('busySchedulesTableBody');
	if (!schedules.length) {
		replace(body, el('tr', {}, el('td', { colspan: 5, class: 'text-center py-4' },
			icon('bi-calendar-x', 'text-muted busy-empty-icon'), el('p', { class: 'mt-2 mb-0 text-muted' }, 'Chưa có lịch bận nào'))));
		return;
	}
	replace(body, schedules.map(scheduleRow));
}

function filterTable() {
	if (!state.schedules.length) return;
	const term = normalize(byId('searchInput').value);
	byId('busySchedulesTableBody').querySelectorAll('tr').forEach(row => {
		const matches = !term || [1, 2].some(index => normalize(row.children[index]?.textContent).includes(term));
		row.style.display = matches ? '' : 'none';
	});
}

async function loadMyBusySchedules() {
	if (!state.user || !state.user.id) {
		setTimeout(loadMyBusySchedules, 500);
		return;
	}
	const revision = ++state.revision;
	try {
		const response = await requestJson(`/api/doctor-busy-schedules/my-busy-schedules?status=${encodeURIComponent(byId('statusFilter').value)}`);
		if (revision !== state.revision) return;
		if (!response.success) {
			showAlert('Không thể tải danh sách lịch bận', 'error');
			return;
		}
		renderBusySchedulesTable(response.data);
		filterTable();
	} catch (error) {
		if (revision !== state.revision) return;
		if (error instanceof HttpError && error.status === 401) {
			localStorage.removeItem('token');
			window.location.href = 'login.html';
		} else {
			showAlert('Có lỗi xảy ra khi tải dữ liệu', 'error');
		}
	}
}

function conflictMessage(data) {
	if (data && data.conflicts) {
		return 'Xung đột với lịch hẹn hiện có:\n' + data.conflicts.map(conflict => `- Bệnh nhân: ${conflict.patient_name}, Thời gian: ${conflict.appointment_date}\n`).join('');
	}
	if (data && data.conflict_schedule) {
		const conflict = data.conflict_schedule;
		return `Xung đột với lịch bận khác:\n- Thời gian: ${conflict.start_datetime} đến ${conflict.end_datetime}\n- Lý do: ${conflict.reason}`;
	}
	return null;
}

function reportSaveError(error, action) {
	const status = error instanceof HttpError ? error.status : 0;
	if (status === 409 && conflictMessage(error.data)) {
		showAlert(conflictMessage(error.data), 'warning');
		return;
	}
	if (status === 401) {
		window.location.href = 'login.html';
		return;
	}
	const messages = { 409: 'Xung đột thời gian với lịch bận hoặc lịch hẹn hiện có', 400: 'Thông tin lịch bận chưa hợp lệ. Vui lòng kiểm tra lại.', 500: 'Không thể lưu lịch bận. Vui lòng thử lại.' };
	showAlert(messages[status] || `Không thể ${action} lịch bận. Vui lòng kiểm tra lại.`, 'error');
}

async function saveBusySchedule(data) {
	const button = document.querySelector('#busyScheduleForm button[type="submit"]');
	const original = [...button.childNodes];
	const editing = state.editingId;
	const action = editing ? 'cập nhật' : 'tạo';
	button.disabled = true;
	replace(button, el('i', { class: 'spinner-border spinner-border-sm me-2' }), editing ? 'Đang cập nhật...' : 'Đang tạo...');
	try {
		const response = await requestJson(editing ? `/api/doctor-busy-schedules/${editing}` : '/api/doctor-busy-schedules', { method: editing ? 'PUT' : 'POST', json: data });
		button.disabled = false;
		replace(button, original);
		if (!response.success) {
			showAlert(`Không thể ${action} lịch bận. Vui lòng kiểm tra lại.`, 'error');
			return;
		}
		showAlert(editing ? 'Cập nhật lịch bận thành công!' : 'Tạo lịch bận thành công!', 'success');
		byId('busyScheduleForm').reset();
		state.editingId = null;
		setSubmitLabels(false);
		loadMyBusySchedules();
		Object.assign(state, { reasons: null, reasonsTime: null });
	} catch (error) {
		button.disabled = false;
		replace(button, original);
		reportSaveError(error, action);
	}
}

function createBusySchedule() {
	if (!state.user || !state.user.id) {
		showAlert('Đang tải thông tin người dùng, vui lòng thử lại sau', 'warning');
		return;
	}
	const form = new FormData(byId('busyScheduleForm'));
	const data = { doctor_id: state.user.id, start_datetime: form.get('start_datetime'), end_datetime: form.get('end_datetime'), reason: form.get('reason') };
	if (!data.start_datetime || !data.end_datetime || !data.reason) {
		showAlert('Vui lòng điền đầy đủ thông tin bắt buộc', 'warning');
		return;
	}
	const startTime = new Date(data.start_datetime);
	const endTime = new Date(data.end_datetime);
	if (startTime >= endTime) showAlert('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc', 'warning');
	else if (endTime < new Date()) showAlert('Không thể tạo lịch bận trong quá khứ', 'warning');
	else saveBusySchedule(data);
}

function editBusySchedule(id) {
	const schedule = state.schedules.find(entry => entry.id === id);
	if (!schedule) {
		showAlert('Không tìm thấy lịch bận', 'error');
		return;
	}
	setRange(new Date(schedule.start_datetime), new Date(schedule.end_datetime));
	field('reason').value = schedule.reason ?? '';
	state.editingId = id;
	setSubmitLabels(true);
	const header = document.querySelector('.card-header');
	if (header) window.scrollTo({ top: header.getBoundingClientRect().top + window.pageYOffset - 100, behavior: 'smooth' });
	showAlert('Đã load dữ liệu lịch bận để chỉnh sửa', 'info');
}

function resetForm() {
	byId('busyScheduleForm').reset();
	state.editingId = null;
	setSubmitLabels(false);
	replace(byId('reasonSuggestionsContainer'));
	showAlert('Đã reset form về chế độ tạo mới', 'info');
}

async function deleteBusySchedule(id) {
	try {
		const response = await requestJson(`/api/doctor-busy-schedules/${id}`, { method: 'DELETE' });
		if (!response.success) throw new Error('rejected');
		showAlert('Xóa lịch bận thành công!', 'success');
		window.bootstrap.Modal.getInstance(byId('deleteConfirmModal'))?.hide();
		loadMyBusySchedules();
	} catch {
		showAlert('Không thể xóa lịch bận. Vui lòng thử lại.', 'error');
	}
}

function confirmDeleteBusySchedule(id) {
	const schedule = state.schedules.find(entry => entry.id === id);
	if (!schedule) return;
	const timeRange = formatTimeRangeReadable(new Date(schedule.start_datetime), new Date(schedule.end_datetime));
	const confirmButton = el('button', { 'data-qlpk-button': 'danger', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-danger' }, icon('bi-trash', 'me-1'), 'Xóa');
	on(confirmButton, 'click', () => deleteBusySchedule(id));
	const dialog = el('div', { class: 'modal fade', id: 'deleteConfirmModal', tabindex: '-1' }, el('div', { class: 'modal-dialog' }, el('div', { class: 'modal-content' },
		el('div', { class: 'modal-header bg-danger text-white' }, el('h5', { class: 'modal-title' }, icon('bi-exclamation-triangle', 'me-2'), 'Xác nhận xóa'),
			el('button', { type: 'button', class: 'btn-close btn-close-white', 'data-bs-dismiss': 'modal' })),
		el('div', { class: 'modal-body' }, el('p', {}, 'Bạn có chắc chắn muốn xóa lịch bận này?'),
			el('div', { class: 'alert alert-warning' }, el('strong', {}, 'Thời gian:'), ` ${timeRange}`, el('br'), el('strong', {}, 'Lý do:'), ` ${schedule.reason || 'Không có lý do'}`),
			el('p', { class: 'text-danger' }, el('small', {}, 'Hành động này không thể hoàn tác!'))),
		el('div', { class: 'modal-footer' }, el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Hủy'), ' ', confirmButton))));
	byId('deleteConfirmModal')?.remove();
	document.body.appendChild(dialog);
	window.bootstrap.Modal.getOrCreateInstance(dialog).show();
}

function bind() {
	const form = byId('busyScheduleForm');
	on(form, 'submit', event => {
		event.preventDefault();
		createBusySchedule();
	});
	on(field('start_datetime'), 'change', event => {
		const startTime = new Date(event.target.value);
		if (!Number.isNaN(startTime.getTime()) && !field('end_datetime').value) field('end_datetime').value = new Date(startTime.getTime() + 60 * 60 * 1000).toISOString().slice(0, 16);
	});
	['start_datetime', 'end_datetime'].forEach(name => on(field(name), 'change', () => {
		setQuickTimeSelection();
		validateDateTimeInputs();
	}));
	on(form, 'reset', () => setQuickTimeSelection());
	delegate(form, 'click', '[data-quick-time]', (event, button) => setQuickTime(button.dataset.quickTime, button));
	on(byId('searchInput'), 'input', filterTable);
	on(byId('statusFilter'), 'change', loadMyBusySchedules);
	on(field('reason'), 'focus', showReasonSuggestions);
	delegate(byId('reasonSuggestionsContainer'), 'click', '.suggestion-badge', (event, badge) => {
		field('reason').value = badge.textContent;
		byId('reasonSuggestionsContainer').querySelectorAll('.suggestion-badge').forEach(item => item.classList.toggle('is-selected', item === badge));
	});
	byId('resetFormBtn')?.addEventListener('click', resetForm);
	delegate(document, 'click', '[data-busy-action]', (event, button) => {
		const action = button.dataset.busyAction;
		if (action === 'edit') editBusySchedule(Number(button.dataset.busyId));
		else if (action === 'delete') confirmDeleteBusySchedule(Number(button.dataset.busyId));
		else if (action === 'reset') resetForm();
		else if (action === 'reload') loadMyBusySchedules();
	});
	byId('logoutBtn')?.addEventListener('click', () => window.QLPKAppHeader?.logout());
}

bind();
loadUserInfo();
loadMyBusySchedules();
QLPKRealtimePageHooks?.register({ types: ['busy_schedule.changed'], debounceMs: 500, handler: loadMyBusySchedules });
