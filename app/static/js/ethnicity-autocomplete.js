/**
 * Ethnicity Autocomplete Component
 * Autocomplete cho dân tộc với danh sách cố định
 */

class EthnicityAutocomplete extends AutocompleteBase {
    constructor(inputId, dropdownId) {
        // Truyền null cho apiEndpoint vì sẽ override loadItems() để dùng danh sách cố định
        super(inputId, dropdownId, null);
        
        // Danh sách dân tộc (format như API response: {id, name})
        // Lấy từ code gốc trong receptionist-new.js
        this.ethnicities = [
            { id: 1, name: 'Kinh' },
            { id: 2, name: 'Tày' },
            { id: 3, name: 'Thái' },
            { id: 4, name: 'Mường' },
            { id: 5, name: 'Khmer' },
            { id: 6, name: 'Hoa' },
            { id: 7, name: 'Nùng' },
            { id: 8, name: 'H\'Mông' },
            { id: 9, name: 'Dao' },
            { id: 10, name: 'Gia Rai' },
            { id: 11, name: 'Ê Đê' },
            { id: 12, name: 'Ba Na' },
            { id: 13, name: 'Xơ Đăng' },
            { id: 14, name: 'Cơ Ho' },
            { id: 15, name: 'Chăm' },
            { id: 16, name: 'Sán Dìu' },
            { id: 17, name: 'Ra Glai' },
            { id: 18, name: 'M\'Nông' },
            { id: 19, name: 'Thổ' },
            { id: 20, name: 'Xtiêng' },
            { id: 21, name: 'Khơ Mú' },
            { id: 22, name: 'Brâu' },
            { id: 23, name: 'Cơ Tu' },
            { id: 24, name: 'Giáy' },
            { id: 25, name: 'Lào' },
            { id: 26, name: 'La Chí' },
            { id: 27, name: 'La Ha' },
            { id: 28, name: 'Phù Lá' },
            { id: 29, name: 'Lự' },
            { id: 30, name: 'Ngái' },
            { id: 31, name: 'Chứt' },
            { id: 32, name: 'Si La' },
            { id: 33, name: 'Pu Péo' },
            { id: 34, name: 'Rơ Măm' },
            { id: 35, name: 'Ơ Đu' }
        ];
        
        // Đảm bảo this.items được khởi tạo ngay lập tức để tránh undefined
        this.items = this.ethnicities;
    }
    
    async loadItems() {
        // Override để dùng danh sách cố định thay vì gọi API
        // Đảm bảo items luôn được set, kể cả khi this.ethnicities chưa sẵn sàng
        this.items = this.ethnicities || [];
    }
    
    getNoResultsText() {
        return 'Không tìm thấy dân tộc';
    }
}

// Export để sử dụng ở file khác
// Không auto-initialize vì đã được khởi tạo bởi DRY module (personal-detail-modal-dry.js)
window.EthnicityAutocomplete = EthnicityAutocomplete;

