import { DEFAULT_CONFIG, installServicesFormFns7 } from './doctor-services-form-parts/defaults-and-summary.js';

const REGISTRY = window.QLPKDoctorModuleRegistry;
if (!REGISTRY) throw new Error('Thiếu Doctor module registry');
const RUNTIME = REGISTRY.get('supportRuntime');
if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

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

function installServicesFormFns1(ctx) {
	function getDocument(context = {}) {
		return RUNTIME.getScopedDocument(context, ctx.config);
	}

	function requestJson(url, requestOptions = {}) {
		return RUNTIME.requestJson(url, requestOptions);
	}

	function getDomId(name) {
		return ctx.config.dom[name] || name;
	}

	function getEndpoint(name, args = {}) {
		const endpoint = ctx.config.endpoints[name];
		return typeof endpoint === 'function'
			? endpoint(args)
			: String(endpoint || '').replace('{appointmentId}', args.appointmentId || '').replace('{page}', args.page || '').replace('{perPage}', args.perPage || '');
	}

	function showToast(type, message, toastOptions = {}) {
		RUNTIME.showToast(type, message, toastOptions);
	}

	function getCurrentAppointmentId() {
		return RUNTIME.getCurrentAppointmentId(ctx.STATE);
	}

	function isCurrentToken(token, appointmentId = ctx.STATE.appointmentId) {
		return RUNTIME.isCurrentToken(ctx.STATE, token, appointmentId);
	}

	function markDirty() {
		ctx.CHANGES.mark();
	}

	function normalizeService(item = {}) {
		return {
			uid: `srv-${ctx.STATE.nextServiceRowId++}`,
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

	Object.assign(ctx, {
		getDocument, requestJson, getDomId, getEndpoint, showToast, getCurrentAppointmentId, isCurrentToken,
		markDirty, normalizeService, renderServiceRemoveButton
	});
}

function installServicesFormFns2(ctx) {
	function isCatalogServiceSelected(item) {
		const serviceId = normalizeId(item && item.id);
		return Boolean(serviceId) && ctx.STATE.services.some(service => service.serviceId === serviceId);
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
		const footer = getElement(doc, ctx.getDomId('selectionTotal'));
		const value = getElement(doc, ctx.getDomId('selectionTotalValue'));
		if (!footer || !value) return;
		footer.hidden = !ctx.STATE.services.length;
		value.textContent = formatCurrency(ctx.STATE.services.reduce((sum, service) => sum + getEstimatedTotal(service), 0));
	}

	function renderPagination(doc) {
		const pager = getElement(doc, ctx.getDomId('catalogPagination'));
		const status = getElement(doc, ctx.getDomId('catalogPageStatus'));
		const pageSelect = getElement(doc, ctx.getDomId('catalogPageSelect'));
		if (!pager) return;
		const page = Math.max(1, toNumber(ctx.STATE.serviceCatalogPagination.page, 1));
		const pages = Math.max(0, toNumber(ctx.STATE.serviceCatalogPagination.pages, 0));
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
			pageSelect.disabled = ctx.STATE.serviceCatalogLoading;
		}
		pager.querySelectorAll('[data-service-catalog-page]').forEach(button => {
			const previous = button.dataset.serviceCatalogPage === 'previous';
			button.disabled = ctx.STATE.serviceCatalogLoading || (previous ? page <= 1 : page >= pages);
		});
	}

	Object.assign(ctx, { isCatalogServiceSelected, renderEstimatedTotal, renderPagination });
}

function installServicesFormFns3(ctx) {
	function renderCatalog(doc) {
		const list = getElement(doc, ctx.getDomId('catalogList'));
		const empty = getElement(doc, ctx.getDomId('catalogEmpty'));
		if (!list) return;
		ctx.STATE.serviceOptions.clear();
		if (!ctx.STATE.serviceCatalog.length) {
			list.innerHTML = '';
			list.hidden = true;
			if (empty) empty.hidden = false;
			ctx.renderPagination(doc);
			return;
		}
		list.hidden = false;
		list.innerHTML = ctx.STATE.serviceCatalog.map(item => {
			const optionKey = `service:${item.id}`;
			const selected = ctx.isCatalogServiceSelected(item);
			ctx.STATE.serviceOptions.set(optionKey, item);
			return `<button type="button" class="doctor-service-catalog__item${selected ? ' is-selected' : ''}" data-service-catalog-select="${escapeAttr(optionKey)}" aria-pressed="${selected}" ${selected ? 'disabled' : ''}><span>${escapeHtml(item.name)}</span></button>`;
		}).join('');
		if (empty) empty.hidden = true;
		ctx.renderPagination(doc);
	}

	function renderServices(doc) {
		const list = getElement(doc, ctx.getDomId('selectionList'));
		const empty = getElement(doc, ctx.getDomId('selectionEmpty'));
		if (!list) return;
		if (!ctx.STATE.services.length) {
			list.innerHTML = '';
			list.hidden = true;
			if (empty) empty.hidden = false;
			ctx.renderEstimatedTotal(doc);
			renderCatalog(doc);
			return;
		}
		list.hidden = false;
		list.innerHTML = ctx.STATE.services.map(service => `<article class="doctor-service-selection__row" data-service-row-id="${escapeAttr(service.uid)}">
			<strong class="doctor-service-selection__name">${escapeHtml(service.name || 'Chưa đặt tên dịch vụ')}</strong>
			<span class="doctor-service-selection__price">${formatCurrency(service.amount)}</span>
			<label class="doctor-service-selection__quantity"><span class="visually-hidden">Số lượng ${escapeHtml(service.name || 'dịch vụ')}</span><input type="number" min="1" value="${escapeAttr(service.quantity)}" data-service-field="quantity" aria-label="Số lượng ${escapeAttr(service.name || 'dịch vụ')}"></label>
			${ctx.renderServiceRemoveButton()}
		</article>`).join('');
		if (empty) empty.hidden = true;
		ctx.renderEstimatedTotal(doc);
		renderCatalog(doc);
	}

	function resetContextData(doc) {
		ctx.STATE.services = [];
		ctx.STATE.servicesLoaded = false;
		ctx.CHANGES.reset();
		ctx.STATE.servicesSaving = false;
		ctx.STATE.serviceCatalog = [];
		ctx.STATE.serviceCatalogLoaded = false;
		ctx.STATE.serviceCatalogPage = 1;
		ctx.STATE.serviceCatalogPagination = { page: 1, perPage: ctx.SERVICE_CATALOG_PER_PAGE, total: 0, pages: 0 };
		ctx.STATE.serviceCatalogLoading = false;
		ctx.STATE.serviceCatalogRequestToken += 1;
		ctx.STATE.serviceOptions.clear();
		renderServices(doc);
		renderCatalog(doc);
	}

	Object.assign(ctx, { renderCatalog, renderServices, resetContextData });
}

function installServicesFormFns4(ctx) {
	async function loadServices(context) {
		const { doc, token, appointmentId } = context;
		try {
			const data = await ctx.requestJson(ctx.getEndpoint('appointment', { appointmentId }));
			if (!ctx.isCurrentToken(token, appointmentId)) return false;
			ctx.STATE.services = Array.isArray(data && data.services) ? data.services.map(ctx.normalizeService) : [];
			ctx.STATE.servicesLoaded = true;
			ctx.CHANGES.reset();
			ctx.renderServices(doc);
			return true;
		} catch (error) {
			if (ctx.isCurrentToken(token, appointmentId)) ctx.showToast('error', 'Không thể tải dịch vụ. Vui lòng thử lại.');
			return false;
		}
	}

	async function loadCatalog(context, requestedPage = ctx.STATE.serviceCatalogPage) {
		const { doc, token, appointmentId } = context;
		const page = Math.max(1, toNumber(requestedPage, 1));
		const requestToken = ++ctx.STATE.serviceCatalogRequestToken;
		ctx.STATE.serviceCatalogLoading = true;
		ctx.renderCatalog(doc);
		try {
			const data = await ctx.requestJson(ctx.getEndpoint('catalog', { page, perPage: ctx.SERVICE_CATALOG_PER_PAGE }));
			if (!ctx.isCurrentToken(token, appointmentId) || requestToken !== ctx.STATE.serviceCatalogRequestToken) return false;
			ctx.STATE.serviceCatalog = Array.isArray(data && data.services) ? data.services : [];
			const pagination = data && data.pagination ? data.pagination : {};
			ctx.STATE.serviceCatalogPage = Math.max(1, toNumber(pagination.page, page));
			ctx.STATE.serviceCatalogPagination = {
				page: ctx.STATE.serviceCatalogPage,
				perPage: Math.max(1, toNumber(pagination.per_page, ctx.SERVICE_CATALOG_PER_PAGE)),
				total: Math.max(0, toNumber(pagination.total, ctx.STATE.serviceCatalog.length)),
				pages: Math.max(0, toNumber(pagination.pages, 0))
			};
			ctx.STATE.serviceCatalogLoaded = true;
			ctx.STATE.serviceCatalogLoading = false;
			ctx.renderCatalog(doc);
			return true;
		} catch (error) {
			if (ctx.isCurrentToken(token, appointmentId) && requestToken === ctx.STATE.serviceCatalogRequestToken) {
				ctx.STATE.serviceCatalogLoading = false;
				ctx.renderCatalog(doc);
				ctx.showToast('error', 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.');
			}
			return false;
		}
	}

	function changeCatalogPage(doc, requestedPage) {
		const pages = Math.max(0, toNumber(ctx.STATE.serviceCatalogPagination.pages, 0));
		const page = Math.max(1, toNumber(requestedPage, 1));
		if (ctx.STATE.serviceCatalogLoading || page > pages) return false;
		const appointmentId = ctx.getCurrentAppointmentId();
		if (!appointmentId) return false;
		loadCatalog({ doc, token: ctx.STATE.contextToken, appointmentId }, page);
		return true;
	}

	Object.assign(ctx, { loadServices, loadCatalog, changeCatalogPage });
}

function installServicesFormFns5(ctx) {
	function collect() {
		return ctx.STATE.services.filter(service => service.name).map(service => ({
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
		const doc = ctx.getDocument(options);
		const appointmentId = ctx.getCurrentAppointmentId();
		if (!appointmentId) return { skipped: true, reason: 'missing-appointment' };
		if (ctx.STATE.isLoading && ctx.STATE.isLoading()) return { skipped: true, reason: 'loading' };
		if (!ctx.STATE.servicesLoaded) {
			const error = new Error('Chưa tải xong dịch vụ của lượt khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
			error.module = 'services';
			error.moduleLabel = 'Dịch vụ';
			throw error;
		}
		if (ctx.STATE.servicesSaving) return { skipped: true, reason: 'saving', module: 'services' };
		const revision = ctx.CHANGES.capture();
		ctx.STATE.servicesSaving = true;
		try {
			const data = await ctx.requestJson(ctx.getEndpoint('sync', { appointmentId }), {
				method: 'PUT',
				body: { services: collect() }
			});
			const hasNewChanges = !ctx.CHANGES.settle(revision);
			if (!hasNewChanges) {
				ctx.STATE.services = Array.isArray(data && data.services) ? data.services.map(ctx.normalizeService) : ctx.STATE.services;
				ctx.renderServices(doc);
			}
			ctx.showToast(hasNewChanges ? 'info' : 'success', hasNewChanges ? 'Đã lưu dịch vụ trước đó; có thay đổi mới cần lưu lại.' : 'Đã lưu dịch vụ', options);
			return { status: 'success', module: 'services', data, hasNewChanges };
		} finally {
			ctx.STATE.servicesSaving = false;
		}
	}

	function addFromCatalog(doc, optionKey) {
		const item = ctx.STATE.serviceOptions.get(optionKey);
		if (!item || ctx.isCatalogServiceSelected(item)) return false;
		ctx.STATE.services.push(ctx.normalizeService({ service_id: item.id, service_name: item.name, quantity: 1, duration_minutes: item.duration_minutes, unit_price: item.default_price }));
		ctx.markDirty();
		ctx.renderServices(doc);
		return true;
	}

	function handleInput(doc, target) {
		if (target.dataset.serviceField !== 'quantity') return false;
		const rowUid = getRowUidFromTarget(target, '[data-service-row-id]', 'data-service-row-id');
		const service = ctx.STATE.services.find(item => item.uid === rowUid);
		if (!service) return false;
		service.quantity = Math.max(1, toNumber(target.value, 1) || 1);
		ctx.markDirty();
		ctx.renderEstimatedTotal(doc);
		return true;
	}

	Object.assign(ctx, { collect, save, addFromCatalog, handleInput });
}

function installServicesFormFns6(ctx) {
	function bind(bindOptions = {}) {
		const doc = ctx.getDocument(bindOptions);
		ctx.STATE.isLoading = bindOptions.isLoading || ctx.STATE.isLoading;
		RUNTIME.configure(bindOptions);
		const root = getElement(doc, ctx.config.rootId);
		if (!root || ctx.STATE.bound) return Boolean(root);
		root.addEventListener('click', event => {
			const catalogSelect = event.target.closest('[data-service-catalog-select]');
			if (catalogSelect) {
				event.preventDefault();
				ctx.addFromCatalog(doc, catalogSelect.dataset.serviceCatalogSelect);
				return;
			}
			const pageButton = event.target.closest('[data-service-catalog-page]');
			if (pageButton) {
				event.preventDefault();
				const page = Math.max(1, toNumber(ctx.STATE.serviceCatalogPagination.page, 1));
				ctx.changeCatalogPage(doc, pageButton.dataset.serviceCatalogPage === 'previous' ? page - 1 : page + 1);
				return;
			}
			const rowAction = event.target.closest('[data-service-row-action]');
			if (!rowAction) return;
			event.preventDefault();
			const rowUid = getRowUidFromTarget(rowAction, '[data-service-row-id]', 'data-service-row-id');
			ctx.STATE.services = ctx.STATE.services.filter(service => service.uid !== rowUid);
			ctx.markDirty();
			ctx.renderServices(doc);
		});
		root.addEventListener('input', event => {
			if (event.target.dataset.serviceField) ctx.handleInput(doc, event.target);
		});
		root.addEventListener('change', event => {
			const Select = event.target?.ownerDocument?.defaultView?.HTMLSelectElement;
			if (Select && event.target instanceof Select && event.target.id === ctx.getDomId('catalogPageSelect')) {
				ctx.changeCatalogPage(doc, event.target.value);
			}
		});
		ctx.STATE.bound = true;
		return true;
	}

	function clear(options = {}) {
		const doc = ctx.getDocument(options);
		ctx.STATE.contextToken += 1;
		ctx.STATE.appointmentId = null;
		ctx.resetContextData(doc);
	}

	function load(context = {}) {
		const doc = ctx.getDocument(context);
		const appointment = context.payload || context.appointment || {};
		const appointmentId = normalizeId(context.appointmentId || appointment.id || (appointment.appointment && appointment.appointment.id));
		if (!appointmentId) return Promise.resolve(false);
		ctx.STATE.contextToken += 1;
		const token = ctx.STATE.contextToken;
		ctx.STATE.appointmentId = appointmentId;
		ctx.resetContextData(doc);
		return Promise.allSettled([
			ctx.loadServices({ doc, token, appointmentId }),
			ctx.loadCatalog({ doc, token, appointmentId })
		]).then(results => results.every(result => result.status === 'fulfilled' && result.value === true));
	}

	function getDraftSnapshot() {
		return { rows: draftRowsWithoutRuntimeIds(ctx.STATE.services) };
	}

	Object.assign(ctx, { bind, clear, load, getDraftSnapshot });
}

function create(options = {}) {
	const ctx = {};
	installServicesFormFns1(ctx);
	installServicesFormFns2(ctx);
	installServicesFormFns3(ctx);
	installServicesFormFns4(ctx);
	installServicesFormFns5(ctx);
	installServicesFormFns6(ctx);
	installServicesFormFns7(ctx);

	ctx.config = mergeConfig(options.config);
	ctx.SERVICE_CATALOG_PER_PAGE = Math.max(1, Number(ctx.config.perPage) || DEFAULT_CONFIG.perPage);
	ctx.STATE = {
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
		serviceCatalogPagination: { page: 1, perPage: ctx.SERVICE_CATALOG_PER_PAGE, total: 0, pages: 0 },
		serviceCatalogLoading: false,
		serviceCatalogRequestToken: 0,
		nextServiceRowId: 1,
		serviceOptions: new Map()
	};
	ctx.CHANGES = RUNTIME.createChangeTracker(ctx.STATE, { revisionKey: 'servicesRevision', dirtyKey: 'servicesDirty' });

	return {
		bind: ctx.bind,
		clear: ctx.clear,
		load: ctx.load,
		populate: ctx.load,
		collect: ctx.collect,
		save: ctx.save,
		hasUnsavedChanges: () => Boolean(ctx.STATE.servicesDirty),
		getDraftSnapshot: ctx.getDraftSnapshot,
		restoreDraftSnapshot: ctx.restoreDraftSnapshot,
		markRestoredRows: (doc, baseRows, draftRows) => markRestoredRows(doc, '[data-service-row-id]', changedRowIndexes(baseRows, draftRows)),
		getState: () => ctx.STATE,
		getConfig: () => ({ ...ctx.config, dom: { ...ctx.config.dom }, endpoints: { ...ctx.config.endpoints } })
	};
}

REGISTRY.register('servicesForm', { create, defaults: mergeConfig() }, {
	dependencies: ['supportRuntime', 'componentDomScope', 'iconSystem'],
	owner: 'doctor/services'
});
