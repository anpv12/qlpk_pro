(function (window, document) {
	'use strict';

	const REGISTRY = window.QLPKDoctorModuleRegistry;
	if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
	const RUNTIME = REGISTRY.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');
	const DEFAULT_DOM = {
		root: 'doctorServicePanel',
		selectionTotal: 'doctorServiceSelectionTotal',
		selectionTotalValue: 'doctorServiceSelectionTotalValue',
		catalogPagination: 'doctorServiceCatalogPagination',
		catalogPageStatus: 'doctorServiceCatalogPageStatus',
		catalogPageSelect: 'doctorServiceCatalogPageSelect',
		catalogList: 'doctorServiceCatalogList',
		catalogEmpty: 'doctorServiceCatalogEmptyState',
		selectionList: 'doctorServiceSelectionList',
		selectionEmpty: 'doctorServiceEmptyState'
	};
	const DEFAULT_ENDPOINTS = {
		appointment: ({ appointmentId }) => `/services/appointment/${appointmentId}`,
		catalog: ({ page, perPage }) => `/services/?page=${page}&per_page=${perPage}`,
		sync: ({ appointmentId }) => `/services/appointment/${appointmentId}/sync`
	};
	const DEFAULT_CONFIG = {
		rootId: 'doctorServicePanel',
		strictRoot: true,
		perPage: 24,
		dom: DEFAULT_DOM,
		endpoints: DEFAULT_ENDPOINTS
	};

	const mergeConfig = config => RUNTIME.mergeConfig(DEFAULT_CONFIG, config, ['dom', 'endpoints']);

	const {
		getElement,
		textOf,
		toNumber,
		normalizeId,
		escapeHtml,
		escapeAttr,
		formatCurrency,
		draftRowsWithoutRuntimeIds,
		markRestoredRows,
		changedRowIndexes,
		getRowUidFromTarget
	} = RUNTIME;

	function create(options = {}) {
		const config = mergeConfig(options.config);
		const SERVICE_CATALOG_PER_PAGE = Math.max(1, Number(config.perPage) || DEFAULT_CONFIG.perPage);
		function getDocument(context = {}) {
			return RUNTIME.getScopedDocument(context, config);
		}
		const STATE = {
			bound: false,
			contextToken: 0,
			appointmentId: null,
			isLoading: null,
			services: [],
			servicesLoaded: false,
			servicesDirty: false,
			servicesRevision: 0,
			servicesSaving: false,
			serviceCatalog: [],
			serviceCatalogLoaded: false,
			serviceCatalogPage: 1,
			serviceCatalogPagination: { page: 1, perPage: SERVICE_CATALOG_PER_PAGE, total: 0, pages: 0 },
			serviceCatalogLoading: false,
			serviceCatalogRequestToken: 0,
			nextServiceRowId: 1,
			serviceOptions: new Map()
		};
		const CHANGES = RUNTIME.createChangeTracker(STATE, { revisionKey: 'servicesRevision', dirtyKey: 'servicesDirty' });

		function requestJson(url, requestOptions = {}) {
			return RUNTIME.requestJson(url, requestOptions);
		}

		function getDomId(name) {
			return config.dom[name] || name;
		}

		function getEndpoint(name, args = {}) {
			const endpoint = config.endpoints[name];
			return typeof endpoint === 'function'
				? endpoint(args)
				: String(endpoint || '').replace('{appointmentId}', args.appointmentId || '').replace('{page}', args.page || '').replace('{perPage}', args.perPage || '');
		}

		function showToast(type, message, toastOptions = {}) {
			RUNTIME.showToast(type, message, toastOptions);
		}

		function getCurrentAppointmentId() {
			return RUNTIME.getCurrentAppointmentId(STATE);
		}

		function isCurrentToken(token, appointmentId = STATE.appointmentId) {
			return RUNTIME.isCurrentToken(STATE, token, appointmentId);
		}

		function markDirty() {
			CHANGES.mark();
		}

		function normalizeService(item = {}) {
			return {
				uid: `srv-${STATE.nextServiceRowId++}`,
				id: normalizeId(item.id || item.appointmentServiceId),
				serviceId: normalizeId(item.service_id || item.serviceId),
				name: textOf(item.service_name || item.name),
				quantity: Math.max(1, toNumber(item.quantity, 1) || 1),
				duration: Math.max(0, toNumber(item.duration_minutes ?? item.duration, 0)),
				amount: Math.max(0, toNumber(item.unit_price ?? item.price ?? item.amount ?? item.default_price, 0)),
				note: textOf(item.note || item.description),
				discountPercent: Math.max(0, toNumber(item.discount_percent, 0)),
				taxPercent: Math.max(0, toNumber(item.tax_percent, 0))
			};
		}

		function renderServiceRemoveButton() {
			const iconSystem = REGISTRY.get('iconSystem');
			if (iconSystem && typeof iconSystem.renderActionButton === 'function') {
				return iconSystem.renderActionButton({
					action: 'delete',
					title: 'Xóa dịch vụ',
					label: 'Xóa dịch vụ',
					attrs: { 'data-service-row-action': 'remove' },
					className: 'doctor-service-selection__remove'
				});
			}
			return '<button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" class="doctor-workspace-button doctor-service-selection__remove" data-service-row-action="remove">Xóa</button>';
		}

		function isCatalogServiceSelected(item) {
			const serviceId = normalizeId(item && item.id);
			return Boolean(serviceId) && STATE.services.some(service => service.serviceId === serviceId);
		}

		function getEstimatedTotal(service) {
			const amount = Math.max(0, toNumber(service && service.amount, 0));
			const quantity = Math.max(1, toNumber(service && service.quantity, 1) || 1);
			const discount = Math.max(0, toNumber(service && service.discountPercent, 0));
			const tax = Math.max(0, toNumber(service && service.taxPercent, 0));
			const subtotal = amount * quantity;
			const discounted = subtotal - (subtotal * discount / 100);
			return discounted + (discounted * tax / 100);
		}

		function renderEstimatedTotal(doc) {
			const footer = getElement(doc, getDomId('selectionTotal'));
			const value = getElement(doc, getDomId('selectionTotalValue'));
			if (!footer || !value) return;
			footer.hidden = !STATE.services.length;
			value.textContent = formatCurrency(STATE.services.reduce((sum, service) => sum + getEstimatedTotal(service), 0));
		}

		function renderPagination(doc) {
			const pager = getElement(doc, getDomId('catalogPagination'));
			const status = getElement(doc, getDomId('catalogPageStatus'));
			const pageSelect = getElement(doc, getDomId('catalogPageSelect'));
			if (!pager) return;
			const page = Math.max(1, toNumber(STATE.serviceCatalogPagination.page, 1));
			const pages = Math.max(0, toNumber(STATE.serviceCatalogPagination.pages, 0));
			const visible = pages > 1;
			pager.hidden = !visible;
			if (status) status.textContent = visible ? `${page} / ${pages}` : '';
			if (pageSelect) {
				pageSelect.innerHTML = visible
					? Array.from({ length: pages }, (_, index) => {
						const value = index + 1;
						return `<option value="${value}"${value === page ? ' selected' : ''}>Trang ${value} / ${pages}</option>`;
					}).join('')
					: '';
				pageSelect.disabled = STATE.serviceCatalogLoading;
			}
			pager.querySelectorAll('[data-service-catalog-page]').forEach(button => {
				const previous = button.dataset.serviceCatalogPage === 'previous';
				button.disabled = STATE.serviceCatalogLoading || (previous ? page <= 1 : page >= pages);
			});
		}

		function renderCatalog(doc) {
			const list = getElement(doc, getDomId('catalogList'));
			const empty = getElement(doc, getDomId('catalogEmpty'));
			if (!list) return;
			STATE.serviceOptions.clear();
			if (!STATE.serviceCatalog.length) {
				list.innerHTML = '';
				list.hidden = true;
				if (empty) empty.hidden = false;
				renderPagination(doc);
				return;
			}
			list.hidden = false;
			list.innerHTML = STATE.serviceCatalog.map(item => {
				const optionKey = `service:${item.id}`;
				const selected = isCatalogServiceSelected(item);
				STATE.serviceOptions.set(optionKey, item);
				return `<button type="button" class="doctor-service-catalog__item${selected ? ' is-selected' : ''}" data-service-catalog-select="${escapeAttr(optionKey)}" aria-pressed="${selected}" ${selected ? 'disabled' : ''}><span>${escapeHtml(item.name)}</span></button>`;
			}).join('');
			if (empty) empty.hidden = true;
			renderPagination(doc);
		}

		function renderServices(doc) {
			const list = getElement(doc, getDomId('selectionList'));
			const empty = getElement(doc, getDomId('selectionEmpty'));
			if (!list) return;
			if (!STATE.services.length) {
				list.innerHTML = '';
				list.hidden = true;
				if (empty) empty.hidden = false;
				renderEstimatedTotal(doc);
				renderCatalog(doc);
				return;
			}
			list.hidden = false;
			list.innerHTML = STATE.services.map(service => `<article class="doctor-service-selection__row" data-service-row-id="${escapeAttr(service.uid)}">
				<strong class="doctor-service-selection__name">${escapeHtml(service.name || 'Chưa đặt tên dịch vụ')}</strong>
				<span class="doctor-service-selection__price">${formatCurrency(service.amount)}</span>
				<label class="doctor-service-selection__quantity"><span class="visually-hidden">Số lượng ${escapeHtml(service.name || 'dịch vụ')}</span><input type="number" min="1" value="${escapeAttr(service.quantity)}" data-service-field="quantity" aria-label="Số lượng ${escapeAttr(service.name || 'dịch vụ')}"></label>
				${renderServiceRemoveButton()}
			</article>`).join('');
			if (empty) empty.hidden = true;
			renderEstimatedTotal(doc);
			renderCatalog(doc);
		}

		function resetContextData(doc) {
			STATE.services = [];
			STATE.servicesLoaded = false;
			CHANGES.reset();
			STATE.servicesSaving = false;
			STATE.serviceCatalog = [];
			STATE.serviceCatalogLoaded = false;
			STATE.serviceCatalogPage = 1;
			STATE.serviceCatalogPagination = { page: 1, perPage: SERVICE_CATALOG_PER_PAGE, total: 0, pages: 0 };
			STATE.serviceCatalogLoading = false;
			STATE.serviceCatalogRequestToken += 1;
			STATE.serviceOptions.clear();
			renderServices(doc);
			renderCatalog(doc);
		}

		async function loadServices(context) {
			const { doc, token, appointmentId } = context;
			try {
				const data = await requestJson(getEndpoint('appointment', { appointmentId }));
				if (!isCurrentToken(token, appointmentId)) return false;
				STATE.services = Array.isArray(data && data.services) ? data.services.map(normalizeService) : [];
				STATE.servicesLoaded = true;
				CHANGES.reset();
				renderServices(doc);
				return true;
			} catch (error) {
				if (isCurrentToken(token, appointmentId)) showToast('error', 'Không thể tải dịch vụ. Vui lòng thử lại.');
				return false;
			}
		}

		async function loadCatalog(context, requestedPage = STATE.serviceCatalogPage) {
			const { doc, token, appointmentId } = context;
			const page = Math.max(1, toNumber(requestedPage, 1));
			const requestToken = ++STATE.serviceCatalogRequestToken;
			STATE.serviceCatalogLoading = true;
			renderCatalog(doc);
			try {
				const data = await requestJson(getEndpoint('catalog', { page, perPage: SERVICE_CATALOG_PER_PAGE }));
				if (!isCurrentToken(token, appointmentId) || requestToken !== STATE.serviceCatalogRequestToken) return false;
				STATE.serviceCatalog = Array.isArray(data && data.services) ? data.services : [];
				const pagination = data && data.pagination ? data.pagination : {};
				STATE.serviceCatalogPage = Math.max(1, toNumber(pagination.page, page));
				STATE.serviceCatalogPagination = {
					page: STATE.serviceCatalogPage,
					perPage: Math.max(1, toNumber(pagination.per_page, SERVICE_CATALOG_PER_PAGE)),
					total: Math.max(0, toNumber(pagination.total, STATE.serviceCatalog.length)),
					pages: Math.max(0, toNumber(pagination.pages, 0))
				};
				STATE.serviceCatalogLoaded = true;
				STATE.serviceCatalogLoading = false;
				renderCatalog(doc);
				return true;
			} catch (error) {
				if (isCurrentToken(token, appointmentId) && requestToken === STATE.serviceCatalogRequestToken) {
					STATE.serviceCatalogLoading = false;
					renderCatalog(doc);
					showToast('error', 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.');
				}
				return false;
			}
		}

		function changeCatalogPage(doc, requestedPage) {
			const pages = Math.max(0, toNumber(STATE.serviceCatalogPagination.pages, 0));
			const page = Math.max(1, toNumber(requestedPage, 1));
			if (STATE.serviceCatalogLoading || page > pages) return false;
			const appointmentId = getCurrentAppointmentId();
			if (!appointmentId) return false;
			loadCatalog({ doc, token: STATE.contextToken, appointmentId }, page);
			return true;
		}

		function collect() {
			return STATE.services.filter(service => service.name).map(service => ({
				id: service.id || undefined,
				service_id: service.serviceId || undefined,
				service_name: service.name,
				quantity: Math.max(1, toNumber(service.quantity, 1) || 1),
				unit_price: toNumber(service.amount, 0),
				duration_minutes: Math.max(0, toNumber(service.duration, 0)),
				note: service.note || '',
				discount_percent: service.discountPercent || undefined,
				tax_percent: service.taxPercent || undefined
			}));
		}

		async function save(options = {}) {
			const doc = getDocument(options);
			const appointmentId = getCurrentAppointmentId();
			if (!appointmentId) return { skipped: true, reason: 'missing-appointment' };
			if (STATE.isLoading && STATE.isLoading()) return { skipped: true, reason: 'loading' };
			if (!STATE.servicesLoaded) {
				const error = new Error('Chưa tải xong dịch vụ của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
				error.module = 'services';
				error.moduleLabel = 'Dịch vụ';
				throw error;
			}
			if (STATE.servicesSaving) return { skipped: true, reason: 'saving', module: 'services' };
			const revision = CHANGES.capture();
			STATE.servicesSaving = true;
			try {
				const data = await requestJson(getEndpoint('sync', { appointmentId }), {
					method: 'PUT',
					body: { services: collect() }
				});
				const hasNewChanges = !CHANGES.settle(revision);
				if (!hasNewChanges) {
					STATE.services = Array.isArray(data && data.services) ? data.services.map(normalizeService) : STATE.services;
					renderServices(doc);
				}
				showToast(hasNewChanges ? 'info' : 'success', hasNewChanges ? 'Đã lưu dịch vụ trước đó; có thay đổi mới cần lưu lại.' : 'Đã lưu dịch vụ', options);
				return { status: 'success', module: 'services', data, hasNewChanges };
			} finally {
				STATE.servicesSaving = false;
			}
		}

		function addFromCatalog(doc, optionKey) {
			const item = STATE.serviceOptions.get(optionKey);
			if (!item || isCatalogServiceSelected(item)) return false;
			STATE.services.push(normalizeService({ service_id: item.id, service_name: item.name, quantity: 1, duration_minutes: item.duration_minutes, unit_price: item.default_price }));
			markDirty();
			renderServices(doc);
			return true;
		}

		function handleInput(doc, target) {
			if (target.dataset.serviceField !== 'quantity') return false;
			const rowUid = getRowUidFromTarget(target, '[data-service-row-id]', 'data-service-row-id');
			const service = STATE.services.find(item => item.uid === rowUid);
			if (!service) return false;
			service.quantity = Math.max(1, toNumber(target.value, 1) || 1);
			markDirty();
			renderEstimatedTotal(doc);
			return true;
		}

		function bind(bindOptions = {}) {
			const doc = getDocument(bindOptions);
			STATE.isLoading = bindOptions.isLoading || STATE.isLoading;
			RUNTIME.configure(bindOptions);
			const root = getElement(doc, config.rootId);
			if (!root || STATE.bound) return Boolean(root);
			root.addEventListener('click', event => {
				const catalogSelect = event.target.closest('[data-service-catalog-select]');
				if (catalogSelect) {
					event.preventDefault();
					addFromCatalog(doc, catalogSelect.dataset.serviceCatalogSelect);
					return;
				}
				const pageButton = event.target.closest('[data-service-catalog-page]');
				if (pageButton) {
					event.preventDefault();
					const page = Math.max(1, toNumber(STATE.serviceCatalogPagination.page, 1));
					changeCatalogPage(doc, pageButton.dataset.serviceCatalogPage === 'previous' ? page - 1 : page + 1);
					return;
				}
				const rowAction = event.target.closest('[data-service-row-action]');
				if (!rowAction) return;
				event.preventDefault();
				const rowUid = getRowUidFromTarget(rowAction, '[data-service-row-id]', 'data-service-row-id');
				STATE.services = STATE.services.filter(service => service.uid !== rowUid);
				markDirty();
				renderServices(doc);
			});
			root.addEventListener('input', event => {
				if (event.target.dataset.serviceField) handleInput(doc, event.target);
			});
			root.addEventListener('change', event => {
				const Select = event.target?.ownerDocument?.defaultView?.HTMLSelectElement;
				if (Select && event.target instanceof Select && event.target.id === getDomId('catalogPageSelect')) {
					changeCatalogPage(doc, event.target.value);
				}
			});
			STATE.bound = true;
			return true;
		}

		function clear(options = {}) {
			const doc = getDocument(options);
			STATE.contextToken += 1;
			STATE.appointmentId = null;
			resetContextData(doc);
		}

		function load(context = {}) {
			const doc = getDocument(context);
			const appointment = context.payload || context.appointment || {};
			const appointmentId = normalizeId(context.appointmentId || appointment.id || (appointment.appointment && appointment.appointment.id));
			if (!appointmentId) return Promise.resolve(false);
			STATE.contextToken += 1;
			const token = STATE.contextToken;
			STATE.appointmentId = appointmentId;
			resetContextData(doc);
			return Promise.allSettled([
				loadServices({ doc, token, appointmentId }),
				loadCatalog({ doc, token, appointmentId })
			]).then(results => results.every(result => result.status === 'fulfilled' && result.value === true));
		}

		function getDraftSnapshot() {
			return { rows: draftRowsWithoutRuntimeIds(STATE.services) };
		}

		function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
			const doc = getDocument(restoreOptions);
			STATE.services = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map(row => normalizeService({
				id: row.id,
				service_id: row.serviceId,
				service_name: row.name,
				quantity: row.quantity,
				duration_minutes: row.duration,
				unit_price: row.amount,
				note: row.note,
				discount_percent: row.discountPercent,
				tax_percent: row.taxPercent
			}));
			CHANGES.restore(restoreOptions.dirty);
			renderServices(doc);
			return true;
		}

		return {
			bind,
			clear,
			load,
			populate: load,
			collect,
			save,
			hasUnsavedChanges: () => Boolean(STATE.servicesDirty),
			getDraftSnapshot,
			restoreDraftSnapshot,
			markRestoredRows: (doc, baseRows, draftRows) => markRestoredRows(doc, '[data-service-row-id]', changedRowIndexes(baseRows, draftRows)),
			getState: () => STATE,
			getConfig: () => ({ ...config, dom: { ...config.dom }, endpoints: { ...config.endpoints } })
		};
	}

	REGISTRY.register('servicesForm', { create, defaults: mergeConfig() }, {
		dependencies: ['supportRuntime', 'componentDomScope', 'iconSystem'],
		owner: 'doctor/services'
	});
})(window, document);
