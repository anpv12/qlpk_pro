import { QLPKDoctorPageRuntime } from './page-runtime.js';
import { QLPKComponentDomScope } from '../components/component-dom-scope.js';

let currentContext = null;

/**
 * Canonical runtime context for the Doctor workspace.
 *
 * Components may still expose a legacy global for pages that have not been
 * migrated yet, but Doctor code must receive this context instead of
 * reaching into window/document implicitly.  Keeping the compatibility
 * surface here makes the eventual module migration mechanical.
 */
function createStateBridge(target) {
	const listeners = new Set();
	return Object.freeze({
		get(key) {
			return key === undefined ? { ...target } : target[key];
		},
		set(key, value) {
			target[key] = value;
			listeners.forEach(listener => listener({ [key]: value }, { ...target }));
			return value;
		},
		patch(values = {}) {
			Object.assign(target, values);
			listeners.forEach(listener => listener({ ...values }, { ...target }));
			return { ...target };
		},
		snapshot: () => ({ ...target }),
		subscribe(listener) {
			if (typeof listener !== 'function') return () => {};
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		clear() {
			Object.keys(target).forEach(key => delete target[key]);
			listeners.forEach(listener => listener({}, {}));
		}
	});
}

function create(options = {}) {
	const sourceDocument = options.document || document;
	const registry = options.registry || window.QLPKDoctorModuleRegistry;
	const runtime = options.runtime || QLPKDoctorPageRuntime;
	const config = options.config || registry?.get?.('doctorComponentConfig') || {};
	const scopeFactory = options.scopeFactory || QLPKComponentDomScope;
	const stateObject = options.stateObject || null;
	const state = options.state || createStateBridge(stateObject || { ...options.initialState });
	const lifecycle = new Map();
	const events = new Map();

	function on(name, handler) {
		if (!name || typeof handler !== 'function') return () => {};
		if (!events.has(name)) events.set(name, new Set());
		events.get(name).add(handler);
		return () => events.get(name)?.delete(handler);
	}

	function emit(name, payload) {
		events.get(name)?.forEach(handler => handler(payload, context));
	}

	function getModule(name, required = false) {
		const module = registry?.get?.(name) || null;
		if (!module && required) throw new Error(`Thiếu Doctor module: ${name}`);
			return module;
	}

	function getDocument(scopeOptions = {}) {
		if (!scopeOptions.rootId || !scopeFactory?.create) return sourceDocument;
		return scopeFactory.create({ document: sourceDocument, ...scopeOptions });
	}

	function mount(name, component, mountOptions = {}) {
		if (!name || !component) return null;
		if (lifecycle.has(name)) return lifecycle.get(name);
		const instance = typeof component === 'function'
			? component({ ...mountOptions, context })
			: component;
		lifecycle.set(name, instance || component);
		emit('mounted', { name, instance: instance || component });
		return instance || component;
	}

	function unmount(name, options = {}) {
		const instance = lifecycle.get(name);
		if (!instance) return false;
		if (options.destroy !== false && typeof instance.destroy === 'function') instance.destroy();
		lifecycle.delete(name);
		emit('unmounted', { name, instance });
		return true;
	}

	function validate(requiredModules = []) {
		const missing = requiredModules.filter(name => !getModule(name));
		if (missing.length) {
			const error = new Error(`Thiếu Doctor modules: ${missing.join(', ')}`);
				error.missingModules = missing;
			throw error;
		}
		return true;
	}

	const context = {
		document: sourceDocument,
		window,
		runtime,
		registry,
		config,
		state,
		stateObject,
		getDocument,
		getModule,
		validate,
		mount,
		unmount,
		on,
		emit,
		listMounted: () => Array.from(lifecycle.keys())
	};

	return Object.freeze(context);
}

function setCurrent(context) {
	currentContext = context || null;
	return currentContext;
}

function getCurrent() {
	return currentContext;
}

function clearCurrent(context) {
	if (!context || currentContext === context) currentContext = null;
}

const api = Object.freeze({ create, setCurrent, getCurrent, clearCurrent });
export const QLPKDoctorComponentContext = api;
if (window.QLPKDoctorModuleRegistry?.register) {
	window.QLPKDoctorModuleRegistry.register('doctorComponentContext', api);
}
