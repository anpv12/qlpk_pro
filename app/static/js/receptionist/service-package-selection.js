(function (window) {
	'use strict';

	function normalizeSearchText(value) {
		return window.QLPKSearchNormalization?.normalizeSearchText(value)
			|| String(value || '').toLowerCase().trim();
	}

	function parseOptionalId(value) {
		if (value === null || typeof value === 'undefined' || value === '') {
			return null;
		}
		const parsed = parseInt(value, 10);
		return Number.isNaN(parsed) ? null : parsed;
	}

	function readSelectionFromDocument(doc) {
		const root = doc || window.document;
		const serviceId = parseOptionalId(root.getElementById('serviceTypeId')?.value || '');

		return {
			service_id: serviceId,
			package_id: null,
			appointment_type: 'SERVICE'
		};
	}

	function applySelectionToFormData(formData, doc) {
		const selection = readSelectionFromDocument(doc);
		formData.appointment_type = selection.appointment_type;
		formData.service_id = selection.service_id;
		formData.package_id = null;
		return formData;
	}

	function filterServicesByQuery(servicesList, query) {
		return servicesList.filter(service =>
			normalizeSearchText(service.name).includes(query) ||
			(service.code && normalizeSearchText(service.code).includes(query)));
	}

	function handleServiceDropdownKeydown(dropdown, e) {
		const items = [...dropdown.querySelectorAll('.service-autocomplete-item')];
		const active = items.find(item => item.classList.contains('active'));
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!active) {
				items[0]?.classList.add('active');
			} else {
				active.classList.remove('active');
				const next = active.nextElementSibling;
				if (next && next.matches('.service-autocomplete-item')) next.classList.add('active');
			}
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (active) {
				active.classList.remove('active');
				const prev = active.previousElementSibling;
				if (prev && prev.matches('.service-autocomplete-item')) prev.classList.add('active');
			}
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (active) active.click();
		} else if (e.key === 'Escape') {
			dropdown.classList.remove('show');
		}
	}

	function createServiceItem(service, onSelect) {
		const doc = window.document;
		const item = doc.createElement('div');
		item.className = 'service-autocomplete-item';
		const name = doc.createElement('span');
		name.className = 'service-name';
		name.textContent = service.name || '';
		const price = doc.createElement('span');
		price.className = 'service-price';
		price.textContent = `${Number(service.default_price || 0).toLocaleString()} VNĐ`;
		item.append(name, price);
		item.addEventListener('click', () => onSelect(service));
		return item;
	}

	const serviceAutocompleteBindings = new Map();

	function initServiceAutocomplete(inputId, dropdownId, hiddenId, servicesList) {
		const doc = window.document;
		const input = doc.getElementById(inputId);
		const dropdown = doc.getElementById(dropdownId);
		const hidden = doc.getElementById(hiddenId);
		serviceAutocompleteBindings.get(inputId)?.abort();
		if (!input || !dropdown) return;
		const binding = new AbortController();
		serviceAutocompleteBindings.set(inputId, binding);
		const { signal } = binding;
		const setHidden = value => { if (hidden) hidden.value = value; };
		dropdown.replaceChildren();
		dropdown.classList.remove('show');

		function selectService(selected) {
			input.value = selected.name;
			setHidden(selected.id);
			dropdown.classList.remove('show');
		}

		function renderDropdown(list) {
			if (!list || list.length === 0) {
				const empty = doc.createElement('div');
				empty.className = 'service-autocomplete-no-results';
				empty.textContent = 'Không tìm thấy dịch vụ phù hợp';
				dropdown.replaceChildren(empty);
				dropdown.classList.add('show');
				return;
			}
			dropdown.replaceChildren(...list.map(service => createServiceItem(service, selectService)));
			dropdown.classList.add('show');
		}

		input.addEventListener('focus', () => {
			const query = normalizeSearchText(input.value);
			renderDropdown(query ? filterServicesByQuery(servicesList, query) : servicesList);
		}, { signal });

		input.addEventListener('input', () => {
			const query = normalizeSearchText(input.value);
			setHidden('');
			if (!query) {
				renderDropdown(servicesList);
				return;
			}
			renderDropdown(filterServicesByQuery(servicesList, query));
		}, { signal });

		doc.addEventListener('click', e => {
			if (!e.target.closest(`#${inputId}, #${dropdownId}`)) {
				dropdown.classList.remove('show');
			}
		}, { signal });

		input.addEventListener('keydown', e => handleServiceDropdownKeydown(dropdown, e), { signal });
	}

	function setFieldValue(id, value) {
		const field = window.document.getElementById(id);
		if (field) field.value = value;
	}

	function setServiceSelection(appointment, servicesList) {
		if (appointment.service_id && servicesList && servicesList.length > 0) {
			const service = servicesList.find(item => String(item.id) === String(appointment.service_id));
			setFieldValue('serviceType', service ? service.name : '');
			setFieldValue('serviceTypeId', appointment.service_id);
			return true;
		}

		setFieldValue('serviceType', '');
		setFieldValue('serviceTypeId', '');
		return false;
	}

	window.ReceptionistServicePackage = {
		parseOptionalId,
		readSelectionFromDocument,
		applySelectionToFormData,
		initServiceAutocomplete,
		setServiceSelection
	};
})(window);
