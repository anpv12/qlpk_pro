(function (window) {
	'use strict';

	function normalizeSearchText(value) {
		if (value === undefined || value === null) return '';
		return String(value)
			.normalize('NFKD')
			.toLowerCase()
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/đ/g, 'd')
			.trim();
	}

	function contains(value, query) {
		const normalizedQuery = normalizeSearchText(query);
		return !normalizedQuery || normalizeSearchText(value).includes(normalizedQuery);
	}

	window.QLPKSearchNormalization = Object.freeze({
		normalizeSearchText,
		contains
	});
})(window);
