(function (window) {
	'use strict';

	const PARTS = window.QLPKModalPatientSearchParts || (window.QLPKModalPatientSearchParts = {});
	const REGISTRY = window.QLPKDoctorModuleRegistry;
	const resolveUi = (name, fallback) => REGISTRY?.get?.(name) || fallback;
	const getTabsUi = options => options?.tabsUi || resolveUi('modalFunctionTabsUi', window.ModalFunctionTabsUi);
	const getHistoryListUi = options => options?.historyListUi || resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);

	function resolveElement(elementOrId) {
		if (!elementOrId) return null;
		return typeof elementOrId === 'string' ? document.getElementById(elementOrId) : elementOrId;
	}

	function getBootstrapModalApi() {
		if (window.bootstrap && window.bootstrap.Modal) return window.bootstrap.Modal;
		if (typeof bootstrap !== 'undefined' && bootstrap.Modal) return bootstrap.Modal;
		return null;
	}

	function showBootstrapModal(modalOrId, options = {}) {
		const modalEl = resolveElement(modalOrId || 'patientSearchModal');
		if (!modalEl) {
			if (options.missingMessage) console.warn(options.missingMessage);
			return null;
		}
		const Modal = getBootstrapModalApi();
		if (!Modal) return null;
		const instance = Modal.getOrCreateInstance(modalEl);
		instance.show();
		return instance;
	}

	function hideBootstrapModal(modalOrId) {
		const modalEl = resolveElement(modalOrId || 'patientSearchModal');
		if (!modalEl) return null;
		const Modal = getBootstrapModalApi();
		if (!Modal) return null;
		const instance = Modal.getInstance(modalEl);
		if (instance) instance.hide();
		return instance;
	}

	function buildStateHtml(state) {
		const states = {
			error: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--search patient-search-modal__empty-state--error">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-exclamation-triangle patient-search-modal__empty-icon"></i>
                </span>
                <p class="patient-search-modal__empty-title">Lỗi tải danh sách bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Vui lòng thử lại thao tác tìm kiếm</small>
            </div>
        `,
			emptySearch: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--search">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-search patient-search-modal__empty-icon"></i>
                </span>
                <p class="patient-search-modal__empty-title">Nhập tên hoặc mã hồ sơ để tìm kiếm bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Kết quả tìm kiếm sẽ hiển thị tại đây</small>
            </div>
        `,
			noPatientHistory: `
            <div class="patient-search-modal__empty-state patient-search-modal__empty-state--history">
                <span class="patient-search-modal__empty-icon-wrap" aria-hidden="true">
                    <i class="bi bi-person patient-search-modal__empty-icon--sm"></i>
                </span>
                <p class="patient-search-modal__empty-title">Vui lòng chọn bệnh nhân</p>
                <small class="patient-search-modal__empty-description">Lịch sử khám sẽ hiển thị theo hồ sơ đã chọn</small>
            </div>
        `
		};

		return states[state] || '';
	}

	function renderState(containerOrId, state) {
		const container = resolveElement(containerOrId);
		if (!container) return '';
		const html = buildStateHtml(state);
		container.innerHTML = html;
		return html;
	}

	function ensureHighlightStyles() {
		// CSS is owned by patient-search-modal.css; keep this function for legacy callers.
		return true;
	}

	function syncWindowState(options = {}) {
		if (options.exposeLegacyWindowState === false || typeof window === 'undefined') return options;
		window.modalSelectedPatient = options.selectedPatient;
		window.modalMedicalHistoryLoading = options.medicalHistoryLoading;
		window.modalMedicalHistoryData = options.medicalHistoryData;
		window.modalSelectedHistoryIndex = options.selectedHistoryIndex;
		return options;
	}

	function getDateFormatter(formatDateDisplay) {
		if (typeof formatDateDisplay === 'function') return formatDateDisplay;
		if (typeof window.formatDateDisplay === 'function') return window.formatDateDisplay;
		return value => value || '';
	}

	function getPatientSearchText(patient) {
		if (!patient) return '';
		return patient.patient_code || patient.full_name || '';
	}

	function resolvePresetSearch(options = {}) {
		const input = resolveElement(options.searchInput || 'modalPatientSearch');
		if (options.shouldPrefill && options.currentPatientData) {
			const query = getPatientSearchText(options.currentPatientData);
			if (input) input.value = query;
			return {
				query,
				prefillPatientId: options.currentPatientData.id || null
			};
		}

		return {
			query: input ? input.value.trim() : '',
			prefillPatientId: null
		};
	}

	function openSearchModalWithPreset(options = {}) {
		const modal = showBootstrapModal(options.modal || options.modalElement || 'patientSearchModal', {
			missingMessage: options.missingMessage
		});
		if (!modal) return null;
		if (typeof options.reset === 'function') options.reset();
		return {
			modal,
			presetSearch: resolvePresetSearch({
				searchInput: options.searchInput,
				shouldPrefill: options.shouldPrefill,
				currentPatientData: options.currentPatientData
			})
		};
	}

	function buildOpenSearchModalState(openResult) {
		if (!openResult || !openResult.presetSearch) return null;
		return {
			prefillPatientId: openResult.presetSearch.prefillPatientId,
			query: openResult.presetSearch.query || '',
			shouldPrefill: false
		};
	}

	function openSearchModalAndFetch(options = {}) {
		const openResult = openSearchModalWithPreset(options);
		const openState = buildOpenSearchModalState(openResult);
		if (!openState) return null;
		if (typeof options.setPrefillPatientId === 'function') {
			options.setPrefillPatientId(openState.prefillPatientId);
		}
		if (typeof options.fetchSearch === 'function') {
			options.fetchSearch(openState.query);
		}
		if (typeof options.setShouldPrefill === 'function') {
			options.setShouldPrefill(openState.shouldPrefill);
		}
		return openState;
	}

	function buildPatientRowHtml({ patient, index, selectedPatient, formatDateDisplay, showPatientAction = true }) {
		const isActive = selectedPatient && selectedPatient.id === patient.id;
		const formatDate = getDateFormatter(formatDateDisplay);
		const dateColumnClass = showPatientAction ? 'col-2' : 'col-3';
		const phoneColumnClass = showPatientAction ? 'col-2' : 'col-3';
		const actionColumn = showPatientAction
			? `
            <div class="col-2 text-center">
				<button data-qlpk-button="view" data-qlpk-button-variant="soft" class="btn btn-sm patient-search-modal__patient-action" data-action="copy" data-index="${index}" title="Xem lại">
                    <i class="bi bi-eye"></i>
                </button>
            </div>`
			: '';

		return `
            <div class="row border-bottom py-2 align-items-center modal-patient-item${isActive ? ' modal-patient-item-active' : ''}"
             data-index="${index}">
            <div class="col-2 text-center patient-search-modal__patient-code">
                ${window.QLPKHtml.escape(patient.patient_code || '')}
            </div>
			<div class="col-4 text-center patient-search-modal__patient-name">
				${window.QLPKHtml.escape(patient.full_name || '')}
			</div>
			<div class="${dateColumnClass} text-center">
				${patient.date_of_birth ? formatDate(patient.date_of_birth) : ''}
			</div>
			<div class="${phoneColumnClass} text-center">
				${window.QLPKHtml.escape(patient.phone || '')}
			</div>
			${actionColumn}
	        </div>
	    `;
	}

	function syncPatientActionColumn(containerOrId, showPatientAction) {
		const container = resolveElement(containerOrId || 'modalSearchResults');
		const headerCell = container
			?.closest('.patient-search-modal__results-card')
			?.querySelector('.patient-search-modal__table-head-row > :last-child');
		if (!headerCell) return null;
		headerCell.hidden = !showPatientAction;
		return headerCell;
	}

	function renderSearchResults(options = {}) {
		const container = resolveElement(options.container || 'modalSearchResults');
		if (!container) return '';
		const showPatientAction = options.showPatientAction !== false;
		syncPatientActionColumn(container, showPatientAction);

		if (options.isError) {
			return renderState(container, 'error');
		}

		const patients = Array.isArray(options.patients) ? options.patients : [];
		if (!patients.length) {
			return renderState(container, 'emptySearch');
		}

		const rows = patients.map((patient, index) => buildPatientRowHtml({
			patient,
			index,
			selectedPatient: options.selectedPatient,
			formatDateDisplay: options.formatDateDisplay,
			showPatientAction
		})).join('');
		container.innerHTML = rows;
		return rows;
	}

	function resolveAutoSelectIndex(options = {}) {
		const patients = Array.isArray(options.patients) ? options.patients : [];
		if (!patients.length) return -1;

		let targetIndex = -1;
		if (options.prefillPatientId) {
			targetIndex = patients.findIndex(patient => patient.id === options.prefillPatientId);
		}
		if (targetIndex < 0 && options.selectedPatient) {
			targetIndex = patients.findIndex(patient => patient.id === options.selectedPatient.id);
		}
		return targetIndex < 0 ? 0 : targetIndex;
	}

	function renderHistoryNoPatient(containerOrId = 'modalMedicalHistory') {
		return renderState(containerOrId, 'noPatientHistory');
	}

	function setSelectButtonEnabled(enabled, buttonOrId = 'selectPatientFromModal') {
		const button = resolveElement(buttonOrId);
		if (button) button.disabled = !enabled;
		return button;
	}

	function setActivePatientRow(index, options = {}) {
		const activeClass = options.activeClass || 'modal-patient-item-active';
		document.querySelectorAll(options.rowSelector || '.modal-patient-item').forEach(item => item.classList.remove(activeClass));
		const row = document.querySelector(`${options.rowSelector || '.modal-patient-item'}[data-index="${index}"]`);
		if (row) row.classList.add(activeClass);
		return row;
	}

	function selectAppointmentCard(appointmentId, options = {}) {
		const rowSelector = options.rowSelector || '.qlpk-waiting-card';
		const activeClass = options.activeClass || 'selected';
		const cards = Array.from(document.querySelectorAll(rowSelector));
		cards.forEach(card => {
			card.classList.remove(activeClass);
		});
		const selectedCard = cards.find(card => String(card.dataset.appointmentId || '') === String(appointmentId));
		if (selectedCard) selectedCard.classList.add(activeClass);
		return selectedCard;
	}

	function applySelectedPatientUi(index, options = {}) {
		const row = setActivePatientRow(index, options);
		const button = setSelectButtonEnabled(true, options.selectButton || 'selectPatientFromModal');
		return { row, button };
	}

	function applyNoSearchResultsUi(options = {}) {
		const historyHtml = renderHistoryNoPatient(options.medicalHistory || 'modalMedicalHistory');
		const button = setSelectButtonEnabled(false, options.selectButton || 'selectPatientFromModal');
		return { historyHtml, button };
	}

	function applySinglePatientSearchUi(patient, options = {}) {
		const searchInput = resolveElement(options.searchInput || 'modalPatientSearch');
		if (searchInput) searchInput.value = getPatientSearchText(patient);
		const button = setSelectButtonEnabled(true, options.selectButton || 'selectPatientFromModal');
		return { searchInput, button };
	}

	function showHistoryButton(buttonOrId = 'historyBtn') {
		const button = resolveElement(buttonOrId);
		if (!button) return null;
		button.removeAttribute('style');
		button.classList.add('patient-search-modal__history-button-visible');
		button.classList.remove('d-none', 'visually-hidden');
		return button;
	}

	function resetModalDom(options = {}) {
		setSelectButtonEnabled(false, options.selectButton || 'selectPatientFromModal');

		const searchInput = resolveElement(options.searchInput || 'modalPatientSearch');
		if (searchInput) searchInput.value = '';

		renderState(options.searchResults || 'modalSearchResults', 'emptySearch');
		renderHistoryNoPatient(options.medicalHistory || 'modalMedicalHistory');
	}

	function bindSearchInput(inputOrId, onSearch) {
		const input = resolveElement(inputOrId || 'modalPatientSearch');
		if (!input || typeof onSearch !== 'function') return null;

		input.addEventListener('input', event => {
			onSearch(input.value.trim(), event);
		});
		input.addEventListener('keypress', event => {
			if (event.key === 'Enter') {
				event.preventDefault();
				onSearch(input.value.trim(), event);
			}
		});
		return input;
	}

	function bindPatientResultsClick(containerOrId, options = {}) {
		const container = resolveElement(containerOrId || 'modalSearchResults');
		if (!container) return null;

		container.addEventListener('click', event => {
			const target = event.target;
			if (!target || typeof target.closest !== 'function') return;
			const row = target.closest(options.rowSelector || '.modal-patient-item');
			if (!row) return;
			const index = Number(row.dataset.index);
			if (Number.isNaN(index)) return;

			const actionEl = target.closest('[data-action]');
			const action = actionEl ? actionEl.getAttribute('data-action') : null;
			if (action === 'copy') {
				event.stopPropagation();
				if (typeof options.onCopy === 'function') options.onCopy(index, event);
				return;
			}
			if (typeof options.onSelect === 'function') options.onSelect(index, event);
		});
		return container;
	}

	function bindModalHidden(modalOrId, onHidden) {
		const modal = resolveElement(modalOrId || 'patientSearchModal');
		if (!modal || typeof onHidden !== 'function') return null;
		modal.addEventListener('hidden.bs.modal', event => onHidden(event));
		return modal;
	}

	function bindSelectButton(buttonOrId, onSelect) {
		const button = resolveElement(buttonOrId || 'selectPatientFromModal');
		if (!button || typeof onSelect !== 'function') return null;
		button.addEventListener('click', event => onSelect(event));
		return button;
	}

	function bindSelectPatientFromModalButton(buttonOrId, options = {}) {
		return bindSelectButton(buttonOrId, async event => {
			const selectedPatient = typeof options.getSelectedPatient === 'function'
				? options.getSelectedPatient()
				: null;
			if (!selectedPatient) return;

			if (typeof options.loadPatient === 'function') {
				await options.loadPatient(selectedPatient, event);
			}
			hideBootstrapModal(options.modal);

			const locked = typeof options.isFormLocked === 'function'
				? options.isFormLocked()
				: Boolean(options.isFormLocked);
			if (locked && typeof options.unlockForm === 'function') {
				options.unlockForm();
			}

			if (typeof options.showToast === 'function') {
				options.showToast('success', options.successMessage || 'Đã chọn bệnh nhân');
			}
		});
	}

	function bindOpenButtons(options = {}) {
		const bound = {};
		const searchButton = resolveElement(options.searchButton);
		if (searchButton && typeof options.onSearchOpen === 'function') {
			searchButton.addEventListener('click', event => options.onSearchOpen(event));
			bound.searchButton = searchButton;
		}

		const historyButton = resolveElement(options.historyButton);
		if (historyButton && typeof options.onHistoryOpen === 'function') {
			historyButton.addEventListener('click', event => options.onHistoryOpen(event));
			bound.historyButton = historyButton;
		}
		return bound;
	}

	function bindSearchModalOpenButtons(options = {}) {
		const setShouldPrefill = value => {
			if (typeof options.setShouldPrefill === 'function') options.setShouldPrefill(value);
		};
		const open = event => {
			if (typeof options.open === 'function') options.open(event);
		};
		return bindOpenButtons({
			searchButton: options.searchButton,
			historyButton: options.historyButton,
			onSearchOpen(event) {
				setShouldPrefill(false);
				open(event);
			},
			onHistoryOpen(event) {
				setShouldPrefill(true);
				open(event);
			}
		});
	}

	function bindPatientSearchModalFlowControls(options = {}) {
		const bound = {};
		bound.openButtons = bindSearchModalOpenButtons({
			searchButton: options.searchButton,
			historyButton: options.historyButton,
			setShouldPrefill: options.setShouldPrefill,
			open: options.open
		});

		bound.searchInput = bindSearchInput(options.searchInput, (query, event) => {
			if (typeof options.fetchSearch === 'function') options.fetchSearch(query, event);
		});
		bound.resultsClick = bindPatientResultsClick(options.resultsContainer, {
			onCopy: options.copyPatient,
			onSelect: options.selectPatient
		});

		const historyListUi = getHistoryListUi(options);
		if (historyListUi && typeof historyListUi.bindHistoryListActions === 'function') {
			bound.historyList = historyListUi.bindHistoryListActions(options.historyContainer, {
				onSelect: options.selectHistory,
				copyHistory: options.copyHistory,
				deleteHistory: options.deleteHistory,
				showToast: options.showToast
			});
		}

		bound.selectButton = bindSelectPatientFromModalButton(options.selectButton, {
			getSelectedPatient: options.getSelectedPatient,
			loadPatient: options.loadPatient,
			modal: options.modal,
			isFormLocked: options.isFormLocked,
			unlockForm: options.unlockForm,
			showToast: options.showToast
		});
		bound.hidden = bindModalHidden(options.modal, options.resetModal);

		const tabsUi = getTabsUi(options);
		if (tabsUi && typeof tabsUi.bindShownTabEvents === 'function') {
			bound.tabs = tabsUi.bindShownTabEvents(options.tabs, options.updateContent);
		}

		bound.relativeResolver = bindRelativeLinkResolver(options.openLinkedRelative);
		return bound;
	}

	function bindRelativeLinkResolver(openLinkedRelative) {
		if (!window.RelativeLinkHandler || typeof window.RelativeLinkHandler.registerResolver !== 'function') {
			return false;
		}
		if (typeof openLinkedRelative !== 'function') return false;
		window.RelativeLinkHandler.registerResolver(patientId => openLinkedRelative(patientId));
		return true;
	}

	Object.assign(PARTS, {
		resolveElement, getBootstrapModalApi, showBootstrapModal, hideBootstrapModal, buildStateHtml,
		renderState, ensureHighlightStyles, syncWindowState, getDateFormatter, getPatientSearchText,
		resolvePresetSearch, openSearchModalWithPreset, buildOpenSearchModalState, openSearchModalAndFetch,
		buildPatientRowHtml, syncPatientActionColumn, renderSearchResults, resolveAutoSelectIndex,
		renderHistoryNoPatient, setSelectButtonEnabled, setActivePatientRow, selectAppointmentCard,
		showHistoryButton, resetModalDom, applySelectedPatientUi, applyNoSearchResultsUi,
		applySinglePatientSearchUi, bindSearchInput, bindPatientResultsClick, bindModalHidden,
		bindSelectButton, bindSelectPatientFromModalButton, bindOpenButtons, bindSearchModalOpenButtons,
		bindPatientSearchModalFlowControls, bindRelativeLinkResolver
	});
})(window);
