/**
 * Nationality Autocomplete Component
 * Autocomplete cho quốc tịch với danh sách cố định
 */

class NationalityAutocomplete extends window.AutocompleteBase {
    constructor(inputId, dropdownId) {
        // Truyền null cho apiEndpoint vì sẽ override loadItems() để dùng danh sách cố định
        super(inputId, dropdownId, null);
        
        // Danh sách quốc tịch (format như API response: {id, name})
        // Lấy từ code gốc trong receptionist-new.js
        this.nationalities = [
            { id: 1, name: 'Việt Nam' },
            { id: 2, name: 'Mỹ' },
            { id: 3, name: 'Anh' },
            { id: 4, name: 'Pháp' },
            { id: 5, name: 'Đức' },
            { id: 6, name: 'Nhật' },
            { id: 7, name: 'Hàn Quốc' },
            { id: 8, name: 'Trung Quốc' },
            { id: 9, name: 'Thái Lan' },
            { id: 10, name: 'Singapore' }
        ];
        
        // Đảm bảo this.items được khởi tạo ngay lập tức để tránh undefined
        this.items = this.nationalities;
    }
    
    async loadItems() {
        // Override để dùng danh sách cố định thay vì gọi API
        // Đảm bảo items luôn được set, kể cả khi this.nationalities chưa sẵn sàng
        this.items = this.nationalities || [];
    }
    
    getNoResultsText() {
        return 'Không tìm thấy quốc tịch';
    }
}

// Export để sử dụng ở file khác
// Không auto-initialize vì đã được khởi tạo bởi DRY module (personal-detail-modal-dry.js)
window.NationalityAutocomplete = NationalityAutocomplete;

