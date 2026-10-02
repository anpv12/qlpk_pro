(function (window) {
	'use strict';

	const FIELD_SELECTOR = '.receptionist-field, .form-group, .mb-3, .col-md-6, .col-12';
	const FIELD_IDS = ['appointmentDate', 'appointmentTime'];
	let changeBinding = null;

	function getSetTimeout(options) {
		return options && options.setTimeout ? options.setTimeout : window.setTimeout.bind(window);
	}

	function getFields() {
		return FIELD_IDS.map(id => window.document.getElementById(id)).filter(Boolean);
	}

	function addWarningLabel(field) {
		const label = field.closest(FIELD_SELECTOR)?.querySelector('label');
		if (!label || label.querySelector('.error-warning-text')) return;
		const warning = window.document.createElement('span');
		warning.className = 'error-warning-text';
		warning.textContent = 'Cần thay đổi';
		label.append(warning);
	}

	function highlight(options) {
		const schedule = getSetTimeout(options || {});
		const fields = getFields();
		fields.forEach(field => {
			field.classList.add('appointment-error-highlight');
			addWarningLabel(field);
		});

		const dateEl = window.document.getElementById('appointmentDate');
		if (dateEl && typeof dateEl.scrollIntoView === 'function') {
			dateEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
		schedule(() => {
			if (!dateEl) return;
			dateEl.focus();
			dateEl.classList.add('shake-on-focus');
		}, 300);
	}

	function remove() {
		getFields().forEach(field => {
			field.classList.remove('appointment-error-highlight', 'shake-on-focus');
			field.closest(FIELD_SELECTOR)?.querySelectorAll('label .error-warning-text').forEach(node => node.remove());
		});
	}

	function bindChangeListeners() {
		changeBinding?.abort();
		changeBinding = new AbortController();
		const { signal } = changeBinding;
		getFields().forEach(field => {
			field.addEventListener('change', remove, { signal });
			field.addEventListener('focus', () => field.addEventListener('input', remove, { signal, once: false }), { signal, once: true });
		});
	}

	window.ReceptionistAppointmentDateHighlight = {
		highlight,
		remove,
		bindChangeListeners
	};
})(window);
