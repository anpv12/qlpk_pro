(function () {
	'use strict';

	function normalizeQuery(query) {
		return String(query || '').toLowerCase().trim();
	}

	function normalizeVietnameseQuery(query) {
		return normalizeQuery(query)
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd');
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

	function sortOrderMatches(a, b, queryLower = '', normalize = normalizeQuery) {
		const aName = normalize(a.name);
		const bName = normalize(b.name);
		if (queryLower) {
			const aStarts = aName.startsWith(queryLower);
			const bStarts = bName.startsWith(queryLower);
			if (aStarts && !bStarts) return -1;
			if (!aStarts && bStarts) return 1;
		}
		return aName.localeCompare(bName);
	}

	function buildSurveyMatches(surveyTemplates = [], queryLower = '', normalize = normalizeQuery) {
		return (surveyTemplates || [])
			.filter(template => {
				const nameLower = normalize(template.name);
				return !queryLower || nameLower.includes(queryLower);
			})
			.map(toSurveyMatch);
	}

	function buildOrderMatches(orderIndex, queryLower = '', options = {}) {
		const matches = [];
		if (!orderIndex) return matches;
		const normalize = options.normalize || normalizeQuery;

		for (const [id, data] of orderIndex.entries()) {
			const searchFields = options.includeMetadataSearch
				? [data.name, data.code, data.breadcrumb, data.description, data.performer]
				: [data.name];
			const searchableText = normalize(searchFields.filter(Boolean).join(' '));
			if (!queryLower || searchableText.includes(queryLower)) {
				matches.push({ id, ...data, isSurvey: false });
			}
		}

		return matches.sort((a, b) => sortOrderMatches(a, b, queryLower, normalize));
	}

	function buildOrderAutocompleteMatches(options = {}) {
		const normalize = options.normalizeSearch ? normalizeVietnameseQuery : normalizeQuery;
		const queryLower = normalize(options.query);
		const surveyMatches = buildSurveyMatches(options.surveyTemplates, queryLower, normalize);
		const maxResults = Number.isFinite(options.maxResults) ? options.maxResults : 10;

		if (!queryLower) {
			if (!options.includeCatalogWhenEmpty) {
				return surveyMatches;
			}

			const emptyCatalogLimit = Number.isFinite(options.emptyCatalogLimit) ? options.emptyCatalogLimit : 20;
			const remaining = Math.max(0, emptyCatalogLimit - surveyMatches.length);
			return [
				...surveyMatches,
				...buildOrderMatches(options.orderIndex, '', {
					normalize,
					includeMetadataSearch: Boolean(options.includeMetadataSearch)
				}).slice(0, remaining)
			];
		}

		const orderMatches = buildOrderMatches(options.orderIndex, queryLower, {
			normalize,
			includeMetadataSearch: Boolean(options.includeMetadataSearch)
		});
		return [...surveyMatches, ...orderMatches.slice(0, maxResults - surveyMatches.length)];
	}

	function renderOrderAutocompleteDropdownHtml(matches = [], options = {}) {
		const escapeHtml = options.escapeHtml || ((value = '') => String(value));
		const formatCurrency = options.formatCurrency || ((value) => value);
		const selectedIndex = Number.isInteger(options.selectedIndex) ? options.selectedIndex : -1;

		return (matches || []).map((item, index) => {
			const activeClass = index === selectedIndex ? 'active' : '';
			if (item.isSurvey) {
				const questionCount = item.question_count || 0;
				const pricingInfo = item.pricing_type === 'time_based'
					? `${formatCurrency(item.price_per_minute || 0)}/phút`
					: (item.service_name || 'Chưa liên kết dịch vụ');
				const pricingHtml = options.showSurveyPricing
					? `<div class="text-muted small order-autocomplete-pricing"><i class="bi bi-currency-dollar"></i> ${pricingInfo}</div>`
					: '';

				return `
					<div class="autocomplete-item survey-item ${activeClass}"
						 data-survey-id="${item.surveyTemplateId}"
						 data-is-survey="true"
						 data-index="${index}"
						 role="option"
						 aria-selected="${index === selectedIndex}">
						<div class="d-flex align-items-center gap-2">
							<i class="bi bi-clipboard-pulse order-autocomplete-survey-icon"></i>
							<span class="fw-semibold order-autocomplete-survey-name">${escapeHtml(item.name || '')}</span>
							<span class="badge order-autocomplete-survey-badge">${questionCount} câu hỏi</span>
						</div>
						${item.description ? `<div class="text-muted small order-autocomplete-survey-description">${escapeHtml(item.description)}</div>` : ''}
						${pricingHtml}
					</div>
				`;
			}

			return `
				<div class="autocomplete-item ${activeClass}"
					 data-order-id="${item.id}"
					 data-is-survey="false"
					 data-index="${index}"
					 role="option"
					 aria-selected="${index === selectedIndex}">
					<div class="fw-semibold order-autocomplete-order-name">${escapeHtml(item.name || '')}</div>
					${item.breadcrumb ? `<div class="text-muted small order-autocomplete-breadcrumb">${escapeHtml(item.breadcrumb)}</div>` : ''}
				</div>
			`;
		}).join('');
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
				const isSurvey = this.getAttribute('data-is-survey') === 'true';
				if (isSurvey) {
					const surveyId = Number(this.getAttribute('data-survey-id'));
					if (typeof options.onSurveySelect === 'function') {
						options.onSurveySelect(surveyId, this);
					}
					return;
				}

				const orderId = Number(this.getAttribute('data-order-id'));
				if (typeof options.onOrderSelect === 'function') {
					options.onOrderSelect(orderId, this);
				}
			});
		});
	}

	function renderAutocompleteDropdown(dropdown, matches = [], options = {}) {
		if (!dropdown) return false;
		if (!matches || matches.length === 0) {
			if (options.emptyText) {
				dropdown.innerHTML = `<div class="autocomplete-empty" role="status">${(options.escapeHtml || String)(options.emptyText)}</div>`;
				setAutocompleteDropdownVisible(dropdown, true);
				return false;
			}
			setAutocompleteDropdownVisible(dropdown, false);
			return false;
		}

		dropdown.innerHTML = renderOrderAutocompleteDropdownHtml(matches, {
			selectedIndex: options.selectedIndex,
			escapeHtml: options.escapeHtml,
			formatCurrency: options.formatCurrency,
			showSurveyPricing: options.showSurveyPricing
		});
		setAutocompleteDropdownVisible(dropdown, options.displayValue !== 'none');

		bindAutocompleteItemHover(dropdown, options.onSelectedIndexChange);
		bindAutocompleteItemSelection(dropdown, {
			onSurveySelect: options.onSurveySelect,
			onOrderSelect: options.onOrderSelect
		});

		return true;
	}

	function setupOrderFormAutocomplete(options = {}) {
		const doc = options.document || document;
		const nameInput = options.nameInput || doc.getElementById(options.nameInputId || 'orderFormNewName');
		const dropdown = options.dropdown || doc.getElementById(options.dropdownId || 'orderFormNewNameDropdown');
		const pathHint = options.pathHint || doc.getElementById(options.pathHintId || 'orderFormNewPathHint');

		if (!nameInput || !dropdown) return null;
		nameInput.setAttribute('role', 'combobox');
		nameInput.setAttribute('aria-autocomplete', 'list');
		nameInput.setAttribute('aria-expanded', 'false');
		if (dropdown.id) nameInput.setAttribute('aria-controls', dropdown.id);
		if (nameInput.id) dropdown.dataset.autocompleteInputId = nameInput.id;
		dropdown.setAttribute('role', 'listbox');
		dropdown.setAttribute('aria-hidden', 'true');

		let selectedIndex = -1;
		const setSelectedIndex = (nextIndex) => {
			selectedIndex = nextIndex;
			return selectedIndex;
		};
		const hide = (hideOptions = {}) => setSelectedIndex(hideAutocompleteDropdown(dropdown, hideOptions));

		const searchOrders = (query, searchOptions = {}) => buildOrderAutocompleteMatches({
			query,
			orderIndex: typeof options.getOrderIndex === 'function' ? options.getOrderIndex() : options.orderIndex,
			surveyTemplates: typeof options.getSurveyTemplates === 'function' ? options.getSurveyTemplates() : options.surveyTemplates,
			includeCatalogWhenEmpty: Boolean(searchOptions.includeCatalogWhenEmpty),
			emptyCatalogLimit: options.emptyCatalogLimit,
			normalizeSearch: Boolean(options.normalizeSearch),
			includeMetadataSearch: Boolean(options.includeMetadataSearch)
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
			escapeHtml: options.escapeHtml,
			formatCurrency: options.formatCurrency,
			showSurveyPricing: options.showSurveyPricing,
			emptyText: options.emptyText,
			onSelectedIndexChange: setSelectedIndex,
			onSurveySelect: (surveyId, item) => {
				if (typeof options.onSurveySelect === 'function') {
					options.onSurveySelect(surveyId, getCallbackContext(item));
				}
			},
			onOrderSelect: (orderId, item) => {
				if (typeof options.onOrderSelect === 'function') {
					options.onOrderSelect(orderId, getCallbackContext(item));
				}
			}
		});

		const performSearch = createAutocompleteSearchRunner({
			search: searchOrders,
			getEmptyMatches: options.includeCatalogWhenEmpty
				? () => searchOrders('', { includeCatalogWhenEmpty: true })
				: undefined,
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
					const matches = typeof options.getEmptyMatches === 'function'
						? options.getEmptyMatches(query, searchOptions)
						: (typeof options.search === 'function' ? options.search('', searchOptions) : []);
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

		const inputHandler = function () {
			if (setSelectedIndex) setSelectedIndex(-1);
			if (typeof options.onInput === 'function') options.onInput(this.value, this);
			const isEmpty = !this.value || this.value.trim() === '';
			performSearch(this.value, { showAllIfEmpty: isEmpty });
		};

		const focusHandler = function () {
			performSearch(this.value, { showAllIfEmpty: true });
		};

		const keydownHandler = function (event) {
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

	function setupOrderFormNewAutocompleteShell(options = {}) {
		return setupOrderFormAutocomplete({
			document: options.document || document,
			getOrderIndex: options.getOrderIndex,
			getSurveyTemplates: options.getSurveyTemplates,
			includeCatalogWhenEmpty: Boolean(options.includeCatalogWhenEmpty),
			emptyCatalogLimit: options.emptyCatalogLimit,
			normalizeSearch: Boolean(options.normalizeSearch),
			includeMetadataSearch: Boolean(options.includeMetadataSearch),
			selectFirstOnEnter: Boolean(options.selectFirstOnEnter),
			escapeHtml: options.escapeHtml,
			formatCurrency: options.formatCurrency,
			showSurveyPricing: Boolean(options.showSurveyPricing),
			onSurveySelect: (surveyId, context) => {
				if (typeof options.addSurveyTemplateToSelection === 'function') {
					options.addSurveyTemplateToSelection(surveyId);
				}
				context.hide();
			},
			onOrderSelect: (orderId, context) => {
				const orderIndex = typeof options.getOrderIndex === 'function' ? options.getOrderIndex() : null;
				const orderData = orderIndex?.get?.(orderId);
				if (!orderData) return;
				if (typeof options.applyOrderCatalogItemToForm === 'function') {
					options.applyOrderCatalogItemToForm(orderData, {
						document: options.document || document,
						nameInput: context.nameInput,
						pathHint: context.pathHint,
						updateLocationFields: options.updateLocationFields,
						loadOrderPerformers: options.loadOrderPerformers
					});
				}
				context.hide();
			}
		});
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
		renderOrderAutocompleteDropdownHtml,
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
		setupOrderFormNewAutocompleteShell,
		handleAutocompleteKeydown
	};

	window.ClinicalOrderAutocompleteUtils = api;
	window.DoctorExaminationOrderAutocompleteUtils = api;
	window.PsychologistExaminationOrderAutocompleteUtils = api;
})();
