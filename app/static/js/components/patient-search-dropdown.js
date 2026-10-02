import { el, replace } from '../shared/dom.js';

const MIN_QUERY_LENGTH = 2;
const FOCUS_SEARCH_DELAY_MS = 100;
const INPUT_DEBOUNCE_MS = 300;
const DEFAULT_PER_PAGE = 10000;

function stateNode(message) {
	return el('div', { class: 'relative-search-item no-results' }, message);
}

function renderState(dropdown, message) {
	replace(dropdown, stateNode(message));
}

function metaPart(label, value) {
	return el('span', null, el('strong', null, label), ' ', value);
}

function patientResultNode(patient, options) {
	const { formatDateDisplay, nameClass, metaClass } = options;
	const phone = patient.phone || 'Chưa có';
	const lastExam = patient.latest_appointment_date ? formatDateDisplay(patient.latest_appointment_date) : 'Chưa khám';
	const diagnosis = patient.latest_diagnosis || 'Chưa có';
	return el('div', { class: 'relative-search-item', 'data-patient-id': patient.id },
		el('div', { class: nameClass }, patient.full_name),
		el('div', { class: metaClass },
			metaPart('SĐT:', phone),
			patient.date_of_birth ? metaPart('Sinh:', formatDateDisplay(patient.date_of_birth)) : null
		),
		el('div', { class: metaClass },
			metaPart('Khám gần nhất:', lastExam),
			diagnosis !== 'Chưa có' ? metaPart('Chẩn đoán:', diagnosis) : null
		)
	);
}

function renderPatientResults(dropdown, patients, options) {
	const { onSelect, shouldRender } = options;
	if (!Array.isArray(patients) || patients.length === 0) {
		renderState(dropdown, 'Không tìm thấy bệnh nhân');
		return;
	}
	replace(dropdown, patients.map(patient => patientResultNode(patient, options)));

	dropdown.querySelectorAll('.relative-search-item').forEach(item => {
		if (item.classList.contains('no-results')) return;
		item.addEventListener('click', () => {
			if (!shouldRender()) return;
			const patientId = parseInt(item.dataset.patientId, 10);
			const patient = patients.find(candidate => candidate.id === patientId);
			if (patient) onSelect(patient);
		});
		item.addEventListener('mouseenter', () => {
			dropdown.querySelectorAll('.relative-search-item').forEach(other => other.classList.remove('active'));
			item.classList.add('active');
		});
	});
}

function moveActiveItem(dropdown, direction) {
	const items = dropdown.querySelectorAll('.relative-search-item');
	const activeItem = dropdown.querySelector('.relative-search-item.active');
	if (!activeItem) {
		if (items.length > 0 && direction > 0) items[0].classList.add('active');
		return;
	}
	activeItem.classList.remove('active');
	const sibling = direction > 0 ? activeItem.nextElementSibling : activeItem.previousElementSibling;
	if (sibling) {
		sibling.classList.add('active');
		sibling.scrollIntoView({ block: 'nearest' });
	} else if (items.length > 0) {
		items[direction > 0 ? 0 : items.length - 1].classList.add('active');
	}
}

function installDropdownFns1(ctx) {
	const clearSearchTimeout = () => {
		if (ctx.searchTimeout) {
			clearTimeout(ctx.searchTimeout);
			ctx.searchTimeout = null;
		}
	};

	const createSearchToken = () => {
		ctx.activeSearchToken += 1;
		return ctx.activeSearchToken;
	};

	const invalidateSearch = () => {
		ctx.activeSearchToken += 1;
		clearSearchTimeout();
	};

	const canRender = searchToken => !ctx.disposed && searchToken === ctx.activeSearchToken && ctx.doc.activeElement === ctx.nameInput;

	const repositionDropdown = () => {
		if (ctx.dropdown.dataset.visible !== 'true') return;
		const rect = ctx.nameInput.getBoundingClientRect();
		const width = Math.max(320, Math.min(520, rect.width * 1.3));
		ctx.dropdown.style.width = `${width}px`;
		ctx.dropdown.style.top = `${rect.bottom + 8}px`;
			ctx.dropdown.style.left = `${rect.left}px`;
			ctx.dropdown.classList.add(ctx.floatingClass);
	};

	const handleViewportChange = () => repositionDropdown();

	const showDropdown = searchToken => {
		if (!canRender(searchToken)) return false;
		if (ctx.dropdown.dataset.visible === 'true') return true;
		ctx.dropdown.dataset.visible = 'true';
		ctx.dropdown.classList.add('is-open');
		repositionDropdown();
		window.addEventListener('scroll', handleViewportChange, true);
		window.addEventListener('resize', handleViewportChange);
		return true;
	};

	const closeDropdown = () => {
		if (ctx.dropdown.dataset.visible !== 'true') return;
		ctx.dropdown.dataset.visible = 'false';
		ctx.dropdown.classList.remove('is-open');
		window.removeEventListener('scroll', handleViewportChange, true);
		window.removeEventListener('resize', handleViewportChange);
	};

	const hideDropdown = () => {
		invalidateSearch();
		closeDropdown();
	};

	const renderTokenState = (searchToken, message) => {
		if (!canRender(searchToken)) return false;
		renderState(ctx.dropdown, message);
		showDropdown(searchToken);
		return true;
	};

	Object.assign(ctx, {
		clearSearchTimeout, createSearchToken, invalidateSearch, canRender, showDropdown, closeDropdown,
		hideDropdown, renderState: renderTokenState
	});
}

