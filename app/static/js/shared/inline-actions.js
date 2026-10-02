// Delegated replacement for inline on*="" handlers so pages can run under a
// script-src CSP without 'unsafe-inline'.
//   <button data-qlpk-call="editService" data-qlpk-args='[12]'>        -> window.editService(12)
//   <select data-qlpk-call="render" data-qlpk-on="change">             -> on change instead of click
//   <a data-qlpk-call="switchTab" data-qlpk-args='["chi"]' data-qlpk-prevent> -> event.preventDefault()
// Dotted paths resolve from window and keep the owner as `this`
// (data-qlpk-call="CustomModal.closeModal"). Argument placeholders:
// "$this" = the element, "$event" = the event, "$value" = element.value.
// data-qlpk-self only fires when the element itself is the target
// (former `if (event.target === this)` guards); data-qlpk-stop stops
// propagation, including later document-level listeners. One element can
// bind several events with data-qlpk-on-<event>="fn" and
// data-qlpk-on-<event>-args='[...]' (focus/blur use focusin/focusout).
// ES module pages register their handlers here instead of on window:
//   window.QLPKInlineActions.register({ editService, deleteService });
// Registered names win over window lookups; dotted paths still resolve from window.
const CALL_ATTR = 'data-qlpk-call';
const registry = new Map();
const EVENTS = ['click', 'mousedown', 'change', 'input', 'keyup', 'keydown', 'submit', 'focusin', 'focusout'];

function resolvePath(path) {
	const name = String(path || '');
	if (registry.has(name)) return registry.get(name);
	return name.split('.').reduce((owner, key) => (owner == null ? undefined : owner[key]), window);
}

function resolveArgs(element, event, argsAttr = 'data-qlpk-args') {
	const raw = element.getAttribute(argsAttr);
	if (!raw) return [];
	let parsed;
	try {
		parsed = JSON.parse(raw);
	} catch (error) {
		throw new Error(`data-qlpk-args không phải JSON hợp lệ: ${raw}`);
		}
		const list = Array.isArray(parsed) ? parsed : [parsed];
	return list.map(value => {
		if (value === '$this') return element;
		if (value === '$event') return event;
		if (value === '$value') return element.value;
		return value;
	});
}

function findBinding(target, type) {
	const specific = target.closest(`[data-qlpk-on-${type}]`);
		if (specific) {
		return { element: specific, path: specific.getAttribute(`data-qlpk-on-${type}`), argsAttr: `data-qlpk-on-${type}-args` };
		}
		const generic = target.closest(`[${CALL_ATTR}]`);
		if (!generic || (generic.getAttribute('data-qlpk-on') || 'click') !== type) return null;
	return { element: generic, path: generic.getAttribute(CALL_ATTR), argsAttr: 'data-qlpk-args' };
}

function invoke(binding, event) {
	const { element, path } = binding;
	const callee = resolvePath(path);
	if (typeof callee !== 'function') {
		console.error(`[inline-actions] Không tìm thấy hàm "${path}" cho`, element);
			return;
	}
	if (element.hasAttribute('data-qlpk-prevent')) event.preventDefault();
	if (element.hasAttribute('data-qlpk-stop')) {
		event.stopPropagation();
		event.stopImmediatePropagation();
	}
	const ownerPath = path.includes('.') ? path.slice(0, path.lastIndexOf('.')) : '';
	callee.apply(ownerPath && !registry.has(path) ? resolvePath(ownerPath) : window, resolveArgs(element, event, binding.argsAttr));
}

function dispatch(event) {
	if (!(event.target instanceof Element)) return;
	const binding = findBinding(event.target, event.type);
	if (!binding) return;
	if (binding.element.hasAttribute('data-qlpk-self') && event.target !== binding.element) return;
	invoke(binding, event);
}

EVENTS.forEach(type => document.addEventListener(type, dispatch));
export const QLPKInlineActions = Object.freeze({
	register(actions) {
		Object.entries(actions).forEach(([name, fn]) => registry.set(name, fn));
	},
});
