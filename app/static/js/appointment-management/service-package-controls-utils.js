(function (window) {
	'use strict';

	function formatPrice(price) {
		return new Intl.NumberFormat('vi-VN').format(price) + ' VNĐ';
	}

	function renderServiceLoadError($) {
		$('#addServiceDropdown, #editServiceDropdown')
			.html('<div class="autocomplete-no-results">Lỗi tải dữ liệu dịch vụ</div>')
			.addClass('show');
	}

	function renderServiceDropdown($, $dropdown, list) {
		if (!list || list.length === 0) {
			$dropdown.html('<div class="autocomplete-no-results">Không tìm thấy dịch vụ phù hợp</div>').addClass('show');
			return;
		}

		$dropdown.empty().addClass('show');
		list.forEach(service => {
			const $item = $('<div class="autocomplete-item">')
				.data('service', service);
			$item.append(
				$('<span class="autocomplete-item-name">').text(service.name || ''),
				$('<span class="autocomplete-item-price">').text(formatPrice(service.default_price || 0))
			);
			$dropdown.append($item);
		});
	}

	function initializeServiceAutocomplete(options) {
		const $ = options.$;
		const $input = $(`#${options.inputId}`);
		const $dropdown = $(`#${options.dropdownId}`);
		const $hidden = $(`#${options.hiddenId}`);
		const getServices = typeof options.getServices === 'function' ? options.getServices : () => [];
		const eventNamespace = `.serviceAutocomplete${options.inputId}`;

		function renderDropdown(list) {
			renderServiceDropdown($, $dropdown, list);
		}

		$dropdown.off(`click${eventNamespace}`, '.autocomplete-item').on(`click${eventNamespace}`, '.autocomplete-item', function () {
			const selected = $(this).data('service');
			$input.val(selected.name);
			$hidden.val(selected.id);
			$dropdown.removeClass('show');
			$input.trigger('serviceSelected', [selected]);
		});

		$input.off(`focus${eventNamespace}`).on(`focus${eventNamespace}`, function () {
			const query = $(this).val().toLowerCase().trim();
			if (!query) {
				renderDropdown(getServices());
			} else {
				$input.trigger('input');
			}
		});

		$input.off(`input${eventNamespace}`).on(`input${eventNamespace}`, function () {
			const query = $(this).val().toLowerCase().trim();
			if (!query) {
				$hidden.val('');
				renderDropdown(getServices());
				return;
			}

			const filtered = getServices().filter(service =>
				service.name.toLowerCase().includes(query) ||
				(service.code && service.code.toLowerCase().includes(query))
			);

			if (filtered.length === 0) {
				$hidden.val('');
			}
			renderDropdown(filtered);
		});

		$(document).off(`click${eventNamespace}`).on(`click${eventNamespace}`, function (event) {
			if (!$(event.target).closest(`#${options.inputId}, #${options.dropdownId}`).length) {
				$dropdown.removeClass('show');
			}
		});

		$input.off(`keydown${eventNamespace}`).on(`keydown${eventNamespace}`, function (event) {
			const $items = $dropdown.find('.autocomplete-item');
			const $active = $items.filter('.active');

			if (event.key === 'ArrowDown') {
				event.preventDefault();
				if ($active.length === 0) {
					$items.first().addClass('active');
				} else {
					$active.removeClass('active').next('.autocomplete-item').addClass('active');
				}
			} else if (event.key === 'ArrowUp') {
				event.preventDefault();
				if ($active.length > 0) {
					$active.removeClass('active').prev('.autocomplete-item').addClass('active');
				}
			} else if (event.key === 'Enter') {
				event.preventDefault();
				if ($active.length > 0) {
					$active.click();
				}
			} else if (event.key === 'Escape') {
				$dropdown.removeClass('show');
			}
		});
	}

	function updatePriceDisplay(options) {
		return options;
	}

	function updateEditPriceDisplay(options) {
		return options;
	}

	function populatePackageSelects($, packages) {
		const packageSelect = $('#addPackage');
		const editPackageSelect = $('#editPackage');

		packageSelect.empty();
		editPackageSelect.empty();
		packageSelect.append($('<option>').val('').text('Chọn gói'));
		editPackageSelect.append($('<option>').val('').text('Chọn gói'));

		if (packages && packages.length > 0) {
			packages.forEach(pkg => {
				const optionText = `${pkg.name || ''} - ${formatPrice(pkg.price || 0)}`;
				const $option = $('<option>')
					.val(pkg.id)
					.attr('data-duration', pkg.duration_minutes)
					.attr('data-price', pkg.price)
					.text(optionText);
				packageSelect.append($option.clone());
				editPackageSelect.append($option);
			});
		} else {
			packageSelect.append($('<option>').val('').prop('disabled', true).text('Chưa có gói nào. Vui lòng thêm từ quản trị!'));
			editPackageSelect.append($('<option>').val('').prop('disabled', true).text('Chưa có gói nào. Vui lòng thêm từ quản trị!'));
		}
	}

	function renderPackageSelectError($) {
		const packageSelect = $('#addPackage');
		const editPackageSelect = $('#editPackage');
		packageSelect.empty().append('<option value="" disabled>Lỗi tải dữ liệu gói</option>');
		editPackageSelect.empty().append('<option value="" disabled>Lỗi tải dữ liệu gói</option>');
	}

	window.AppointmentManagementServicePackageControlsUtils = {
		formatPrice,
		initializeServiceAutocomplete,
		populatePackageSelects,
		renderPackageSelectError,
		renderServiceDropdown,
		renderServiceLoadError,
		updateEditPriceDisplay,
		updatePriceDisplay
	};
})(window);
