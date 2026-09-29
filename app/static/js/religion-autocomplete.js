/**
 * Religion Autocomplete Component
 * Autocomplete cho tôn giáo với danh sách cố định
 */

class ReligionAutocomplete extends window.AutocompleteBase {
    constructor(inputId, dropdownId) {
        // Truyền null cho apiEndpoint vì sẽ override loadItems() để dùng danh sách cố định
        super(inputId, dropdownId, null);
        
        // Danh sách tôn giáo (format như API response: {id, name})
        // Lấy từ code gốc trong receptionist-new.js
        this.religions = [
            { id: 1, name: 'Không tôn giáo' },
            { id: 2, name: 'Phật giáo' },
            { id: 3, name: 'Công giáo' },
            { id: 4, name: 'Tin lành' },
            { id: 5, name: 'Hồi giáo' },
            { id: 6, name: 'Cao Đài' },
            { id: 7, name: 'Hoà Hảo' },
            { id: 8, name: 'Khác' }
        ];
        
        // Đảm bảo this.items được khởi tạo ngay lập tức để tránh undefined
        this.items = this.religions;
    }
    
    async loadItems() {
        // Override để dùng danh sách cố định thay vì gọi API
        // Đảm bảo items luôn được set, kể cả khi this.religions chưa sẵn sàng
        this.items = this.religions || [];
    }
    
    getNoResultsText() {
        return 'Không tìm thấy tôn giáo';
    }
}

// Export để sử dụng ở file khác
// Không auto-initialize vì đã được khởi tạo bởi DRY module (personal-detail-modal-dry.js)
window.ReligionAutocomplete = ReligionAutocomplete;

