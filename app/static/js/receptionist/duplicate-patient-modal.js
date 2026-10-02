import { el, icon } from '../shared/dom.js';

(function (window, document) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function getBootstrap(options) {
		return options && options.bootstrap ? options.bootstrap : window.bootstrap;
	}

	function setUpdateButtonEnabled(doc, enabled) {
		const updateButton = doc.getElementById('updateSelectedBtn');
		if (updateButton) {
			updateButton.disabled = !enabled;
		}
	}

	function selectCard(index, cardElement, options = {}) {
		const doc = getDocument(options);
		if (!cardElement) return null;

		doc.querySelectorAll('.duplicate-patient-card').forEach(card => {
			card.classList.remove('is-selected');
			card.setAttribute('aria-selected', 'false');
			const icon = card.querySelector('.bi-check-circle-fill');
			if (icon) {
				icon.classList.add('is-hidden');
			}
		});

		cardElement.classList.add('is-selected');
		cardElement.setAttribute('aria-selected', 'true');
		const selectedIcon = cardElement.querySelector('.bi-check-circle-fill');
		if (selectedIcon) {
			selectedIcon.classList.remove('is-hidden');
		}

		setUpdateButtonEnabled(doc, true);
		return index;
	}

	function buildPatientCard(patient, index, options) {
		const doc = getDocument(options);
		const patientCard = doc.createElement('div');
		patientCard.className = 'duplicate-patient-card';
		patientCard.setAttribute('role', 'option');
		patientCard.setAttribute('tabindex', '0');
		patientCard.setAttribute('aria-selected', 'false');
		const selectPatientCard = () => {
			selectCard(index, patientCard, options);
			if (typeof options.onSelect === 'function') {
				options.onSelect(patient, index, patientCard);
			}
		};
		patientCard.addEventListener('click', selectPatientCard);
		patientCard.addEventListener('keydown', event => {
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			selectPatientCard();
		});

		patientCard.replaceChildren(
			el('div', { class: 'duplicate-patient-card__icon', 'aria-hidden': 'true' }, icon('bi-person-circle')),
			el('div', { class: 'duplicate-patient-card__body' },
				el('div', { class: 'duplicate-patient-card__title-row' },
					el('strong', {}, patient.full_name || ''),
					el('span', {}, patient.patient_code || 'Chưa có mã')),
				el('div', { class: 'duplicate-patient-card__meta' },
					el('span', {}, `SĐT: ${patient.phone || 'Chưa có'}`),
					el('span', {}, `CCCD: ${patient.id_number || 'Chưa có'}`))),
			el('i', { class: 'bi bi-check-circle-fill duplicate-patient-selected-icon is-hidden', 'aria-hidden': 'true' }));

		return patientCard;
	}

	function bindActionButtons(options = {}) {
		const doc = getDocument(options);
		if (doc._receptionistDuplicatePatientActionsBound) return;
		doc.addEventListener('click', event => {
			const button = event.target.closest('[data-duplicate-action]');
			if (!button) return;
			const modal = doc.getElementById('duplicatePatientModal');
			if (!modal || !modal.contains(button)) return;
			const action = button.getAttribute('data-duplicate-action');
			if (typeof options.onAction === 'function') {
				options.onAction(action);
			}
		});
		doc._receptionistDuplicatePatientActionsBound = true;
	}

	function show(options = {}) {
		const doc = getDocument(options);
		const duplicateList = doc.getElementById('duplicateList');
		if (!duplicateList) return;
		bindActionButtons(options);

		duplicateList.replaceChildren();
		duplicateList.setAttribute('role', 'listbox');
		duplicateList.setAttribute('aria-label', 'Danh sách bệnh nhân trùng');
		(options.duplicatePatients || []).forEach((patient, index) => {
			duplicateList.appendChild(buildPatientCard(patient, index, options));
		});

		setUpdateButtonEnabled(doc, false);

		const bootstrapInstance = getBootstrap(options);
		const modalElement = doc.getElementById('duplicatePatientModal');
		if (bootstrapInstance && modalElement) {
			const modal = new bootstrapInstance.Modal(modalElement);
			modal.show();
		}
	}

	window.ReceptionistDuplicatePatientModal = {
		show,
		selectCard
	};
})(window, document);
