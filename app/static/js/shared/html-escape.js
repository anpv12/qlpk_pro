// Escape text before it is interpolated into an HTML string (innerHTML, template rows).
(function (window) {
	'use strict';
	const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '`': '&#096;' };
	function escape(value) {
		if (value === null || value === undefined) return '';
		return String(value).replace(/[&<>"'`]/g, character => ENTITIES[character]);
	}
	window.QLPKHtml = Object.freeze({ escape });
})(window);
