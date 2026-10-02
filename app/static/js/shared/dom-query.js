// Selector-based field helpers for ES module pages. Like the jQuery calls they replace, they act on
// every match and do nothing when the selector matches nothing.
const all = selector => [...document.querySelectorAll(selector)];

// Value of the first match (undefined when nothing matches).
export function fieldValue(selector) {
    return document.querySelector(selector)?.value;
}

// null/undefined clear the field, other values are stringified.
export function setFieldValue(selector, value) {
    all(selector).forEach(node => { node.value = value == null ? '' : String(value); });
}

export function textOf(selector) {
    return all(selector).map(node => node.textContent).join('');
}

export function setText(selector, text) {
    all(selector).forEach(node => { node.textContent = text == null ? '' : String(text); });
}

export function setAttr(selector, name, value) {
    all(selector).forEach(node => node.setAttribute(name, String(value)));
}

export function setProp(selector, name, value) {
    all(selector).forEach(node => { node[name] = value; });
}

export function isChecked(selector) {
    return all(selector).some(node => node.checked);
}

export function addClass(selector, className) {
    const names = String(className).split(/\s+/).filter(Boolean);
    all(selector).forEach(node => node.classList.add(...names));
}

export function removeClass(selector, className) {
    const names = String(className).split(/\s+/).filter(Boolean);
    all(selector).forEach(node => node.classList.remove(...names));
}

export function toggleClass(selector, className, force) {
    const names = String(className).split(/\s+/).filter(Boolean);
    all(selector).forEach(node => names.forEach(name => node.classList.toggle(name, force)));
}

export function focusFirst(selector) {
    document.querySelector(selector)?.focus();
}

export function clearChildren(selector) {
    all(selector).forEach(node => node.replaceChildren());
}

export function removeAll(selector) {
    all(selector).forEach(node => node.remove());
}

export function showModal(selector) {
    const node = document.querySelector(selector);
    if (node) window.bootstrap.Modal.getOrCreateInstance(node).show();
}

export function hideModal(selector) {
    const node = document.querySelector(selector);
    if (node) window.bootstrap.Modal.getOrCreateInstance(node).hide();
}

const bound = new WeakMap();
const nodesOf = target => (typeof target === 'string' ? all(target) : [].concat(target).filter(Boolean));

// Replaces the listener previously bound under `key` for this event (the jQuery .off('type.ns').on('type.ns') pattern).
// The handler runs with `this` set to the element, like a jQuery handler.
export function rebind(target, type, key, handler) {
    nodesOf(target).forEach(node => {
        if (!bound.has(node)) bound.set(node, new Map());
        const listeners = bound.get(node);
        const id = `${type}|${key}`;
        if (listeners.has(id)) node.removeEventListener(type, listeners.get(id));
        const listener = event => handler.call(node, event);
        listeners.set(id, listener);
        node.addEventListener(type, listener);
    });
}

// Delegated variant: one listener on root for every current and future match of selector, `this` = the match.
export function rebindDelegate(root, type, selector, key, handler) {
    rebind(root, type, `${key}|${selector}`, event => {
        const match = event.target instanceof Element ? event.target.closest(selector) : null;
        if (match && root.contains(match)) handler.call(match, event);
    });
}

export function unbind(target, type, key) {
    nodesOf(target).forEach(node => {
        const listeners = bound.get(node);
        const id = `${type}|${key}`;
        if (listeners?.has(id)) {
            node.removeEventListener(type, listeners.get(id));
            listeners.delete(id);
        }
    });
}
