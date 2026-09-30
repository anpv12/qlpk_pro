/**
 * Base Autocomplete Component
 * Class cơ sở cho các autocomplete component
 */

function normalizeAutocompleteText(value) {
    return window.QLPKSearchNormalization?.normalizeSearchText(value)
        || String(value || '').toLowerCase().trim();
}

class AutocompleteBase {
    constructor(inputId, dropdownId, apiEndpoint) {
        this.input = document.getElementById(inputId);
        this.dropdown = document.getElementById(dropdownId);
        this.apiEndpoint = apiEndpoint;
        this.items = [];
        this.filteredItems = [];
        this.selectedIndex = -1;
        this.isOpen = false;
        
        if (this.input && this.dropdown) {
            this.registerInstance();
            this.init();
        }
    }

    registerInstance() {
        if (!window.__qlpkAutocompleteInstances) {
            window.__qlpkAutocompleteInstances = new Set();
        }
        window.__qlpkAutocompleteInstances.add(this);
    }
    
    async init() {
        // Load danh sách items
        await this.loadItems();
        
        // Bind events
        this.bindEvents();
    }
    
    async loadItems() {
        try {
            const response = await fetch(this.apiEndpoint);
            
            if (response.ok) {
                const data = await response.json();
                this.items = data.success ? data.data : (data.data || data);
            }
        } catch (error) {
            console.error(`Error loading items from ${this.apiEndpoint}:`, error);
        }
    }
    
