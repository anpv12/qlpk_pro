(function () {
	'use strict';

	const ORDER_STATUS_CONFIG = {
		draft: { label: 'Dự thảo', className: 'status-draft' },
		sent: { label: 'Chuyển thực hiện', className: 'status-sent' },
		completed: { label: 'Hoàn thành', className: 'status-completed' }
	};

	function getOrderStatusConfig(value) {
		return ORDER_STATUS_CONFIG[value] || ORDER_STATUS_CONFIG.sent;
	}

	const api = {
		ORDER_STATUS_CONFIG,
		getOrderStatusConfig
	};

	window.ClinicalOrderStatusUtils = api;
	window.DoctorExaminationOrderStatusUtils = api;
	window.PsychologistExaminationOrderStatusUtils = api;
})();
