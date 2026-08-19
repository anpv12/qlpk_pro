(function (window) {
	'use strict';

	function calculateAgeFromDate(dateString) {
		const date = new Date(dateString);
		if (Number.isNaN(date.getTime())) return null;
		const today = new Date();
		let age = today.getFullYear() - date.getFullYear();
		const monthDelta = today.getMonth() - date.getMonth();
		if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < date.getDate())) {
			age -= 1;
		}
		return age >= 0 ? age : null;
	}

	function autoResizeTextarea(textarea, context = {}) {
		if (!textarea) return;
		const win = context.window || window;
		textarea.style.height = 'auto';
		if (textarea.value.trim()) {
			textarea.style.height = `${textarea.scrollHeight}px`;
			return;
		}

		const computedStyle = win.getComputedStyle(textarea);
		const lineHeight = parseFloat(computedStyle.lineHeight) || 21;
		const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
		const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;
		const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
		const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;
		const rows1Height = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
		textarea.style.height = `${rows1Height}px`;
	}

	function setTextareaValue(textareaId, value, context = {}) {
		const doc = context.document || document;
		const jquery = context.$ || window.$;
		const textarea = doc.getElementById(textareaId);
		if (!textarea) return;

		if (typeof jquery !== 'undefined') {
			jquery(textarea).val(value);
		} else {
			textarea.value = value || '';
		}

		setTimeout(() => {
			autoResizeTextarea(textarea, context);
		}, 50);
	}

	function setupAutoResizeForTextarea(textarea, context = {}) {
		if (!textarea || textarea.dataset.autoResizeSetup) return false;
		const resize = typeof context.autoResizeTextarea === 'function'
			? context.autoResizeTextarea
			: item => autoResizeTextarea(item, context);
		textarea.dataset.autoResizeSetup = 'true';

		textarea.addEventListener('input', function () {
			resize(this);
		});

		setTimeout(() => {
			resize(textarea);
		}, 100);
		return true;
	}

	function bindAutoResizeTextareas(context = {}) {
		const doc = context.document || document;
		const selector = context.selector || '.auto-resize-textarea';
		const setup = typeof context.setupAutoResizeForTextarea === 'function'
			? context.setupAutoResizeForTextarea
			: textarea => setupAutoResizeForTextarea(textarea, context);

		doc.querySelectorAll(selector).forEach(setup);

		const Observer = context.MutationObserver || window.MutationObserver;
		if (!Observer || !doc.body) return null;

		const observer = new Observer(function (mutations) {
			mutations.forEach(function (mutation) {
				mutation.addedNodes.forEach(function (node) {
					if (node.nodeType !== 1) return;
					if (node.matches && node.matches(selector)) {
						setup(node);
					}
					if (node.querySelectorAll) {
						node.querySelectorAll(selector).forEach(setup);
					}
				});
			});
		});
		observer.observe(doc.body, { childList: true, subtree: true });
		return observer;
	}

	function findTextareaFromButton(btn) {
		return btn?.closest('td')?.querySelector('textarea') || null;
	}

	function moveTextareaUp(btn) {
		const textarea = findTextareaFromButton(btn);
		if (!textarea) return;
		const lines = textarea.value.split('\n');
		if (lines.length > 1) {
			const firstLine = lines.shift();
			lines.push(firstLine);
			textarea.value = lines.join('\n');
		}
	}

	function moveTextareaDown(btn) {
		const textarea = findTextareaFromButton(btn);
		if (!textarea) return;
		const lines = textarea.value.split('\n');
		if (lines.length > 1) {
			const lastLine = lines.pop();
			lines.unshift(lastLine);
			textarea.value = lines.join('\n');
		}
	}

	function clearTextarea(btn, context = {}) {
		const textarea = findTextareaFromButton(btn);
		if (!textarea) return;
		const confirmFn = context.confirm || window.confirm;
		if (confirmFn('Xóa nội dung ghi chú?')) {
			textarea.value = '';
		}
	}

	function createTextareaAdapter(context = {}) {
		return {
			calculateAgeFromDate,
			autoResizeTextarea(textarea) {
				return autoResizeTextarea(textarea, context);
			},
			setTextareaValue(textareaId, value) {
				return setTextareaValue(textareaId, value, context);
			},
			setupAutoResizeForTextarea(textarea) {
				return setupAutoResizeForTextarea(textarea, context);
			},
			bindAutoResizeTextareas(options = {}) {
				return bindAutoResizeTextareas({
					...context,
					...options,
					setupAutoResizeForTextarea: textarea => setupAutoResizeForTextarea(textarea, context)
				});
			},
			moveTextareaUp,
			moveTextareaDown,
			clearTextarea(btn) {
				return clearTextarea(btn, context);
			}
		};
	}

	const api = {
		calculateAgeFromDate,
		autoResizeTextarea,
		setTextareaValue,
		setupAutoResizeForTextarea,
		bindAutoResizeTextareas,
		moveTextareaUp,
		moveTextareaDown,
		clearTextarea,
		createTextareaAdapter
	};

	window.ClinicalTextareaUiUtils = api;
	window.DoctorExaminationTextareaUtils = api;
})(window);
