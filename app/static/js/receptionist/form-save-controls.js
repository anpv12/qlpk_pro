(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	// A button's own content while it shows the loading state.
	const originalButtonContent = new WeakMap();

	function setButtonLoading(button, isLoading, loadingLabel) {
		if (!button) return;

		if (isLoading) {
			if (!originalButtonContent.has(button)) {
				originalButtonContent.set(button, [...button.childNodes]);
			}
			button.classList.add('is-loading');
			button.disabled = true;
			button.setAttribute('aria-busy', 'true');
			const spinner = document.createElement('span');
			spinner.className = 'qlpk-button-spinner';
			spinner.setAttribute('aria-hidden', 'true');
			const label = document.createElement('span');
			label.textContent = loadingLabel || 'Đang lưu...';
			button.replaceChildren(spinner, label);
			return;
		}

		button.classList.remove('is-loading');
		button.disabled = false;
		button.removeAttribute('aria-busy');
		if (originalButtonContent.has(button)) {
			button.replaceChildren(...originalButtonContent.get(button));
			originalButtonContent.delete(button);
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
