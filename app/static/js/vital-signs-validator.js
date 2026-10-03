// Quản lý trạng thái Tooltip
let activeTooltip = null;

function showTooltip(target, text) {
	if (activeTooltip) {
		activeTooltip.remove();
	}
	const tooltip = document.createElement('div');
	tooltip.className = 'vital-signs-tooltip';
	tooltip.textContent = text;
	document.body.appendChild(tooltip);

	const rect = target.getBoundingClientRect();
	const tooltipRect = tooltip.getBoundingClientRect();

	// Tính toán vị trí hiển thị (nằm ngay phía trên icon)
	const left = rect.left + window.scrollX + (rect.width / 2) - (tooltipRect.width / 2);
	const top = rect.top + window.scrollY - tooltipRect.height - 8;

	tooltip.style.setProperty('--vital-tooltip-left', `${left}px`);
	tooltip.style.setProperty('--vital-tooltip-top', `${top}px`);

	// Kích hoạt transition opacity
	void tooltip.offsetHeight; // Force reflow
	tooltip.classList.add('is-visible');

	activeTooltip = tooltip;
}

function hideTooltip() {
	if (activeTooltip) {
		const temp = activeTooltip;
		temp.classList.remove('is-visible');
		setTimeout(() => {
			temp.remove();
		}, 150);
		activeTooltip = null;
	}
}

// Bộ quy tắc kiểm tra các ngưỡng sinh hiệu (RED FLAGS)
const validators = {
	breathing: function(val) {
		const num = parseInt(val, 10);
		if (isNaN(num)) return null;
		if (num > 20) {
			return `Nhịp thở nhanh (cao): ${num} lần/phút (Bình thường: 12-20)`;
		}
		if (num < 12) {
			return `Nhịp thở chậm (thấp): ${num} lần/phút (Bình thường: 12-20)`;
		}
		return null;
	},
	pulse: function(val) {
		const num = parseInt(val, 10);
		if (isNaN(num)) return null;
		if (num > 100) {
			return `Mạch nhanh (cao): ${num} lần/phút (Bình thường: 60-100)`;
		}
		if (num < 60) {
			return `Mạch chậm (thấp): ${num} lần/phút (Bình thường: 60-100)`;
		}
		return null;
	},
	temperature: function(val) {
		// Hỗ trợ nhập số thập phân dạng dấu phẩy tiếng Việt (37,5 -> 37.5)
		const normalized = val.replace(',', '.');
		const num = parseFloat(normalized);
		if (isNaN(num)) return null;
		if (num > 38.3) {
			return `Nhiệt độ cao (Sốt): ${num}°C (Bình thường: 36.5-37.5, Nguy hiểm: >38.3)`;
		}
		if (num < 35.0) {
			return `Nhiệt độ thấp (Hạ thân nhiệt): ${num}°C (Bình thường: 36.5-37.5, Nguy hiểm: <35.0)`;
		}
		return null;
	},
	bloodPressure: function(val) {
		// Định dạng SBP/DBP (ví dụ: 120/80 hoặc 120-80)
		const parts = val.split(/[/-]/);
		if (parts.length < 2) return null;
		const sbp = parseInt(parts[0].trim(), 10);
		const dbp = parseInt(parts[1].trim(), 10);
		if (isNaN(sbp) || isNaN(dbp)) return null;

		if (sbp > 140 || dbp > 90) {
			return `Huyết áp cao: ${sbp}/${dbp} mmHg (Bình thường: <120/80, Nguy hiểm: >140/90)`;
		}
		if (sbp < 90 || dbp < 60) {
			return `Huyết áp thấp: ${sbp}/${dbp} mmHg (Bình thường: <120/80, Nguy hiểm: <90/60)`;
		}
		return null;
	}
};

function findFieldLabel(input) {
	const directLabel = document.querySelector(`label[for="${input.id}"]`);
	if (directLabel) return directLabel;

	const fieldContainer = input.closest('.receptionist-vital-field, .col-md-1, .col-md-2, .col-md-3, .col-md-4, .col, .form-group');
	return fieldContainer ? fieldContainer.querySelector('label') : null;
}

// Thực hiện kiểm tra trường nhập liệu và render icon cảnh báo
function validateField(input) {
	const id = input.id;
	const validator = validators[id];
	if (!validator) return;

	const val = input.value.trim();
	const errorMsg = val ? validator(val) : null;

	const label = findFieldLabel(input);
	if (!label) return;

	// Xóa icon cảnh báo cũ
	const existingIcon = label.querySelector('.vital-blink-icon');
	if (existingIcon) {
		existingIcon.remove();
	}

	// Chèn icon cảnh báo mới nếu vượt ngưỡng
	if (errorMsg) {
		const icon = document.createElement('span');
		icon.className = 'vital-blink-icon';
		const iconGlyph = document.createElement('i');
		iconGlyph.className = 'bi bi-exclamation-triangle-fill';
		icon.replaceChildren(iconGlyph);
		icon.dataset.tooltipText = errorMsg;

		// Gán các sự kiện để hiển thị tooltip
		icon.addEventListener('mouseenter', function() {
			showTooltip(icon, errorMsg);
		});
		icon.addEventListener('mouseleave', hideTooltip);
		icon.addEventListener('click', function() {
			showTooltip(icon, errorMsg);
		});

		label.appendChild(icon);
	}
}

function init() {
	const ids = ['breathing', 'pulse', 'bloodPressure', 'temperature'];

	// 1. Lắng nghe sự kiện trực tiếp từ DOM
	ids.forEach(id => {
		const input = document.getElementById(id);
		if (input) {
			// Validate lần đầu (nếu có sẵn dữ liệu từ database load lên)
			validateField(input);

			// Lắng nghe sự kiện người dùng nhập liệu trực tiếp
			input.addEventListener('input', function() {
				validateField(input);
			});
			input.addEventListener('change', function() {
				validateField(input);
			});

			// Override setter của property value để bắt được sự kiện gán giá trị bằng Vanilla JS
			// (ví dụ khi gọi input.value = 80)
			const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
			if (descriptor && descriptor.set) {
				Object.defineProperty(input, 'value', {
					get: function() {
						return descriptor.get.call(this);
					},
					set: function(val) {
						descriptor.set.call(this, val);
						validateField(this);
					},
					configurable: true
				});
			}
		}
	});
}

// Khởi động
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', init);
} else {
	init();
}

export { validateField, init as initVitalSignsValidator };
