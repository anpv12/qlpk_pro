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

	function initServiceAutocomplete(inputId, dropdownId, hiddenId, servicesList, $) {
		const $input = $(`#${inputId}`);
		const $dropdown = $(`#${dropdownId}`);
		const $hidden = $(`#${hiddenId}`);

		function renderDropdown(list) {
			if (!list || list.length === 0) {
				$dropdown.html('<div class="service-autocomplete-no-results">Không tìm thấy dịch vụ phù hợp</div>').addClass('show');
				return;
			}
			$dropdown.empty().addClass('show');
			list.forEach(service => {
				const $item = $('<div class="service-autocomplete-item">')
					.html(`
						<span class="service-name">${service.name}</span>
						<span class="service-price">${service.default_price.toLocaleString()} VNĐ</span>
					`)
					.data('service', service)
					.on('click', function () {
						const selected = $(this).data('service');
						$input.val(selected.name);
						$hidden.val(selected.id);
						$dropdown.removeClass('show');
						$input.trigger('serviceSelected', [selected]);
					});
				$dropdown.append($item);
			});
		}

		$input.on('focus', function () {
			const query = normalizeSearchText($(this).val());
			if (!query) {
				renderDropdown(servicesList);
			} else {
				$input.trigger('input');
			}
		});

		$input.on('input', function () {
			const query = normalizeSearchText($(this).val());
			if (!query) {
				$hidden.val('');
				renderDropdown(servicesList);
				return;
			}
			const filtered = servicesList.filter(s =>
				normalizeSearchText(s.name).includes(query) ||
				(s.code && normalizeSearchText(s.code).includes(query))
			);
			if (filtered.length === 0) {
				$hidden.val('');
			}
			renderDropdown(filtered);
		});

		$(document).on('click', function (e) {
			if (!$(e.target).closest(`#${inputId}, #${dropdownId}`).length) {
				$dropdown.removeClass('show');
			}
		});

		$input.on('keydown', function (e) {
			const $items = $dropdown.find('.service-autocomplete-item');
			const $active = $items.filter('.active');
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				if ($active.length === 0) {
					$items.first().addClass('active');
				} else {
					$active.removeClass('active').next('.service-autocomplete-item').addClass('active');
				}
			} else if (e.key === 'ArrowUp') {
				e.preventDefault();
				if ($active.length) {
					$active.removeClass('active').prev('.service-autocomplete-item').addClass('active');
				}
			} else if (e.key === 'Enter') {
				e.preventDefault();
				if ($active.length) {
					$active.trigger('click');
				}
			} else if (e.key === 'Escape') {
				$dropdown.removeClass('show');
			}
		});
	}

	function setServiceSelection(appointment, servicesList, $) {
		if (appointment.service_id && servicesList && servicesList.length > 0) {
			const service = servicesList.find(item => item.id == appointment.service_id);
			$('#serviceType').val(service ? service.name : '');
			$('#serviceTypeId').val(appointment.service_id);
			return true;
		}

		$('#serviceType').val('');
		$('#serviceTypeId').val('');
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
