(function (window) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}

	function normalizeSearchText(value) {
		return window.QLPKSearchNormalization?.normalizeSearchText(value)
			|| String(value || '').toLowerCase().trim();
	}

	function filterAppointmentsByPatientQuery(appointments, query) {
		const source = Array.isArray(appointments) ? appointments : [];
		const normalized = normalizeSearchText(query);
		if (!normalized) return source;

		return source.filter(appointment => {
			const name = normalizeSearchText(appointment.patient_full_name);
			const phone = normalizeSearchText(appointment.patient_phone);
			const idNumber = normalizeSearchText(appointment.patient_id_number);
			return name.includes(normalized) || phone.includes(normalized) || idNumber.includes(normalized);
		});
	}

	function buildWaitingListPatientCardHtml(appointment, index, options = {}) {
		const queueCard = window.QLPKWaitingQueueCardUi;

		if (!queueCard || typeof queueCard.renderAppointmentCard !== 'function') {
			return '';
		}

		return queueCard.renderAppointmentCard({
			appointment,
			index,
			variant: options.variant || 'timeline',
			formatDateDisplay: options.formatDateDisplay,
			calculateAge: options.calculateAge,
			patientCodeLabel: options.patientCodeLabel,
			includeAge: options.includeAge !== false,
			includeGender: options.includeGender !== false,
			includeStatus: options.includeStatus !== false,
			includePractitioner: options.includePractitioner !== false,
			includeDateTime: options.includeDateTime !== false,
			statusTextFallback: 'Đang chờ',
			includePhone: options.includePhone === true,
			attrs: {
				'data-appointment-id': appointment.id || '',
				role: 'button',
				tabindex: '0'
			},
			actions: options.showActions === false ? [] : [
				{ action: 'transfer', title: 'Chuyển khám', dataAction: 'transfer' },
				{ action: 'delete', title: 'Xóa lượt khám', dataAction: 'delete' }
			]
		});
	}

	function resolveWindowAction(name) {
		return name && typeof window[name] === 'function' ? window[name] : null;
	}

	function bindWaitingListPatientCardEvents(container, options = {}) {
		const selectAction = options.onSelectAppointment
			|| resolveWindowAction(options.selectFunctionName || 'selectPatientCard');
		const transferAction = options.onTransferAppointment
			|| resolveWindowAction(options.transferFunctionName || 'showTransferMenu');
		const deleteAction = options.onDeleteAppointment
			|| resolveWindowAction(options.deleteFunctionName || 'deleteExaminationFromQuickSearch');

		container.querySelectorAll('.qlpk-waiting-card[data-appointment-id]').forEach(card => {
			const rawAppointmentId = card.dataset.appointmentId;
			const appointmentId = Number(rawAppointmentId);
			if (!rawAppointmentId || !Number.isFinite(appointmentId)) return;

			card.addEventListener('click', () => {
				if (typeof selectAction === 'function') selectAction(appointmentId);
			});
			card.addEventListener('keydown', event => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				if (typeof selectAction === 'function') selectAction(appointmentId);
			});

			card.querySelector('[data-waiting-action="transfer"]')?.addEventListener('click', event => {
				event.stopPropagation();
				if (typeof transferAction === 'function') transferAction(appointmentId, event);
			});
			card.querySelector('[data-waiting-action="delete"]')?.addEventListener('click', event => {
				event.stopPropagation();
				if (typeof deleteAction === 'function') deleteAction(appointmentId);
			});
		});
	}

	function setEmptyStateVisible(emptyState, visible) {
		if (!emptyState) return;
		emptyState.classList.toggle('exam-initially-hidden', !visible);
		emptyState.hidden = !visible;
	}

	function renderAppointmentsTable(options = {}) {
		const doc = getDocument(options);
		const tbody = doc.getElementById(options.listId || 'waitingListTableBody');
		const emptyState = doc.getElementById(options.emptyStateId || 'appointmentsEmptyState');
		if (!tbody) return [];
		const panel = tbody.closest('.qlpk-queue-panel');

		const filteredAppointments = filterAppointmentsByPatientQuery(
			options.appointments,
			options.patientSearchQuery
		);

		if (filteredAppointments.length === 0) {
			tbody.innerHTML = '';
			if (panel) panel.classList.add('qlpk-queue-panel--empty');
			setEmptyStateVisible(emptyState, true);
			return filteredAppointments;
		}

		if (panel) panel.classList.remove('qlpk-queue-panel--empty');
		setEmptyStateVisible(emptyState, false);
		tbody.innerHTML = filteredAppointments
			.map((appointment, index) => buildWaitingListPatientCardHtml(appointment, index, options))
			.join('');
		bindWaitingListPatientCardEvents(tbody, options);
		const selectedId = options.getSelectedAppointmentId?.();
		if (selectedId) tbody.querySelector(`.qlpk-waiting-card[data-appointment-id="${Number(selectedId)}"]`)?.classList.add('is-selected');
		return filteredAppointments;
	}

	async function loadCombinedAppointments(options = {}) {
		try {
			const statuses = options.statuses || ['doctor_exam', 'conclusion'];
			const page = options.page || 1;
			const perPage = options.perPage || 10;
			const roleQueryParam = options.roleQueryParam || 'doctor=true';
			const appointments = [];
			const seenAppointmentIds = new Set();

			for (const statusItem of statuses) {
				let nextPage = page;
				do {
					const response = await options.apiCall(`/api/appointments/?examination_status=${statusItem}&page=${nextPage}&per_page=${perPage}&${roleQueryParam}`);
					if (options.isCurrentRequest && !options.isCurrentRequest()) return { status: 'stale' };
					if (!response || !response.ok) throw new Error('Không thể tải danh sách chờ khám');
					const data = await response.json();
					if (!Array.isArray(data.appointments)) throw new Error('Danh sách chờ khám không hợp lệ');
					data.appointments.forEach(appointment => {
						if (seenAppointmentIds.has(appointment.id)) return;
						seenAppointmentIds.add(appointment.id);
						appointments.push(appointment);
					});
					nextPage = options.loadAllPages && data.pagination?.has_next ? data.pagination.next_page : null;
				} while (nextPage);
			}

			if (options.isCurrentRequest && !options.isCurrentRequest()) return { status: 'stale' };
			if (!options.preserveServerOrder) appointments.sort((a, b) => b.id - a.id);

			if (appointments.length > 0) {
				if (typeof options.setAppointments === 'function') options.setAppointments(appointments);
				if (typeof options.setCurrentPage === 'function') options.setCurrentPage(page);
				if (typeof options.setTotalPages === 'function') options.setTotalPages(Math.ceil(appointments.length / perPage));
				if (typeof options.render === 'function') options.render();
				if (typeof options.updatePagination === 'function') options.updatePagination();
				return { appointments, status: 'loaded' };
			}

			if (typeof options.setAppointments === 'function') options.setAppointments([]);
			if (typeof options.render === 'function') options.render();
			return { appointments: [], status: 'empty' };
		} catch (error) {
			if (options.isCurrentRequest && !options.isCurrentRequest()) return { status: 'stale' };
			if (typeof options.showError === 'function') options.showError(error);
			return { appointments: [], status: 'error', error };
		}
	}

	function createWaitingListAdapter(options = {}) {
		let requestVersion = 0;
		const getPerPage = typeof options.getPerPage === 'function'
			? options.getPerPage
			: () => options.perPage || 10;
		const getAppointments = typeof options.getAppointments === 'function'
			? options.getAppointments
			: () => options.appointments || [];
		const getPatientSearchQuery = typeof options.getPatientSearchQuery === 'function'
			? options.getPatientSearchQuery
			: () => options.patientSearchQuery || '';
		const getCurrentPage = typeof options.getCurrentPage === 'function'
			? options.getCurrentPage
			: () => options.currentPage || 1;

		function renderAdapterAppointmentsTable() {
			return renderAppointmentsTable({
				document: getDocument(options),
				appointments: getAppointments(),
				patientSearchQuery: getPatientSearchQuery(),
				getSelectedAppointmentId: options.getSelectedAppointmentId,
				currentPage: getCurrentPage(),
				perPage: getPerPage(),
				formatDateDisplay: options.formatDateDisplay,
				calculateAge: options.calculateAge,
				variant: options.variant,
				patientCodeLabel: options.patientCodeLabel,
				listId: options.listId,
				emptyStateId: options.emptyStateId,
				selectFunctionName: options.selectFunctionName,
				transferFunctionName: options.transferFunctionName,
				deleteFunctionName: options.deleteFunctionName,
				showActions: options.showActions,
				includeAge: options.includeAge,
				includeGender: options.includeGender,
				includePhone: options.includePhone,
				includeStatus: options.includeStatus,
				includePractitioner: options.includePractitioner,
				includeDateTime: options.includeDateTime
			});
		}

		function loadAdapterAppointments(status = options.defaultStatus, page = 1) {
			const version = ++requestVersion;
			return loadCombinedAppointments({
				apiCall: options.apiCall,
				statuses: options.statuses,
				page,
				perPage: getPerPage(),
				roleQueryParam: options.roleQueryParam,
				loadAllPages: options.loadAllPages,
				preserveServerOrder: options.preserveServerOrder,
				isCurrentRequest: () => version === requestVersion,
				setAppointments: options.setAppointments,
				setCurrentPage: options.setCurrentPage,
				setTotalPages: options.setTotalPages,
				render: renderAdapterAppointmentsTable,
				updatePagination: options.updatePagination,
				showError: options.showError,
				status
			});
		}

		return {
			loadAppointments: loadAdapterAppointments,
			renderAppointmentsTable: renderAdapterAppointmentsTable
		};
	}

	function bindStatusTabs(options = {}) {
		const doc = getDocument(options);
		doc.querySelectorAll(options.selector || '[data-status]').forEach(tab => {
			const boundFlag = options.boundFlag || '_waitingListStatusBound';
			if (tab[boundFlag]) return;
			tab.addEventListener('click', function () {
				const status = this.getAttribute(options.statusAttribute || 'data-status');
				if (typeof options.setCurrentStatus === 'function') {
					options.setCurrentStatus(status);
				}

				doc.querySelectorAll(options.selector || '[data-status]').forEach(item => item.classList.remove(options.activeClass || 'active'));
				this.classList.add(options.activeClass || 'active');

				if (typeof options.loadAppointments === 'function') {
					options.loadAppointments(status, 1);
				}
			});
			tab[boundFlag] = true;
		});
	}

	function bindPatientSearchInput(options = {}) {
		const doc = getDocument(options);
		const input = doc.getElementById(options.inputId || 'patientSearch');
		if (!input || input._waitingListPatientSearchBound) return input || null;

		const setQuery = value => {
			if (typeof options.setPatientSearchQuery === 'function') {
				options.setPatientSearchQuery(value);
			}
			if (typeof options.renderAppointmentsTable === 'function') {
				options.renderAppointmentsTable();
			}
		};

		input.addEventListener('input', function () {
			setQuery(this.value);
		});
		input.addEventListener('keydown', function (event) {
			if (event.key !== 'Escape') return;
			this.value = '';
			setQuery('');
		});
		input._waitingListPatientSearchBound = true;
		return input;
	}

	window.ClinicalExaminationWaitingListUi = Object.freeze({
		filterAppointmentsByPatientQuery,
		buildWaitingListPatientCardHtml,
		renderAppointmentsTable,
		loadCombinedAppointments,
		createWaitingListAdapter,
		bindStatusTabs,
		bindPatientSearchInput
	});
	window.QLPKDoctorModuleRegistry?.register?.('examinationWaitingListUi', window.ClinicalExaminationWaitingListUi);
})(window);
