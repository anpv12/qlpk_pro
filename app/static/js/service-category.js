import { el } from './shared/dom.js';
import { bindExcelImport, emptyNote, mountModalCrudPage, statusBadge } from './components/modal-crud-page.js';

const list = mountModalCrudPage({
	logName: 'categories', listUrl: '/service-categories/', itemUrl: id => `/service-categories/${id}`,
	tableBody: 'categoryTableBody', colspan: 6, emptyText: 'Chưa có danh mục nào', searchInput: 'searchInput',
	searchValues: category => [category.name, category.description],
	cells: category => [category.id, el('strong', {}, category.name), category.description ? category.description : emptyNote('Không có mô tả'),
		statusBadge(category.is_active, 'Kích hoạt', 'Không kích hoạt'), new Date(category.created_at).toLocaleDateString('vi-VN')],
	labels: { edit: 'Sửa danh mục', remove: 'Xóa danh mục' },
	add: { form: 'addCategoryForm', modal: 'addCategoryModal' },
	edit: { modal: 'editCategoryModal', button: 'updateCategoryBtn', idInput: 'editCategoryId' },
	fields: [
		{ key: 'name', add: 'categoryName', edit: 'editCategoryName', type: 'trim', checks: [{ invalid: value => !value, message: 'Tên danh mục không được để trống' }], error: { add: 'nameError', edit: 'editNameError' } },
		{ key: 'description', add: 'categoryDescription', edit: 'editCategoryDescription', type: 'trim' },
		{ key: 'is_active', add: 'categoryActive', edit: 'editCategoryActive', type: 'checkbox' },
	],
	realtimeFilter: event => event && event.payload && event.payload.entity === 'service_category',
	text: {
		loadFailed: 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.',
		added: 'Thêm danh mục thành công!', addFailed: 'Không thể thêm nhóm dịch vụ. Vui lòng kiểm tra lại.',
		updated: 'Cập nhật danh mục thành công!', updateFailed: 'Không thể cập nhật nhóm dịch vụ. Vui lòng kiểm tra lại.',
		deleteConfirm: 'Bạn có chắc chắn muốn xóa danh mục này?', deleted: 'Xóa danh mục thành công!', deleteFailed: 'Không thể xóa nhóm dịch vụ. Vui lòng thử lại.',
	},
});

bindExcelImport({
	modalId: 'importModal', fileInput: 'importFile', url: '/service-categories/import', templateFile: 'mau_import_nhom_dich_vu.xlsx',
	templateRows: [['Tên nhóm dịch vụ', 'Mô tả', 'Trạng thái'], ['Khám tổng quát', 'Khám sức khỏe tổng quát', 'Kích hoạt'],
		['Khám chuyên khoa', 'Khám các chuyên khoa', 'Kích hoạt'], ['Xét nghiệm', 'Các loại xét nghiệm', 'Kích hoạt']],
	done: 'Import nhóm dịch vụ thành công!', failed: 'Không thể nhập nhóm dịch vụ. Vui lòng kiểm tra tệp và thử lại.', onImported: () => list.load(),
});
