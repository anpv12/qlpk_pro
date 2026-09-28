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

	function renderHtml(container, html) {
		if (!container) return '';
		container.innerHTML = html;
		return html;
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

	window.QLPKHistoryTabCore = Object.freeze({ isContextCurrent, resolveHistoryState, renderHtml, resolveTabContext });
})(window);
