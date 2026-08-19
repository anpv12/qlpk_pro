// datepicker-init.js
// Initialize Flatpickr for all inputs with class 'js-datepicker'
// UI: display dd/MM/yyyy, value sent to server: YYYY-MM-DD (ISO)

/**
 * DRY Helper: Set value for datepicker using Flatpickr API
 * @param {string|HTMLElement} elementIdOrElement - Element ID or DOM element
 * @param {string|null} value - Date value in Y-m-d format (or null to clear)
 * @param {boolean} triggerChange - Whether to trigger change event (default: true)
 */
function setDatepickerValue(elementIdOrElement, value, triggerChange = true) {
	const input = typeof elementIdOrElement === 'string'
		? document.getElementById(elementIdOrElement)
		: elementIdOrElement;

	if (!input) {
		console.warn('setDatepickerValue: Element not found:', elementIdOrElement);
		return;
	}

	if (input._flatpickr) {
		// Use Flatpickr API to set date (handles formatting automatically)
		input._flatpickr.setDate(value || null, triggerChange);
	} else {
		// Fallback: set value directly if Flatpickr not initialized yet
		input.value = value || '';
	}
}

// Make globally available
window.setDatepickerValue = setDatepickerValue;

function isDatepickerDisabled(el) {
	return el.dataset.datepickerDisabled === 'true'
		|| el.dataset.datepicker === 'off'
		|| el.dataset.datepickerEnabled === 'false';
}

function readDatepickerBoolean(el, name, fallback) {
	if (!(name in el.dataset)) {
		return fallback;
	}
	return el.dataset[name] !== 'false';
}

