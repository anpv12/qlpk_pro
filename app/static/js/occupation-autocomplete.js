import { el } from './shared/dom.js';

/**
 * Occupation Autocomplete Component
 * Thay thế combobox thông thường bằng autocomplete input với dropdown gợi ý
 */

function normalizeOccupationText(value) {
    return window.QLPKSearchNormalization?.normalizeSearchText(value)
        || String(value || '').toLowerCase().trim();
}

class OccupationAutocomplete {
    constructor(inputId, dropdownId) {
        this.input = document.getElementById(inputId);
        this.dropdown = document.getElementById(dropdownId);
        this.occupations = [];
        this.filteredOccupations = [];
        this.selectedIndex = -1;
        this.isOpen = false;
        
        // Kiểm tra input và dropdown có tồn tại không
        if (!this.input) {
            console.error(`OccupationAutocomplete: Input element with id "${inputId}" not found`);
            return;
        }
        if (!this.dropdown) {
            console.error(`OccupationAutocomplete: Dropdown element with id "${dropdownId}" not found`);
            return;
        }
        
        this.init();
    }
    
    async init() {
        // Kiểm tra input và dropdown có tồn tại không trước khi init
        if (!this.input || !this.dropdown) {
            console.warn('OccupationAutocomplete: Cannot initialize, input or dropdown not found');
            return;
        }
        
        // Load danh sách nghề nghiệp
        await this.loadOccupations();
        
        // Bind events
        this.bindEvents();
    }
    
    async loadOccupations() {
        try {
            const response = await fetch('/api/occupations/');
            
            if (response.ok) {
                const data = await response.json();
                this.occupations = data.success ? data.data : (data.data || data);
            }
        } catch (error) {
            console.error('Error loading occupations:', error);
        }
    }
    
