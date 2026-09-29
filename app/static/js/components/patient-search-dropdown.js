(function (window) {
	'use strict';

	const MIN_QUERY_LENGTH = 2;
	const FOCUS_SEARCH_DELAY_MS = 100;
	const INPUT_DEBOUNCE_MS = 300;
	const DEFAULT_PER_PAGE = 10000;

	function stateHtml(message) {
		return `<div class="relative-search-item no-results">${message}</div>`;
	}

	function renderPatientResults(dropdown, patients, options) {
		const { escapeHtml, formatDateDisplay, nameClass, metaClass, onSelect, shouldRender } = options;
		if (!Array.isArray(patients) || patients.length === 0) {
			dropdown.innerHTML = stateHtml('Không tìm thấy bệnh nhân');
			return;
		}
		dropdown.innerHTML = patients.map(patient => {
			const phone = patient.phone || 'Chưa có';
			const lastExam = patient.latest_appointment_date ? formatDateDisplay(patient.latest_appointment_date) : 'Chưa khám';
			const diagnosis = patient.latest_diagnosis || 'Chưa có';
			return `
				<div class="relative-search-item" data-patient-id="${patient.id}">
					<div class="${nameClass}">${escapeHtml(patient.full_name)}</div>
					<div class="${metaClass}">
						<span><strong>SĐT:</strong> ${escapeHtml(phone)}</span>
						${patient.date_of_birth ? `<span><strong>Sinh:</strong> ${formatDateDisplay(patient.date_of_birth)}</span>` : ''}
					</div>
					<div class="${metaClass}">
						<span><strong>Khám gần nhất:</strong> ${lastExam}</span>
						${diagnosis !== 'Chưa có' ? `<span><strong>Chẩn đoán:</strong> ${escapeHtml(diagnosis)}</span>` : ''}
					</div>
				</div>
			`;
		}).join('');

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

	function attach(options) {
		const { row, nameInput, dropdown, floatingClass, search, onSelect } = options;
		const onQueryCleared = typeof options.onQueryCleared === 'function' ? options.onQueryCleared : () => {};
		const onQueryChanged = typeof options.onQueryChanged === 'function' ? options.onQueryChanged : () => {};
		const perPage = options.perPage || DEFAULT_PER_PAGE;
		const doc = row.ownerDocument || window.document;
		let searchTimeout = null;
		let activeSearchToken = 0;
		let disposed = false;

		const clearSearchTimeout = () => {
			if (searchTimeout) {
				clearTimeout(searchTimeout);
				searchTimeout = null;
			}
		};
		const createSearchToken = () => {
			activeSearchToken += 1;
			return activeSearchToken;
		};
		const invalidateSearch = () => {
			activeSearchToken += 1;
			clearSearchTimeout();
		};
		const canRender = searchToken => !disposed && searchToken === activeSearchToken && doc.activeElement === nameInput;

		const repositionDropdown = () => {
			if (dropdown.dataset.visible !== 'true') return;
			const rect = nameInput.getBoundingClientRect();
			const width = Math.max(320, Math.min(520, rect.width * 1.3));
			dropdown.style.width = `${width}px`;
			dropdown.style.top = `${rect.bottom + 8}px`;
			dropdown.style.left = `${rect.left}px`;
			dropdown.classList.add(floatingClass);
		};
		const handleViewportChange = () => repositionDropdown();

		const showDropdown = searchToken => {
			if (!canRender(searchToken)) return false;
			if (dropdown.dataset.visible === 'true') return true;
			dropdown.dataset.visible = 'true';
			dropdown.classList.add('is-open');
			repositionDropdown();
			window.addEventListener('scroll', handleViewportChange, true);
			window.addEventListener('resize', handleViewportChange);
			return true;
		};
		const closeDropdown = () => {
			if (dropdown.dataset.visible !== 'true') return;
			dropdown.dataset.visible = 'false';
			dropdown.classList.remove('is-open');
			window.removeEventListener('scroll', handleViewportChange, true);
			window.removeEventListener('resize', handleViewportChange);
		};
		const hideDropdown = () => {
			invalidateSearch();
			closeDropdown();
		};
		const renderState = (searchToken, message) => {
			if (!canRender(searchToken)) return false;
			dropdown.innerHTML = stateHtml(message);
			showDropdown(searchToken);
			return true;
		};
		const runSearch = (query, searchToken) => search(query, dropdown, {
			onSelect: patient => {
				if (!canRender(searchToken)) return;
				onSelect(patient);
				hideDropdown();
			},
			onShow: () => showDropdown(searchToken),
			perPage,
			shouldRender: () => canRender(searchToken)
		});

		const outsideClickHandler = event => {
			if (!row.contains(event.target) && !dropdown.contains(event.target)) hideDropdown();
		};
		const focusInHandler = event => {
			if (event.target === nameInput || dropdown.contains(event.target)) return;
			hideDropdown();
		};
		let outsideClickBound = false;
		const bindOutsideClick = () => {
			if (disposed || outsideClickBound) return;
			doc.addEventListener('click', outsideClickHandler);
			outsideClickBound = true;
		};
		const outsideClickTimer = setTimeout(bindOutsideClick, 0);
		row.addEventListener('focusin', focusInHandler);

		nameInput.addEventListener('focus', event => {
			const query = event.target.value.trim();
			const searchToken = createSearchToken();
			if (query.length >= MIN_QUERY_LENGTH) {
				clearSearchTimeout();
				searchTimeout = setTimeout(() => runSearch(query, searchToken), FOCUS_SEARCH_DELAY_MS);
				return;
			}
			renderState(searchToken, 'Đang tải...');
			runSearch('', searchToken);
		});

		nameInput.addEventListener('input', event => {
			const query = event.target.value.trim();
			invalidateSearch();
			const searchToken = createSearchToken();
			if (query.length < MIN_QUERY_LENGTH) {
				renderState(searchToken, 'Nhập tên để tìm kiếm...');
				onQueryCleared();
				return;
			}
			onQueryChanged();
			searchTimeout = setTimeout(() => runSearch(query, searchToken), INPUT_DEBOUNCE_MS);
		});

		nameInput.addEventListener('keydown', event => {
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				moveActiveItem(dropdown, event.key === 'ArrowDown' ? 1 : -1);
				return;
			}
			if (event.key === 'Enter') {
				const activeItem = dropdown.querySelector('.relative-search-item.active');
				if (activeItem) {
					event.preventDefault();
					activeItem.click();
				}
				return;
			}
			if (event.key === 'Escape') hideDropdown();
		});

		const dispose = () => {
			disposed = true;
			invalidateSearch();
			closeDropdown();
			clearTimeout(outsideClickTimer);
			if (outsideClickBound) doc.removeEventListener('click', outsideClickHandler);
			row.removeEventListener('focusin', focusInHandler);
		};

		return { hideDropdown, dispose };
	}

	window.QLPKPatientSearchDropdown = Object.freeze({ attach, renderPatientResults, stateHtml });
})(window);
