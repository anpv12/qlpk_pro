function getDocument(options) {
	return options && options.document ? options.document : window.document;
}

function getConsole(options) {
	return options && options.console ? options.console : window.console;
}

function getApiCall(options) {
	return options && options.apiCall ? options.apiCall : window.apiCall;
}

const mainAddressAutocompleteState = {
	regions: [],
	units: [],
	regionsLoaded: false,
	unitProvinceCode: '',
	activeDropdown: null,
	activeInput: null,
	repositionHandler: null,
	outsideClickBound: false,
	focusCloseBound: false
};

function normalizeAddressQuery(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '')
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.trim();
}

function filterAddressItems(items, query) {
	const normalizedQuery = normalizeAddressQuery(query);
	if (!normalizedQuery) return items.slice(0, 30);
	return items.filter(item => normalizeAddressQuery(item.full_name || item.name).includes(normalizedQuery)).slice(0, 30);
}

function findAddressItemByName(items, value) {
	const target = normalizeAddressQuery(value);
	if (!target) return null;
	return items.find(item => normalizeAddressQuery(item.name) === target || normalizeAddressQuery(item.full_name) === target) || null;
}

function closeMainAddressDropdown() {
	const dropdown = mainAddressAutocompleteState.activeDropdown;
	if (!dropdown) return;

	dropdown.classList.remove('is-open');
	if (mainAddressAutocompleteState.repositionHandler) {
		window.removeEventListener('scroll', mainAddressAutocompleteState.repositionHandler, true);
		window.removeEventListener('resize', mainAddressAutocompleteState.repositionHandler);
		mainAddressAutocompleteState.repositionHandler = null;
	}

	if (dropdown.parentElement === document.body && dropdown._addressOriginalParent) {
		dropdown._addressOriginalParent.appendChild(dropdown);
		dropdown._addressOriginalParent = null;
	}
	dropdown.classList.remove('receptionist-address-dropdown--floating');
	dropdown.removeAttribute('style');
	mainAddressAutocompleteState.activeDropdown = null;
	mainAddressAutocompleteState.activeInput = null;
}

function positionMainAddressDropdown(input, dropdown) {
	if (!dropdown._addressOriginalParent) {
		dropdown._addressOriginalParent = dropdown.parentElement;
	}
	if (dropdown.parentElement !== document.body) {
		document.body.appendChild(dropdown);
	}
	dropdown.classList.add('receptionist-address-dropdown--floating');

	const applyPosition = () => {
		const rect = input.getBoundingClientRect();
		const gap = 6;
		const spaceBelow = window.innerHeight - rect.bottom;
		const spaceAbove = rect.top;
		const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
		const availableSpace = openAbove ? spaceAbove : spaceBelow;
		const maxHeight = Math.max(100, Math.min(220, availableSpace - gap));
		const top = openAbove ? Math.max(gap, rect.top - maxHeight - 4) : rect.bottom;

		Object.assign(dropdown.style, {
			position: 'fixed',
			top: `${top}px`,
			left: `${rect.left}px`,
			right: 'auto',
			width: `${rect.width}px`,
			maxHeight: `${maxHeight}px`,
			zIndex: '1070'
		});
	};

	applyPosition();
	if (mainAddressAutocompleteState.repositionHandler) {
		window.removeEventListener('scroll', mainAddressAutocompleteState.repositionHandler, true);
		window.removeEventListener('resize', mainAddressAutocompleteState.repositionHandler);
	}
	mainAddressAutocompleteState.repositionHandler = applyPosition;
	window.addEventListener('scroll', applyPosition, true);
	window.addEventListener('resize', applyPosition);
}

function renderMainAddressDropdown(input, dropdown, items, onSelect, emptyText) {
	dropdown.innerHTML = '';

	if (!items.length) {
		const empty = document.createElement('div');
		empty.className = 'receptionist-address-dropdown-empty';
		empty.textContent = emptyText;
		dropdown.appendChild(empty);
	} else {
		items.forEach(item => {
			const option = document.createElement('button');
			option.type = 'button';
			option.className = 'receptionist-address-dropdown-item';
			option.textContent = item.full_name || item.name;
			option.addEventListener('mousedown', event => event.preventDefault());
			option.addEventListener('click', () => onSelect(item));
			dropdown.appendChild(option);
		});
	}

	closeMainAddressDropdown();
	mainAddressAutocompleteState.activeInput = input;
	mainAddressAutocompleteState.activeDropdown = dropdown;
	dropdown.classList.add('is-open');
	positionMainAddressDropdown(input, dropdown);
}

export { closeMainAddressDropdown, filterAddressItems, findAddressItemByName, getApiCall, getConsole, getDocument, mainAddressAutocompleteState, normalizeAddressQuery, positionMainAddressDropdown, renderMainAddressDropdown };