    bindEvents() {
        if (!this.input || !this.dropdown) return;
        
        // Input focus - show dropdown và load danh sách đầy đủ
        this.input.addEventListener('focus', async () => {
            // Đảm bảo data đã được load
            if (this.occupations.length === 0) {
                await this.loadOccupations();
            }
            
            this.filteredOccupations = [...this.occupations]; // Load tất cả danh sách
            this.populateDropdown();
            this.showDropdown();
        });
        
        // Input blur - hide dropdown after delay
        this.input.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown(), 200);
        });
        
        // Input input - filter and show suggestions
        this.input.addEventListener('input', (e) => {
            this.filterOccupations(e.target.value);
        });
        
        // Input keydown - handle arrow keys and enter
        this.input.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
        
        // Click outside - hide dropdown
        document.addEventListener('click', (e) => {
            if (this.input && this.dropdown) {
                if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                    this.hideDropdown();
                }
            }
        });
    }
    
    filterOccupations(query) {
        if (!query.trim()) {
            this.filteredOccupations = [...this.occupations];
        } else {
            const lowerQuery = normalizeOccupationText(query);
            this.filteredOccupations = this.occupations.filter(occ => 
                normalizeOccupationText(occ.name).includes(lowerQuery)
            );
        }
        
        this.selectedIndex = -1;
        this.populateDropdown();
        this.showDropdown();
    }
    
    populateDropdown() {
        if (!this.dropdown) return;
        
        let items;
        if (this.filteredOccupations.length === 0) {
            const query = this.input ? this.input.value : '';
            items = query.trim()
                ? [el('div', { class: 'occupation-item new-occupation', 'data-new': 'true', 'data-name': query },
                    el('i', { class: 'bi bi-plus-circle me-2' }), `Tạo mới: "${query}"`)]
                : [el('div', { class: 'occupation-item no-results' }, 'Không tìm thấy nghề nghiệp')];
        } else {
            items = this.filteredOccupations.map((occ, index) => el('div', {
                class: 'occupation-item', 'data-index': String(index), 'data-id': String(occ.id), 'data-name': occ.name ?? ''
            }, occ.name ?? ''));
        }
        this.dropdown.replaceChildren(...items);
        
        // Bind click events
        this.dropdown.querySelectorAll('.occupation-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectOccupation(item);
            });
        });
    }
    
    selectOccupation(item) {
        if (!this.input) return;
        
        const isNew = item.dataset.new === 'true';
        const occupationName = item.dataset.name;
        
        if (isNew) {
            // Tạo nghề nghiệp mới
            this.createNewOccupation(occupationName);
        } else {
            // Chọn nghề nghiệp có sẵn
            this.input.value = occupationName;
            this.hideDropdown();
            
            // Trigger change event
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    async createNewOccupation(name) {
        if (!this.input) return;
        
        try {
            const response = await fetch('/api/occupations/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: name })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    // Cập nhật danh sách local
                    this.occupations.push(data.data);
                    
                    // Set giá trị cho input
                    this.input.value = data.data.name;
                    this.hideDropdown();
                    
                    // Trigger change event
                    this.input.dispatchEvent(new Event('change', { bubbles: true }));
                    
                    // Show success message
                }
            }
        } catch (error) {
            // Error creating occupation
        }
    }
    
    handleKeydown(e) {
        if (!this.dropdown) return;
        
        const items = this.dropdown.querySelectorAll('.occupation-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection(items);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection(items);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0 && items[this.selectedIndex]) {
                    this.selectOccupation(items[this.selectedIndex]);
                }
                break;
                
            case 'Escape':
                this.hideDropdown();
                break;
        }
    }
    
    updateSelection(items) {
        items.forEach((item, index) => {
            item.classList.toggle('selected', index === this.selectedIndex);
        });
    }
    
    showDropdown() {
        if (!this.dropdown) return;
        
        if (this.filteredOccupations.length > 0 || (this.input && this.input.value.trim())) {
            this.dropdown.classList.add('is-open');
            this.isOpen = true;
            
            // Nếu dropdown nằm trong modal, render ra body để tránh bị cắt
            if (this.input) {
                const modal = this.input.closest('.modal');
                if (modal) {
                    this.repositionDropdownInModal();
                }
            }
        }
    }
    
    repositionDropdownInModal() {
        if (!this.input || !this.dropdown) return;
        
        // Lấy vị trí của input
        const inputRect = this.input.getBoundingClientRect();
        const dropdown = this.dropdown;
        
        // Lưu parent ban đầu nếu chưa lưu
        if (!this._originalParent) {
            this._originalParent = dropdown.parentElement;
        }
        
        // Append dropdown ra body nếu chưa được append (để tránh làm modal mở rộng)
        if (dropdown.parentElement !== document.body) {
            document.body.appendChild(dropdown);
            // Thêm class để có thể style được khi dropdown nằm ngoài modal
            dropdown.classList.add('modal-occupation-dropdown');
        }
        
        const applyFloatingPosition = (rect) => {
            const spaceBelow = window.innerHeight - rect.bottom;
            const maxHeight = Math.min(200, spaceBelow - 10); // 10px padding
            Object.assign(dropdown.style, {
                '--autocomplete-floating-top': `${rect.bottom}px`,
                '--autocomplete-floating-left': `${rect.left}px`,
                '--autocomplete-floating-width': `${rect.width}px`,
                '--autocomplete-floating-max-height': `${maxHeight}px`
            });
        };

        applyFloatingPosition(inputRect);
        
        // Xử lý khi scroll hoặc resize
        const handleReposition = () => {
            const newRect = this.input.getBoundingClientRect();
            applyFloatingPosition(newRect);
        };
        
        // Lưu handler để có thể remove sau
        this._repositionHandler = handleReposition;
        window.addEventListener('scroll', handleReposition, true);
        window.addEventListener('resize', handleReposition);
    }
    
    hideDropdown() {
        if (!this.dropdown) return;
        
        this.dropdown.classList.remove('is-open');
        this.isOpen = false;
        this.selectedIndex = -1;
        
        // Remove event listeners nếu có
        if (this._repositionHandler) {
            window.removeEventListener('scroll', this._repositionHandler, true);
            window.removeEventListener('resize', this._repositionHandler);
            this._repositionHandler = null;
        }
        
        // Reset position về absolute và đưa dropdown về vị trí ban đầu nếu đã append ra body
        if (this.input) {
            const modal = this.input.closest('.modal');
            if (modal) {
                // Đưa dropdown về lại parent ban đầu nếu đã append ra body
                if (this.dropdown.parentElement === document.body && this._originalParent) {
                    this._originalParent.appendChild(this.dropdown);
                    this._originalParent = null;
                    // Remove class khi trả về parent ban đầu
                    this.dropdown.classList.remove('modal-occupation-dropdown');
                }
                
                this.dropdown.removeAttribute('style');
            }
        }
    }
    
    // Public methods
    getValue() {
        return this.input ? this.input.value.trim() : '';
    }
    
    setValue(value) {
        if (this.input) {
            this.input.value = value;
        }
    }
    
    clear() {
        if (this.input) {
            this.input.value = '';
        }
        this.hideDropdown();
    }
}

// Auto-initialize khi DOM ready (chỉ nếu chưa được khởi tạo)
document.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo autocomplete cho field nghề nghiệp (chỉ nếu chưa có và cả input và dropdown đều tồn tại)
    const occupationInput = document.getElementById('occupation');
    const occupationDropdown = document.getElementById('occupationDropdown');
    if (occupationInput && occupationDropdown && !window.occupationAutocomplete) {
        window.occupationAutocomplete = new OccupationAutocomplete('occupation', 'occupationDropdown');
    }
});

// Export để sử dụng ở file khác
window.OccupationAutocomplete = OccupationAutocomplete;
