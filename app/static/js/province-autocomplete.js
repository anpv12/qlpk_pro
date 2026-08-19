/**
 * Province Autocomplete Component
 * Autocomplete cho Tỉnh/Thành phố với data từ API
 */

class ProvinceAutocomplete extends AutocompleteBase {
	constructor(inputId, dropdownId, onSelectCallback) {
		// Truyền null cho apiEndpoint vì sẽ override loadItems()
		super(inputId, dropdownId, null);

		// Callback khi chọn province (để load ward)
		this.onSelectCallback = onSelectCallback || null;

		// Cache provinces data
		this.provinces = [];
	}

	async loadItems() {
		try {
			const token = localStorage.getItem('qlpk_token');
			const response = await fetch('/api/vietnam-address/regions', {
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			if (response.ok) {
				const data = await response.json();
				// API trả về { data: [{ code, name }] }
				const regions = data.data || data || [];

				// Transform thành format { id, name, code }
				this.provinces = regions.map(r => ({
					id: r.code,
					name: r.name,
					code: r.code
				}));

				this.items = this.provinces;
			}
		} catch (error) {
			console.error('Error loading provinces:', error);
			this.items = [];
		}
	}

	selectItem(item) {
		const isNew = item.dataset.new === 'true';
		const itemName = item.dataset.name;
		const itemCode = item.dataset.id; // code được lưu trong data-id

		if (isNew) {
			// Province không cho phép tạo mới - chỉ set value
			this.input.value = itemName;
			this.hideDropdown();
		} else {
			// Chọn item có sẵn
			this.input.value = itemName;
			// Lưu code vào data attribute cho việc load ward
			this.input.dataset.code = itemCode;
			this.hideDropdown();

			// Trigger callback để load ward
			if (this.onSelectCallback && typeof this.onSelectCallback === 'function') {
				this.onSelectCallback(itemName, itemCode);
			}

			// Trigger change event
			this.input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	// Override để không cho tạo mới
	populateDropdown() {
		let html = '';

		if (this.filteredItems.length === 0) {
			html = `<div class="occupation-item no-results">${this.getNoResultsText()}</div>`;
		} else {
			this.filteredItems.forEach((item, index) => {
				html += `
                    <div class="occupation-item" data-index="${index}" data-id="${item.code}" data-name="${item.name}">
                        ${item.name}
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

	getNoResultsText() {
		return 'Không tìm thấy tỉnh/thành phố';
	}

	// Lấy code của province đã chọn
	getSelectedCode() {
		return this.input.dataset.code || null;
	}

	// Set value và code (dùng khi load data từ DB)
	async setValueByName(provinceName) {
		if (!provinceName) {
			this.input.value = '';
			this.input.dataset.code = '';
			return;
		}

		// Đảm bảo đã load provinces
		if (!this.provinces || this.provinces.length === 0) {
			await this.loadItems();
		}

		// Tìm province theo tên
		const province = this.provinces.find(p =>
			p.name.toLowerCase() === provinceName.toLowerCase()
		);

		if (province) {
			this.input.value = province.name;
			this.input.dataset.code = province.code;
		} else {
			// Không tìm thấy - set value trực tiếp
			this.input.value = provinceName;
			this.input.dataset.code = '';
		}
	}
}

// Export để sử dụng ở file khác
window.ProvinceAutocomplete = ProvinceAutocomplete;
