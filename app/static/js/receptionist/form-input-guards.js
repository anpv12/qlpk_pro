(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function sanitizeAgeValue(value, maxDigits) {
		const limit = maxDigits || 3;
		return String(value == null ? '' : value).replace(/[^0-9]/g, '').slice(0, limit);
	}

	function bindAgeInputGuard(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const fieldId = opts.fieldId || 'age';
		const ageInput = doc.getElementById(fieldId);
		if (!ageInput || ageInput._bound) return;

		ageInput.addEventListener('input', function () {
			this.value = sanitizeAgeValue(this.value, opts.maxDigits);
		});
		ageInput._bound = true;
	}

	window.ReceptionistFormInputGuards = {
		sanitizeAgeValue,
		bindAgeInputGuard
	};
})(window);
