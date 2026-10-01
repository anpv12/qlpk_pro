'use strict';
const NativeFormData = globalThis.FormData;
// Minimal DOM for node:test suites of ES module pages (no jsdom dependency). Covers what the
// pages use: element tree + HTML fragment parser, attributes/dataset/classList, form values,
// CSS selectors (tag, #id, .class, [attr], [attr="v"], :not(), descendant and child combinators,
// comma lists), bubbling events with preventDefault/stopPropagation, focus and form reset.

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', '#39': "'", '#039': "'" };
const decode = text => text.replace(/&(#?\w+);/g, (all, name) => ENTITIES[name] ?? (name.startsWith('#') ? String.fromCharCode(Number(name.slice(1))) : all));
const escapeText = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const camel = name => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const kebab = name => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

class Event {
    constructor(type, init = {}) {
        Object.assign(this, { type, bubbles: init.bubbles !== false, defaultPrevented: false, target: null, currentTarget: null, detail: init.detail });
        this.propagationStopped = false;
        this.immediateStopped = false;
    }
    preventDefault() { this.defaultPrevented = true; }
    stopPropagation() { this.propagationStopped = true; }
    stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; }
}

class EventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler, options) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push({ handler, once: Boolean(options && options.once) });
    }
    removeEventListener(type, handler) {
        const list = this.listeners.get(type) || [];
        this.listeners.set(type, list.filter(entry => entry.handler !== handler));
    }
    fire(event) {
        event.currentTarget = this;
        for (const entry of [...(this.listeners.get(event.type) || [])]) {
            if (entry.once) this.removeEventListener(event.type, entry.handler);
            entry.handler.call(this, event);
            if (event.immediateStopped) break;
        }
    }
    dispatchEvent(event) {
        event.target = event.target || this;
        let node = this;
        while (node) {
            node.fire(event);
            if (!event.bubbles || event.propagationStopped) break;
            node = node.parentNode || (node.nodeType === 9 ? node.defaultView : null);
        }
        return !event.defaultPrevented;
    }
}

class Node extends EventTarget {
    constructor(nodeType, ownerDocument) {
        super();
        this.nodeType = nodeType;
        this.ownerDocument = ownerDocument;
        this.childNodes = [];
        this.parentNode = null;
    }
    get parentElement() { return this.parentNode && this.parentNode.nodeType === 1 ? this.parentNode : null; }
    get isConnected() { let node = this; while (node.parentNode) node = node.parentNode; return node.nodeType === 9; }
    get firstChild() { return this.childNodes[0] || null; }
    get textContent() { return this.childNodes.map(child => child.textContent).join(''); }
    set textContent(value) { this.replaceChildren(); if (value !== '') this.append(String(value)); }
    appendChild(child) {
        if (child.nodeType === 11) { [...child.childNodes].forEach(node => this.appendChild(node)); return child; }
        child.remove();
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    insertBefore(child, reference) {
        if (!reference) return this.appendChild(child);
        child.remove();
        child.parentNode = this;
        this.childNodes.splice(this.childNodes.indexOf(reference), 0, child);
        return child;
    }
    removeChild(child) { child.remove(); return child; }
    remove() {
        if (!this.parentNode) return;
        const siblings = this.parentNode.childNodes;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentNode = null;
    }
    append(...nodes) { nodes.forEach(node => this.appendChild(typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node)); }
    prepend(...nodes) { nodes.reverse().forEach(node => this.insertBefore(typeof node === 'string' ? this.ownerDocument.createTextNode(node) : node, this.firstChild)); }
    replaceChildren(...nodes) { [...this.childNodes].forEach(child => child.remove()); this.append(...nodes); }
    contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
}

class Text extends Node {
    constructor(data, ownerDocument) { super(3, ownerDocument); this.data = String(data); }
    get textContent() { return this.data; }
    set textContent(value) { this.data = String(value); }
    get outerHTML() { return escapeText(this.data); }
    cloneNode() { return this.ownerDocument.createTextNode(this.data); }
}

class DocumentFragment extends Node {
    constructor(ownerDocument) { super(11, ownerDocument); }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    querySelector(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).find(node => node.matches(selector)) || null; }
}

function classList(element) {
    const read = () => (element.getAttribute('class') || '').split(/\s+/).filter(Boolean);
    const write = list => element.setAttribute('class', list.join(' '));
    return {
        add: (...names) => write([...new Set([...read(), ...names])]),
        remove: (...names) => write(read().filter(name => !names.includes(name))),
        contains: name => read().includes(name),
        toggle(name, force) {
            const on = force === undefined ? !read().includes(name) : Boolean(force);
            on ? this.add(name) : this.remove(name);
            return on;
        },
        get length() { return read().length; },
        [Symbol.iterator]: () => read()[Symbol.iterator](),
    };
}

