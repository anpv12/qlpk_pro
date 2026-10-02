import { el, replace } from '../shared/dom.js';
import { rebind, rebindDelegate } from '../shared/dom-query.js';

function normalizeServiceSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '')
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.trim();
}

function formatPrice(price) {
	return new Intl.NumberFormat('vi-VN').format(price) + ' VNĐ';
}

const noResults = text => el('div', { class: 'autocomplete-no-results' }, text);

function renderServiceLoadError() {
	document.querySelectorAll('#addServiceDropdown, #editServiceDropdown').forEach(dropdown => {
		replace(dropdown, noResults('Lỗi tải dữ liệu dịch vụ'));
		dropdown.classList.add('show');
	});
}

// Service shown by each dropdown item
const itemServices = new WeakMap();

function renderServiceDropdown(dropdown, list) {
	dropdown.classList.add('show');
	if (!list || list.length === 0) {
		replace(dropdown, noResults('Không tìm thấy dịch vụ phù hợp'));
		return;
	}
	replace(dropdown, list.map(service => {
		const item = el('div', { class: 'autocomplete-item' },
			el('span', { class: 'autocomplete-item-name' }, service.name || ''),
			el('span', { class: 'autocomplete-item-price' }, formatPrice(service.default_price || 0)));
		itemServices.set(item, service);
		return item;
	}));
}

function moveActive(dropdown, step) {
	const items = [...dropdown.querySelectorAll('.autocomplete-item')];
	const index = items.findIndex(item => item.classList.contains('active'));
	if (index === -1) {
		if (step > 0) items[0]?.classList.add('active');
		return;
	}
	items[index].classList.remove('active');
	items[index + step]?.classList.add('active');
}

// Service name autocomplete: picking an item fills the input/hidden id and emits qlpk:service-selected (detail = service)
function initializeServiceAutocomplete(options) {
	const input = document.getElementById(options.inputId);
	const dropdown = document.getElementById(options.dropdownId);
	const hidden = document.getElementById(options.hiddenId);
	if (!input || !dropdown || !hidden) return;
	const getServices = typeof options.getServices === 'function' ? options.getServices : () => [];
	const key = `serviceAutocomplete${options.inputId}`;
	const render = list => renderServiceDropdown(dropdown, list);

	rebindDelegate(dropdown, 'click', '.autocomplete-item', key, function () {
		const selected = itemServices.get(this);
		input.value = selected.name;
		hidden.value = selected.id;
		dropdown.classList.remove('show');
		input.dispatchEvent(new CustomEvent('qlpk:service-selected', { bubbles: true, detail: selected }));
	});
	rebind(input, 'focus', key, () => {
		if (!normalizeServiceSearchText(input.value)) render(getServices());
		else input.dispatchEvent(new Event('input', { bubbles: true }));
	});
	rebind(input, 'input', key, () => {
		const query = normalizeServiceSearchText(input.value);
		if (!query) {
			hidden.value = '';
			render(getServices());
			return;
		}
		const filtered = getServices().filter(service =>
			normalizeServiceSearchText(service.name).includes(query) ||
			(service.code && normalizeServiceSearchText(service.code).includes(query)));
		if (filtered.length === 0) hidden.value = '';
		render(filtered);
	});
	rebind(document, 'click', key, event => {
		if (!(event.target instanceof Element) || !event.target.closest(`#${options.inputId}, #${options.dropdownId}`)) dropdown.classList.remove('show');
	});
	rebind(input, 'keydown', key, event => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			moveActive(dropdown, event.key === 'ArrowDown' ? 1 : -1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			dropdown.querySelector('.autocomplete-item.active')?.click();
		} else if (event.key === 'Escape') {
			dropdown.classList.remove('show');
		}
	});
}

function packageOptions(packages) {
	if (!packages || packages.length === 0) {
		return [el('option', { value: '', disabled: true }, 'Chưa có gói nào. Vui lòng thêm từ quản trị!')];
	}
	return packages.map(pkg => el('option', { value: pkg.id, 'data-duration': pkg.duration_minutes, 'data-price': pkg.price },
		`${pkg.name || ''} - ${formatPrice(pkg.price || 0)}`));
}

const packageSelects = () => ['addPackage', 'editPackage'].map(id => document.getElementById(id)).filter(Boolean);

function populatePackageSelects(packages) {
	packageSelects().forEach(select => replace(select, el('option', { value: '' }, 'Chọn gói'), packageOptions(packages)));
}

function renderPackageSelectError() {
	packageSelects().forEach(select => replace(select, el('option', { value: '', disabled: true }, 'Lỗi tải dữ liệu gói')));
}

const AppointmentManagementServicePackageControlsUtils = {
	formatPrice,
	initializeServiceAutocomplete,
	populatePackageSelects,
	renderPackageSelectError,
	renderServiceDropdown,
	renderServiceLoadError
};

export { AppointmentManagementServicePackageControlsUtils };
