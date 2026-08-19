(function (window, document) {
	'use strict';

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

	window.QLPKComponentDomScope = Object.freeze({ create, resolveRoot });
	window.QLPKDoctorModuleRegistry?.register?.('componentDomScope', window.QLPKComponentDomScope, {
		owner: 'shared/dom-scope',
		version: 2
	});
})(window, document);
