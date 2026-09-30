import { mountCatalogDictionaryPage } from './components/catalog-dictionary-page.js';

mountCatalogDictionaryPage({
	prefix: 'al', modalId: 'alModal', addButtonId: 'btn-add-allergen', addIcon: 'bi-droplet-half',
	api: '/api/allergen', entity: 'allergen', nameField: 'ten_di_nguyen', templateFile: 'mau_import_di_nguyen.xlsx',
	text: {
		addTitle: 'Thêm dị nguyên mới', editTitle: 'Cập nhật dị nguyên',
		nameRequired: 'Tên dị nguyên không được để trống',
		saveRejected: 'Không thể lưu dị nguyên. Vui lòng kiểm tra lại.', saveFailed: 'Không thể xử lý dị nguyên. Vui lòng thử lại.',
		deleteConfirm: 'Bạn có chắc chắn muốn xóa dị nguyên này?', deleteFailed: 'Không thể xóa dị nguyên. Vui lòng thử lại.',
		importDone: 'Đã nhập dữ liệu dị nguyên.', importFailed: 'Không thể nhập dữ liệu dị nguyên. Vui lòng kiểm tra tệp và thử lại.',
	},
});
