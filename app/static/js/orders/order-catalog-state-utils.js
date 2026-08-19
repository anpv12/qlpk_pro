(function () {
	'use strict';

	function ensureOrderCatalogDefaultExpansion(state) {
		if (!state || state.expandedNodes.size) return;
		(state.treeRoots || []).forEach((node) => {
			state.expandedNodes.add(node.id);
		});
	}

	function rebuildOrderCatalogIndex(state) {
		if (!state) return;
		state.orderIndex = new Map();

		const walkNodes = (nodes = [], trail = []) => {
			nodes.forEach((node) => {
				const currentTrail = [...trail, node.name || 'Chỉ định'];
				const nodeId = Number(node.id);
				state.orderIndex.set(nodeId, {
					...node,
					breadcrumb: currentTrail.join(' › '),
				});
				if (node.children && node.children.length) {
					walkNodes(node.children, currentTrail);
				}
			});
		};

		walkNodes(state.treeRoots);
	}

	function syncSelectedOrdersWithIndex(state, onRender) {
		if (!state) return;
		if (!state.selectedOrders.length) {
			if (typeof onRender === 'function') onRender();
			return;
		}

		state.selectedOrders = state.selectedOrders.map((order) => {
			if (!order.order_item_id) return order;
			const latest = state.orderIndex.get(Number(order.order_item_id));
			if (!latest) return order;
			return {
				...order,
				order_name: order.order_name || latest.name || '',
				group_path: order.group_path || latest.breadcrumb || ''
			};
		});

		if (typeof onRender === 'function') onRender();
	}

	function toggleOrderCategoryNode(state, categoryId) {
		if (!state || !categoryId) return false;
		if (state.expandedNodes.has(categoryId)) {
			state.expandedNodes.delete(categoryId);
		} else {
			state.expandedNodes.add(categoryId);
		}
		return true;
	}

	function createOrderCatalogStateAdapter(options = {}) {
		const getState = typeof options.getState === 'function' ? options.getState : () => options.state;
		return {
			ensureDefaultExpansion() {
				return ensureOrderCatalogDefaultExpansion(getState());
			},
			rebuildIndex() {
				return rebuildOrderCatalogIndex(getState());
			},
			syncSelectedOrdersWithIndex() {
				return syncSelectedOrdersWithIndex(getState(), options.renderSelectedOrders);
			},
			toggleCategory(categoryId) {
				const toggled = toggleOrderCategoryNode(getState(), categoryId);
				if (toggled && typeof options.renderOrderCategoryTree === 'function') {
					options.renderOrderCategoryTree();
				}
				return toggled;
			}
		};
	}

	const api = {
		ensureOrderCatalogDefaultExpansion,
		rebuildOrderCatalogIndex,
		syncSelectedOrdersWithIndex,
		toggleOrderCategoryNode,
		createOrderCatalogStateAdapter
	};

	window.ClinicalOrderCatalogStateUtils = api;
	window.DoctorExaminationOrderCatalogStateUtils = api;
	window.PsychologistExaminationOrderCatalogStateUtils = api;
})();
