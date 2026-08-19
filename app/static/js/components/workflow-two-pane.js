(function (window, document) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function getPaneName(element) {
		if (!element || !element.dataset) return '';
		return element.dataset.workflowPane || '';
	}

	function getPaneContentName(element) {
		if (!element || !element.dataset) return '';
		return element.dataset.workflowPaneContent || '';
	}

	function getRoot(options = {}) {
		const doc = getDocument(options);
		if (options.root) return options.root;
		if (options.rootSelector) return doc.querySelector(options.rootSelector);
		return doc.querySelector('.qlpk-workflow-two-pane');
	}

	function activate(targetPane, options = {}) {
		const root = getRoot(options);
		if (!root) return false;
		const pane = targetPane === 'queue' ? 'queue' : 'main';

		root.querySelectorAll('[data-workflow-pane]').forEach(button => {
			const isActive = getPaneName(button) === pane;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});

		root.querySelectorAll('[data-workflow-pane-content]').forEach(panel => {
			const isActive = getPaneContentName(panel) === pane;
			panel.classList.toggle('is-active', isActive);
		});

		return true;
	}

	function bind(options = {}) {
		const root = getRoot(options);
		if (!root || root._qlpkWorkflowTwoPaneBound) return Boolean(root);
		const defaultPane = options.defaultPane || root.dataset.workflowDefaultPane || 'main';

		root.addEventListener('click', event => {
			const button = event.target.closest('[data-workflow-pane]');
			if (!button || !root.contains(button)) return;
			event.preventDefault();
			activate(getPaneName(button), { ...options, root });
		});

		getDocument(options).addEventListener('click', event => {
			const trigger = event.target.closest('[data-workflow-switch-pane]');
			if (!trigger) return;
			const pane = trigger.dataset.workflowSwitchPane;
			if (!pane) return;
			activate(pane, { ...options, root });
		});

		root._qlpkWorkflowTwoPaneBound = true;
		activate(defaultPane, { ...options, root });
		return true;
	}

	window.QLPKWorkflowTwoPane = Object.freeze({
		activate,
		bind
	});
	window.QLPKDoctorModuleRegistry?.register?.('workflowTwoPane', window.QLPKWorkflowTwoPane);
})(window, document);
