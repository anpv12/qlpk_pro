(function (window) {
	'use strict';

	function getJQuery(options) {
		return options && options.$ ? options.$ : window.jQuery;
	}

	function getSetTimeout(options) {
		return options && options.setTimeout ? options.setTimeout : window.setTimeout.bind(window);
	}

	function getFields($) {
		return {
			appointmentDateEl: $('#appointmentDate'),
			appointmentTimeEl: $('#appointmentTime')
		};
	}

	function addWarningLabels(appointmentDateEl, appointmentTimeEl) {
		const fieldSelector = '.receptionist-field, .form-group, .mb-3, .col-md-6, .col-12';
		const dateLabel = appointmentDateEl.closest(fieldSelector).find('label').first();
		const timeLabel = appointmentTimeEl.closest(fieldSelector).find('label').first();

		if (dateLabel.length && !dateLabel.find('.error-warning-text').length) {
			dateLabel.append('<span class="error-warning-text">Cần thay đổi</span>');
		}
		if (timeLabel.length && !timeLabel.find('.error-warning-text').length) {
			timeLabel.append('<span class="error-warning-text">Cần thay đổi</span>');
		}
	}

	function highlight(options) {
		const opts = options || {};
		const $ = getJQuery(opts);
		const schedule = getSetTimeout(opts);
		if (!$) return;

		const { appointmentDateEl, appointmentTimeEl } = getFields($);
		appointmentDateEl.addClass('appointment-error-highlight');
		appointmentTimeEl.addClass('appointment-error-highlight');
		addWarningLabels(appointmentDateEl, appointmentTimeEl);

		if (appointmentDateEl[0] && typeof appointmentDateEl[0].scrollIntoView === 'function') {
			appointmentDateEl[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		schedule(() => {
			appointmentDateEl.focus();
			appointmentDateEl.addClass('shake-on-focus');
		}, 300);
	}

	function remove(options) {
		const $ = getJQuery(options || {});
		if (!$) return;

		const { appointmentDateEl, appointmentTimeEl } = getFields($);
		appointmentDateEl.removeClass('appointment-error-highlight shake-on-focus');
		appointmentTimeEl.removeClass('appointment-error-highlight shake-on-focus');

		const fieldSelector = '.receptionist-field, .form-group, .mb-3, .col-md-6, .col-12';
		appointmentDateEl.closest(fieldSelector).find('label .error-warning-text').remove();
		appointmentTimeEl.closest(fieldSelector).find('label .error-warning-text').remove();
	}

	function bindChangeListeners(options) {
		const opts = options || {};
		const $ = getJQuery(opts);
		if (!$) return;

		$('#appointmentDate, #appointmentTime').off('change.appointment-error').on('change.appointment-error', function () {
			remove(opts);
		});

		$('#appointmentDate, #appointmentTime').off('focus.appointment-error').on('focus.appointment-error', function () {
			const $this = $(this);
			$this.off('input.appointment-error').on('input.appointment-error', function () {
				remove(opts);
			});
		});
	}

	window.ReceptionistAppointmentDateHighlight = {
		highlight,
		remove,
		bindChangeListeners
	};
})(window);
