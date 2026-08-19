(function (window) {
	'use strict';

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function normalizePage(page, totalPages) {
		let nextPage = Number(page) || 1;
		if (nextPage > totalPages) nextPage = totalPages;
		if (nextPage < 1) nextPage = 1;
		return nextPage;
	}

	function buildServiceItem(documentRef, service) {
		const item = documentRef.createElement('div');
		item.className = 'system-service-item';

		const defaultQuantity = '1';
		const defaultDuration = Number.isFinite(Number(service?.duration_minutes))
			? String(Number(service.duration_minutes))
			: '0';
		const defaultAmount = Number.isFinite(Number(service?.default_price))
			? String(Number(service.default_price))
			: '0';

		item.dataset.serviceId = service?.id ? String(service.id) : '';
		item.dataset.name = service?.name || '';
		item.dataset.defaultQuantity = defaultQuantity;
		item.dataset.defaultDuration = defaultDuration;
		item.dataset.defaultAmount = defaultAmount;

		const header = documentRef.createElement('div');
		header.className = 'system-service-header';

		const addBtn = documentRef.createElement('button');
		addBtn.type = 'button';
		addBtn.className = 'system-service-add';

		const icon = documentRef.createElement('i');
		icon.className = 'bi bi-plus-circle';

		const nameSpan = documentRef.createElement('span');
		nameSpan.textContent = service?.name || 'Không có tên';

		addBtn.appendChild(icon);
		addBtn.appendChild(nameSpan);
		header.appendChild(addBtn);

		const fieldsWrapper = documentRef.createElement('div');
		fieldsWrapper.className = 'system-service-fields';

		[
			{ label: 'Số lượng', className: 'system-service-quantity', value: defaultQuantity, min: '1' },
			{ label: 'Thời gian (phút)', className: 'system-service-duration', value: defaultDuration, min: '0' },
			{ label: 'Số tiền (VND)', className: 'system-service-amount', value: defaultAmount, min: '0', step: '1000' }
		].forEach(field => {
			const fieldWrapper = documentRef.createElement('div');
			fieldWrapper.className = 'system-service-field';

			const label = documentRef.createElement('label');
			label.textContent = field.label;

			const input = documentRef.createElement('input');
			input.type = 'number';
			input.className = field.className;
			input.value = field.value;
			input.min = field.min;
			if (field.step) input.step = field.step;

			fieldWrapper.appendChild(label);
			fieldWrapper.appendChild(input);
			fieldsWrapper.appendChild(fieldWrapper);
		});

		item.appendChild(header);
		item.appendChild(fieldsWrapper);
		return item;
	}

	function updateSystemServicesPaginationDisplay({ document: documentRef, total, start, end, page, totalPages } = {}) {
		const doc = documentRef || window.document;
		const paginationWrapper = doc.getElementById('systemServicesPagination');
		if (!paginationWrapper) return;

		if (!total) {
			paginationWrapper.style.display = 'none';
			return;
		}

		paginationWrapper.style.display = 'flex';
		const rangeEl = doc.getElementById('systemServicesRange');
		const totalEl = doc.getElementById('systemServicesTotal');
		const pageEl = doc.getElementById('systemServicesCurrentPage');
		const prevBtn = doc.getElementById('systemServicesPrevBtn');
		const nextBtn = doc.getElementById('systemServicesNextBtn');

		if (rangeEl) rangeEl.textContent = `${start.toLocaleString('vi-VN')} - ${end.toLocaleString('vi-VN')}`;
		if (totalEl) totalEl.textContent = total.toLocaleString('vi-VN');
		if (pageEl) pageEl.textContent = `${page}/${totalPages}`;
		if (prevBtn) prevBtn.disabled = page <= 1;
		if (nextBtn) nextBtn.disabled = page >= totalPages;
	}

	function renderSystemServices(options = {}) {
		const doc = getDocument(options);
		const services = options.services;
		const keyword = options.keyword || '';
		const perPage = Number(options.perPage) || 5;
		const listEl = doc.getElementById('systemServicesList');
		const paginationWrapper = doc.getElementById('systemServicesPagination');
		if (!listEl) {
			return { total: 0, totalPages: 1, page: 1 };
		}

		listEl.innerHTML = '';

		if (!Array.isArray(services) || services.length === 0) {
			listEl.innerHTML = '<p class="text-muted mb-0">Chưa có dịch vụ khả dụng.</p>';
			if (paginationWrapper) paginationWrapper.style.display = 'none';
			return { total: 0, totalPages: 1, page: 1 };
		}

		const normalizedKeyword = (keyword || '').trim().toLowerCase();
		const filteredServices = normalizedKeyword
			? services.filter(service => (service?.name || '').toLowerCase().includes(normalizedKeyword))
			: services;

		const total = filteredServices.length;

		if (!Array.isArray(filteredServices) || filteredServices.length === 0) {
			listEl.innerHTML = '<p class="text-muted mb-0">Không tìm thấy dịch vụ phù hợp.</p>';
			if (paginationWrapper) paginationWrapper.style.display = 'none';
			return { total: 0, totalPages: 1, page: 1 };
		}

		const totalPages = Math.max(1, Math.ceil(total / perPage));
		const page = normalizePage(options.page, totalPages);
		const startIndex = (page - 1) * perPage;
		const visibleServices = filteredServices.slice(startIndex, startIndex + perPage);
		const fragment = doc.createDocumentFragment();

		visibleServices.forEach(service => {
			fragment.appendChild(buildServiceItem(doc, service));
		});

		listEl.appendChild(fragment);
		updateSystemServicesPaginationDisplay({
			document: doc,
			total,
			start: startIndex + 1,
			end: startIndex + visibleServices.length,
			page,
			totalPages
		});

		return { total, totalPages, page };
	}

	function resetSystemServiceInputs(options = {}) {
		const doc = getDocument(options);
		const systemItems = doc.querySelectorAll('#systemServicesList .system-service-item');
		systemItems.forEach(item => {
			const defaultQuantity = parseInt(item.dataset.defaultQuantity || '1', 10) || 1;
			const defaultDuration = parseInt(item.dataset.defaultDuration || '0', 10) || 0;
			const defaultAmount = parseFloat(item.dataset.defaultAmount || '0') || 0;

			const quantityInput = item.querySelector('.system-service-quantity');
			const durationInput = item.querySelector('.system-service-duration');
			const amountInput = item.querySelector('.system-service-amount');

			if (quantityInput) quantityInput.value = defaultQuantity;
			if (durationInput) durationInput.value = defaultDuration;
			if (amountInput) amountInput.value = defaultAmount;
		});
	}

	function readSystemServiceItemPayload(addButton) {
		const item = addButton?.closest?.('.system-service-item');
		if (!item) return null;

		const rawServiceId = parseInt(item.dataset.serviceId || '', 10);
		const serviceId = Number.isFinite(rawServiceId) ? rawServiceId : null;
		const quantityInput = item.querySelector('.system-service-quantity');
		const durationInput = item.querySelector('.system-service-duration');
		const amountInput = item.querySelector('.system-service-amount');

		return {
			serviceId,
			name: item.dataset.name || (addButton.textContent || '').trim(),
			quantity: parseInt(quantityInput?.value || item.dataset.defaultQuantity || '1', 10) || 1,
			duration: parseInt(durationInput?.value || item.dataset.defaultDuration || '0', 10) || 0,
			amount: parseFloat(amountInput?.value || item.dataset.defaultAmount || '0') || 0
		};
	}

	function bindSystemServiceAdd(options = {}) {
		const doc = getDocument(options);
		const listEl = options.listElement || doc.getElementById('systemServicesList');
		if (!listEl) return;

		listEl.addEventListener('click', (event) => {
			const target = event.target;
			const addBtn = target?.closest?.('.system-service-add');
			if (!addBtn) return;
			if (typeof listEl.contains === 'function' && !listEl.contains(addBtn)) return;

			const isLocked = typeof options.isLocked === 'function'
				? Boolean(options.isLocked())
				: Boolean(options.locked);
			if (isLocked || addBtn.disabled) {
				event.preventDefault();
				event.stopPropagation();
				if (typeof options.onLockedAction === 'function') {
					options.onLockedAction(event);
				}
				return;
			}

			const servicePayload = readSystemServiceItemPayload(addBtn);
			if (servicePayload && typeof options.onAddSystemService === 'function') {
				options.onAddSystemService(servicePayload, event);
			}
		});
	}

	function bindSystemServicePagination(options = {}) {
		const doc = getDocument(options);
		const prevBtn = options.previousButton || doc.getElementById('systemServicesPrevBtn');
		const nextBtn = options.nextButton || doc.getElementById('systemServicesNextBtn');

		if (prevBtn && typeof options.onPreviousPage === 'function') {
			prevBtn.addEventListener('click', (event) => options.onPreviousPage(event));
		}

		if (nextBtn && typeof options.onNextPage === 'function') {
			nextBtn.addEventListener('click', (event) => options.onNextPage(event));
		}
	}

	function bindServiceModalLifecycle(options = {}) {
		const doc = getDocument(options);
		const serviceModal = options.serviceModal || doc.getElementById('serviceModal');
		if (!serviceModal) return;

		if (typeof options.onShow === 'function') {
			serviceModal.addEventListener('show.bs.modal', (event) => options.onShow(event));
		}

		if (typeof options.onHidden === 'function') {
			serviceModal.addEventListener('hidden.bs.modal', (event) => options.onHidden(event));
		}
	}

	function bindServiceSearchInput(options = {}) {
		const doc = getDocument(options);
		const searchInput = options.searchInput || doc.getElementById('serviceNameInput');
		if (!searchInput || typeof options.onSearchInput !== 'function') return;

		searchInput.addEventListener('input', (event) => {
			options.onSearchInput(searchInput.value || '', event);
		});
	}

	function getSystemServicesStateValue(options, key, fallback) {
		const getter = options[`get${key}`];
		if (typeof getter === 'function') return getter();
		return fallback;
	}

	function setSystemServicesStateValue(options, key, value) {
		const setter = options[`set${key}`];
		if (typeof setter === 'function') setter(value);
	}

	async function ensureSystemServicesLoaded(forceReload = false, options = {}) {
		const doc = getDocument(options);
		const listEl = doc.getElementById('systemServicesList');
		if (!listEl) return false;

		if (getSystemServicesStateValue(options, 'Loading', false)) {
			return false;
		}

		const services = getSystemServicesStateValue(options, 'Services', []);
		const loaded = getSystemServicesStateValue(options, 'Loaded', false);
		const perPage = Number(options.perPage) || 5;
		const hasCache = Array.isArray(services) && services.length > 0;

		if (!forceReload && loaded && hasCache) {
			setSystemServicesStateValue(options, 'Total', services.length);
			setSystemServicesStateValue(options, 'TotalPages', Math.max(1, Math.ceil(services.length / perPage)));
			if (typeof options.renderSystemServices === 'function') {
				options.renderSystemServices(services, getSystemServicesStateValue(options, 'Keyword', ''));
			}
			return true;
		}

		setSystemServicesStateValue(options, 'Loading', true);
		try {
			listEl.innerHTML = '<p class="text-muted mb-0">Đang tải danh sách dịch vụ...</p>';
			const response = await options.apiCall('/services');
			if (!response.ok) {
				let message = 'Không tải được danh sách dịch vụ.';
				try {
					const errorData = await response.json();
					message = errorData?.detail || message;
				} catch (parseError) {
					if (options.console?.warn) {
						options.console.warn('Không parse được lỗi danh sách dịch vụ:', parseError);
					}
				}
				listEl.innerHTML = `<p class="text-danger mb-0">${message}</p>`;
				if (typeof options.showToast === 'function') {
					options.showToast('error', message);
				}
				return false;
			}

			const data = await response.json();
			const nextServices = Array.isArray(data) ? data : [];
			setSystemServicesStateValue(options, 'Services', nextServices);
			setSystemServicesStateValue(options, 'Total', nextServices.length);
			setSystemServicesStateValue(options, 'TotalPages', Math.max(1, Math.ceil(nextServices.length / perPage)));
			setSystemServicesStateValue(options, 'Page', 1);
			if (typeof options.renderSystemServices === 'function') {
				options.renderSystemServices(nextServices, getSystemServicesStateValue(options, 'Keyword', ''));
			}
			setSystemServicesStateValue(options, 'Loaded', true);
			return true;
		} catch (error) {
			if (options.console?.error) {
				options.console.error('ensureSystemServicesLoaded error:', error);
			}
			listEl.innerHTML = '<p class="text-danger mb-0">Không thể tải dịch vụ. Vui lòng thử lại.</p>';
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không thể tải danh sách dịch vụ. Vui lòng thử lại.');
			}
			return false;
		} finally {
			setSystemServicesStateValue(options, 'Loading', false);
		}
	}

	function bindServiceModalControls(options = {}) {
		const doc = getDocument(options);
		const serviceModal = options.serviceModal || doc.getElementById('serviceModal');

		bindSystemServiceAdd({
			...options,
			document: doc,
			listElement: options.systemServicesList || doc.getElementById('systemServicesList')
		});
		bindSystemServicePagination({
			...options,
			document: doc
		});
		bindServiceModalLifecycle({
			...options,
			document: doc,
			serviceModal
		});
		bindServiceSearchInput({
			...options,
			document: doc,
			searchInput: options.searchInput || doc.getElementById('serviceNameInput')
		});
	}

	function initializeServiceModalWorkflow(options = {}) {
		const doc = getDocument(options);
		const serviceModal = options.serviceModal || doc.getElementById('serviceModal');
		if (!serviceModal) return false;

		const getPage = () => Number(typeof options.getPage === 'function' ? options.getPage() : options.page) || 1;
		const setPage = value => {
			if (typeof options.setPage === 'function') options.setPage(value);
		};
		const getTotalPages = () => Number(typeof options.getTotalPages === 'function' ? options.getTotalPages() : options.totalPages) || 1;
		const getServices = () => (typeof options.getServices === 'function' ? options.getServices() : options.services) || [];
		const getKeyword = () => (typeof options.getKeyword === 'function' ? options.getKeyword() : options.keyword) || '';
		const setKeyword = value => {
			if (typeof options.setKeyword === 'function') options.setKeyword(value || '');
		};

		const rerenderCurrentPage = () => {
			if (typeof options.renderSystemServices === 'function') {
				options.renderSystemServices(getServices(), getKeyword());
			}
			if (typeof options.resetSystemServiceInputs === 'function') {
				options.resetSystemServiceInputs();
			}
		};

		bindServiceModalControls({
			...options,
			document: doc,
			serviceModal,
			onAddSystemService: options.onAddSystemService || options.addOrUpdateSelectedService,
			onPreviousPage(event) {
				if (typeof options.onPreviousPage === 'function') {
					options.onPreviousPage(event);
					return;
				}
				const page = getPage();
				if (page > 1) {
					setPage(page - 1);
					rerenderCurrentPage();
				}
			},
			onNextPage(event) {
				if (typeof options.onNextPage === 'function') {
					options.onNextPage(event);
					return;
				}
				const page = getPage();
				if (page < getTotalPages()) {
					setPage(page + 1);
					rerenderCurrentPage();
				}
			},
			async onShow(event) {
				if (typeof options.onShow === 'function') {
					await options.onShow(event);
					return;
				}
				const searchInputEl = doc.getElementById('serviceNameInput');
				if (searchInputEl) {
					setKeyword('');
					searchInputEl.value = '';
				}
				setPage(1);
				if (typeof options.ensureSystemServicesLoaded === 'function') {
					await options.ensureSystemServicesLoaded();
				}
				if (typeof options.resetSystemServiceInputs === 'function') {
					options.resetSystemServiceInputs();
				}
				if (typeof options.renderSelectedServices === 'function') {
					options.renderSelectedServices();
				}
				if (typeof options.updateTotalServiceAmountDisplay === 'function') {
					options.updateTotalServiceAmountDisplay();
				}
				const appointmentId = typeof options.getCurrentAppointmentId === 'function'
					? options.getCurrentAppointmentId()
					: options.currentAppointmentId;
				if (appointmentId && typeof options.loadAppointmentServices === 'function') {
					options.loadAppointmentServices();
				}

				const locked = typeof options.isLocked === 'function' ? Boolean(options.isLocked()) : Boolean(options.locked);
				if (locked) {
					window.setTimeout(() => {
						applyServiceModalLockState({ document: doc, serviceModal, locked: true });
					}, 100);
				}
			},
			onHidden(event) {
				if (typeof options.onHidden === 'function') {
					options.onHidden(event);
					return;
				}
				if (typeof options.syncAppointmentServices === 'function') {
					options.syncAppointmentServices();
				}
			},
			onSearchInput(keyword, event) {
				if (typeof options.onSearchInput === 'function') {
					options.onSearchInput(keyword, event);
					return;
				}
				setKeyword(keyword || '');
				setPage(1);
				rerenderCurrentPage();
			}
		});

		if (typeof options.renderSelectedServices === 'function') {
			options.renderSelectedServices();
		}
		if (typeof options.updateTotalServiceAmountDisplay === 'function') {
			options.updateTotalServiceAmountDisplay();
		}
		if (typeof options.scheduleAppointmentServiceSync === 'function') {
			options.scheduleAppointmentServiceSync();
		}
		return true;
	}

	function renderSelectedServices(options = {}) {
		const doc = getDocument(options);
		const selectedServices = Array.isArray(options.selectedServices) ? options.selectedServices : [];
		const listContainer = doc.getElementById('selectedServicesList');
		if (!listContainer) return;

		if (selectedServices.length === 0) {
			listContainer.innerHTML = '<p class="text-muted mb-0">Chưa có dịch vụ nào được chọn</p>';
			return;
		}

		const html = selectedServices.map(service => `
        <div class="selected-service-item" data-service-id="${service.id}">
            <div class="selected-service-header">
                <div class="selected-service-left">
                    <button type="button" class="btn-remove-service" data-service-action="remove" data-service-id="${service.id}">
                        <i class="bi bi-x-lg"></i>
                    </button>
                    <span class="selected-service-name">${service.name}</span>
                </div>
            </div>
            <div class="selected-service-fields">
                <div class="selected-service-field">
                    <label>Số lượng</label>
                    <input type="number" min="1" value="${service.quantity}" data-service-field="quantity" data-service-id="${service.id}">
                </div>
                <div class="selected-service-field">
                    <label>Thời gian (phút)</label>
                    <input type="number" min="0" value="${service.duration}" data-service-field="duration" data-service-id="${service.id}">
                </div>
                <div class="selected-service-field">
                    <label>Số tiền (VND)</label>
                    <input type="number" min="0" step="1000" value="${service.amount}" data-service-field="amount" data-service-id="${service.id}">
                </div>
            </div>
        </div>
    `).join('');

		listContainer.innerHTML = html;
		listContainer.querySelectorAll('[data-service-action="remove"]').forEach(button => {
			button.addEventListener('click', () => {
				const serviceId = Number(button.getAttribute('data-service-id'));
				if (Number.isNaN(serviceId)) return;
				if (typeof options.removeServiceFromList === 'function') {
					options.removeServiceFromList(serviceId);
				} else if (typeof window.removeServiceFromList === 'function') {
					window.removeServiceFromList(serviceId);
				}
			});
		});
		listContainer.querySelectorAll('[data-service-field][data-service-id]').forEach(input => {
			input.addEventListener('change', () => {
				const serviceId = Number(input.getAttribute('data-service-id'));
				const field = input.getAttribute('data-service-field');
				if (Number.isNaN(serviceId) || !field) return;
				if (typeof options.updateSelectedServiceField === 'function') {
					options.updateSelectedServiceField(serviceId, field, input.value);
				} else if (typeof window.updateSelectedServiceField === 'function') {
					window.updateSelectedServiceField(serviceId, field, input.value);
				}
			});
		});
	}

	function calculateTotalServiceAmount(services = [], toNumberFn = Number) {
		return (Array.isArray(services) ? services : []).reduce((sum, service) => {
			const quantity = toNumberFn(service.quantity, 0);
			const amount = toNumberFn(service.amount, 0);
			return sum + (quantity * amount);
		}, 0);
	}

	function updateTotalServiceAmountDisplay(options = {}) {
		const doc = getDocument(options);
		const totalElement = doc.getElementById('totalServiceAmount');
		const total = Number(options.total) || 0;
		const formatCurrency = typeof options.formatCurrency === 'function'
			? options.formatCurrency
			: value => String(value);

		if (totalElement) {
			totalElement.textContent = formatCurrency(total);
		}

		return total;
	}

	function setDisabledVisualState(element, locked) {
		if (!element) return;
		element.disabled = locked;
		element.style.pointerEvents = locked ? 'none' : '';
		element.style.opacity = locked ? '0.6' : '';
	}

	function setReadonlyVisualState(element, locked) {
		if (!element) return;
		if (locked) {
			element.setAttribute('readonly', 'readonly');
			element.style.pointerEvents = 'none';
		} else {
			element.removeAttribute('readonly');
			element.style.pointerEvents = '';
		}
	}

	function applyServiceModalLockState(options = {}) {
		const doc = getDocument(options);
		const serviceModal = options.serviceModal || doc.getElementById('serviceModal');
		if (!serviceModal) return;

		const locked = Boolean(options.locked);
		setReadonlyVisualState(serviceModal.querySelector('#serviceNameInput'), locked);

		serviceModal.querySelectorAll('.system-service-add').forEach(btn => {
			setDisabledVisualState(btn, locked);
		});

		serviceModal.querySelectorAll('.btn-remove-service').forEach(btn => {
			setDisabledVisualState(btn, locked);
		});

		serviceModal.querySelectorAll('#selectedServicesList input[type="number"]').forEach(el => {
			setReadonlyVisualState(el, locked);
		});

		setDisabledVisualState(serviceModal.querySelector('#systemServicesPrevBtn'), locked);
		setDisabledVisualState(serviceModal.querySelector('#systemServicesNextBtn'), locked);
	}

	function createSystemServiceCatalogAdapter(options = {}) {
		const doc = getDocument(options);
		const perPage = Number(options.perPage) || 5;

		function renderServices(services, keyword = '') {
			const result = renderSystemServices({
				document: doc,
				services,
				keyword,
				page: getSystemServicesStateValue(options, 'Page', 1),
				perPage
			});
			setSystemServicesStateValue(options, 'Total', result.total);
			setSystemServicesStateValue(options, 'TotalPages', result.totalPages);
			setSystemServicesStateValue(options, 'Page', result.page);
			return result;
		}

		function ensureLoaded(forceReload = false) {
			return ensureSystemServicesLoaded(forceReload, {
				...options,
				document: doc,
				perPage,
				renderSystemServices: renderServices
			});
		}

		return {
			renderSystemServices: renderServices,
			ensureSystemServicesLoaded: ensureLoaded
		};
	}

	const api = {
		renderSystemServices,
		updateSystemServicesPaginationDisplay,
		resetSystemServiceInputs,
		initializeServiceModalWorkflow,
		readSystemServiceItemPayload,
		ensureSystemServicesLoaded,
		createSystemServiceCatalogAdapter,
		bindServiceModalControls,
		renderSelectedServices,
		calculateTotalServiceAmount,
		updateTotalServiceAmountDisplay,
		applyServiceModalLockState
	};

	window.ClinicalServiceModalUiUtils = api;
	window.DoctorExaminationServiceModalUiUtils = api;
})(window);
