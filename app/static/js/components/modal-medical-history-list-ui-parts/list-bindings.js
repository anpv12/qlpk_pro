// components/modal-medical-history-list-ui.js: phần 3/3 (nạp trước modal-medical-history-list-ui.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/modal-medical-history-list-ui'] || (window.QLPKModuleParts['components/modal-medical-history-list-ui'] = { state: {} });

	function setActiveHistoryRow(index, options = {}) {
		const activeClass = options.activeClass || 'modal-history-item-active';
		document.querySelectorAll(options.rowSelector || '.modal-history-item').forEach(item => item.classList.remove(activeClass));
		if (index !== null && index !== undefined) {
			const row = document.querySelector(`${options.rowSelector || '.modal-history-item'}[data-index="${index}"]`);
			if (row) row.classList.add(activeClass);
			return row || null;
		}
		return null;
	}
	function bindHistoryListClick(containerOrId, options = {}) {
		const container = moduleParts.resolveElement(containerOrId || 'modalMedicalHistory');
		if (!container) return null;

		container.addEventListener('click', async event => {
			const target = event.target;
			if (!target || typeof target.closest !== 'function') return;

			const row = target.closest(options.rowSelector || '.modal-history-item');
			if (row) {
				const index = Number(row.dataset.index);
				if (!Number.isNaN(index) && typeof options.onSelect === 'function') {
					container.querySelectorAll('.modal-history-item-user-selected').forEach(item => item.classList.remove('modal-history-item-user-selected'));
					row.classList.add('modal-history-item-user-selected');
					options.onSelect(index, event, row);
				}
			}

			const actionEl = target.closest('[data-action]');
			const action = actionEl ? actionEl.getAttribute('data-action') : null;
			if (action === 'copy-history') {
				event.preventDefault();
				event.stopPropagation();
				if (typeof options.onCopyHistory === 'function') {
					await options.onCopyHistory(actionEl.dataset.index, event, actionEl);
				}
				return;
			}
			if (action === 'delete-history') {
				event.preventDefault();
				event.stopPropagation();
				const examId = actionEl.dataset.examId;
				if (examId && typeof options.onDeleteHistory === 'function') {
					await options.onDeleteHistory(examId, actionEl.dataset.index, event, actionEl);
				}
			}
		});
		return container;
	}
	function bindHistoryListActions(containerOrId, options = {}) {
		return bindHistoryListClick(containerOrId, {
			rowSelector: options.rowSelector,
			onSelect: options.onSelect,
			onCopyHistory: async (historyIndex, event, actionEl) => {
				if (typeof options.copyHistory !== 'function') return;
				try {
					await options.copyHistory(historyIndex, event, actionEl);
				} catch (error) {
					console.error(options.copyErrorLogMessage || 'Không thể sao chép lịch sử khám:', error);
					if (typeof options.showToast === 'function') {
						options.showToast('error', options.copyErrorMessage || 'Không thể sao chép lịch sử khám. Vui lòng thử lại.');
					}
				}
			},
			onDeleteHistory: async (examId, index, event, actionEl) => {
				if (typeof options.deleteHistory === 'function') {
					await options.deleteHistory(examId, index, event, actionEl);
				}
			}
		});
	}

	Object.assign(moduleParts, {
		setActiveHistoryRow,
		bindHistoryListClick,
		bindHistoryListActions
	});
})(window);
