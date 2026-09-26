(function (window) {
	'use strict';

	function escapeHtml(value = '') {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function joinClasses(...values) {
		return values
			.flat()
			.filter(Boolean)
			.map(value => String(value).trim())
			.filter(Boolean)
			.join(' ');
	}

	function buildAttributes(attrs = {}) {
		return Object.entries(attrs)
			.filter(([, value]) => value !== false && value != null)
			.map(([key, value]) => {
				if (value === true) return escapeHtml(key);
				return `${escapeHtml(key)}="${escapeHtml(value)}"`;
			})
			.join(' ');
	}

	function buildIdentityHtml(items = []) {
		return items
			.filter(Boolean)
			.map(item => `<span>${escapeHtml(item)}</span>`)
			.join('');
	}

	function buildMetaItemHtml(item = {}) {
		if (item.html) return item.html;
		const iconHtml = item.icon ? `<i class="bi ${escapeHtml(item.icon)} qlpk-waiting-card__meta-icon ${escapeHtml(item.iconClass || '')}" aria-hidden="true"></i>` : '';
		const textHtml = item.strong
			? `<strong class="qlpk-waiting-card__meta-value ${escapeHtml(item.valueClass || '')}">${escapeHtml(item.text || '')}</strong>`
			: `<span class="qlpk-waiting-card__meta-label ${escapeHtml(item.valueClass || '')}">${escapeHtml(item.text || '')}</span>`;

		return `
			<div class="qlpk-waiting-card__meta-item ${escapeHtml(item.className || '')}">
				${iconHtml}${textHtml}
			</div>
		`;
	}

	function buildMetaHtml(items = []) {
		return items.map(buildMetaItemHtml).join('');
	}

	function formatAppointmentDateText(appointment = {}, options = {}) {
		if (!appointment.appointment_date) return '';
		if (typeof options.formatDateDisplay === 'function') {
			return options.formatDateDisplay(appointment.appointment_date) || '';
		}
		return appointment.appointment_date || '';
	}

	function formatAppointmentTimeText(appointment = {}) {
		if (appointment.appointment_time) return appointment.appointment_time;
		if (!appointment.appointment_date) return '';
		const date = new Date(appointment.appointment_date);
		if (Number.isNaN(date.getTime())) return '';
		return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
	}

	function getPatientCode(appointment = {}) {
		return appointment.patient_code || (appointment.patient && appointment.patient.patient_code) || '';
	}

	function formatPatientCodeText(appointment = {}, options = {}) {
		const patientCode = getPatientCode(appointment);
		if (!patientCode) return '';
		if (options.patientCodeLabel === false || options.patientCodeLabel === '') return patientCode;
		return `${options.patientCodeLabel || 'Mã HS'}: ${patientCode}`;
	}

	function formatPatientGenderText(appointment = {}) {
		const rawGender = appointment.patient_gender
			|| appointment.gender
			|| (appointment.patient && appointment.patient.gender)
			|| '';
		const normalizedGender = String(rawGender || '').trim().toLowerCase();
		const genderMap = {
			male: 'Nam',
			nam: 'Nam',
			female: 'Nữ',
			'nu': 'Nữ',
			'nữ': 'Nữ',
			other: 'Khác',
			khac: 'Khác',
			'khác': 'Khác'
		};
		return genderMap[normalizedGender] || rawGender;
	}

	function formatPatientAgeText(appointment = {}, options = {}) {
		if (!appointment.patient_date_of_birth || typeof options.calculateAge !== 'function') return '';
		const age = options.calculateAge(appointment.patient_date_of_birth);
		return age ? `${age} tuổi` : '';
	}

	function splitPractitionerDisplayName(value) {
		const displayName = String(value || '').trim();
		const titleMatch = displayName.match(/^(.+\.)\s+(.+)$/);
		if (!titleMatch) return { title: '', name: displayName };
		return {
			title: titleMatch[1].trim(),
			name: titleMatch[2].trim()
		};
	}

	function renderPractitionerDisplayName(value, label = 'BS/TLG:') {
		const parts = splitPractitionerDisplayName(value);
		if (!parts.name) return '';
		const title = parts.title ? ` <strong class="qlpk-waiting-card__practitioner-title">${escapeHtml(parts.title)}</strong>` : '';
		return `
			<span class="qlpk-waiting-card__practitioner-title-line">
				<span class="qlpk-waiting-card__practitioner-label">${escapeHtml(label)}</span>${title}<strong class="qlpk-waiting-card__practitioner-name">${escapeHtml(parts.name)}</strong>
			</span>
		`;
	}

	function getStatusText(appointment = {}, fallback = 'Đang chờ') {
		if (appointment.examination_status_text || appointment.status_text) {
			return appointment.examination_status_text || appointment.status_text;
		}
		const statusMap = {
			WAITING_TRANSFER: 'Chờ chuyển khám',
			DOCTOR_EXAM: 'Đang khám',
			PSYCHOLOGIST_EXAM: 'Tâm lý gia',
			CONCLUSION: 'Kết luận',
			WAITING_PAYMENT: 'Chờ thanh toán',
			COMPLETED: 'Hoàn thành'
		};
		return statusMap[appointment.examination_status] || fallback;
	}

	function getStatusClass(appointment = {}) {
		const statusMap = {
			WAITING_TRANSFER: 'is-waiting',
			DOCTOR_EXAM: 'is-examining',
			PSYCHOLOGIST_EXAM: 'is-examining',
			CONCLUSION: 'is-conclusion',
			WAITING_PAYMENT: 'is-payment',
			COMPLETED: 'is-completed'
		};
		return statusMap[appointment.examination_status] || 'is-waiting';
	}

	const SEVERITY_BADGES = {
		'Nhẹ': { className: 'is-low', icon: 'bi-info-circle-fill', label: 'Mức độ nghiêm trọng: Nhẹ' },
		'Trung bình': { className: 'is-medium', icon: 'bi-exclamation-triangle-fill', label: 'Mức độ nghiêm trọng: Trung bình' },
		'Nặng': { className: 'is-high', icon: 'bi-exclamation-diamond-fill', label: 'Mức độ nghiêm trọng: Nặng' },
		'Rất nặng': { className: 'is-critical', icon: 'bi-exclamation-octagon-fill', label: 'Mức độ nghiêm trọng: Rất nặng' }
	};

	function getAppointmentSeverityLevel(appointment = {}) {
		return appointment.severity_level || (appointment.patient && appointment.patient.severity_level) || '';
	}

	function renderSeverityIcon(appointment = {}) {
		const severity = getAppointmentSeverityLevel(appointment);
		const config = SEVERITY_BADGES[severity];
		if (!config) return '';
		const label = escapeHtml(config.label);
		return `<span class="qlpk-waiting-card__severity-icon ${config.className}" data-severity-tooltip="${label}" aria-label="${label}" tabindex="0"><i class="bi ${config.icon} qlpk-feedback-icon" aria-hidden="true"></i></span>`;
	}

	function renderRecentlyEditedBadge(isRecentlyEdited) {
		if (!isRecentlyEdited) return '';
		return '<span class="qlpk-status qlpk-status--success qlpk-waiting-card__edited-badge"><i class="bi bi-clock-history" aria-hidden="true"></i><span>Vừa cập nhật</span></span>';
	}

	function renderStatusBadgeHtml(statusText, statusClass, statusBadgeClass) {
		if (!statusText) return '';
		return `<span class="${joinClasses('qlpk-status', 'qlpk-waiting-card__status', statusClass, statusBadgeClass)}">${escapeHtml(statusText)}</span>`;
	}

	function renderActionButton(action, title, attrs = {}, className = '') {
		const buttonClass = joinClasses('qlpk-waiting-card__action', `qlpk-waiting-card__action--${action}`, className);
		if (window.QLPKIconSystem && typeof window.QLPKIconSystem.renderActionButton === 'function') {
			return window.QLPKIconSystem.renderActionButton({ action, title, label: title, attrs, className: buttonClass });
		}

		const attrHtml = buildAttributes(Object.assign({ type: 'button', title, 'aria-label': title }, attrs));
		const fallbackIcon = action === 'delete' ? 'bi-trash' : action === 'edit' ? 'bi-pencil-square' : 'bi-arrow-right-circle';
		const buttonRole = action === 'delete' ? 'danger' : action === 'edit' ? 'edit' : 'execute';
		return `<button data-qlpk-button="${buttonRole}" data-qlpk-button-variant="soft" class="${escapeHtml(buttonClass)}"${attrHtml ? ` ${attrHtml}` : ''}><i class="bi ${fallbackIcon}" aria-hidden="true"></i></button>`;
	}

	function normalizeActionConfig(actionConfig, appointment = {}) {
		if (!actionConfig) return null;
		const config = typeof actionConfig === 'string' ? { action: actionConfig } : actionConfig;
		const action = config.action || 'transfer';
		const dataAction = config.dataAction || action;
		const titles = {
			edit: 'Sửa lịch hẹn',
			transfer: 'Chuyển khám',
			delete: 'Xóa/Hủy lịch hẹn'
		};
		return {
			action,
			title: config.title || titles[action] || action,
			attrs: Object.assign({
				'data-waiting-action': dataAction,
				'data-appointment-id': appointment.id || ''
			}, config.attrs || {}),
			className: config.className || ''
		};
	}

	function renderActions(actionConfigs = [], options = {}) {
		const configs = actionConfigs
			.map(actionConfig => normalizeActionConfig(actionConfig, options.appointment))
			.filter(Boolean);
		if (!configs.length && !options.leadingHtml) return '';

		const buttonsHtml = configs
			.map(config => renderActionButton(config.action, config.title, config.attrs, config.className))
			.join('');

		return `
			<div class="${joinClasses('qlpk-waiting-card__actions', options.className)}">
				${options.leadingHtml || ''}
				${buttonsHtml ? `<div class="qlpk-waiting-card__action-buttons" role="group" aria-label="${escapeHtml(options.actionGroupLabel || 'Thao tác lịch hẹn')}">${buttonsHtml}</div>` : ''}
			</div>
		`;
	}

	function normalizeInitials(value) {
		const words = String(value || '')
			.trim()
			.split(/\s+/)
			.filter(Boolean);
		if (!words.length) return 'BN';
		const sourceWords = words.length === 1 ? [words[0].slice(0, 2)] : [words[0], words[words.length - 1]];
		return sourceWords
			.map(word => word.charAt(0))
			.join('')
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/Đ/g, 'D')
			.replace(/đ/g, 'd')
			.toUpperCase()
			.slice(0, 2) || 'BN';
	}

	function buildScheduleHtml(timeText) {
		if (!timeText) return '';
		return `
			<div class="qlpk-waiting-card__schedule" aria-label="Giờ hẹn">
				<span class="qlpk-waiting-card__schedule-label">Giờ hẹn</span>
				<strong class="qlpk-waiting-card__schedule-time">${escapeHtml(timeText)}</strong>
			</div>
		`;
	}

	function renderAppointmentCard(options = {}) {
		const appointment = options.appointment || {};
		const index = Number.isFinite(options.index) ? options.index : 0;
		const currentPage = options.currentPage || 1;
		const perPage = options.perPage || 0;
		const sequenceNumber = options.sequenceMode === 'page' && perPage
			? (currentPage - 1) * perPage + index + 1
			: index + 1;
		const appointmentId = appointment.id || '';
		const dateText = formatAppointmentDateText(appointment, options);
		const timeText = formatAppointmentTimeText(appointment);
		const practitionerText = appointment.doctor_name || appointment.psychologist_name || appointment.practitioner_name || '';
		const scheduleHtml = options.includeSchedule === false ? '' : buildScheduleHtml(timeText);
		const isRecentlyEdited = Boolean(appointment.is_latest_edited);
		const statusText = options.includeStatus === false
			? ''
			: isRecentlyEdited && options.recentlyEditedStatusText
				? options.recentlyEditedStatusText
				: getStatusText(appointment, options.statusTextFallback || 'Đang chờ');
		const statusClass = joinClasses(
			getStatusClass(appointment),
			isRecentlyEdited && options.recentlyEditedStatusText ? 'is-recently-edited' : ''
		);
		const statusInActions = statusText && options.statusPlacement === 'actions';
		const identityItems = [
			options.includePatientCode === false ? '' : formatPatientCodeText(appointment, options),
			options.includeGender ? formatPatientGenderText(appointment) : '',
			options.includeAge ? formatPatientAgeText(appointment, options) : '',
			options.includePhone ? (appointment.patient_phone || appointment.phone || '') : ''
		].filter(Boolean);
		const metaHtml = [
			options.includePractitioner === false || !practitionerText ? '' : `
				<div class="qlpk-waiting-card__meta-item qlpk-waiting-card__meta-item--practitioner">
					<span class="qlpk-waiting-card__practitioner-line"><i class="bi bi-heart-pulse-fill qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--practitioner" aria-hidden="true"></i><span class="qlpk-waiting-card__practitioner-text">${renderPractitionerDisplayName(practitionerText, options.practitionerLabel || 'BS/TLG:')}</span></span>
				</div>
			`,
			options.includeDateTime === false || (!dateText && !timeText) ? '' : `
				<div class="qlpk-waiting-card__meta-item qlpk-waiting-card__meta-item--datetime">
					<span class="qlpk-waiting-card__datetime">
						${dateText ? `<span class="qlpk-waiting-card__meta-label"><i class="bi bi-calendar3 qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--date" aria-hidden="true"></i>${escapeHtml(dateText)}</span>` : ''}
						${!scheduleHtml && timeText ? `<strong class="qlpk-waiting-card__meta-value"><i class="bi bi-clock-history qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--time" aria-hidden="true"></i>${escapeHtml(timeText)}</strong>` : ''}
					</span>
				</div>
			`
		].filter(Boolean).join('');
		const leadingHtml = [
			statusInActions ? `<div class="qlpk-waiting-card__status-wrap qlpk-waiting-card__status-wrap--actions">${renderStatusBadgeHtml(statusText, statusClass, options.statusBadgeClass)}</div>` : '',
			options.showRecentlyEdited && options.showRecentlyEditedBadge !== false ? renderRecentlyEditedBadge(Boolean(appointment.is_latest_edited)) : '',
			options.leadingActionHtml || ''
		].filter(Boolean).join('');
		const recentlyEditedClass = isRecentlyEdited && options.showRecentlyEdited ? 'qlpk-waiting-card--recently-edited' : '';

		if (options.variant === 'timeline') {
			return renderTimelineAppointmentCard({
				attrs: Object.assign({
					'data-appointment-id': appointmentId
				}, options.attrs || {}),
				cardClass: joinClasses(
					options.cardClass,
					recentlyEditedClass
				),
				initials: normalizeInitials(appointment.patient_full_name || options.fallbackPatientName || ''),
				patientNameHtml: escapeHtml(appointment.patient_full_name || options.fallbackPatientName || 'Chưa có tên'),
				patientAfterHtml: options.showSeverity ? renderSeverityIcon(appointment) : '',
				dateText,
				timeText,
				identityItems,
				statusText,
				statusClass,
				actionsHtml: renderActions(options.actions || [], {
					appointment,
					leadingHtml,
					actionGroupLabel: options.actionGroupLabel
				})
			});
		}

		return renderCard({
			attrs: Object.assign({
				'data-appointment-id': appointmentId
			}, options.attrs || {}),
			cardClass: joinClasses(
				options.cardClass,
				recentlyEditedClass
			),
			patientNameHtml: escapeHtml(appointment.patient_full_name || options.fallbackPatientName || 'Chưa có tên'),
			patientAfterHtml: options.showSeverity ? renderSeverityIcon(appointment) : '',
			identityItems,
				statusText: statusInActions ? '' : statusText,
				statusClass,
				indexText: options.indexText || `#${sequenceNumber}`,
				scheduleHtml,
				metaHtml,
				actionsHtml: renderActions(options.actions || [], {
				appointment,
				leadingHtml,
				actionGroupLabel: options.actionGroupLabel,
				className: statusInActions ? 'qlpk-waiting-card__actions--status-leading' : ''
			})
		});
	}

	function renderTimelineAppointmentCard(options = {}) {
		const cardClass = joinClasses('qlpk-waiting-card', 'qlpk-waiting-card--timeline', options.cardClass);
		const attrs = buildAttributes(options.attrs);
		const articleAttrs = attrs ? ` ${attrs}` : '';
		const patientNameHtml = options.patientNameHtml || escapeHtml(options.patientName || 'N/A');
		const patientAfterHtml = options.patientAfterHtml || '';
		const identityHtml = buildIdentityHtml(options.identityItems || []);
		const scheduleItems = [options.timeText, options.dateText].filter(Boolean);
		const statusClass = joinClasses('qlpk-status', 'qlpk-waiting-card__status', options.statusClass, options.statusBadgeClass);
		const statusHtml = options.statusText
			? `<div class="qlpk-waiting-card__status-wrap"><span class="${statusClass}">${escapeHtml(options.statusText)}</span></div>`
			: '';

		return `
			<article class="${cardClass}"${articleAttrs}>
				<div class="qlpk-waiting-card__timeline-marker" aria-hidden="true">
					<span class="qlpk-waiting-card__avatar">${escapeHtml(options.initials || 'BN')}</span>
				</div>
				<div class="qlpk-waiting-card__timeline-content">
					<header class="qlpk-waiting-card__head">
						<strong class="qlpk-waiting-card__patient-name">
							<span class="qlpk-waiting-card__patient-name-text">${patientNameHtml}</span>${patientAfterHtml}
						</strong>
					</header>
					${scheduleItems.length ? `<div class="qlpk-waiting-card__timeline-line qlpk-waiting-card__timeline-line--schedule">${buildIdentityHtml(scheduleItems)}</div>` : ''}
					${identityHtml ? `<div class="qlpk-waiting-card__identity">${identityHtml}</div>` : ''}
					${statusHtml}
					${options.actionsHtml || ''}
				</div>
			</article>
		`;
	}

	function renderCard(options = {}) {
		const variant = options.variant ? `qlpk-waiting-card--${options.variant}` : '';
		const cardClass = joinClasses('qlpk-waiting-card', variant, options.cardClass);
		const attrs = buildAttributes(options.attrs);
		const patientNameHtml = options.patientNameHtml || escapeHtml(options.patientName || 'N/A');
		const patientAfterHtml = options.patientAfterHtml || '';
		const identityHtml = options.identityHtml || buildIdentityHtml(options.identityItems || []);
		const statusHtml = options.statusHtml || renderStatusBadgeHtml(options.statusText || '', options.statusClass, options.statusBadgeClass);
		const metaHtml = options.metaHtml || buildMetaHtml(options.metaItems || []);
		const actionsHtml = options.actionsHtml || '';
		const articleAttrs = attrs ? ` ${attrs}` : '';
		const contentHtml = `
			<header class="${joinClasses('qlpk-waiting-card__head', options.headClass)}">
				<div class="${joinClasses('qlpk-waiting-card__patient', options.patientClass)}">
					<strong class="${joinClasses('qlpk-waiting-card__patient-name', options.patientNameClass)}">
						<span class="${joinClasses('qlpk-waiting-card__patient-name-text', options.patientNameTextClass)}">${patientNameHtml}</span>${patientAfterHtml}
					</strong>
					${identityHtml ? `<span class="${joinClasses('qlpk-waiting-card__identity', options.identityClass)}">${identityHtml}</span>` : ''}
				</div>
				${statusHtml ? `<div class="${joinClasses('qlpk-waiting-card__status-wrap', options.statusWrapClass)}">${statusHtml}</div>` : ''}
				${options.indexText ? `<span class="${joinClasses('qlpk-waiting-card__index', options.indexClass)}">${escapeHtml(options.indexText)}</span>` : ''}
			</header>
			${metaHtml ? `<div class="${joinClasses('qlpk-waiting-card__meta', options.metaClass)}">${metaHtml}</div>` : ''}
			${actionsHtml}
		`;
		const bodyHtml = options.scheduleHtml
			? `<div class="qlpk-waiting-card__layout">${options.scheduleHtml}<div class="qlpk-waiting-card__content">${contentHtml}</div></div>`
			: contentHtml;

		return `
			<article class="${cardClass}"${articleAttrs}>
				${bodyHtml}
			</article>
		`;
	}

	window.QLPKWaitingQueueCardUi = Object.freeze({
		escapeHtml,
		joinClasses,
		buildAttributes,
		buildIdentityHtml,
		buildMetaItemHtml,
		buildMetaHtml,
		renderCard,
		renderAppointmentCard,
		formatPatientCodeText,
		formatPatientGenderText,
		renderSeverityIcon,
		renderRecentlyEditedBadge,
		renderActions
	});
	window.QLPKDoctorModuleRegistry?.register?.('waitingQueueCardUi', window.QLPKWaitingQueueCardUi);
})(window);
