(function () {
	'use strict';

	function getOrderFacilityLabel(order) {
		if (order.location_type === 'out') {
			return order.out_facility || order.performer || 'Cơ sở ngoài';
		}
		return order.in_house_unit || order.performer || 'Trong cơ sở';
	}

	function getOrderPerformerName(order) {
		if (order.location_type === 'out') {
			return order.out_facility || order.performer || 'Không xác định';
		}
		return order.in_house_unit || order.performer || 'Không xác định';
	}

	function groupOrdersByPerformer(orders) {
		if (!orders || orders.length === 0) return [];

		const grouped = {};
		orders.forEach(order => {
			const performerName = getOrderPerformerName(order);
			if (!grouped[performerName]) grouped[performerName] = [];
			grouped[performerName].push(order);
		});

		return Object.keys(grouped)
			.map(performerName => ({
				performerName,
				orders: grouped[performerName],
				count: grouped[performerName].length
			}))
			.sort((a, b) => a.performerName.localeCompare(b.performerName, 'vi'));
	}

	const api = {
		getOrderFacilityLabel,
		getOrderPerformerName,
		groupOrdersByPerformer
	};

	window.ClinicalOrderPerformerUtils = api;
	window.DoctorExaminationOrderPerformerUtils = api;
	window.PsychologistExaminationOrderPerformerUtils = api;
})();
