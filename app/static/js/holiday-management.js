// Shared page runtime (formerly classic script tags), in page order.
import './shared/confirmation-dialog.js';
import './app-version-check.js';
import './flatpickr-vn.js';
import './datepicker-init.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import { el } from './shared/dom.js';
import { emptyNote, mountModalCrudPage, statusBadge } from './components/modal-crud-page.js';

const required = message => [{ invalid: value => !value, message }];

mountModalCrudPage({
	logName: 'holidays', listUrl: '/holidays/', itemUrl: id => `/holidays/${id}`,
	tableBody: 'holidayTableBody', colspan: 6, emptyText: 'Chưa có ngày lễ nào', searchInput: 'searchInput',
	searchValues: holiday => [holiday.name, holiday.description],
	cells: holiday => [holiday.id, el('strong', {}, holiday.name), new Date(holiday.date).toLocaleDateString('vi-VN'),
		holiday.description ? holiday.description : emptyNote('Không có mô tả'), statusBadge(holiday.is_recurring, 'Có', 'Không')],
	labels: { edit: 'Sửa ngày nghỉ', remove: 'Xóa ngày nghỉ' },
	add: { form: 'addHolidayForm', modal: 'addHolidayModal' },
	edit: { modal: 'editHolidayModal', button: 'updateHolidayBtn', idInput: 'editHolidayId' },
	fields: [
		{ key: 'name', add: 'holidayName', edit: 'editHolidayName', type: 'trim', checks: required('Tên ngày lễ không được để trống'), error: { add: 'nameError', edit: 'editNameError' } },
		{ key: 'date', add: 'holidayDate', edit: 'editHolidayDate', checks: required('Ngày không được để trống'), error: { add: 'dateError', edit: 'editDateError' } },
		{ key: 'description', add: 'holidayDescription', edit: 'editHolidayDescription', type: 'trim' },
		{ key: 'is_recurring', add: 'holidayRecurring', edit: 'editHolidayRecurring', type: 'checkbox' },
	],
	realtimeFilter: event => event && event.payload && event.payload.entity === 'holiday',
	text: {
		loadFailed: 'Không thể tải danh sách ngày lễ. Vui lòng thử lại.',
		added: 'Thêm ngày lễ thành công!', addFailed: 'Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại.',
		updated: 'Cập nhật ngày lễ thành công!', updateFailed: 'Không thể cập nhật ngày nghỉ. Vui lòng kiểm tra lại.',
		deleteConfirm: 'Bạn có chắc chắn muốn xóa ngày lễ này?', deleted: 'Xóa ngày lễ thành công!', deleteFailed: 'Không thể xóa ngày nghỉ. Vui lòng thử lại.',
	},
});
