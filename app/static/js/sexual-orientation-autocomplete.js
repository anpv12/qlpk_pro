class SexualOrientationAutocomplete extends window.AutocompleteBase {
    constructor(inputId, dropdownId) {
        super(inputId, dropdownId, '/api/sexual-orientations/');
    }
    
    getNoResultsText() {
        return 'Không tìm thấy xu hướng tính dục';
    }
}

// Export để sử dụng ở file khác
// Không auto-initialize vì đã được khởi tạo bởi DRY module (personal-detail-modal-dry.js)
window.SexualOrientationAutocomplete = SexualOrientationAutocomplete;