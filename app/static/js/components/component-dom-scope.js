import { QLPKDoctorModuleRegistry } from '../doctor-examination/module-registry.js';

function resolveRoot(doc, rootId) {
	if (!rootId) return doc;
	return doc.getElementById(rootId) || null;
}

function findById(root, id) {
	if (!root || !id) return null;
	if (root.id === id) return root;
	if (typeof root.getElementById === 'function') return root.getElementById(id);
	return typeof root.querySelector === 'function' ? root.querySelector(`#${id}`) : null;
}

function create(options = {}) {
	const sourceDocument = options.document || document;
	const root = resolveRoot(sourceDocument, options.rootId);
	const fields = options.fields || {};
	const strictRoot = options.strictRoot === true;
	if (!root && options.rootId && strictRoot) return null;

	const resolveId = logicalId => fields[logicalId] || logicalId;
	const resolveElement = logicalId => {
		const physicalId = resolveId(logicalId);
		return findById(root, physicalId) || (strictRoot ? null : sourceDocument.getElementById(physicalId));
	};

	const scopedRoot = root || sourceDocument;
	const proxy = new Proxy(sourceDocument, {
		get(target, property) {
			if (property === 'root') return scopedRoot;
			if (property === 'getRoot') return () => scopedRoot;
			if (property === 'resolve') return resolveElement;
			if (property === 'getElementById') return resolveElement;
			if (property === 'querySelector') return selector => scopedRoot.querySelector(selector);
			if (property === 'querySelectorAll') return selector => scopedRoot.querySelectorAll(selector);
			if (property === 'contains') return node => Boolean(scopedRoot.contains?.(node));
			if (property === 'scopeRoot') return scopedRoot;
			const value = target[property];
			return typeof value === 'function' ? value.bind(target) : value;
		}
	});
	return proxy;
}

const DEFAULT_SCOPED_CONFIG = Object.freeze({ rootId: '', strictRoot: false, fields: Object.freeze({}) });

function mergeScopedConfig(config = {}) {
	return {
		...DEFAULT_SCOPED_CONFIG,
		...config,
		fields: { ...DEFAULT_SCOPED_CONFIG.fields, ...(config.fields || {}) }
	};
}

function resolveScopedDocument(options = {}, config = {}) {
	const scopeOptions = { rootId: config.rootId, strictRoot: config.strictRoot, fields: config.fields };
	if (options.context?.getDocument && config.rootId) {
		return options.context.getDocument(scopeOptions);
	}
	return create({ document: options.document || document, ...scopeOptions });
}

function createScopedComponent(options = {}, config = {}, handlers = {}) {
	const withScope = (callOptions = {}) => ({
		...options,
		...callOptions,
		document: resolveScopedDocument({ ...options, ...callOptions }, config)
	});
	const api = {};
	Object.keys(handlers).forEach(name => {
		api[name] = name === 'populate'
			? (payload, callOptions) => handlers[name](payload, withScope(callOptions))
			: callOptions => handlers[name](withScope(callOptions));
	});
	return api;
}

export const QLPKComponentDomScope = Object.freeze({ create, resolveRoot, mergeScopedConfig, resolveScopedDocument, createScopedComponent });
QLPKDoctorModuleRegistry.register('componentDomScope', QLPKComponentDomScope, {
	owner: 'shared/dom-scope',
	version: 2
});
