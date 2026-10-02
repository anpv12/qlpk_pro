// The page's date formatter (dd/mm/yyyy display). Each page's shared runtime sets it once — utils.js,
// receptionist/formatters.js or the doctor/psychologist page runtime, in page load order — and shared
// components read it; null on a page that sets none.
let pageDateFormatter = null;

export function setPageDateFormatter(formatter) {
	pageDateFormatter = typeof formatter === 'function' ? formatter : null;
}

export function getPageDateFormatter() {
	return pageDateFormatter;
}
