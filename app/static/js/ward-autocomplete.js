/**
 * Ward Autocomplete Component
 * Autocomplete cho Xã/Phường/Đặc khu với data từ API
 * Load dựa trên Province đã chọn
 */

class WardAutocomplete extends AutocompleteBase {
	constructor(inputId, dropdownId) {
		// Truyền null cho apiEndpoint vì sẽ override loadItems()
		super(inputId, dropdownId, null);

		// Province code để load units
		this.provinceCode = null;

		// Cache units data
		this.units = [];
	}

	/**
	 * Set province code và reload units
	 * @param {string} code - Mã tỉnh/thành phố
	 */
	async setProvinceCode(code) {
		this.provinceCode = code;
		// Clear current value khi đổi province
		this.input.value = '';
		this.input.dataset.code = '';

		if (code) {
			await this.loadItems();
		} else {
			this.units = [];
			this.items = [];
		}
	}

	async loadItems() {
		if (!this.provinceCode) {
			this.items = [];
			return;
		}

		try {
			const token = localStorage.getItem('qlpk_token');
			const response = await fetch(`/api/vietnam-address/regions/${this.provinceCode}/units`, {
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			if (response.ok) {
				const data = await response.json();
				// API trả về { data: [{ code, name, full_name }] }
				const units = data.data || data || [];

				// Transform thành format { id, name, code, full_name }
				this.units = units.map(u => ({
					id: u.code,
					name: u.name,
					code: u.code,
					full_name: u.full_name || u.name
				}));

				this.items = this.units;
			}
		} catch (error) {
			console.error('Error loading units:', error);
			this.items = [];
		}
	}

	selectItem(item) {
		const isNew = item.dataset.new === 'true';
		const itemName = item.dataset.name;
		const itemCode = item.dataset.id;

		if (isNew) {
			// Ward không cho phép tạo mới - chỉ set value
			this.input.value = itemName;
			this.hideDropdown();
		} else {
			// Chọn item có sẵn
			this.input.value = itemName;
			this.input.dataset.code = itemCode;
			this.hideDropdown();

			// Trigger change event
			this.input.dispatchEvent(new Event('change', { bubbles: true }));
		}
	}

	// Override để không cho tạo mới
	populateDropdown() {
		let html = '';

		if (!this.provinceCode) {
			html = `<div class="occupation-item no-results">Vui lòng chọn Tỉnh/Thành phố trước</div>`;
		} else if (this.filteredItems.length === 0) {
			html = `<div class="occupation-item no-results">${this.getNoResultsText()}</div>`;
		} else {
			this.filteredItems.forEach((item, index) => {
				html += `
                    <div class="occupation-item" data-index="${index}" data-id="${item.code}" data-name="${item.name}">
                        ${item.full_name || item.name}
                    </div>
                `;
			});
		}

		this.dropdown.innerHTML = html;

		// Bind click events
		this.dropdown.querySelectorAll('.occupation-item').forEach(item => {
			item.addEventListener('click', () => {
				if (!item.classList.contains('no-results')) {
					this.selectItem(item);
				}
			});
		});
	}

	getNoResultsText() {
		return 'Không tìm thấy xã/phường';
	}

	// Lấy code của ward đã chọn
	getSelectedCode() {
		return this.input.dataset.code || null;
	}

	// Set value và code (dùng khi load data từ DB)
	async setValueByName(wardName) {
		if (!wardName) {
			this.input.value = '';
			this.input.dataset.code = '';
			return;
		}

		// Đảm bảo đã load units (nếu có provinceCode)
		if (this.provinceCode && (!this.units || this.units.length === 0)) {
			await this.loadItems();
		}

		// Tìm unit theo tên
		const unit = this.units.find(u =>
			(window.QLPKSearchNormalization?.normalizeSearchText(u.name) || u.name.toLowerCase()) ===
				(window.QLPKSearchNormalization?.normalizeSearchText(wardName) || wardName.toLowerCase()) ||
			(u.full_name && (window.QLPKSearchNormalization?.normalizeSearchText(u.full_name) || u.full_name.toLowerCase()) ===
				(window.QLPKSearchNormalization?.normalizeSearchText(wardName) || wardName.toLowerCase()))
		);

		if (unit) {
			this.input.value = unit.name;
			this.input.dataset.code = unit.code;
		} else {
			// Không tìm thấy - set value trực tiếp
			this.input.value = wardName;
			this.input.dataset.code = '';
		}
	}
}

// Export để sử dụng ở file khác
window.WardAutocomplete = WardAutocomplete;
