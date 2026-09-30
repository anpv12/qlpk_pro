// Holiday calendar: list/search, add and edit modals, delete confirmation, realtime refresh.
import { byId, delegate, el, icon, on, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';

let holidays = [];
const toast = (type, message) => window.QLPKUserFeedback?.show(type, message);
const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value) || String(value || '').toLowerCase().trim();
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

function actionButton(kind, label, iconName, id, extraClass) {
	return el('button', { 'data-qlpk-button': kind, 'data-qlpk-button-variant': 'soft', class: `btn btn-sm${extraClass}`,
		dataset: { holidayAction: kind, holidayId: id }, 'aria-label': label, title: label }, icon(iconName));
}

function holidayRow(holiday) {
	return el('tr', {},
		el('td', {}, holiday.id),
		el('td', {}, el('strong', {}, holiday.name)),
		el('td', {}, new Date(holiday.date).toLocaleDateString('vi-VN')),
		el('td', {}, holiday.description ? holiday.description : el('span', { class: 'text-muted' }, 'Không có mô tả')),
		el('td', {}, el('span', { class: `badge ${holiday.is_recurring ? 'qlpk-status--success' : 'qlpk-status--neutral'}` }, holiday.is_recurring ? 'Có' : 'Không')),
		el('td', {}, actionButton('edit', 'Sửa ngày nghỉ', 'bi-pencil', holiday.id, ' me-1'), ' ', actionButton('danger', 'Xóa ngày nghỉ', 'bi-trash', holiday.id, '')));
}

function renderPage(items) {
	const body = byId('holidayTableBody');
	if (!items.length) {
		replace(body, el('tr', {}, el('td', { colspan: 6, class: 'text-center text-muted py-4' }, icon('bi-inbox', 'fs-1 d-block mb-2'), 'Chưa có ngày lễ nào')));
		return;
	}
	replace(body, items.map(holidayRow));
}

const pagination = window.QLPKPagination.createClient({ render: renderPage });

async function loadHolidays() {
	try {
		holidays = await requestJson('/holidays/');
		pagination.setItems(holidays);
	} catch (error) {
		console.error('Error loading holidays:', error);
		toast('error', 'Không thể tải danh sách ngày lễ. Vui lòng thử lại.');
	}
}

// Reads one holiday form (prefix '' = add, 'edit' = edit); marks the first missing required field.
function readForm(prefix) {
	const id = name => byId(prefix ? `edit${name}` : name.charAt(0).toLowerCase() + name.slice(1));
	const nameInput = id('HolidayName');
	const dateInput = id('HolidayDate');
	const name = nameInput.value.trim();
	const date = dateInput.value;
	if (!name) {
		nameInput.classList.add('is-invalid');
		byId(prefix ? 'editNameError' : 'nameError').textContent = 'Tên ngày lễ không được để trống';
		return null;
	}
	if (!date) {
		dateInput.classList.add('is-invalid');
		byId(prefix ? 'editDateError' : 'dateError').textContent = 'Ngày không được để trống';
		return null;
	}
	nameInput.classList.remove('is-invalid');
	dateInput.classList.remove('is-invalid');
	return { name, date, description: id('HolidayDescription').value.trim(), is_recurring: id('HolidayRecurring').checked };
}

async function submitHoliday({ url, method, data, modalId, done, failed, label }) {
	try {
		await requestJson(url, { method, json: data });
		toast('success', done);
		modal(modalId).hide();
		loadHolidays();
	} catch (error) {
		console.error(`Error ${label} holiday:`, error);
		toast('error', failed);
	}
}

function editHoliday(holidayId) {
	const holiday = holidays.find(entry => entry.id === holidayId);
	if (!holiday) return;
	byId('editHolidayId').value = holiday.id;
	byId('editHolidayName').value = holiday.name;
	byId('editHolidayDate').value = holiday.date;
	byId('editHolidayDescription').value = holiday.description ?? '';
	byId('editHolidayRecurring').checked = Boolean(holiday.is_recurring);
	modal('editHolidayModal').show();
}

async function deleteHoliday(holidayId) {
	if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa ngày lễ này?')) return;
	try {
		await requestJson(`/holidays/${holidayId}`, { method: 'DELETE' });
		toast('success', 'Xóa ngày lễ thành công!');
		loadHolidays();
	} catch (error) {
		console.error('Error deleting holiday:', error);
		toast('error', 'Không thể xóa ngày nghỉ. Vui lòng thử lại.');
	}
}

on(byId('addHolidayForm'), 'submit', event => {
	event.preventDefault();
	const data = readForm('');
	if (data) submitHoliday({ url: '/holidays/', method: 'POST', data, modalId: 'addHolidayModal', label: 'adding',
		done: 'Thêm ngày lễ thành công!', failed: 'Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại.' });
});
on(byId('updateHolidayBtn'), 'click', () => {
	const data = readForm('edit');
	if (data) submitHoliday({ url: `/holidays/${byId('editHolidayId').value}`, method: 'PUT', data, modalId: 'editHolidayModal', label: 'updating',
		done: 'Cập nhật ngày lễ thành công!', failed: 'Không thể cập nhật ngày nghỉ. Vui lòng kiểm tra lại.' });
});
delegate(byId('holidayTableBody'), 'click', '[data-holiday-action]', (event, button) => {
	const id = Number(button.dataset.holidayId);
	if (button.dataset.holidayAction === 'edit') editHoliday(id);
	else deleteHoliday(id);
});
on(byId('searchInput'), 'input', event => {
	const term = normalize(event.target.value);
	pagination.setItems(holidays.filter(holiday => normalize(holiday.name).includes(term)
		|| (holiday.description && normalize(holiday.description).includes(term))));
});
on(byId('addHolidayModal'), 'hidden.bs.modal', () => {
	byId('addHolidayForm').reset();
	document.querySelectorAll('.is-invalid').forEach(node => node.classList.remove('is-invalid'));
});
window.QLPKRealtimePageHooks?.register({
	types: ['catalog.changed'],
	filter: event => event && event.payload && event.payload.entity === 'holiday',
	handler: loadHolidays,
	debounceMs: 350,
});
loadHolidays();
