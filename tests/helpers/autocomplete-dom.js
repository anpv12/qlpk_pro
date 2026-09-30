'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { runScriptFile } = require('./module-source');

function createEnvironment() {
  const timers = new Map(); let nextTimer = 0;
  let document;
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.id = ''; this.value = ''; this.children = [];
      this.attributes = {}; this.events = {}; this.dataset = {}; this.hidden = false;
      this.disabled = false; this.readOnly = false; this.scrollTop = 0; this.clientHeight = 160;
      this.scrollHeight = 400; this.offsetTop = 0; this.offsetHeight = 40; this.ownerDocument = document;
      this.rect = {left: 100, top: 200, right: 400, bottom: 240, width: 300, height: 40};
      this.styles = {}; this.style = {setProperty: (key, value) => {this.styles[key] = value;}};
      const classes = new Set();
      this.classList = {add: (...values) => values.forEach(v => classes.add(v)), remove: (...values) => values.forEach(v => classes.delete(v)),
        contains: value => classes.has(value) || this.className?.split(' ').includes(value),
        toggle: (value, force) => {if (force) classes.add(value); else classes.delete(value);}};
    }
    append(...children) { children.forEach(child => {child.parentElement = this; this.children.push(child);}); }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) { this.children.forEach(child => {child.parentElement = null;}); this.children = []; this.append(...children); }
    remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    getAttribute(key) { return this.attributes[key] ?? null; }
    hasAttribute(key) { return key in this.attributes; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
    removeEventListener(type, callback) { this.events[type] = (this.events[type] || []).filter(fn => fn !== callback); }
    fire(type, data = {}) { return Promise.all((this.events[type] || []).map(fn => fn({target: this, preventDefault() {}, stopPropagation() {}, ...data}))); }
    click(data) { return this.fire('click', data); }
    focus() { if (document.activeElement !== this) {document.activeElement = this; this.fire('focus');} }
    blur() { document.activeElement = null; }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    matches(selector) {
      return selector.split(',').some(raw => {
        const s = raw.trim();
        if (s === 'fieldset:disabled') return this.tagName === 'FIELDSET' && this.disabled;
        if (s.startsWith('.')) return this.classList.contains(s.slice(1));
        if (s.startsWith('#')) return this.id === s.slice(1);
        const match = s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
        if (match) return match[2] === undefined ? this.hasAttribute(match[1]) : this.getAttribute(match[1]) === match[2];
        return this.tagName.toLowerCase() === s;
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return this.hidden ? [] : [this.rect]; }
    getBoundingClientRect() { return this.rect; }
    showPopover() { this.popoverOpen = true; }
    hidePopover() { this.popoverOpen = false; }
    after(...nodes) {
      if (!this.parentElement) return;
      const index = this.parentElement.children.indexOf(this);
      nodes.forEach(node => { node.parentElement = this.parentElement; });
      this.parentElement.children.splice(index + 1, 0, ...nodes);
    }
    get nextElementSibling() {
      if (!this.parentElement) return null;
      const index = this.parentElement.children.indexOf(this);
      return this.parentElement.children[index + 1] || null;
    }
  }
  document = new Element('document'); document.ownerDocument = document;
  document.documentElement = new Element('html'); document.body = new Element('body');
  document.append(document.documentElement); document.documentElement.append(document.body);
  document.createElement = tag => new Element(tag);
  document.getElementById = id => document.querySelector('#' + id);
  const window = new Element('window'); window.innerWidth = 1000; window.innerHeight = 800;
  window.QLPKHtml = require('./html-escape').QLPKHtml;
  window.getComputedStyle = element => ({fontSize: '16px', overflowY: element.overflowY || 'visible'});
  document.defaultView = window;
  const context = vm.createContext({window, document, console, URLSearchParams, AbortController,
    setTimeout: fn => {timers.set(++nextTimer, fn); return nextTimer;}, clearTimeout: id => timers.delete(id)});
  const load = relative => runScriptFile(path.join(__dirname, '../..', relative), context);
  function createField(id = 'testField') {
    const create = (tag, suffix, marker) => {const element = new Element(tag); element.id = id + suffix; element.setAttribute(marker, ''); return element;};
    const root = create('div', '', 'data-autocomplete-field'), control = create('div', 'Control', 'data-autocomplete-control');
    const input = create('input', 'Input', 'data-autocomplete-input'), tags = create('div', 'Tags', 'data-autocomplete-tags');
    const dropdown = create('div', 'Dropdown', 'data-autocomplete-dropdown'), list = create('div', 'List', 'data-autocomplete-list');
    control.append(tags, input); dropdown.append(list); root.append(control, dropdown); document.body.append(root);
    return {root, control, input, tags, dropdown, list};
  }
  return {window, document, context, load, createField, Element, tick: () => {const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn());}};
}
module.exports = {createEnvironment};
