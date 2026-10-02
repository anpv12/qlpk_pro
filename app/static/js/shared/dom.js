// Native DOM building blocks for ES module pages: nodes are created, never parsed from HTML strings.
//   el('button', { class: 'btn', dataset: { action: 'edit' }, title: 'Sửa' }, icon('bi-pencil'), 'Sửa')
// Props: class/className, text, dataset, hidden/disabled/checked (boolean), value (property), defaultValue (an input's
// value attribute, as markup would set it), any other attribute.
// Children: nodes, strings/numbers (text nodes), arrays; null/undefined/false are skipped.

export function byId(id) {
	return document.getElementById(id);
}

function applyProp(node, key, value) {
	if (value === undefined || value === null || value === false) return;
	if (key === 'class' || key === 'className') node.className = value;
	else if (key === 'text') node.textContent = String(value);
	else if (key === 'dataset') Object.entries(value).forEach(([name, data]) => { if (data != null) node.dataset[name] = String(data); });
	else if (key === 'value') node.value = String(value);
	else if (key === 'defaultValue') node.defaultValue = String(value);
	else if (value === true) node.setAttribute(key, '');
	else node.setAttribute(key, String(value));
}

export function append(node, children) {
	for (const child of children.flat(Infinity)) {
		if (child === null || child === undefined || child === false) continue;
		node.append(typeof child === 'object' && typeof child.nodeType === 'number' ? child : document.createTextNode(String(child)));
	}
	return node;
}

export function el(tag, props = {}, ...children) {
	const node = document.createElement(tag);
	Object.entries(props || {}).forEach(([key, value]) => applyProp(node, key, value));
	return append(node, children);
}

export function icon(name, className = '') {
	return el('i', { class: ['bi', name, className].filter(Boolean).join(' ') });
}

export function replace(node, ...children) {
	node.replaceChildren();
	return append(node, children);
}

export function on(target, type, handler, options) {
	target.addEventListener(type, handler, options);
	return () => target.removeEventListener(type, handler, options);
}

// One listener on a container for every current and future matching descendant.
export function delegate(root, type, selector, handler) {
	return on(root, type, event => {
		const match = event.target instanceof Element ? event.target.closest(selector) : null;
		if (match && root.contains(match)) handler(event, match);
	});
}

export function debounce(fn, wait) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), wait);
	};
}

export function setVisible(node, visible) {
	if (node) node.hidden = !visible;
}

// The one sanctioned HTML-string sink: printable documents produced by the shared document builders
// (prescriptions/shared/prescription-document-template.js; the medical record and service invoice builders in
// components/modal-history-data-runtime-parts/). They escape every data field and emit one markup for the screen
// preview, the print window and the PDF. Page UI and data must use el()/replace().
export function renderDocumentMarkup(node, documentHtml) {
	node.innerHTML = documentHtml;
	return node;
}
