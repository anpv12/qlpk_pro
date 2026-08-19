(function (window) {
	'use strict';

	const PROFILE_AUTOCOMPLETE_OPTIONS = {
		nationality: ['Việt Nam', 'Mỹ', 'Anh', 'Pháp', 'Đức', 'Nhật', 'Hàn Quốc', 'Trung Quốc', 'Thái Lan', 'Singapore'],
		religion: ['Không tôn giáo', 'Phật giáo', 'Công giáo', 'Tin lành', 'Hồi giáo', 'Cao Đài', 'Hoà Hảo', 'Khác'],
		ethnicity: ['Kinh', 'Tày', 'Thái', 'Mường', 'Khmer', 'Hoa', 'Nùng', "H'Mông", 'Dao', 'Gia Rai', 'Ê Đê', 'Ba Na', 'Xơ Đăng', 'Cơ Ho', 'Chăm', 'Sán Dìu', 'Ra Glai', "M'Nông", 'Thổ', 'Xtiêng', 'Khơ Mú', 'Brâu', 'Cơ Tu', 'Giáy', 'Lào', 'La Chí', 'La Ha', 'Phù Lá', 'Lự', 'Ngái', 'Chứt', 'Si La', 'Pu Péo', 'Rơ Măm', 'Brâu', 'Ơ Đu'],
		educationLevel: ['Không biết đọc biết viết', 'Biết đọc biết viết', 'Tiểu học', 'Trung học cơ sở', 'Trung học phổ thông', 'Trung cấp', 'Cao đẳng', 'Đại học', 'Thạc sĩ', 'Tiến sĩ'],
		occupation: [
			'Công nhân', 'Nông dân', 'Buôn bán', 'Lái xe', 'Thợ may', 'Thợ xây', 'Thợ điện', 'Thợ nước', 'Thợ sửa xe', 'Thợ hàn',
			'Giáo viên', 'Bác sĩ', 'Y tá', 'Dược sĩ', 'Luật sư', 'Kế toán', 'Nhân viên văn phòng', 'Công chức', 'Cảnh sát', 'Quân nhân',
			'Sinh viên', 'Học sinh', 'Nội trợ', 'Hưu trí', 'Thất nghiệp', 'Khác'
		],
		sexualOrientation: ['Dị tính', 'Đồng tính nam', 'Đồng tính nữ', 'Song tính', 'Toàn tính', 'Vô tính', 'Khác', 'Không muốn trả lời']
	};

	const FIELD_CONFIGS = [
		['nationality', 'nationalityDropdown', 'nationalityValue', 'nationality'],
		['religion', 'religionDropdown', 'religionValue', 'religion'],
		['ethnicity', 'ethnicityDropdown', 'ethnicityValue', 'ethnicity'],
		['educationLevel', 'educationLevelDropdown', 'educationLevelValue', 'educationLevel'],
		['occupation', 'occupationDropdown', 'occupationValue', 'occupation'],
		['sexualOrientation', 'sexualOrientationDropdown', 'sexualOrientationValue', 'sexualOrientation']
	];

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function setupAutocomplete(inputId, dropdownId, hiddenId, optionsList, options = {}) {
		const doc = getDocument(options);
		const input = doc.getElementById(inputId);
		const dropdown = doc.getElementById(dropdownId);
		const hidden = doc.getElementById(hiddenId);

		if (!input || !dropdown) return;
		if (input._receptionistProfileAutocompleteBound) return;
		input._receptionistProfileAutocompleteBound = true;

		function filterOptions(value) {
			return optionsList.filter(option =>
				option.toLowerCase().includes(value.toLowerCase())
			);
		}

		function hasExactOption(value) {
			const normalizedValue = value.trim().toLowerCase();
			return optionsList.some(option => option.toLowerCase() === normalizedValue);
		}

		function selectValue(value) {
			input.value = value;
			if (hidden) hidden.value = value;
			dropdown.classList.remove('is-open');
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}

		function createOptionItem(option) {
			const item = doc.createElement('div');
			item.className = 'dropdown-item';
			item.textContent = option;
			item.addEventListener('click', () => selectValue(option));
			return item;
		}

		function createNewValueItem(value) {
			const item = doc.createElement('div');
			item.className = 'dropdown-item new-occupation';
			item.setAttribute('data-new', 'true');
			item.setAttribute('data-name', value);

			const icon = doc.createElement('i');
			icon.className = 'bi bi-plus-circle me-2';
			icon.setAttribute('aria-hidden', 'true');
			item.appendChild(icon);

			const label = doc.createElement('span');
			label.textContent = `Tạo mới: "${value}"`;
			item.appendChild(label);

			item.addEventListener('click', () => selectValue(value));
			return item;
		}

		function showDropdown(filteredOptions, rawValue = '') {
			dropdown.innerHTML = '';
			const creatableValue = rawValue.trim();
			const shouldShowCreate = creatableValue.length > 0 && !hasExactOption(creatableValue);

			if (filteredOptions.length === 0 && !shouldShowCreate) {
				dropdown.classList.remove('is-open');
				return;
			}

			if (shouldShowCreate) {
				dropdown.appendChild(createNewValueItem(creatableValue));
			}

			filteredOptions.forEach(option => {
				dropdown.appendChild(createOptionItem(option));
			});

			dropdown.classList.add('is-open');
		}

		doc.addEventListener('click', (e) => {
			if (!input.contains(e.target) && !dropdown.contains(e.target)) {
				dropdown.classList.remove('is-open');
			}
		});

		input.addEventListener('input', (e) => {
			const value = e.target.value;
			if (hidden) hidden.value = value;

			if (value.trim().length > 0) {
				showDropdown(filterOptions(value), value);
			} else {
				showDropdown(optionsList);
			}
		});

		input.addEventListener('focus', (e) => {
			const value = e.target.value.trim();
			showDropdown(value.length > 0 ? filterOptions(value) : optionsList, value);
		});
	}

	function initializeAutocomplete(options = {}) {
		FIELD_CONFIGS.forEach(([inputId, dropdownId, hiddenId, optionKey]) => {
			setupAutocomplete(inputId, dropdownId, hiddenId, PROFILE_AUTOCOMPLETE_OPTIONS[optionKey], options);
		});
	}

	window.ReceptionistProfileAutocomplete = {
		options: PROFILE_AUTOCOMPLETE_OPTIONS,
		setupAutocomplete,
		initializeAutocomplete
	};
})(window);
