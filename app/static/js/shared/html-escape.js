// Escape text before it is interpolated into an HTML string (innerHTML, template rows).
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;', '`': '&#096;' };
function escape(value) {
	if (value === null || value === undefined) return '';
	return String(value).replace(/[&<>"'`]/g, character => ENTITIES[character]);
}
export const QLPKHtml = Object.freeze({ escape });
