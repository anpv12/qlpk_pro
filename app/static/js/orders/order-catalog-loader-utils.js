(function () {
	'use strict';

	async function loadOrderCatalogData(options = {}) {
		const apiCall = options.apiCall;
		if (typeof apiCall !== 'function') {
			throw new Error('apiCall is required to load order catalog data');
		}

		const [orderResponse, surveyResponse] = await Promise.all([
			apiCall('/api/order-items?include_inactive=true'),
			apiCall('/api/survey-templates-for-orders')
		]);

		if (!orderResponse.ok) {
			throw new Error('Không thể tải danh mục chỉ định');
		}

		const orderPayload = await orderResponse.json();
		const items = Array.isArray(orderPayload.data) ? orderPayload.data : [];

		let surveyTemplates = [];
		if (surveyResponse.ok) {
			const surveyPayload = await surveyResponse.json();
			surveyTemplates = Array.isArray(surveyPayload.data) ? surveyPayload.data : [];
		}

		return { items, surveyTemplates };
	}

	async function loadOrderCatalogTree(forceReload = false, options = {}) {
		const state = options.state;
		if (!state) return false;

		if (state.isLoading) return false;
		if (state.fetched && !forceReload) {
			if (typeof options.renderOrderCategoryTree === 'function') {
				options.renderOrderCategoryTree();
			}
			return true;
		}

		const doc = options.document || document;
		const renderUtils = options.renderUtils;
		const treeElements = renderUtils?.getOrderCatalogTreeElements
			? renderUtils.getOrderCatalogTreeElements(doc)
			: null;
		if (renderUtils?.showOrderCatalogTreeLoading) {
			renderUtils.showOrderCatalogTreeLoading(treeElements);
		}

		state.isLoading = true;
		try {
			const { items, surveyTemplates } = await loadOrderCatalogData({ apiCall: options.apiCall });
			state.items = items;
			state.treeRoots = typeof options.buildOrderTreeStructure === 'function'
				? options.buildOrderTreeStructure(items)
				: items;
			state.surveyTemplates = surveyTemplates;

			state.fetched = true;
			state.expandedNodes = new Set();
			if (typeof options.rebuildOrderCatalogIndex === 'function') {
				options.rebuildOrderCatalogIndex();
			}
			if (typeof options.syncSelectedOrdersWithIndex === 'function') {
				options.syncSelectedOrdersWithIndex();
			}
			if (typeof options.renderOrderCategoryTree === 'function') {
				options.renderOrderCategoryTree();
			}
			return true;
		} catch (error) {
			if (options.console?.error) {
				options.console.error('Error loading order catalog:', error);
			}
			if (renderUtils?.renderOrderCatalogTreeError) {
				renderUtils.renderOrderCatalogTreeError(treeElements);
			}
			if (typeof options.showToast === 'function') {
				options.showToast('error', 'Không thể tải danh mục chỉ định. Vui lòng thử lại.');
			}
			return false;
		} finally {
			state.isLoading = false;
			if (renderUtils?.hideOrderCatalogTreeLoading) {
				renderUtils.hideOrderCatalogTreeLoading(treeElements);
			}
		}
	}

	function createOrderCatalogLoaderAdapter(options = {}) {
		return {
			loadOrderCatalogTree(forceReload = false) {
				const state = typeof options.getState === 'function' ? options.getState() : options.state;
				return loadOrderCatalogTree(forceReload, {
					...options,
					state
				});
			}
		};
	}

	const api = {
		loadOrderCatalogData,
		loadOrderCatalogTree,
		createOrderCatalogLoaderAdapter
	};

	window.ClinicalOrderCatalogLoaderUtils = api;
	window.DoctorExaminationOrderCatalogLoaderUtils = api;
	window.PsychologistExaminationOrderCatalogLoaderUtils = api;
})();
