(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function setButtonLoading(button, isLoading, loadingLabel) {
		if (!button) return;

		if (isLoading) {
			if (!button.dataset.originalHtml) {
				button.dataset.originalHtml = button.innerHTML;
			}
			button.classList.add('is-loading');
			button.disabled = true;
			button.setAttribute('aria-busy', 'true');
			button.innerHTML = '<span class="qlpk-button-spinner" aria-hidden="true"></span><span>' + (loadingLabel || 'Đang lưu...') + '</span>';
			return;
		}

		button.classList.remove('is-loading');
		button.disabled = false;
		button.removeAttribute('aria-busy');
		if (button.dataset.originalHtml) {
			button.innerHTML = button.dataset.originalHtml;
			delete button.dataset.originalHtml;
		}
	}

	function bindSaveInfoButton(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const saveInfoBtn = doc.getElementById(opts.buttonId || 'saveInfoBtn');
		if (!saveInfoBtn || saveInfoBtn._saveInfoBound) return;

		saveInfoBtn.addEventListener('click', function () {
			if (saveInfoBtn.disabled || typeof opts.savePatientData !== 'function') return;

			setButtonLoading(saveInfoBtn, true, opts.loadingLabel || 'Đang lưu...');
			Promise.resolve()
				.then(() => opts.savePatientData())
				.finally(() => {
					setButtonLoading(saveInfoBtn, false);
				});
		});
		saveInfoBtn._saveInfoBound = true;
	}

	window.ReceptionistFormSaveControls = {
		bindSaveInfoButton
	};
})(window);
