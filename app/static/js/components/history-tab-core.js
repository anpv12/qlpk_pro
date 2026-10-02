(function (window) {
	'use strict';

	function isContextCurrent(options) {
		return typeof options.isContextCurrent !== 'function' || options.isContextCurrent();
	}

	function resolveHistoryState(options = {}) {
		if (!options.patient) {
			return { state: 'noPatient', history: null, index: null };
		}

		if (options.isHistoryLoading) {
			return { state: 'historyLoading', history: null, index: null };
		}

		const histories = Array.isArray(options.histories) ? options.histories : [];
		if (!histories.length) {
			return { state: 'emptyHistory', history: null, index: null };
		}

		let index = Number.isInteger(options.selectedIndex) ? options.selectedIndex : 0;
		if (index < 0 || index >= histories.length) {
			index = 0;
		}

		const history = histories[index];
		if (!history) {
			return { state: 'missingHistory', history: null, index };
		}

		return { state: 'ready', history, index };
	}

	// A placeholder block of a history tab: { icon | spinner, text, small?, tone: 'muted' | 'danger' }.
	function buildStateBlock(spec) {
		const doc = window.document;
		const node = (tag, className, text) => {
			const element = doc.createElement(tag);
			if (className) element.className = className;
			if (text !== undefined) element.textContent = text;
			return element;
		};
		const block = node('div', `text-center text-${spec.tone || 'muted'} py-4`);
		if (spec.spinner) {
			const spinner = node('div', 'spinner-border text-primary');
			spinner.setAttribute('role', 'status');
			block.append(spinner);
		} else {
			block.append(node('i', `bi ${spec.icon} patient-search-modal__empty-icon`));
		}
		block.append(node('p', spec.small ? 'mt-2 mb-1' : 'mt-2 mb-0', spec.text));
		if (spec.small) block.append(node('small', 'text-muted', spec.small));
		return block;
	}

	function renderStateBlock(container, spec) {
		if (!container) return null;
		if (!spec) { container.replaceChildren(); return null; }
		const block = buildStateBlock(spec);
		container.replaceChildren(block);
		return block;
	}

	function resolveTabContext(options = {}, renderPendingState) {
		const contentArea = options.container;
		if (!contentArea) return { done: { state: 'missingContainer' } };
		if (!isContextCurrent(options)) return { done: { state: 'stale' } };
		const historyState = resolveHistoryState({
			patient: options.patient,
			isHistoryLoading: options.isHistoryLoading,
			histories: options.histories,
			selectedIndex: options.selectedIndex
		});
		if (historyState.state !== 'ready') {
			renderPendingState(contentArea, historyState.state);
			return { done: historyState };
		}
		return { contentArea, historyState };
	}

	window.QLPKHistoryTabCore = Object.freeze({ isContextCurrent, resolveHistoryState, buildStateBlock,
		renderStateBlock, resolveTabContext });
})(window);
