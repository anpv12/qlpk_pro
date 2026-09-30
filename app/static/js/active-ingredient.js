import { mountCatalogDictionaryPage } from './components/catalog-dictionary-page.js';

mountCatalogDictionaryPage({
	prefix: 'ai', modalId: 'aiModal', addButtonId: 'btn-add-ingredient', addIcon: 'bi-capsule',
	api: '/api/active-ingredient', entity: 'active_ingredient', nameField: 'ten_hoat_chat', templateFile: 'mau_import_hoat_chat.xlsx',
	text: {
		addTitle: 'Thêm hoạt chất mới', editTitle: 'Cập nhật hoạt chất',
		nameRequired: 'Tên hoạt chất không được để trống',
		saveRejected: 'Không thể lưu hoạt chất. Vui lòng kiểm tra lại.', saveFailed: 'Không thể lưu hoạt chất. Vui lòng kiểm tra lại.',
		deleteConfirm: 'Bạn có chắc chắn muốn xóa hoạt chất này?', deleteFailed: 'Không thể xóa hoạt chất. Vui lòng thử lại.',
		importDone: 'Đã nhập dữ liệu hoạt chất.', importFailed: 'Không thể nhập dữ liệu hoạt chất. Vui lòng kiểm tra tệp và thử lại.',
	},
});
