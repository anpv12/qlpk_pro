(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function getCurrentStatus(options) {
		return typeof options.getCurrentStatus === 'function' ? options.getCurrentStatus() : undefined;
	}

	function bindStatusTabs(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		doc.querySelectorAll('[data-status]').forEach(tab => {
			if (tab._appointmentStatusTabBound) return;
			tab.addEventListener('click', function () {
				const status = this.getAttribute('data-status');
				if (typeof opts.setCurrentStatus === 'function') {
					opts.setCurrentStatus(status);
				}

				doc.querySelectorAll('[data-status]').forEach(item => item.classList.remove('active'));
				this.classList.add('active');

				if (typeof opts.loadAppointments === 'function') {
					opts.loadAppointments(status, 1);
				}
			});
			tab._appointmentStatusTabBound = true;
		});
	}

	function bindPagination(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const loadAppointments = opts.loadAppointments;

		const bindings = {
			firstPage: () => [getCurrentStatus(opts), 1],
			prevPage: () => [getCurrentStatus(opts), opts.getCurrentPage() - 1],
			nextPage: () => [getCurrentStatus(opts), opts.getCurrentPage() + 1],
			lastPage: () => [getCurrentStatus(opts), opts.getTotalPages()]
		};

		Object.keys(bindings).forEach(elementId => {
			const element = doc.getElementById(elementId);
			if (!element || element._appointmentPaginationBound) return;
			element.addEventListener('click', function () {
				if (typeof loadAppointments === 'function') {
					loadAppointments.apply(null, bindings[elementId]());
				}
			});
			element._appointmentPaginationBound = true;
		});

		const perPageSelect = doc.getElementById('perPageSelect');
		if (perPageSelect && !perPageSelect._appointmentPerPageBound) {
			perPageSelect.addEventListener('change', function () {
				if (typeof opts.setPerPage === 'function') {
					opts.setPerPage(parseInt(this.value));
				}
				if (typeof loadAppointments === 'function') {
					loadAppointments(getCurrentStatus(opts), 1);
				}
			});
			perPageSelect._appointmentPerPageBound = true;
		}
	}

	function getWaitingListFilter(options) {
		if (typeof options.getWaitingListFilter === 'function') {
			return options.getWaitingListFilter() || {};
		}
		return {};
	}

	function setWaitingListFilter(options, nextFilter) {
		if (typeof options.setWaitingListFilter === 'function') {
			options.setWaitingListFilter(nextFilter);
		}
	}

	function updateWaitingListFilter(options, patch) {
		setWaitingListFilter(options, Object.assign({}, getWaitingListFilter(options), patch));
	}

	function bindWaitingListFilters(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const patientNameInput = doc.getElementById('waitingListPatientName');
		let searchTimer = null;

		if (patientNameInput && !patientNameInput._waitingListPatientNameBound) {
			patientNameInput.addEventListener('input', function () {
				if (searchTimer) clearTimeout(searchTimer);
				searchTimer = setTimeout(() => {
					updateWaitingListFilter(opts, { patient_name: this.value.trim() });
					if (typeof opts.loadAppointments === 'function') {
						opts.loadAppointments(getCurrentStatus(opts), 1);
					}
				}, 300);
			});
			patientNameInput._waitingListPatientNameBound = true;
		}
	}

	function getAllAppointments(options) {
		if (typeof options.getAllAppointments === 'function') {
			return options.getAllAppointments() || [];
		}
		return options.allAppointments || [];
	}

	function getPerPage(options) {
		return typeof options.getPerPage === 'function' ? options.getPerPage() : options.perPage;
	}

	function getCurrentPage(options) {
		return typeof options.getCurrentPage === 'function' ? options.getCurrentPage() : options.currentPage;
	}

	function getTotalPages(options) {
		return typeof options.getTotalPages === 'function' ? options.getTotalPages() : options.totalPages;
	}

	function getFormatDateDisplay(options) {
		return options.formatDateDisplay || window.formatDateDisplay || function (value) { return value || ''; };
	}

	function hideSeverityTooltip() {
		const activeTooltip = document.querySelector('.qlpk-waiting-card__severity-tooltip');
		if (activeTooltip) activeTooltip.remove();
	}

	function positionSeverityTooltip(trigger, tooltip) {
		const triggerRect = trigger.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();
		const viewportPadding = 8;
		const centeredLeft = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
		const left = Math.min(
			Math.max(centeredLeft, viewportPadding),
			window.innerWidth - tooltipRect.width - viewportPadding
		);
		const topAbove = triggerRect.top - tooltipRect.height - viewportPadding;
		const shouldPlaceBelow = topAbove < viewportPadding;
		const top = shouldPlaceBelow ? triggerRect.bottom + viewportPadding : topAbove;

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;
		tooltip.classList.toggle('is-below', shouldPlaceBelow);
	}

	function showSeverityTooltip(trigger) {
		const text = trigger.getAttribute('data-severity-tooltip');
		if (!text) return;

		hideSeverityTooltip();
		const tooltip = document.createElement('div');
		tooltip.className = 'qlpk-waiting-card__severity-tooltip';
		tooltip.setAttribute('role', 'tooltip');
		tooltip.textContent = text;
		document.body.appendChild(tooltip);
		positionSeverityTooltip(trigger, tooltip);
		requestAnimationFrame(() => tooltip.classList.add('is-visible'));
	}

	function bindSeverityTooltips(root) {
		if (!root) return;
		root.querySelectorAll('.qlpk-waiting-card__severity-icon[data-severity-tooltip]').forEach(element => {
			if (element._receptionistSeverityTooltipBound) return;
			element.addEventListener('mouseenter', () => showSeverityTooltip(element));
			element.addEventListener('focus', () => showSeverityTooltip(element));
			element.addEventListener('mouseleave', hideSeverityTooltip);
			element.addEventListener('blur', hideSeverityTooltip);
			element.addEventListener('keydown', event => {
				if (event.key === 'Escape') hideSeverityTooltip();
			});
			element._receptionistSeverityTooltipBound = true;
		});
	}

	function buildWaitingQueueCard(appointment, index, options = {}) {
		const queueCard = window.QLPKWaitingQueueCardUi;
		if (!queueCard || typeof queueCard.buildAppointmentCard !== 'function') return null;

		const currentPage = getCurrentPage(options) || 1;
		const perPage = getPerPage(options) || getAllAppointments(options).length || 1;
		const formatDateDisplay = getFormatDateDisplay(options);

		return queueCard.buildAppointmentCard({
			appointment,
			index,
			currentPage,
			perPage,
			sequenceMode: 'page',
			formatDateDisplay,
			statusTextFallback: 'Chờ chuyển khám',
			fallbackPatientName: 'N/A',
			cardClass: 'qlpk-waiting-card--clickable',
			attrs: {
				role: 'button',
				tabindex: '0',
				'aria-label': `Sửa lịch hẹn ${appointment.patient_full_name || 'bệnh nhân'}`
			},
			includePatientCode: false,
			includeSchedule: false,
			includeDateTime: true,
			statusPlacement: 'actions',
			recentlyEditedStatusText: 'Vừa cập nhật',
			showSeverity: true,
			showRecentlyEdited: true,
			showRecentlyEditedBadge: false,
			actions: [
				{
					action: 'edit',
					title: 'Sửa lịch hẹn',
					dataAction: 'edit',
					attrs: { 'data-workflow-switch-pane': 'main' }
				},
				{ action: 'transfer', title: 'Chuyển khám', dataAction: 'transfer' },
				{ action: 'delete', title: 'Xóa/Hủy lịch hẹn', dataAction: 'cancel' }
			]
		});
	}

	function getWaitingActionHandler(action, options) {
		const opts = options || {};
		const handlers = {
			edit: opts.editAppointment,
			transfer: opts.transferAppointment,
			cancel: opts.cancelAppointment
		};
		return handlers[action];
	}

	function normalizeAppointmentId(appointmentId) {
		const numericAppointmentId = Number(appointmentId);
		return Number.isFinite(numericAppointmentId) ? numericAppointmentId : appointmentId;
	}

	function invokeWaitingAction(action, appointmentId, options) {
		const handler = getWaitingActionHandler(action, options);
		if (typeof handler !== 'function' || !appointmentId) return false;
		handler(normalizeAppointmentId(appointmentId));
		return true;
	}

	function isInteractiveWaitingTarget(target) {
		return Boolean(target && target.closest([
			'button',
			'a',
			'input',
			'select',
			'textarea',
			'label',
			'[data-waiting-action]',
			'[data-severity-tooltip]'
		].join(',')));
	}

	function bindWaitingListActions(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const tbody = doc.getElementById('waitingListTableBody');
		if (!tbody || tbody._waitingListActionsBound) return;

		tbody.addEventListener('click', event => {
			const button = event.target.closest('[data-waiting-action]');
			if (button && tbody.contains(button)) {
				const action = button.getAttribute('data-waiting-action');
				const appointmentId = button.getAttribute('data-appointment-id');
				if (!invokeWaitingAction(action, appointmentId, opts)) return;

				event.preventDefault();
				return;
			}

			if (isInteractiveWaitingTarget(event.target)) return;

			const card = event.target.closest('.qlpk-waiting-card[data-appointment-id]');
			if (!card || !tbody.contains(card)) return;

			event.preventDefault();
			invokeWaitingAction('edit', card.getAttribute('data-appointment-id'), opts);
		});

		tbody.addEventListener('keydown', event => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			if (isInteractiveWaitingTarget(event.target)) return;

			const card = event.target.closest('.qlpk-waiting-card[data-appointment-id]');
			if (!card || !tbody.contains(card)) return;

			event.preventDefault();
			invokeWaitingAction('edit', card.getAttribute('data-appointment-id'), opts);
		});

		tbody._waitingListActionsBound = true;
	}

	function renderAppointmentsTable(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const tbody = doc.getElementById('waitingListTableBody');
		const emptyState = doc.getElementById('appointmentsEmptyState');
		const appointments = getAllAppointments(opts);
		const panel = tbody ? tbody.closest('.qlpk-queue-panel') : null;

		if (!tbody) return;

		if (appointments.length === 0) {
			hideSeverityTooltip();
			tbody.replaceChildren();
			if (panel) panel.classList.add('qlpk-queue-panel--empty');
			if (emptyState) emptyState.classList.remove('receptionist-hidden');
			return;
		}

		if (panel) panel.classList.remove('qlpk-queue-panel--empty');
		if (emptyState) emptyState.classList.add('receptionist-hidden');

		hideSeverityTooltip();
		tbody.replaceChildren(...appointments
			.map((appointment, index) => buildWaitingQueueCard(appointment, index, opts))
			.filter(Boolean));
		bindSeverityTooltips(tbody);
	}

	function updatePagination(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const paginationStart = doc.getElementById('paginationStart');
		const paginationEnd = doc.getElementById('paginationEnd');
		const paginationTotal = doc.getElementById('paginationTotal');
		const firstPage = doc.getElementById('firstPage');
		const prevPage = doc.getElementById('prevPage');
		const nextPage = doc.getElementById('nextPage');
		const lastPage = doc.getElementById('lastPage');
		if (!paginationStart || !paginationEnd || !paginationTotal || !firstPage || !prevPage || !nextPage || !lastPage) {
			return;
		}

		const appointments = getAllAppointments(opts);
		const currentPage = getCurrentPage(opts) || 1;
		const perPage = getPerPage(opts) || appointments.length || 1;
		const totalPages = getTotalPages(opts) || 1;
		const start = (currentPage - 1) * perPage + 1;
		const end = Math.min(currentPage * perPage, appointments.length);

		paginationStart.textContent = start;
		paginationEnd.textContent = end;
		paginationTotal.textContent = appointments.length;

		firstPage.disabled = currentPage === 1;
		prevPage.disabled = currentPage === 1;
		nextPage.disabled = currentPage === totalPages;
		lastPage.disabled = currentPage === totalPages;
	}

	async function updateStatusCounts(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const statuses = opts.statuses || ['waiting_transfer', 'waiting_payment', 'completed'];

		try {
			for (const status of statuses) {
				const response = await opts.apiCall(`/api/?examination_status=${status}&per_page=1&receptionist=true`);

				if (!response.ok) {
					console.error(`API Error for status ${status}: ${response.status} ${response.statusText}`);
					const errorText = await response.text();
					console.error('Error response:', errorText);
					continue;
				}

				const data = await response.json();

				if (data.pagination) {
					const count = data.pagination.total_count || 0;
					const countElement = doc.getElementById(`${status}Count`);
					if (countElement) {
						countElement.textContent = count;
					}
				}
			}
		} catch (error) {
			console.error('Error updating status counts:', error);
		}
	}

	function activateResponsiveWorkspacePane(targetPane, options) {
		const opts = options || {};
		const doc = getDocument(opts);
		const pane = targetPane === 'queue' ? 'queue' : 'main';
		if (window.QLPKWorkflowTwoPane && typeof window.QLPKWorkflowTwoPane.activate === 'function') {
			const didActivate = window.QLPKWorkflowTwoPane.activate(pane, {
				...opts,
				root: doc.querySelector('.qlpk-workflow-two-pane')
			});
			if (didActivate) return;
		}

		doc.querySelectorAll('[data-workflow-pane]').forEach(button => {
			const isActive = button.dataset.workflowPane === pane;
			button.classList.toggle('is-active', isActive);
			button.setAttribute('aria-selected', isActive ? 'true' : 'false');
		});

		doc.querySelectorAll('[data-workflow-pane-content]').forEach(panel => {
			const isActive = panel.dataset.workflowPaneContent === pane;
			panel.classList.toggle('is-active', isActive);
		});
	}

	function bindResponsiveWorkspaceSwitch(options) {
		const opts = options || {};
		const doc = getDocument(opts);
		if (window.QLPKWorkflowTwoPane && typeof window.QLPKWorkflowTwoPane.bind === 'function') {
			const didBind = window.QLPKWorkflowTwoPane.bind({
				...opts,
				root: doc.querySelector('.qlpk-workflow-two-pane')
			});
			if (didBind) return;
		}

		const switcher = doc.querySelector('.qlpk-workflow-two-pane__switch');
		if (!switcher || switcher._receptionistWorkspaceSwitchBound) return;

		switcher.addEventListener('click', function (event) {
			const button = event.target.closest('[data-workflow-pane]');
			if (!button || !switcher.contains(button)) return;
			activateResponsiveWorkspacePane(button.dataset.workflowPane, opts);
		});

		doc.addEventListener('click', function (event) {
			const trigger = event.target.closest('[data-workflow-switch-pane]');
			if (!trigger) return;
			activateResponsiveWorkspacePane(trigger.dataset.workflowSwitchPane, opts);
		});

		switcher._receptionistWorkspaceSwitchBound = true;
		activateResponsiveWorkspacePane(opts.defaultPane || 'main', opts);
	}

	function bindListControls(options) {
		bindResponsiveWorkspaceSwitch(options);
		bindStatusTabs(options);
		bindPagination(options);
		bindWaitingListActions(options);
	}

	window.ReceptionistAppointmentListControls = {
		bindStatusTabs,
		bindPagination,
		bindWaitingListFilters,
		renderAppointmentsTable,
		bindWaitingListActions,
		updatePagination,
		updateStatusCounts,
		activateResponsiveWorkspacePane,
		bindResponsiveWorkspaceSwitch,
		bindListControls
	};
})(window);
