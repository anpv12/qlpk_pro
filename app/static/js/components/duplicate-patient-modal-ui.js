(function (window) {
	'use strict';

	function getDocument(options = {}) {
		return options.document || window.document;
	}

	function setUpdateButtonEnabled(doc, enabled) {
		const updateSelectedBtn = doc.getElementById('updateSelectedBtn');
		if (updateSelectedBtn) updateSelectedBtn.disabled = !enabled;
	}

	function escapeHtml(value) {
		return String(value || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function buildPatientCard(patient, index, options = {}) {
		const doc = getDocument(options);
		const patientCard = doc.createElement('div');
		patientCard.className = 'duplicate-patient-card';
		patientCard.setAttribute('role', 'option');
		patientCard.setAttribute('tabindex', '0');
		patientCard.setAttribute('aria-selected', 'false');
		const selectPatientCard = () => {
			selectDuplicatePatientCard(index, patientCard, options);
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

	function showDuplicatePatientModal(options = {}) {
		const doc = getDocument(options);
		const duplicateList = doc.getElementById('duplicateList');
		if (!duplicateList) return false;

		duplicateList.innerHTML = '';
		duplicateList.setAttribute('role', 'listbox');
		duplicateList.setAttribute('aria-label', 'Danh sách bệnh nhân trùng');
		(options.duplicatePatients || []).forEach((patient, index) => {
			duplicateList.appendChild(buildPatientCard(patient, index, options));
		});

		setUpdateButtonEnabled(doc, false);

		const modalElement = doc.getElementById('duplicatePatientModal');
		if (modalElement && options.bootstrap?.Modal) {
			const modal = new options.bootstrap.Modal(modalElement);
			modal.show();
		}
		return true;
	}

	function selectDuplicatePatientCard(index, cardElement, options = {}) {
		const doc = getDocument(options);
		if (!cardElement) return null;

		doc.querySelectorAll('.duplicate-patient-card').forEach(card => {
			card.classList.remove('is-selected');
			card.setAttribute('aria-selected', 'false');
			const icon = card.querySelector('.bi-check-circle-fill');
			if (icon) icon.classList.add('is-hidden');
		});

		cardElement.classList.add('is-selected');
		cardElement.setAttribute('aria-selected', 'true');
		const selectedIcon = cardElement.querySelector('.bi-check-circle-fill');
		if (selectedIcon) selectedIcon.classList.remove('is-hidden');

		setUpdateButtonEnabled(doc, true);
		return index;
	}

	function handleDuplicateChoice(action, options = {}) {
		const selectedPatient = typeof options.getSelectedPatient === 'function'
			? options.getSelectedPatient()
			: null;
		if (action === 'update' && selectedPatient) {
			if (typeof options.setCurrentPatientId === 'function') {
				options.setCurrentPatientId(selectedPatient.id);
			}
			hideDuplicateModal(options);
			scheduleSaveWithoutDuplicateCheck(options);
		} else if (action === 'cancel') {
			if (typeof options.setCurrentPatientId === 'function') {
				options.setCurrentPatientId(null);
			}
			hideDuplicateModal(options);
			scheduleSaveWithoutDuplicateCheck(options);
		}

		if (typeof options.clearState === 'function') {
			options.clearState();
		}
	}

	async function checkDuplicatePatient(formData, options = {}) {
		try {
			const response = await options.apiCall('/api/patients/check-duplicate', {
				method: 'POST',
				body: JSON.stringify({
					full_name: formData.full_name,
					phone: formData.phone,
					id_number: formData.id_number
				})
			});

			return await response.json();
		} catch (error) {
			const logger = options.console || window.console;
			if (logger && typeof logger.error === 'function') {
				logger.error('Error checking duplicate patient:', error);
			}
			return { is_duplicate: false };
		}
	}

	function hideDuplicateModal(options = {}) {
		const jquery = options.$ || window.$;
		if (jquery) {
			jquery('#duplicatePatientModal').modal('hide');
		}
	}

	function scheduleSaveWithoutDuplicateCheck(options = {}) {
		const timeout = options.setTimeout || window.setTimeout;
		timeout(() => {
			if (typeof options.savePatientDataWithoutDuplicateCheck === 'function') {
				options.savePatientDataWithoutDuplicateCheck();
			}
		}, 100);
	}

	function bindDuplicateChoiceButtons(options = {}) {
		const doc = getDocument(options);
		const modalElement = doc.getElementById('duplicatePatientModal');
		if (!modalElement || modalElement._duplicateChoiceButtonsBound) return false;

		modalElement.addEventListener('click', event => {
			const button = event.target.closest('[data-duplicate-choice]');
			if (!button || !modalElement.contains(button)) return;

			event.preventDefault();
			const action = button.getAttribute('data-duplicate-choice');
			if (action && typeof options.onAction === 'function') {
				options.onAction(action);
			}
		});
		modalElement._duplicateChoiceButtonsBound = true;
		return true;
	}

	function createDuplicatePatientModalAdapter(options = {}) {
		const getPendingDuplicateData = () => typeof options.getPendingDuplicateData === 'function'
			? options.getPendingDuplicateData()
			: null;
		const setPendingDuplicateData = value => {
			if (typeof options.setPendingDuplicateData === 'function') options.setPendingDuplicateData(value);
		};
		const getSelectedDuplicatePatient = () => typeof options.getSelectedDuplicatePatient === 'function'
			? options.getSelectedDuplicatePatient()
			: null;
		const setSelectedDuplicatePatient = value => {
			if (typeof options.setSelectedDuplicatePatient === 'function') options.setSelectedDuplicatePatient(value);
		};

		const adapter = {
			showDuplicatePatientModal(duplicatePatients, count) {
				setPendingDuplicateData({ duplicatePatients, count });
				setSelectedDuplicatePatient(null);
				return showDuplicatePatientModal({
					document: getDocument(options),
					bootstrap: options.bootstrap,
					duplicatePatients,
					onSelect: patient => { setSelectedDuplicatePatient(patient); }
				});
			},

			selectDuplicatePatient(index, cardElement) {
				selectDuplicatePatientCard(index, cardElement, { document: getDocument(options) });
				const pendingDuplicateData = getPendingDuplicateData();
				const selectedPatient = pendingDuplicateData?.duplicatePatients?.[index] || null;
				setSelectedDuplicatePatient(selectedPatient);
				return selectedPatient;
			},

			handleDuplicateChoice(action) {
				return handleDuplicateChoice(action, {
					$: options.$,
					setTimeout: options.setTimeout,
					getSelectedPatient: getSelectedDuplicatePatient,
					setCurrentPatientId: options.setCurrentPatientId,
					savePatientDataWithoutDuplicateCheck: options.savePatientDataWithoutDuplicateCheck,
					clearState: () => {
						setPendingDuplicateData(null);
						setSelectedDuplicatePatient(null);
					}
				});
			},

			checkDuplicatePatient(formData) {
				return checkDuplicatePatient(formData, {
					apiCall: options.apiCall,
					console: options.console || window.console
				});
			},

			async showDuplicateIfNeeded(formData, duplicateOptions = {}) {
				const currentPatientId = typeof duplicateOptions.getCurrentPatientId === 'function'
					? duplicateOptions.getCurrentPatientId()
					: duplicateOptions.currentPatientId;
				if (currentPatientId) return false;

				const duplicateCheck = await adapter.checkDuplicatePatient(formData);
				if (duplicateCheck.is_duplicate) {
					adapter.showDuplicatePatientModal(duplicateCheck.duplicate_patients, duplicateCheck.count);
					return true;
				}
				return false;
			}
		};

		bindDuplicateChoiceButtons({
			document: getDocument(options),
			onAction: action => adapter.handleDuplicateChoice(action)
		});

		return adapter;
	}

	window.ClinicalDuplicatePatientModalUi = {
		showDuplicatePatientModal,
		selectDuplicatePatientCard,
		handleDuplicateChoice,
		bindDuplicateChoiceButtons,
		checkDuplicatePatient,
		createDuplicatePatientModalAdapter
	};
})(window);