    bindEvents() {
        // Input focus - show dropdown và load danh sách đầy đủ
        this.input.addEventListener('focus', async () => {
            this.closeOtherAutocompleteDropdowns();

            // Đảm bảo items được khởi tạo trước khi check length
            if (!this.items || this.items.length === 0) {
                await this.loadItems();
            }
            
            // Đảm bảo items được set sau khi load
            if (!this.items) {
                this.items = [];
            }
            
            this.filteredItems = [...this.items];
            this.populateDropdown();
            this.showDropdown();
        });
        
        // Input blur - hide dropdown after delay
        this.input.addEventListener('blur', () => {
            setTimeout(() => this.hideDropdown(), 200);
        });
        
        // Input input - filter and show suggestions
        this.input.addEventListener('input', (e) => {
            this.filterItems(e.target.value);
        });
        
        // Input keydown - handle arrow keys and enter
        this.input.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
        
        // Click outside - hide dropdown
        // Lưu reference để destroy() có thể remove đúng listener khi instance bị tái tạo
        this._documentClickHandler = (e) => {
            if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
                this.hideDropdown();
            }
        };
        document.addEventListener('click', this._documentClickHandler);
    }
    
    filterItems(query) {
        // Đảm bảo items được khởi tạo
        if (!this.items) {
            this.items = [];
        }
        
        if (!query.trim()) {
            this.filteredItems = [...this.items];
        } else {
            const lowerQuery = normalizeAutocompleteText(query);
            this.filteredItems = this.items.filter(item => 
                item && item.name && normalizeAutocompleteText(item.name).includes(lowerQuery)
            );
        }
        
        this.selectedIndex = -1;
        this.populateDropdown();
        this.showDropdown();
    }
    
    populateDropdown() {
        let html = '';
        
        if (this.filteredItems.length === 0) {
            if (this.input.value.trim()) {
                // Có text input -> hiển thị nút "Tạo mới"
                html = `
                    <div class="occupation-item new-occupation" data-new="true" data-name="${window.QLPKHtml.escape(this.input.value)}">
                        <i class="bi bi-plus-circle me-2"></i>Tạo mới: "${window.QLPKHtml.escape(this.input.value)}"
                    </div>
                `;
            } else {
                // Không có text input -> hiển thị "Không tìm thấy"
                html = `<div class="occupation-item no-results">${this.getNoResultsText()}</div>`;
            }
        } else {
            // Có kết quả search -> hiển thị danh sách
            this.filteredItems.forEach((item, index) => {
                html += `
                    <div class="occupation-item" data-index="${index}" data-id="${item.id}" data-name="${window.QLPKHtml.escape(item.name)}">
                        ${window.QLPKHtml.escape(item.name)}
                    </div>
                `;
            });
        }
        
        this.dropdown.innerHTML = html;
        
        // Bind click events
        this.dropdown.querySelectorAll('.occupation-item').forEach(item => {
            item.addEventListener('click', () => {
                this.selectItem(item);
            });
        });
    }
    
    selectItem(item) {
        const isNew = item.dataset.new === 'true';
        const itemName = item.dataset.name;
        
        if (isNew) {
            // Tạo item mới
            this.createNewItem(itemName);
        } else {
            // Chọn item có sẵn
            this.input.value = itemName;
            this.hideDropdown();
            
            // Trigger change event
            this.input.dispatchEvent(new Event('change', { bubbles: true }));
        }
    }
    
    async createNewItem(name) {
        try {
            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: name })
            });
            
            if (response.ok) {
                const data = await response.json();
                const newItem = data.success ? data.data : data;
                
                // Cập nhật danh sách local
                this.items.push(newItem);
                
                // Set giá trị cho input
                this.input.value = newItem.name;
                this.hideDropdown();
                
                // Trigger change event
                this.input.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (error) {
            console.error(`Error creating new item:`, error);
        }
    }
    
    handleKeydown(e) {
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
                    this.selectItem(items[this.selectedIndex]);
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

    closeOtherAutocompleteDropdowns() {
        const instances = window.__qlpkAutocompleteInstances;
        if (instances && typeof instances.forEach === 'function') {
            instances.forEach(instance => {
                if (instance && instance !== this && typeof instance.hideDropdown === 'function') {
                    instance.hideDropdown();
                }
            });
        }
        window.__qlpkActiveAutocomplete = this;
    }

    shouldUseFloatingDropdown() {
        const modal = this.input.closest('.modal');
        return Boolean(modal || this.input.dataset.autocompleteFloating === 'true' || this.dropdown.dataset.autocompleteFloating === 'true');
    }
    
    showDropdown() {
        this.closeOtherAutocompleteDropdowns();
        this.dropdown.classList.add('is-open');
        this.isOpen = true;
        
        // Render ra body khi dropdown nằm trong modal hoặc trong panel có overflow để tránh bị cắt.
        if (this.shouldUseFloatingDropdown()) {
            this.repositionFloatingDropdown();
        }
    }
    
    repositionFloatingDropdown() {
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
            // Thêm class để có thể style được khi dropdown nằm ngoài parent ban đầu
            dropdown.classList.add('modal-autocomplete-dropdown');
        }
        
        const applyFloatingPosition = (rect) => {
            const viewportGap = 8;
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
            const availableSpace = openAbove ? spaceAbove : spaceBelow;
            const maxHeight = Math.max(96, Math.min(220, availableSpace - viewportGap));
            const top = openAbove ? Math.max(viewportGap, rect.top - maxHeight - 4) : rect.bottom;
            Object.assign(dropdown.style, {
                position: 'fixed',
                top: `${top}px`,
                left: `${rect.left}px`,
                right: 'auto',
                width: `${rect.width}px`,
                maxHeight: `${maxHeight}px`,
                zIndex: '1070',
                '--autocomplete-floating-top': `${top}px`,
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
        if (this._repositionHandler) {
            window.removeEventListener('scroll', this._repositionHandler, true);
            window.removeEventListener('resize', this._repositionHandler);
        }
        this._repositionHandler = handleReposition;
        window.addEventListener('scroll', handleReposition, true);
        window.addEventListener('resize', handleReposition);
    }
    
    hideDropdown() {
        this.dropdown.classList.remove('is-open');
        this.isOpen = false;
        this.selectedIndex = -1;

        if (window.__qlpkActiveAutocomplete === this) {
            window.__qlpkActiveAutocomplete = null;
        }
        
        // Remove event listeners nếu có
        if (this._repositionHandler) {
            window.removeEventListener('scroll', this._repositionHandler, true);
            window.removeEventListener('resize', this._repositionHandler);
            this._repositionHandler = null;
        }
        
        // Reset position và đưa dropdown về vị trí ban đầu nếu đã append ra body.
        if (this.dropdown.parentElement === document.body && this._originalParent) {
            this._originalParent.appendChild(this.dropdown);
            this._originalParent = null;
            this.dropdown.classList.remove('modal-autocomplete-dropdown');
        }

        this.dropdown.removeAttribute('style');
    }
    
    // Abstract method - override in subclass
    getNoResultsText() {
        return 'Không tìm thấy kết quả';
    }
    
    /**
     * Dọn dẹp instance: remove document click listener để tránh orphan listener
     * PHẢI gọi trước khi set instance về null hoặc tạo instance mới
     */
    destroy() {
        if (this._documentClickHandler) {
            document.removeEventListener('click', this._documentClickHandler);
            this._documentClickHandler = null;
        }
        if (window.__qlpkAutocompleteInstances) {
            window.__qlpkAutocompleteInstances.delete(this);
        }
        if (this._repositionHandler) {
            window.removeEventListener('scroll', this._repositionHandler, true);
            window.removeEventListener('resize', this._repositionHandler);
            this._repositionHandler = null;
        }
        this.hideDropdown();
    }
    
    // Public methods
    getValue() {
        return this.input.value.trim();
    }
    
    setValue(value) {
        this.input.value = value;
    }
    
    clear() {
        this.input.value = '';
        this.hideDropdown();
    }
}

// Export để sử dụng ở file khác
window.AutocompleteBase = AutocompleteBase;
