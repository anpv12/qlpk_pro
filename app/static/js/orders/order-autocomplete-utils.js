import { el } from '../shared/dom.js';

(function () {
	'use strict';

	function sharedNormalizeSearchText(value) {
		const helper = typeof window !== 'undefined' ? window.QLPKSearchNormalization : null;
		return helper?.normalizeSearchText
			? helper.normalizeSearchText(value)
			: String(value || '').toLowerCase().trim();
	}

	function normalizeQuery(query) {
		return sharedNormalizeSearchText(query);
	}

	function normalizeVietnameseQuery(query) {
		return sharedNormalizeSearchText(query);
	}

	function toSurveyMatch(template) {
		return {
			id: template.id,
			name: template.name,
			isSurvey: true,
			surveyTemplateId: template.id,
			description: template.description,
			question_count: template.question_count,
			service_name: template.service_name,
			pricing_type: template.pricing_type,
			price_per_minute: template.price_per_minute
		};
	}

	function buildSurveyMatches(surveyTemplates = [], queryLower = '', normalize = normalizeQuery) {
		return (surveyTemplates || [])
			.filter(template => {
				const nameLower = normalize(template.name);
				return !queryLower || nameLower.includes(queryLower);
			})
			.map(toSurveyMatch);
	}

	function buildOrderAutocompleteMatches(options = {}) {
		const normalize = options.normalizeSearch ? normalizeVietnameseQuery : normalizeQuery;
		const queryLower = normalize(options.query);
		const surveyMatches = buildSurveyMatches(options.surveyTemplates, queryLower, normalize);
		const maxResults = Number.isFinite(options.maxResults) ? options.maxResults : 10;
		return surveyMatches.slice(0, maxResults);
	}

	function buildOrderAutocompleteItems(matches = [], options = {}) {
		const formatCurrency = options.formatCurrency || ((value) => value);
		const selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : -1;

		return (matches || []).map((item, index) => {
			const pricingInfo = item.pricing_type === 'time_based'
				? `${formatCurrency(item.price_per_minute || 0)}/phút`
				: (item.service_name || 'Chưa liên kết dịch vụ');
			return el('div', {
				class: `autocomplete-item survey-item${index === selectedIndex ? ' active' : ''}`,
				'data-survey-id': String(item.surveyTemplateId),
				'data-index': String(index),
				role: 'option',
				'aria-selected': String(index === selectedIndex)
			},
			el('div', { class: 'd-flex align-items-center gap-2' },
				el('i', { class: 'bi bi-clipboard-pulse order-autocomplete-survey-icon' }),
				el('span', { class: 'fw-semibold order-autocomplete-survey-name' }, item.name || ''),
				el('span', { class: 'badge order-autocomplete-survey-badge' }, `${item.question_count || 0} câu hỏi`)),
			options.showSurveyDescription !== false && item.description
				? el('div', { class: 'text-muted small order-autocomplete-survey-description' }, item.description) : null,
			options.showSurveyPricing
				? el('div', { class: 'text-muted small order-autocomplete-pricing' }, el('i', { class: 'bi bi-currency-dollar' }), ` ${pricingInfo}`) : null);
		});
	}

	function setAutocompleteDropdownVisible(dropdown, visible) {
		if (!dropdown) return;
		dropdown.classList.toggle('is-open', Boolean(visible));
		dropdown.setAttribute('aria-hidden', String(!visible));
		const inputId = dropdown.dataset.autocompleteInputId;
		const input = inputId ? dropdown.ownerDocument?.getElementById(inputId) : null;
		if (input) input.setAttribute('aria-expanded', String(Boolean(visible)));
	}

	function setActiveAutocompleteItem(dropdown, selectedIndex) {
		if (!dropdown) return;
		const items = dropdown.querySelectorAll('.autocomplete-item');
		items.forEach(el => {
			el.classList.remove('active');
			el.setAttribute('aria-selected', 'false');
		});
		if (selectedIndex >= 0 && items[selectedIndex]) {
			items[selectedIndex].classList.add('active');
			items[selectedIndex].setAttribute('aria-selected', 'true');
			items[selectedIndex].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	}

	function bindAutocompleteItemHover(dropdown, onSelectedIndexChange) {
		if (!dropdown) return;
		dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
			item.addEventListener('mouseenter', function () {
				const nextIndex = Number(this.getAttribute('data-index'));
				setActiveAutocompleteItem(dropdown, nextIndex);
				if (typeof onSelectedIndexChange === 'function') {
					onSelectedIndexChange(nextIndex);
				}
			});
		});
	}

	function bindAutocompleteItemSelection(dropdown, options = {}) {
		if (!dropdown) return;
		dropdown.querySelectorAll('.autocomplete-item').forEach(item => {
			item.addEventListener('click', function () {
				const surveyId = Number(this.getAttribute('data-survey-id'));
				if (typeof options.onSurveySelect === 'function') {
					options.onSurveySelect(surveyId, this);
				}
			});
		});
	}

	function renderAutocompleteDropdown(dropdown, matches = [], options = {}) {
		if (!dropdown) return false;
		if (!matches || matches.length === 0) {
			dropdown.classList.toggle('is-empty', Boolean(options.emptyText));
			if (options.emptyText) {
				dropdown.replaceChildren(el('div', { class: 'autocomplete-empty', role: 'status' }, options.emptyText));
				setAutocompleteDropdownVisible(dropdown, true);
				return false;
			}
			setAutocompleteDropdownVisible(dropdown, false);
			return false;
		}

		dropdown.classList.remove('is-empty');
		dropdown.replaceChildren(...buildOrderAutocompleteItems(matches, {
			selectedIndex: options.selectedIndex,
			formatCurrency: options.formatCurrency,
			showSurveyPricing: options.showSurveyPricing,
			showSurveyDescription: options.showSurveyDescription
		}));
		setAutocompleteDropdownVisible(dropdown, options.displayValue !== 'none');

		bindAutocompleteItemHover(dropdown, options.onSelectedIndexChange);
		bindAutocompleteItemSelection(dropdown, {
			onSurveySelect: options.onSurveySelect
		});

		return true;
	}

	function applyOrderAutocompleteAria(nameInput, dropdown) {
		nameInput.setAttribute('role', 'combobox');
		nameInput.setAttribute('aria-autocomplete', 'list');
		nameInput.setAttribute('aria-expanded', 'false');
		if (dropdown.id) nameInput.setAttribute('aria-controls', dropdown.id);
		if (nameInput.id) dropdown.dataset.autocompleteInputId = nameInput.id;
		dropdown.setAttribute('role', 'listbox');
		dropdown.setAttribute('aria-hidden', 'true');
	}

	function setupOrderFormAutocomplete(options = {}) {
		const doc = options.document || document;
		const nameInput = options.nameInput || doc.getElementById(options.nameInputId || 'orderFormNewName');
		const dropdown = options.dropdown || doc.getElementById(options.dropdownId || 'orderFormNewNameDropdown');
		const pathHint = options.pathHint || doc.getElementById(options.pathHintId || 'orderFormNewPathHint');

		if (!nameInput || !dropdown) return null;
		applyOrderAutocompleteAria(nameInput, dropdown);

		let selectedIndex = -1;
		const setSelectedIndex = (nextIndex) => {
			selectedIndex = nextIndex;
			return selectedIndex;
		};
		const hide = (hideOptions = {}) => setSelectedIndex(hideAutocompleteDropdown(dropdown, hideOptions));

		const searchOrders = (query) => buildOrderAutocompleteMatches({
			query,
			surveyTemplates: typeof options.getSurveyTemplates === 'function' ? options.getSurveyTemplates() : options.surveyTemplates,
			normalizeSearch: Boolean(options.normalizeSearch),
			maxResults: options.maxResults
		});

		const getCallbackContext = (item) => ({
			item,
			nameInput,
			dropdown,
			pathHint,
			hide,
			setSelectedIndex,
			getSelectedIndex: () => selectedIndex
		});

		const renderDropdown = (matches) => renderAutocompleteDropdown(dropdown, matches, {
			selectedIndex,
			formatCurrency: options.formatCurrency,
			showSurveyPricing: options.showSurveyPricing,
			showSurveyDescription: options.showSurveyDescription,
			emptyText: options.emptyText,
			onSelectedIndexChange: setSelectedIndex,
				onSurveySelect: (surveyId, item) => {
					if (typeof options.onSurveySelect === 'function') {
						options.onSurveySelect(surveyId, getCallbackContext(item));
					}
				}
		});

		const performSearch = createAutocompleteSearchRunner({
			search: searchOrders,
			render: renderDropdown,
			hide: () => hide({ pathHint })
		});

		const cleanupInputHandlers = bindAutocompleteInputHandlers({
			input: nameInput,
			dropdown,
			performSearch,
			getSelectedIndex: () => selectedIndex,
			onSelectedIndexChange: setSelectedIndex,
			onInput: options.onInput,
			isEnabled: options.isEnabled,
			hide: () => hide({ pathHint }),
			selectFirstOnEnter: Boolean(options.selectFirstOnEnter)
		});

		const cleanupDismissHandlers = bindAutocompleteDismissHandlers({
			document: doc,
			input: nameInput,
			dropdown,
			onSelectedIndexChange: setSelectedIndex
		});

		return {
			nameInput,
			dropdown,
			pathHint,
			searchOrders,
			renderDropdown,
			performSearch,
			hide,
			cleanup: () => {
				if (typeof cleanupInputHandlers === 'function') cleanupInputHandlers();
				if (typeof cleanupDismissHandlers === 'function') cleanupDismissHandlers();
			}
		};
	}

	function hideAutocompleteDropdown(dropdown, options = {}) {
		if (dropdown) dropdown.classList.remove('is-empty');
		setAutocompleteDropdownVisible(dropdown, false);
		if (options.pathHint) {
			options.pathHint.textContent = options.emptyText || 'Chưa chọn chỉ định nào.';
		}
		return -1;
	}

	function createAutocompleteSearchRunner(options = {}) {
		let debounceTimer = null;
		const delay = Number.isFinite(options.debounceDelay) ? options.debounceDelay : 200;
		const setTimer = options.setTimeout || (typeof setTimeout !== 'undefined' ? setTimeout : null);
		const clearTimer = options.clearTimeout || (typeof clearTimeout !== 'undefined' ? clearTimeout : null);

		return function runAutocompleteSearch(query, searchOptions = {}) {
			if (debounceTimer && clearTimer) clearTimer(debounceTimer);

			const isEmpty = !query || String(query).trim() === '';
			if (isEmpty) {
				if (searchOptions.showAllIfEmpty) {
					let matches = [];
					if (typeof options.getEmptyMatches === 'function') matches = options.getEmptyMatches(query, searchOptions);
					else if (typeof options.search === 'function') matches = options.search('', searchOptions);
					if (typeof options.render === 'function') options.render(matches || []);
				} else if (typeof options.hide === 'function') {
					options.hide();
				}
				return;
			}

			const executeSearch = () => {
				const matches = typeof options.search === 'function' ? options.search(query, searchOptions) : [];
				if (typeof options.render === 'function') options.render(matches || []);
			};

			if (setTimer) {
				debounceTimer = setTimer(executeSearch, delay);
			} else {
				executeSearch();
			}
		};
	}

	function bindAutocompleteInputHandlers(options = {}) {
		const input = options.input || options.nameInput;
		const dropdown = options.dropdown;
		const performSearch = options.performSearch || options.search;
		if (!input || !dropdown || typeof performSearch !== 'function') return null;

		const setSelectedIndex = typeof options.onSelectedIndexChange === 'function'
			? options.onSelectedIndexChange
			: null;
		const getSelectedIndex = typeof options.getSelectedIndex === 'function'
			? options.getSelectedIndex
			: () => -1;
		const isEnabled = typeof options.isEnabled === 'function'
			? options.isEnabled
			: () => true;
		const ensureEnabled = () => {
			if (isEnabled()) return true;
			if (typeof options.hide === 'function') options.hide();
			return false;
		};

		const inputHandler = function () {
			if (!ensureEnabled()) return;
			if (setSelectedIndex) setSelectedIndex(-1);
			if (typeof options.onInput === 'function') options.onInput(this.value, this);
			const isEmpty = !this.value || this.value.trim() === '';
			performSearch(this.value, { showAllIfEmpty: isEmpty });
		};

		const focusHandler = function () {
			if (!ensureEnabled()) return;
			performSearch(this.value, { showAllIfEmpty: true });
		};

		const keydownHandler = function (event) {
			if (!ensureEnabled()) return;
			const nextIndex = handleAutocompleteKeydown(event, dropdown, getSelectedIndex(), {
				selectFirstOnEnter: Boolean(options.selectFirstOnEnter)
			});
			if (setSelectedIndex) setSelectedIndex(nextIndex);
		};

		input.addEventListener('input', inputHandler);
		input.addEventListener('focus', focusHandler);
		input.addEventListener('keydown', keydownHandler);

		return function cleanupAutocompleteInputHandlers() {
			input.removeEventListener('input', inputHandler);
			input.removeEventListener('focus', focusHandler);
			input.removeEventListener('keydown', keydownHandler);
		};
	}

	function bindAutocompleteDismissHandlers(options = {}) {
		const doc = options.document || document;
		const input = options.input || options.nameInput;
		const dropdown = options.dropdown;
		if (!doc || !input || !dropdown) return null;

		const setSelectedIndex = typeof options.onSelectedIndexChange === 'function'
			? options.onSelectedIndexChange
			: null;
		const hideOptions = options.hideOptions || {};
		const blurDelay = Number.isFinite(options.blurDelay) ? options.blurDelay : 200;

		const hideAndResetIndex = () => {
			const nextIndex = hideAutocompleteDropdown(dropdown, hideOptions);
			if (setSelectedIndex) setSelectedIndex(nextIndex);
		};

		const outsideClickHandler = function (event) {
			if (!input.contains(event.target) && !dropdown.contains(event.target)) {
				hideAndResetIndex();
			}
		};

		doc.addEventListener('click', outsideClickHandler);
		input.addEventListener('blur', function () {
			setTimeout(() => {
				if (!dropdown.contains(doc.activeElement)) {
					hideAndResetIndex();
				}
			}, blurDelay);
		});

		return function cleanupAutocompleteDismissHandlers() {
			doc.removeEventListener('click', outsideClickHandler);
		};
	}

	function focusAutocompleteInput(input, options = {}) {
		if (!input) return;

		if (options.scroll !== false && typeof input.scrollIntoView === 'function') {
			input.scrollIntoView(options.scrollOptions || { behavior: 'smooth', block: 'nearest' });
		}

		if (typeof input.focus === 'function') input.focus();

		const delay = Number.isFinite(options.delay) ? options.delay : 150;
		const dispatchEvents = () => {
			const view = input.ownerDocument && input.ownerDocument.defaultView;
			const EventCtor = options.Event || (view && view.Event) || (typeof Event !== 'undefined' ? Event : null);
			if (!EventCtor || typeof input.dispatchEvent !== 'function') return;

			input.dispatchEvent(new EventCtor('focus', { bubbles: true }));
			if (options.triggerInput !== false && input.value) {
				input.dispatchEvent(new EventCtor('input', { bubbles: true }));
			}
		};

		setTimeout(dispatchEvents, delay);
	}

	function handleAutocompleteKeydown(event, dropdown, selectedIndex = -1, options = {}) {
		if (!event || !dropdown) return selectedIndex;
		if (event.key === 'Escape') {
			setAutocompleteDropdownVisible(dropdown, false);
			return -1;
		}
		const items = dropdown.querySelectorAll('.autocomplete-item');
		if (items.length === 0) return selectedIndex;

		if (event.key === 'ArrowDown') {
			event.preventDefault();
			const nextIndex = Math.min(selectedIndex + 1, items.length - 1);
			setActiveAutocompleteItem(dropdown, nextIndex);
			return nextIndex;
		}

		if (event.key === 'ArrowUp') {
			event.preventDefault();
			const nextIndex = Math.max(selectedIndex - 1, -1);
			setActiveAutocompleteItem(dropdown, nextIndex);
			return nextIndex;
		}

		if (event.key === 'Enter' && dropdown.classList.contains('is-open')) {
			if (selectedIndex < 0 && !options.selectFirstOnEnter) return selectedIndex;
			event.preventDefault();
			const nextIndex = selectedIndex >= 0 ? selectedIndex : 0;
			const selectedItem = items[nextIndex];
			if (selectedItem) selectedItem.click();
			return nextIndex;
		}

		return selectedIndex;
	}

	const api = {
		buildOrderAutocompleteMatches,
		buildOrderAutocompleteItems,
		renderAutocompleteDropdown,
		setupOrderFormAutocomplete,
		setActiveAutocompleteItem,
		setAutocompleteDropdownVisible,
		bindAutocompleteItemHover,
		bindAutocompleteItemSelection,
		hideAutocompleteDropdown,
		createAutocompleteSearchRunner,
		bindAutocompleteInputHandlers,
		bindAutocompleteDismissHandlers,
		focusAutocompleteInput,
		handleAutocompleteKeydown
	};

	window.ClinicalOrderAutocompleteUtils = api;
})();
