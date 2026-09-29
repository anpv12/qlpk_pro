(function (window, document) {
	'use strict';

	const config = window.QLPKPsychologistComponentConfig || {
		workspaceRootId: 'psychologistClinicalWorkspace',
		defaultSectionId: 'psychologistClinicalDecisionPanel',
		sections: []
	};
	const DEFAULT_SECTION_ID = 'psychologistClinicalDecisionPanel';
	const ACCORDION_MEDIA_QUERY = '(max-width: 63.99875rem)';

	function getRoot(doc = document) {
		return doc.getElementById(config.workspaceRootId);
	}

	function getSurface(doc = document) {
		return doc.getElementById('psychologistExamSurface');
	}

	function isAccordionCompact() {
		return typeof window.matchMedia === 'function'
			? window.matchMedia(ACCORDION_MEDIA_QUERY).matches
			: false;
	}

	function getClinicalAccordions(root) {
		return Array.from(root.querySelectorAll('[data-psychologist-clinical-accordion]'));
	}

	function syncClinicalAccordions(root) {
		const accordions = getClinicalAccordions(root);
		const grid = root.querySelector('.doctor-clinical-flow__clinical-grid');
		if (!accordions.length) return;

		if (!isAccordionCompact()) {
			accordions.forEach(accordion => {
				accordion.open = true;
			});
			grid?.removeAttribute('data-psychologist-clinical-open');
			return;
		}

		const activeAccordion = accordions.find(accordion => accordion.open) || accordions[0];
		accordions.forEach(accordion => {
			accordion.open = accordion === activeAccordion;
		});
		if (grid && activeAccordion?.dataset.psychologistClinicalAccordion) {
			grid.dataset.psychologistClinicalOpen = activeAccordion.dataset.psychologistClinicalAccordion;
		}
	}

	function bindClinicalAccordions(root) {
		const accordions = getClinicalAccordions(root);
		if (!accordions.length || root.dataset.psychologistClinicalAccordionBound === 'true') return;

		accordions.forEach(accordion => {
			const summary = accordion.querySelector(':scope > summary');
			if (!summary) return;
			summary.addEventListener('click', event => {
				if (!isAccordionCompact()) {
					event.preventDefault();
					accordion.open = true;
					syncClinicalAccordions(root);
					return;
				}

				event.preventDefault();
				if (accordion.open) return;
				accordions.forEach(other => {
					other.open = other === accordion;
				});
				syncClinicalAccordions(root);
			});

			accordion.addEventListener('toggle', () => {
				if (isAccordionCompact()) syncClinicalAccordions(root);
				else accordion.open = true;
			});
		});

		const mediaQuery = typeof window.matchMedia === 'function'
			? window.matchMedia(ACCORDION_MEDIA_QUERY)
			: null;
		const handleMediaChange = () => syncClinicalAccordions(root);
		if (mediaQuery?.addEventListener) mediaQuery.addEventListener('change', handleMediaChange);
		else if (mediaQuery?.addListener) mediaQuery.addListener(handleMediaChange);
		root.dataset.psychologistClinicalAccordionBound = 'true';
		syncClinicalAccordions(root);
	}

	function renderPatientHeader(options = {}) {
		const doc = options.document || document;
		const patient = Object.prototype.hasOwnProperty.call(options, 'patient')
			? (options.patient || {})
			: (window.currentPatientData || {});
		const heading = doc.getElementById('psychologistClinicalHeading');
		const code = doc.getElementById('psychologistPatientCode');
		const latestVisit = doc.getElementById('psychologistPatientLatestVisit');
		if (heading) heading.textContent = patient.full_name || patient.name || 'Chưa chọn bệnh nhân';
		if (code) {
			const patientCode = patient.patient_code || patient.medical_record_number || patient.ma_ho_so || '';
			code.textContent = patientCode;
			code.hidden = !patientCode;
		}
		if (latestVisit) latestVisit.textContent = latestVisitLabel(options);
	}

	function latestVisitLabel(options) {
		if (options.latestVisit) return options.latestVisit;
		return options.appointmentId || window.currentAppointmentId ? 'Lượt khám Tâm lý gia đang mở' : 'Chưa chọn lượt khám';
	}

	function activateSection(targetId = DEFAULT_SECTION_ID, options = {}) {
		const doc = options.document || document;
		const root = getRoot(doc);
		if (!root) return false;
		const sections = Array.from(root.querySelectorAll('[data-psychologist-workspace-section]'));
		if (!sections.length) return false;
		const target = sections.find(section => section.id === targetId)
			|| sections.find(section => section.id === DEFAULT_SECTION_ID)
			|| sections[0];
		const activeId = target.id;
		root.dataset.psychologistActiveSection = activeId;

		sections.forEach(section => {
			const isActive = section.id === activeId;
			section.hidden = !isActive;
			section.classList.toggle('is-active', isActive);
			section.setAttribute('aria-hidden', String(!isActive));
		});
		root.querySelectorAll('[data-psychologist-section-target]').forEach(link => {
			const isActive = link.dataset.psychologistSectionTarget === activeId;
			link.classList.toggle('is-active', isActive);
			if (isActive) link.setAttribute('aria-current', 'true');
			else link.removeAttribute('aria-current');
		});
		return activeId;
	}

	function showWorkspace(options = {}) {
		const doc = options.document || document;
		const root = getRoot(doc);
		const surface = getSurface(doc);
		if (root) root.hidden = false;
		if (surface) {
			surface.classList.add('has-selected-appointment');
			surface.classList.remove('is-empty');
		}
		renderPatientHeader(options);
		activateSection(options.sectionId || DEFAULT_SECTION_ID, { document: doc });
		return Boolean(root);
	}

	function clearWorkspace(options = {}) {
		const doc = options.document || document;
		const root = getRoot(doc);
		const surface = getSurface(doc);
		if (root) root.hidden = true;
		if (surface) {
			surface.classList.remove('has-selected-appointment');
			surface.classList.add('is-empty');
		}
		renderPatientHeader({ document: doc, patient: null, latestVisit: 'Chưa chọn lượt khám' });
		activateSection(DEFAULT_SECTION_ID, { document: doc });
		return true;
	}

	function openModal(modalId, options = {}) {
		const doc = options.document || document;
		const modalElement = doc.getElementById(modalId);
		const bootstrapApi = options.bootstrapApi || window.bootstrap;
		if (!modalElement || !bootstrapApi?.Modal) return false;
		bootstrapApi.Modal.getOrCreateInstance(modalElement).show();
		return true;
	}

	function bind(options = {}) {
		const doc = options.document || document;
		const root = getRoot(doc);
		if (!root || root.dataset.psychologistWorkspaceBound === 'true') return Boolean(root);

		root.addEventListener('click', event => {
			const sectionLink = event.target.closest('[data-psychologist-section-target]');
			if (sectionLink && root.contains(sectionLink)) {
				event.preventDefault();
				activateSection(sectionLink.dataset.psychologistSectionTarget, { document: doc });
				return;
			}

			const modalTrigger = event.target.closest('[data-psychologist-open-modal]');
			if (!modalTrigger || !root.contains(modalTrigger)) return;
			event.preventDefault();
			const modalId = ({ service: 'serviceModal', order: 'orderModal' })[modalTrigger.dataset.psychologistOpenModal] || '';
			if (modalId) openModal(modalId, { document: doc });
		});

		// Bind the rail links directly as well as through delegation.  This keeps
		// navigation reliable when a shared form handler stops bubbling clicks.
		root.querySelectorAll('[data-psychologist-section-target]').forEach(link => {
			if (link.dataset.psychologistSectionBound === 'true') return;
			link.addEventListener('click', event => {
				event.preventDefault();
				event.stopPropagation();
				activateSection(link.dataset.psychologistSectionTarget, { document: doc });
			}, true);
			link.dataset.psychologistSectionBound = 'true';
		});

		if (window.QLPKWorkflowTwoPane?.bind) {
			window.QLPKWorkflowTwoPane.bind({
				document: doc,
				root: root.closest('.qlpk-workflow-two-pane') || doc.querySelector('.qlpk-workflow-two-pane'),
				defaultPane: 'main'
			});
		}
		bindClinicalAccordions(root);
		root.dataset.psychologistWorkspaceBound = 'true';
		activateSection(DEFAULT_SECTION_ID, { document: doc });
		return true;
	}

	window.PsychologistWorkspaceUi = Object.freeze({
		bind,
		activateSection,
		showWorkspace,
		clearWorkspace,
		openModal,
		renderPatientHeader,
		getRoot
	});
})(window, document);