function installDropdownFns2(ctx) {
	const runSearch = (query, searchToken) => ctx.search(query, ctx.dropdown, {
		onSelect: patient => {
			if (!ctx.canRender(searchToken)) return;
			ctx.onSelect(patient);
			ctx.hideDropdown();
		},
		onShow: () => ctx.showDropdown(searchToken),
		perPage: ctx.perPage,
		shouldRender: () => ctx.canRender(searchToken)
	});

	const outsideClickHandler = event => {
		if (!ctx.row.contains(event.target) && !ctx.dropdown.contains(event.target)) ctx.hideDropdown();
	};

	const focusInHandler = event => {
		if (event.target === ctx.nameInput || ctx.dropdown.contains(event.target)) return;
		ctx.hideDropdown();
	};

	const bindOutsideClick = () => {
		if (ctx.disposed || ctx.outsideClickBound) return;
		ctx.doc.addEventListener('click', outsideClickHandler);
		ctx.outsideClickBound = true;
	};

	const dispose = () => {
		ctx.disposed = true;
		ctx.invalidateSearch();
		ctx.closeDropdown();
		clearTimeout(ctx.outsideClickTimer);
		if (ctx.outsideClickBound) ctx.doc.removeEventListener('click', outsideClickHandler);
		ctx.row.removeEventListener('focusin', focusInHandler);
	};

	Object.assign(ctx, { runSearch, focusInHandler, bindOutsideClick, dispose });
}

function attach(options) {
	const ctx = {};
	installDropdownFns1(ctx);
	installDropdownFns2(ctx);

	({ row: ctx.row, nameInput: ctx.nameInput, dropdown: ctx.dropdown, floatingClass: ctx.floatingClass, search: ctx.search, onSelect: ctx.onSelect } = options);
	const onQueryCleared = typeof options.onQueryCleared === 'function' ? options.onQueryCleared : () => {};
	const onQueryChanged = typeof options.onQueryChanged === 'function' ? options.onQueryChanged : () => {};
	ctx.perPage = options.perPage || DEFAULT_PER_PAGE;
	ctx.doc = ctx.row.ownerDocument || window.document;
	ctx.searchTimeout = null;
	ctx.activeSearchToken = 0;
	ctx.disposed = false;
	ctx.outsideClickBound = false;
	ctx.outsideClickTimer = setTimeout(ctx.bindOutsideClick, 0);
	ctx.row.addEventListener('focusin', ctx.focusInHandler);

	ctx.nameInput.addEventListener('focus', event => {
		const query = event.target.value.trim();
		const searchToken = ctx.createSearchToken();
		if (query.length >= MIN_QUERY_LENGTH) {
			ctx.clearSearchTimeout();
			ctx.searchTimeout = setTimeout(() => ctx.runSearch(query, searchToken), FOCUS_SEARCH_DELAY_MS);
			return;
		}
		ctx.renderState(searchToken, 'Đang tải...');
		ctx.runSearch('', searchToken);
	});

	ctx.nameInput.addEventListener('input', event => {
		const query = event.target.value.trim();
		ctx.invalidateSearch();
		const searchToken = ctx.createSearchToken();
		if (query.length < MIN_QUERY_LENGTH) {
			ctx.renderState(searchToken, 'Nhập tên để tìm kiếm...');
			onQueryCleared();
			return;
		}
		onQueryChanged();
		ctx.searchTimeout = setTimeout(() => ctx.runSearch(query, searchToken), INPUT_DEBOUNCE_MS);
	});

	ctx.nameInput.addEventListener('keydown', event => {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			moveActiveItem(ctx.dropdown, event.key === 'ArrowDown' ? 1 : -1);
			return;
		}
		if (event.key === 'Enter') {
			const activeItem = ctx.dropdown.querySelector('.relative-search-item.active');
			if (activeItem) {
				event.preventDefault();
				activeItem.click();
			}
			return;
		}
		if (event.key === 'Escape') ctx.hideDropdown();
	});

	return { hideDropdown: ctx.hideDropdown, dispose: ctx.dispose };
}

export const QLPKPatientSearchDropdown = Object.freeze({ attach, renderPatientResults, renderState });
