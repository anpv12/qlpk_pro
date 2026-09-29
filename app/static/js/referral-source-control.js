(function (window) {
	'use strict';

	const STANDARD_SOURCES = [
		'Facebook',
		'Website',
		'Người quen giới thiệu',
		'Medpro',
		'Khách vãng lai'
	];
	const OTHER_VALUE = 'Khác';

	function getDocument(options) {
		return (options && options.document) || window.document;
	}

	function normalize(value) {
		return String(value || '').trim();
	}

	function getElements(options) {
		const doc = getDocument(options);
		return {
			input: doc.getElementById('referralSource'),
			buttons: Array.from(doc.querySelectorAll('[data-referral-source-option]'))
		};
	}

	function isStandardSource(value) {
		return STANDARD_SOURCES.includes(value);
	}

	function setButtonActive(button, isActive) {
		button.classList.toggle('is-active', isActive);
		button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
	}

	function syncButtons(selectedSource, options) {
		const { buttons } = getElements(options);
		buttons.forEach((button) => {
			setButtonActive(button, button.dataset.referralSourceOption === selectedSource);
		});
	}

	function emitChange(input) {
		if (!input || typeof input.dispatchEvent !== 'function') return;
		const EventCtor = window.Event;
		if (typeof EventCtor === 'function') {
			input.dispatchEvent(new EventCtor('change', { bubbles: true }));
		}
	}

	function setInputMode(input, selectedSource, value) {
		if (!input) return false;
		const isOther = selectedSource === OTHER_VALUE;
		input.value = value || '';
		input.disabled = !isOther;
		input.dataset.referralSourceMode = selectedSource || '';
		return true;
	}

	function getValue(options) {
		const { input } = getElements(options);
		return normalize(input && input.value);
	}

	function setValue(value, options) {
		const { input } = getElements(options);
		if (!input) return false;

		const normalized = normalize(value);
		if (!normalized) {
			setInputMode(input, '', '');
			syncButtons('', options);
			return true;
		}

		const selectedSource = isStandardSource(normalized) ? normalized : OTHER_VALUE;
		setInputMode(input, selectedSource, normalized);
		syncButtons(selectedSource, options);
		return true;
	}

	function chooseSource(source, options) {
		const { input } = getElements(options);
		if (!input) return false;

		if (source === OTHER_VALUE) {
			const currentValue = normalize(input.value);
			const shouldClear = isStandardSource(currentValue) || input.dataset.referralSourceMode !== OTHER_VALUE;
			setInputMode(input, OTHER_VALUE, shouldClear ? '' : currentValue);
			syncButtons(OTHER_VALUE, options);
			if (typeof input.focus === 'function') {
				input.focus();
			}
			return true;
		}

		if (isStandardSource(source)) {
			setInputMode(input, source, source);
			syncButtons(source, options);
			emitChange(input);
			return true;
		}

		return false;
	}

	function syncVisibility(options) {
		const value = getValue(options);
		const customSource = value ? OTHER_VALUE : '';
		const selectedSource = isStandardSource(value) ? value : customSource;
		const { input } = getElements(options);
		if (input) {
			input.disabled = selectedSource !== OTHER_VALUE;
			input.dataset.referralSourceMode = selectedSource;
		}
		syncButtons(selectedSource, options);
	}

	function bind(options) {
		const { buttons } = getElements(options);
		buttons.forEach((button) => {
			if (button.dataset.referralSourceBound) return;
			button.addEventListener('click', function () {
				chooseSource(button.dataset.referralSourceOption, options);
			});
			button.dataset.referralSourceBound = '1';
		});
		syncVisibility(options);
	}

	window.ReferralSourceControl = {
		OTHER_VALUE,
		STANDARD_SOURCES,
		bind,
		chooseSource,
		getValue,
		setValue,
		syncVisibility
	};
})(window);