class Element extends Node {
    constructor(tagName, ownerDocument) {
        super(1, ownerDocument);
        this.tagName = tagName.toUpperCase();
        this.localName = tagName.toLowerCase();
        this.attributes = new Map();
        this.classList = classList(this);
        this.dataset = new Proxy({}, {
            get: (_, key) => (typeof key === 'string' ? this.getAttribute(`data-${kebab(key)}`) ?? undefined : undefined),
            set: (_, key, value) => { this.setAttribute(`data-${kebab(key)}`, String(value)); return true; },
            deleteProperty: (_, key) => { this.removeAttribute(`data-${kebab(key)}`); return true; },
            has: (_, key) => this.hasAttribute(`data-${kebab(key)}`),
            ownKeys: () => [...this.attributes.keys()].filter(name => name.startsWith('data-')).map(name => camel(name.slice(5))),
            getOwnPropertyDescriptor: (_, key) => (this.hasAttribute(`data-${kebab(key)}`) ? { enumerable: true, configurable: true, value: this.getAttribute(`data-${kebab(key)}`) } : undefined),
        });
        this.style = { setProperty: (name, value) => { this.style[name] = value; }, removeProperty: name => { delete this.style[name]; } };
        this.files = null;
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }
    toggleAttribute(name, force) { const on = force === undefined ? !this.hasAttribute(name) : force; on ? this.setAttribute(name, '') : this.removeAttribute(name); return on; }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get className() { return this.getAttribute('class') || ''; }
    set className(value) { this.setAttribute('class', value); }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstElementChild() { return this.children[0] || null; }
    get lastElementChild() { return this.children.at(-1) || null; }
    get nextElementSibling() { const siblings = this.parentNode ? this.parentNode.children : []; return siblings[siblings.indexOf(this) + 1] || null; }
    get previousElementSibling() { const siblings = this.parentNode ? this.parentNode.children : []; const index = siblings.indexOf(this); return index > 0 ? siblings[index - 1] : null; }
    get innerText() { return this.textContent; }
    set innerText(value) { this.textContent = value; }
    get innerHTML() { return this.childNodes.map(node => node.outerHTML).join(''); }
    set innerHTML(html) { this.replaceChildren(); this.appendChild(this.ownerDocument.parseFragment(html)); }
    get outerHTML() {
        const attrs = [...this.attributes].map(([name, value]) => (value === '' ? ` ${name}` : ` ${name}="${value.replace(/"/g, '&quot;')}"`)).join('');
        return VOID.has(this.localName) ? `<${this.localName}${attrs}>` : `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
    }
    matches(selector) { return matches(this, selector); }
    closest(selector) { for (let node = this; node && node.nodeType === 1; node = node.parentNode) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) { return descendants(this).filter(node => node.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getElementsByTagName(tag) { return this.querySelectorAll(tag); }
    click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
    focus() { this.ownerDocument.activeElement = this; this.dispatchEvent(new Event('focus', { bubbles: false })); this.dispatchEvent(new Event('focusin')); }
    blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; this.dispatchEvent(new Event('blur', { bubbles: false })); }
    reset() {
        this.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.type === 'checkbox' || field.type === 'radio') field.checked = field.hasAttribute('checked');
            else field.value = field.localName === 'textarea' ? field.defaultText : field.getAttribute('value') || '';
        });
    }
    get rows() { return this.children.filter(node => node.localName === 'tr'); }
    get cells() { return this.children.filter(node => ['td', 'th'].includes(node.localName)); }
    insertRow() { return this.appendChild(this.ownerDocument.createElement('tr')); }
    insertCell() { return this.appendChild(this.ownerDocument.createElement('td')); }
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
    scrollIntoView() {}
    // <template> keeps its parsed children inert in .content, as in the browser.
    get content() {
        if (this.localName !== 'template') return undefined;
        if (!this.templateContent) {
            this.templateContent = this.ownerDocument.createDocumentFragment();
            [...this.childNodes].forEach(child => this.templateContent.appendChild(child));
        }
        return this.templateContent;
    }
    cloneNode(deep = false) {
        const copy = this.ownerDocument.createElement(this.localName);
        this.attributes.forEach((value, name) => copy.setAttribute(name, value));
        if (deep) this.childNodes.forEach(child => copy.appendChild(child.cloneNode(true)));
        return copy;
    }
}

const reflectBoolean = ['hidden', 'disabled', 'required', 'readOnly', 'multiple', 'selected'];
reflectBoolean.forEach(prop => Object.defineProperty(Element.prototype, prop, {
    get() { return this.hasAttribute(prop.toLowerCase()); },
    set(value) { this.toggleAttribute(prop.toLowerCase(), Boolean(value)); },
}));
['type', 'name', 'placeholder', 'title', 'href', 'src', 'htmlFor', 'download', 'accept', 'min', 'max', 'step', 'colSpan'].forEach(prop => {
    const attr = { htmlFor: 'for', colSpan: 'colspan' }[prop] || prop.toLowerCase();
    Object.defineProperty(Element.prototype, prop, {
        get() { return this.getAttribute(attr) ?? (prop === 'type' && this.localName === 'input' ? 'text' : ''); },
        set(value) { this.setAttribute(attr, value); },
    });
});
Object.defineProperty(Element.prototype, 'value', {
    get() {
        if (this.localName === 'select') {
            const options = this.querySelectorAll('option');
            const chosen = options.find(option => option.selected) || options[0];
            return chosen ? chosen.value : '';
        }
        if (this.localName === 'option') return this.getAttribute('value') ?? this.textContent;
        if (this.currentValue !== undefined) return this.currentValue;
        return this.localName === 'textarea' ? this.defaultText : this.getAttribute('value') || '';
    },
    set(value) {
        if (this.localName === 'select') {
            this.querySelectorAll('option').forEach(option => { option.selected = option.value === String(value); });
            return;
        }
        this.currentValue = String(value ?? '');
        if (this.localName === 'input' && this.type === 'file' && value === '') this.files = null;
    },
});
Object.defineProperty(Element.prototype, 'defaultText', { get() { return this.childNodes.map(node => node.textContent).join(''); } });
Object.defineProperty(Element.prototype, 'checked', {
    get() { return this.currentChecked ?? this.hasAttribute('checked'); },
    set(value) {
        if (value && this.type === 'radio' && this.name) {
            this.ownerDocument.querySelectorAll(`input[type="radio"][name="${this.name}"]`).forEach(radio => { radio.currentChecked = false; });
        }
        this.currentChecked = Boolean(value);
    },
});
Object.defineProperty(Element.prototype, 'options', { get() { return this.querySelectorAll('option'); } });

function descendants(root) {
    const out = [];
    const walk = node => node.childNodes.forEach(child => { if (child.nodeType === 1) { out.push(child); walk(child); } });
    walk(root);
    return out;
}

function splitTop(text, separator) {
    const parts = [];
    let depth = 0; let quote = null; let current = '';
    for (const char of text) {
        if (quote) { if (char === quote) quote = null; current += char; continue; }
        if (char === '"' || char === "'") quote = char;
        if (char === '(' || char === '[') depth++;
        if (char === ')' || char === ']') depth--;
        if (depth === 0 && separator.test(char)) { parts.push(current); current = ''; continue; }
        current += char;
    }
    parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

function compoundMatches(element, compound) {
    const pattern = /(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:([~^$*|]?=)("[^"]*"|'[^']*'|[^\]]*))?\]|:not\(((?:[^()]|\([^()]*\))*)\)|:(checked|disabled|first-child|last-child)/g;
    let match; let consumed = 0;
    while ((match = pattern.exec(compound))) {
        if (match.index !== consumed) throw new Error(`fake-dom: unsupported selector "${compound}"`);
        consumed = pattern.lastIndex;
        const [, tag, id, cls, attr, op, rawValue, not, pseudo] = match;
        if (tag && tag !== '*' && element.localName !== tag.toLowerCase()) return false;
        if (id && element.id !== id) return false;
        if (cls && !element.classList.contains(cls)) return false;
        if (attr) {
            const actual = element.getAttribute(attr);
            if (actual === null) return false;
            const expected = rawValue === undefined ? null : rawValue.replace(/^["']|["']$/g, '');
            if (op === '=' && actual !== expected) return false;
            if (op === '^=' && !actual.startsWith(expected)) return false;
            if (op === '*=' && !actual.includes(expected)) return false;
            if (op === '~=' && !actual.split(/\s+/).includes(expected)) return false;
        }
        if (not && matches(element, not)) return false;
        if (pseudo === 'checked' && !element.checked) return false;
        if (pseudo === 'disabled' && !element.disabled) return false;
        if (pseudo === 'first-child' && element.parentNode?.children[0] !== element) return false;
        if (pseudo === 'last-child' && element.parentNode?.children.at(-1) !== element) return false;
    }
    if (consumed !== compound.length) throw new Error(`fake-dom: unsupported selector "${compound}"`);
    return true;
}

function complexMatches(element, selector) {
    const tokens = selector.replace(/\s*>\s*/g, ' > ').split(/\s+(?![^[]*\])/).filter(Boolean);
    const last = tokens.pop();
    if (!compoundMatches(element, last)) return false;
    let node = element;
    for (let index = tokens.length - 1; index >= 0; index--) {
        const token = tokens[index];
        if (token === '>') {
            node = node.parentElement;
            if (!node || !compoundMatches(node, tokens[--index])) return false;
            continue;
        }
        do node = node.parentElement; while (node && !compoundMatches(node, token));
        if (!node) return false;
    }
    return true;
}

function matches(element, selector) {
    return splitTop(selector, /,/).some(part => complexMatches(element, part));
}

class Document extends Element {
    constructor() {
        super('#document', null);
        this.nodeType = 9;
        this.ownerDocument = this;
        this.documentElement = this.createElement('html');
        this.head = this.createElement('head');
        this.body = this.createElement('body');
        this.documentElement.append(this.head, this.body);
        this.appendChild(this.documentElement);
        this.activeElement = this.body;
        this.baseURI = 'http://clinic.test/';
        this.readyState = 'complete';
    }
    createElement(tag) { return new Element(tag, this); }
    createTextNode(text) { return new Text(text, this); }
    createDocumentFragment() { return new DocumentFragment(this); }
    getElementById(id) { return descendants(this).find(node => node.id === id) || null; }
    parseFragment(html) {
        const fragment = this.createDocumentFragment();
        const stack = [fragment];
        const pattern = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
        let match;
        while ((match = pattern.exec(html))) {
            const [token, close, open, attrs, selfClose, text] = match;
            const parent = stack.at(-1);
            if (text !== undefined) parent.appendChild(this.createTextNode(decode(text)));
            else if (close) {
                const index = stack.map(node => node.localName).lastIndexOf(close.toLowerCase());
                if (index > 0) stack.length = index;
            } else if (open) {
                const element = this.createElement(open);
                for (const attr of attrs.matchAll(/([^\s=>/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
                    element.setAttribute(attr[1], attr[2] === undefined ? '' : decode(attr[2].replace(/^["']|["']$/g, '')));
                }
                parent.appendChild(element);
                if (!selfClose && !VOID.has(element.localName)) stack.push(element);
            } else if (!token.startsWith('<!--')) parent.appendChild(this.createTextNode(token));
        }
        return fragment;
    }
}

function createWindow({ html = '', url = 'http://clinic.test/' } = {}) {
    const document = new Document();
    document.body.appendChild(document.parseFragment(html));
    const storage = () => {
        const map = new Map();
        return { map, getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), clear: () => map.clear() };
    };
    const window = new EventTarget();
    const parsed = new URL(url);
    const location = { href: url, origin: parsed.origin, pathname: parsed.pathname, search: parsed.search, hash: parsed.hash };
    location.assign = href => { location.href = href; };
    Object.assign(window, { document, location, localStorage: storage(), sessionStorage: storage(), setTimeout, clearTimeout, Event, CustomEvent: Event });
    document.defaultView = window;
    document.baseURI = url;
    return window;
}

// Installs window/document globals for a module under test; returns the window.
function installDom(options) {
    const window = createWindow(options);
    function Option(text = '', value, defaultSelected = false, selected = false) {
        const option = window.document.createElement('option');
        option.textContent = text;
        if (value !== undefined) option.setAttribute('value', value);
        if (defaultSelected) option.setAttribute('selected', '');
        if (selected) option.selected = true;
        return option;
    }
    window.Option = Option;
    // FormData(form) over the fake form's named, enabled controls (native FormData only accepts real forms).
    class FakeFormData extends NativeFormData {
        constructor(form) {
            super();
            if (!form) return;
            for (const field of form.querySelectorAll('input, select, textarea')) {
                if (!field.name || field.disabled || field.type === 'file') continue;
                if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
                this.append(field.name, field.value);
            }
        }
    }
    window.FormData = FakeFormData;
    Object.assign(globalThis, { FormData: FakeFormData, Option, window, document: window.document, Node, Element, Text, Event, CustomEvent: Event, localStorage: window.localStorage, sessionStorage: window.sessionStorage });
    return window;
}

module.exports = { createWindow, installDom, Event, Node, Element, Document };
