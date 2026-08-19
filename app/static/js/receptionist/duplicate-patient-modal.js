(function (window, document) {
	'use strict';

	function getDocument(options) {
		return options && options.document ? options.document : document;
	}

	function getBootstrap(options) {
		return options && options.bootstrap ? options.bootstrap : window.bootstrap;
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
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

		patientCard.innerHTML = `
            <div class="duplicate-patient-card__icon" aria-hidden="true">
                <i class="bi bi-person-circle"></i>
            </div>
            <div class="duplicate-patient-card__body">
                <div class="duplicate-patient-card__title-row">
                    <strong>${escapeHtml(patient.full_name)}</strong>
                    <span>${escapeHtml(patient.patient_code || 'Chưa có mã')}</span>
                </div>
                <div class="duplicate-patient-card__meta">
                    <span>SĐT: ${escapeHtml(patient.phone || 'Chưa có')}</span>
                    <span>CCCD: ${escapeHtml(patient.id_number || 'Chưa có')}</span>
                </div>
            </div>
            <i class="bi bi-check-circle-fill duplicate-patient-selected-icon is-hidden" aria-hidden="true"></i>
        `;

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

		duplicateList.innerHTML = '';
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
