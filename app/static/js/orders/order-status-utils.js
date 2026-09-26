(function () {
	'use strict';

	const ORDER_STATUS_CONFIG = {
		survey_sent: { label: 'Đã gửi khảo sát', className: 'status-survey-sent' },
		has_result: { label: 'Có kết quả', className: 'status-has-result' },
		sent: { label: 'Chuyển thực hiện', className: 'status-sent' },
		completed: { label: 'Hoàn thành', className: 'status-completed' }
	};

	function getOrderStatusConfig(value) {
		return ORDER_STATUS_CONFIG[value] || { label: 'Chưa xác định', className: 'status-unknown' };
	}

	const api = {
		ORDER_STATUS_CONFIG,
		getOrderStatusConfig
	};

	window.ClinicalOrderStatusUtils = api;
})();
