(function () {
	'use strict';

	const DEPENDENCIES = {
		tree: { shared: 'ClinicalOrderTreeUtils', legacySuffix: 'OrderTreeUtils', getterName: 'getTreeUtils' },
		status: { shared: 'ClinicalOrderStatusUtils', legacySuffix: 'OrderStatusUtils', getterName: 'getStatusUtils' },
		catalogState: { shared: 'ClinicalOrderCatalogStateUtils', legacySuffix: 'OrderCatalogStateUtils', getterName: 'getCatalogStateUtils' },
		catalogRender: { shared: 'ClinicalOrderCatalogRenderUtils', legacySuffix: 'OrderCatalogRenderUtils', getterName: 'getCatalogRenderUtils' },
		catalogLoader: { shared: 'ClinicalOrderCatalogLoaderUtils', legacySuffix: 'OrderCatalogLoaderUtils', getterName: 'getCatalogLoaderUtils' },
		formUi: { shared: 'ClinicalOrderFormUiUtils', legacySuffix: 'OrderFormUiUtils', getterName: 'getFormUiUtils' },
		autocomplete: { shared: 'ClinicalOrderAutocompleteUtils', legacySuffix: 'OrderAutocompleteUtils', getterName: 'getAutocompleteUtils' },
		selectedTable: { shared: 'ClinicalOrderSelectedTableUiUtils', legacySuffix: 'OrderSelectedTableUiUtils', getterName: 'getSelectedTableUiUtils' },
		selectionState: { shared: 'ClinicalOrderSelectionStateUtils', legacySuffix: 'OrderSelectionStateUtils', getterName: 'getSelectionStateUtils' },
		performerLoader: { shared: 'ClinicalOrderPerformerLoaderUtils', legacySuffix: 'OrderPerformerLoaderUtils', getterName: 'getPerformerLoaderUtils' },
		performer: { shared: 'ClinicalOrderPerformerUtils', legacySuffix: 'OrderPerformerUtils', getterName: 'getPerformerUtils' },
		printUi: { shared: 'ClinicalOrderPrintUiUtils', legacySuffix: 'OrderPrintUiUtils', getterName: 'getPrintUiUtils' }
	};

	function getLegacyPrefix(context) {
		if (context === 'doctor') return 'DoctorExamination';
		if (context === 'psychologist') return 'PsychologistExamination';
		return '';
	}

	function resolveOrderDependency(key, context, win) {
		const dependency = DEPENDENCIES[key];
		if (!dependency) {
			throw new Error(`Unknown order dependency: ${key}`);
		}

		const legacyPrefix = getLegacyPrefix(context);
		const legacyName = legacyPrefix ? `${legacyPrefix}${dependency.legacySuffix}` : null;
		const resolved = win[dependency.shared] || (legacyName ? win[legacyName] : null);
		if (!resolved) {
			throw new Error(`${dependency.shared} is not loaded`);
		}
		return resolved;
	}

	function createOrderPageBridge(context, options = {}) {
		const win = options.window || window;
		const cache = {};

		function get(key) {
			if (!cache[key]) {
				cache[key] = resolveOrderDependency(key, context, win);
			}
			return cache[key];
		}

		const bridge = {
			get,
			buildOrderTreeStructure: (items = []) => get('tree').buildOrderTreeStructure(items),
			sortOrderTreeNodes: (list) => get('tree').sortOrderTreeNodes(list),
			getOrderStatusConfig: (value) => get('status').getOrderStatusConfig(value),
			getOrderFacilityLabel: (order) => get('performer').getOrderFacilityLabel(order),
			getOrderPerformerName: (order) => get('performer').getOrderPerformerName(order),
			groupOrdersByPerformer: (orders) => get('performer').groupOrdersByPerformer(orders),
			bindOrderPageInteractions(bindingOptions = {}) {
				const showToast = bindingOptions.showToast;
				const formAdapter = bindingOptions.formAdapter || {};
				const selectionActionsAdapter = bindingOptions.selectionActionsAdapter || {};
				const catalogStateAdapter = bindingOptions.catalogStateAdapter || {};
				const catalogLoaderAdapter = bindingOptions.catalogLoaderAdapter || {};
				const performerLoaderAdapter = bindingOptions.performerLoaderAdapter || {};
				const printAdapter = bindingOptions.printAdapter || {};
				const lockedStatusMessage = bindingOptions.lockedStatusMessage
					|| 'Không thể thay đổi trạng thái đã hoàn thành trong cơ sở. Trạng thái này được đồng bộ từ Quản lý chỉ định CLS.';
				const call = (adapter, method, ...args) => {
					if (!adapter || typeof adapter[method] !== 'function') return undefined;
					return adapter[method](...args);
				};
				const callbacks = {
					addSurveyTemplateToSelection: bindingOptions.addSurveyTemplateToSelection
						|| ((templateId) => call(formAdapter, 'addSurveyTemplateToSelection', templateId)),
					toggleOrderCategoryNode: bindingOptions.toggleOrderCategoryNode
						|| ((categoryId) => call(catalogStateAdapter, 'toggleCategory', categoryId)),
					addOrderToSelection: bindingOptions.addOrderToSelection
						|| ((orderId) => call(formAdapter, 'addOrderToSelection', orderId)),
					removeOrderFromSelection: bindingOptions.removeOrderFromSelection
						|| ((entryId) => call(selectionActionsAdapter, 'removeOrderFromSelection', entryId)),
					editOrderInSelection: bindingOptions.editOrderInSelection
						|| ((entryId) => call(formAdapter, 'editOrder', entryId)),
					updateOrderStatus: bindingOptions.updateOrderStatus
						|| ((orderTempId, newStatus) => call(selectionActionsAdapter, 'updateOrderStatus', orderTempId, newStatus)),
					clearSelectedOrders: bindingOptions.clearSelectedOrders
						|| (() => call(selectionActionsAdapter, 'clearSelectedOrders')),
					resetOrderFormNew: bindingOptions.resetOrderFormNew
						|| (() => call(formAdapter, 'resetForm')),
					handlePrintSelectedPerformer: bindingOptions.handlePrintSelectedPerformer
						|| (() => call(printAdapter, 'handlePrintSelectedPerformer')),
					handleOrderFormNewSubmit: bindingOptions.handleOrderFormNewSubmit
						|| ((event) => call(formAdapter, 'handleSubmit', event)),
					updateOrderFormNewLocationFields: bindingOptions.updateOrderFormNewLocationFields
						|| (() => call(formAdapter, 'updateLocationFields')),
					loadOrderPerformers: bindingOptions.loadOrderPerformers
						|| (() => call(performerLoaderAdapter, 'loadOrderPerformers')),
					setupOrderFormNewAutocomplete: bindingOptions.setupOrderFormNewAutocomplete
						|| (() => call(formAdapter, 'setupAutocomplete')),
					renderSelectedOrders: bindingOptions.renderSelectedOrders
						|| (() => call(selectionActionsAdapter, 'renderSelectedOrders')),
					loadOrderCatalogTree: bindingOptions.loadOrderCatalogTree
						|| ((forceReload) => call(catalogLoaderAdapter, 'loadOrderCatalogTree', forceReload))
				};
				const bound = {};

				if (bindingOptions.orderCategoryTreeEl) {
					bound.catalogTree = get('catalogRender').bindOrderCatalogTreeEvents(bindingOptions.orderCategoryTreeEl, {
						onSurveyTemplateSelect: callbacks.addSurveyTemplateToSelection,
						onCategoryToggle: callbacks.toggleOrderCategoryNode,
						onOrderSelect: callbacks.addOrderToSelection
					});
				}

				if (bindingOptions.orderSelectionsTableBody) {
					bound.selectedTable = get('selectedTable').bindSelectedOrdersTableEvents(bindingOptions.orderSelectionsTableBody, {
						getOrderStatusConfig: bindingOptions.getOrderStatusConfig || bridge.getOrderStatusConfig,
						onDelete: callbacks.removeOrderFromSelection,
						onEdit: callbacks.editOrderInSelection,
						onLockedStatusChange: bindingOptions.onLockedStatusChange || (() => {
							if (typeof showToast === 'function') showToast('warning', lockedStatusMessage);
						}),
						onStatusChange: bindingOptions.onStatusChange || (({ orderTempId, newStatus }) => {
							callbacks.updateOrderStatus(orderTempId, newStatus);
						})
					});
				}

				bound.formShell = get('formUi').bindOrderFormShell({
					clearButton: bindingOptions.orderClearBtn,
					addNewButton: bindingOptions.orderAddNewBtn,
					printInternalButton: bindingOptions.orderPrintInternalBtn,
					printExternalButton: bindingOptions.orderPrintExternalBtn,
					clearSelectedOrders: callbacks.clearSelectedOrders,
					resetOrderFormNew: callbacks.resetOrderFormNew,
					handlePrintSelectedPerformer: callbacks.handlePrintSelectedPerformer,
					handleSubmit: callbacks.handleOrderFormNewSubmit,
					updateLocationFields: callbacks.updateOrderFormNewLocationFields,
					loadOrderPerformers: callbacks.loadOrderPerformers,
					setupAutocomplete: callbacks.setupOrderFormNewAutocomplete,
					formatDateInput: bindingOptions.formatDateInput,
					hasSelectedOrders: bindingOptions.hasSelectedOrders,
					showToast,
					renderSelectedOrders: callbacks.renderSelectedOrders
				});

				bound.modalOpenButton = get('formUi').bindOrderModalOpenButton(bindingOptions.orderBtn, {
					modal: bindingOptions.modal || 'orderModal',
					loadCatalog: callbacks.loadOrderCatalogTree,
					loadOrders: bindingOptions.loadChiDinhFromServer,
					renderSelectedOrders: callbacks.renderSelectedOrders
				});

				return bound;
			}
		};

		Object.keys(DEPENDENCIES).forEach((key) => {
			bridge[DEPENDENCIES[key].getterName] = () => get(key);
		});

		return bridge;
	}

	window.ClinicalOrderPageBridgeUtils = {
		createOrderPageBridge,
		resolveOrderDependency
	};
})();
