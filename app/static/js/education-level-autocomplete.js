/**
 * Education Level Autocomplete Component
 * Autocomplete cho trình độ học vấn với danh sách cố định
 */

class EducationLevelAutocomplete extends AutocompleteBase {
    constructor(inputId, dropdownId) {
        // Truyền null cho apiEndpoint vì sẽ override loadItems() để dùng danh sách cố định
        super(inputId, dropdownId, null);
        
        // Danh sách trình độ học vấn (format như API response: {id, name})
        this.educationLevels = [
            { id: 1, name: 'Chưa đi học' },
            { id: 2, name: 'Mẫu giáo' },
            { id: 3, name: 'Tiểu học' },
            { id: 4, name: 'Trung học cơ sở' },
            { id: 5, name: 'Trung học phổ thông' },
            { id: 6, name: 'Trung cấp' },
            { id: 7, name: 'Cao đẳng' },
            { id: 8, name: 'Đại học' },
            { id: 9, name: 'Thạc sĩ' },
            { id: 10, name: 'Tiến sĩ' },
            { id: 11, name: 'Không biết đọc biết viết' },
            { id: 12, name: 'Biết đọc biết viết' }
        ];
        
        // Đảm bảo this.items được khởi tạo ngay lập tức để tránh undefined
        this.items = this.educationLevels;
    }
    
    async loadItems() {
        // Override để dùng danh sách cố định thay vì gọi API
        // Đảm bảo items luôn được set, kể cả khi this.educationLevels chưa sẵn sàng
        this.items = this.educationLevels || [];
    }
    
    getNoResultsText() {
        return 'Không tìm thấy trình độ học vấn';
    }
}

// Export để sử dụng ở file khác
// Không auto-initialize vì đã được khởi tạo bởi DRY module (personal-detail-modal-dry.js)
window.EducationLevelAutocomplete = EducationLevelAutocomplete;

