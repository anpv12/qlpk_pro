(function () {
	'use strict';

	function sortOrderTreeNodes(list) {
		list.sort((a, b) => {
			const sortCompare = (a.sort_order || 0) - (b.sort_order || 0);
			if (sortCompare !== 0) return sortCompare;
			return (a.name || '').localeCompare(b.name || '');
		});
		list.forEach((node) => {
			if (node.children && node.children.length) {
				sortOrderTreeNodes(node.children);
			}
		});
	}

	function buildOrderTreeStructure(items = []) {
		const nodeMap = new Map();
		items.forEach((item) => {
			nodeMap.set(item.id, { ...item, children: [] });
		});

		const roots = [];
		nodeMap.forEach((node) => {
			const parentId = node.group_order_item_id;
			if (parentId && nodeMap.has(parentId)) {
				nodeMap.get(parentId).children.push(node);
			} else {
				roots.push(node);
			}
		});
		sortOrderTreeNodes(roots);
		return roots;
	}

	const api = {
		buildOrderTreeStructure,
		sortOrderTreeNodes
	};

	window.ClinicalOrderTreeUtils = api;
	window.DoctorExaminationOrderTreeUtils = api;
	window.PsychologistExaminationOrderTreeUtils = api;
})();
