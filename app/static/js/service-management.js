// Shared page runtime (formerly classic script tags), in page order.
import './shared/confirmation-dialog.js';
import './app-version-check.js';
import './sidebar-dry-loader.js';
import './realtime-page-hooks.js';
import './components/clinic-pagination.js';
import { byId, el, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { bindExcelImport, mountModalCrudPage, statusBadge } from './components/modal-crud-page.js';

const formatPrice = price => new Intl.NumberFormat('vi-VN').format(price) + ' VNĐ';
const price = { invalid: value => value === '' || value === null || value === undefined, message: 'Vui lòng nhập đơn giá' };
const nonNegative = { invalid: value => parseFloat(value) < 0, message: 'Đơn giá không được âm' };

async function loadCategories() {
	try {
		const categories = await requestJson('/service-categories/');
		const options = () => [el('option', { value: '' }, 'Chọn danh mục'),
			categories.filter(category => category.is_active).map(category => el('option', { value: category.id }, category.name))];
		replace(byId('serviceCategory'), options());
		replace(byId('editServiceCategory'), options());
	} catch (error) {
		console.error('Error loading categories:', error);
		window.QLPKUserFeedback?.show('error', 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.');
	}
}

const list = mountModalCrudPage({
	logName: 'services', listUrl: '/services/', itemUrl: id => `/services/${id}`,
	tableBody: 'serviceTableBody', colspan: 7, emptyText: 'Chưa có dịch vụ nào', searchInput: 'searchInput',
	searchValues: service => [service.name, service.description, service.category_name],
	cells: service => [service.id, el('strong', {}, service.name), service.category_name || 'N/A', formatPrice(service.default_price),
		service.duration_minutes || 60, statusBadge(service.is_active, 'Kích hoạt', 'Không kích hoạt')],
	labels: { edit: 'Sửa dịch vụ', remove: 'Xóa dịch vụ' },
	add: { form: 'addServiceForm', modal: 'addServiceModal' },
	edit: { modal: 'editServiceModal', button: 'updateServiceBtn', idInput: 'editServiceId' },
	fields: [
		{ key: 'name', add: 'serviceName', edit: 'editServiceName', type: 'trim', checks: [{ invalid: value => !value, message: 'Tên dịch vụ không được để trống' }], error: { add: 'nameError', edit: 'editNameError' } },
		{ key: 'category_id', add: 'serviceCategory', edit: 'editServiceCategory', checks: [{ invalid: value => !value, message: 'Vui lòng chọn danh mục' }],
			error: { add: 'categoryError', edit: 'editCategoryError' }, toPayload: value => parseInt(value, 10) },
		{ key: 'default_price', add: 'defaultPrice', edit: 'editDefaultPrice', checks: [price, nonNegative], error: { add: 'priceError', edit: 'editPriceError' }, toPayload: parseFloat },
		{ key: 'duration_minutes', add: 'durationMinutes', edit: 'editDurationMinutes', toPayload: value => parseInt(value, 10) || 60, fromItem: service => service.duration_minutes || 60 },
		{ key: 'description', add: 'serviceDescription', edit: 'editServiceDescription', type: 'trim' },
		{ key: 'is_active', add: 'serviceActive', edit: 'editServiceActive', type: 'checkbox' },
	],
	realtimeFilter: event => ['service', 'service_category', 'service_price'].includes(event && event.payload ? event.payload.entity : ''),
	onRealtime: event => { if (event && event.payload && event.payload.entity === 'service_category') loadCategories(); },
	text: {
		loadFailed: 'Không thể tải danh sách dịch vụ. Vui lòng thử lại.',
		added: 'Thêm dịch vụ thành công!', addFailed: 'Không thể thêm dịch vụ. Vui lòng kiểm tra lại.',
		updated: 'Cập nhật dịch vụ thành công!', updateFailed: 'Không thể cập nhật dịch vụ. Vui lòng kiểm tra lại.',
		deleteConfirm: 'Bạn có chắc chắn muốn xóa dịch vụ này?', deleted: 'Xóa dịch vụ thành công!', deleteFailed: 'Không thể xóa dịch vụ. Vui lòng thử lại.',
	},
});
loadCategories();

bindExcelImport({
	modalId: 'importModal', fileInput: 'importFile', url: '/services/import', templateFile: 'mau_import_dich_vu.xlsx',
	templateRows: [['Tên dịch vụ', 'Danh mục', 'Đơn giá (VNĐ)', 'Thời gian (phút)', 'Mô tả', 'Trạng thái'],
		['Khám tổng quát', 'Khám tổng quát', '500000', '60', 'Khám sức khỏe tổng quát', 'Kích hoạt'],
		['Khám tim mạch', 'Khám chuyên khoa', '800000', '90', 'Khám chuyên khoa tim mạch', 'Kích hoạt'],
		['Xét nghiệm máu', 'Xét nghiệm', '300000', '30', 'Xét nghiệm máu cơ bản', 'Kích hoạt']],
	done: 'Import dịch vụ thành công!', failed: 'Không thể nhập dữ liệu dịch vụ. Vui lòng kiểm tra tệp và thử lại.', onImported: () => list.load(),
});