// Function to initialize datepickers (can be called for dynamic elements)
function initDatepickers(selector) {
	if (typeof flatpickr === 'undefined') {
		console.error('Flatpickr library not loaded.');
		return;
	}

	const elements = typeof selector === 'string' ? document.querySelectorAll(selector) : [selector];

	elements.forEach(function (el) {
		if (!el || !(el instanceof HTMLElement)) {
			return;
		}

		if (isDatepickerDisabled(el)) {
			if (el._flatpickr) {
				el._flatpickr.destroy();
			}
			return;
		}

		// Skip if already initialized or if it's a flatpickr generated input
		if (el._flatpickr || el.classList.contains('flatpickr-input')) {
			return;
		}

		// Disable autocomplete to prevent browser from caching medical data
		el.setAttribute('autocomplete', 'off');

		// Read configuration from data attributes
		const dateFormat = el.dataset.dateFormat || 'Y-m-d';
		const altFormat = el.dataset.altFormat || 'd/m/Y';
		const enableTime = el.dataset.enableTime === 'true';
		const noCalendar = el.dataset.noCalendar === 'true';
		const minDate = el.dataset.minDate === 'today' ? 'today' : (el.dataset.minDate || null);
		const maxDate = el.dataset.maxDate === 'today' ? 'today' : (el.dataset.maxDate || null);
		const defaultDate = el.dataset.defaultDate === 'today' ? new Date() : (el.dataset.defaultDate || null);
		const useAltInput = readDatepickerBoolean(el, 'altInput', true);

		let disableDates = [];
		if (el.dataset.disable) {
			try {
				disableDates = JSON.parse(el.dataset.disable);
			} catch (e) {
				console.warn('Invalid data-disable format for datepicker:', el);
			}
		}

		// Store initial value from HTML attribute (not from browser autocomplete)
		// Use getAttribute to get only the value from HTML, not from browser cache
		const initialValue = el.getAttribute('value') || '';

		const fp = flatpickr(el, {
			dateFormat: dateFormat,
			altInput: useAltInput,
			altFormat: altFormat,
			allowInput: true,
			enableTime: enableTime,
			noCalendar: noCalendar,
			minDate: minDate,
			maxDate: maxDate,
			disable: disableDates,
			// Always append to body to avoid clipping by modal overflow:hidden
			// This ensures the calendar is fully visible even in modals
			appendTo: document.body,
			defaultDate: defaultDate,
			locale: {
				firstDayOfWeek: 1,      // Monday
				weekdays: {
					shorthand: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
					longhand: ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']
				},
				months: {
					shorthand: ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'],
					longhand: ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
				}
			},
			onOpen: function (selectedDates, dateStr, instance) {
				// Close all other flatpickr instances
				const allInstances = document.querySelectorAll('.flatpickr-input');
				allInstances.forEach(input => {
					if (input._flatpickr && input._flatpickr !== instance) {
						input._flatpickr.close();
					}
				});
			},
			onReady: function (selectedDates, dateStr, instance) {
				// Remove the selector class from the altInput to prevent re-initialization
				if (instance.altInput) {
					instance.altInput.classList.remove('js-datepicker');
					instance.altInput.classList.add('qlpk-datepicker-alt-input');
					if (instance.element.id) {
						instance.altInput.dataset.datepickerAltFor = instance.element.id;
					}

					// Forward input/change events from altInput to the original input
					// This ensures auto-save works when user types manually
					instance.altInput.addEventListener('input', function () {
						const inputEvent = new Event('input', { bubbles: true });
						instance.element.dispatchEvent(inputEvent);
					});
					instance.altInput.addEventListener('change', function () {
						const changeEvent = new Event('change', { bubbles: true });
						instance.element.dispatchEvent(changeEvent);
					});
				}

				// Parse initial value from HTML attribute (not autocomplete)
				// This ensures proper display format (d/m/Y) even when value comes from server
				if (initialValue && initialValue.trim() !== '') {
					// Parse the value using dateFormat (Y-m-d) and set it
					// setDate will automatically format it to altFormat (d/m/Y) for display
					instance.setDate(initialValue, false); // false = don't trigger onChange
				} else if (selectedDates.length === 0) {
					// Only clear if no date is selected (avoid clearing user-edited values)
					instance.clear();
				}
			},
			onChange: function (selectedDates, dateStr, instance) {
				// Trigger native 'change' and 'input' events on the original input
				// This ensures compatibility with existing event listeners (e.g., auto-save)
				const changeEvent = new Event('change', { bubbles: true });
				const inputEvent = new Event('input', { bubbles: true });
				instance.element.dispatchEvent(changeEvent);
				instance.element.dispatchEvent(inputEvent);
			},
			// Allow overriding position via data-position attribute (e.g. data-position="above")
			// If not specified, default to 'auto'
			position: el.dataset.position || 'auto'
		});
	});
}

// Initialize on page load
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function () {
		initDatepickers('.js-datepicker');
	});
} else {
	initDatepickers('.js-datepicker');
}

// Re-initialize when modals are shown (for Bootstrap modals)
document.addEventListener('shown.bs.modal', function (e) {
	initDatepickers('.js-datepicker');
});

// Make function globally available for manual initialization
window.initDatepickers = initDatepickers;

// FIX: Bootstrap Modal stealing focus from Flatpickr (appended to body)
// This override prevents Bootstrap from forcing focus back to the modal when clicking outside
document.addEventListener('DOMContentLoaded', function () {
	// Check if Bootstrap modal exists (works with both jQuery and vanilla Bootstrap)
	if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
		// Bootstrap 5 approach
		const originalShow = bootstrap.Modal.prototype.show;
		bootstrap.Modal.prototype.show = function () {
			this._config.focus = false;
			originalShow.call(this);
		};
	} else if (typeof jQuery !== 'undefined' && jQuery.fn.modal && jQuery.fn.modal.Constructor) {
		// Bootstrap 3/4 with jQuery approach
		jQuery.fn.modal.Constructor.prototype._enforceFocus = function () { };
		jQuery.fn.modal.Constructor.prototype.enforceFocus = function () { };
	}
});
