import { el } from '../shared/dom.js';

// Waiting-queue / appointment cards built as nodes (patient data is never parsed as HTML).

function joinClasses(...values) {
	return values
		.flat()
		.filter(Boolean)
		.map(value => String(value).trim())
		.filter(Boolean)
		.join(' ');
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

function resolveCardStatus(appointment, options) {
	const isRecentlyEdited = Boolean(appointment.is_latest_edited);
	const recentlyEditedLabel = isRecentlyEdited && options.recentlyEditedStatusText ? options.recentlyEditedStatusText : '';
	let statusText = '';
	if (options.includeStatus !== false) {
		statusText = recentlyEditedLabel || getStatusText(appointment, options.statusTextFallback || 'Đang chờ');
	}
	return {
		isRecentlyEdited,
		statusText,
		statusClass: joinClasses(getStatusClass(appointment), recentlyEditedLabel ? 'is-recently-edited' : ''),
		statusInActions: Boolean(statusText) && options.statusPlacement === 'actions'
	};
}

function buildCardIdentityItems(appointment, options) {
	return [
		options.includePatientCode === false ? '' : formatPatientCodeText(appointment, options),
		options.includeGender ? formatPatientGenderText(appointment) : '',
		options.includeAge ? formatPatientAgeText(appointment, options) : '',
		options.includePhone ? (appointment.patient_phone || appointment.phone || '') : ''
	].filter(Boolean);
}

function resolveSequenceNumber(options, index) {
	const currentPage = options.currentPage || 1;
	const perPage = options.perPage || 0;
	return options.sequenceMode === 'page' && perPage
		? (currentPage - 1) * perPage + index + 1
		: index + 1;
}

function identitySpans(items = []) {
	return items.filter(Boolean).map(item => el('span', {}, item));
}

function buildPractitionerName(value, label = 'BS/TLG:') {
	const parts = splitPractitionerDisplayName(value);
	if (!parts.name) return null;
	return el('span', { class: 'qlpk-waiting-card__practitioner-title-line' },
		el('span', { class: 'qlpk-waiting-card__practitioner-label' }, label),
		parts.title ? [' ', el('strong', { class: 'qlpk-waiting-card__practitioner-title' }, parts.title)] : null,
		el('strong', { class: 'qlpk-waiting-card__practitioner-name' }, parts.name));
}

function buildSeverityIcon(appointment = {}) {
	const config = SEVERITY_BADGES[getAppointmentSeverityLevel(appointment)];
	if (!config) return null;
	return el('span', { class: `qlpk-waiting-card__severity-icon ${config.className}`, 'data-severity-tooltip': config.label, 'aria-label': config.label, tabindex: '0' },
		el('i', { class: `bi ${config.icon} qlpk-feedback-icon`, 'aria-hidden': 'true' }));
}

function buildRecentlyEditedBadge(isRecentlyEdited) {
	if (!isRecentlyEdited) return null;
	return el('span', { class: 'qlpk-status qlpk-status--success qlpk-waiting-card__edited-badge' },
		el('i', { class: 'bi bi-clock-history', 'aria-hidden': 'true' }), el('span', {}, 'Vừa cập nhật'));
}

function buildStatusBadge(statusText, statusClass, statusBadgeClass) {
	if (!statusText) return null;
	return el('span', { class: joinClasses('qlpk-status', 'qlpk-waiting-card__status', statusClass, statusBadgeClass) }, statusText);
}

function buildActionButton(action, title, attrs = {}, className = '') {
	const buttonClass = joinClasses('qlpk-waiting-card__action', `qlpk-waiting-card__action--${action}`, className);
	const iconSystem = window.QLPKIconSystem;
	if (iconSystem && typeof iconSystem.createActionButton === 'function') {
		return iconSystem.createActionButton({ action, title, label: title, attrs, className: buttonClass });
	}
	const fallbackIcon = ({ delete: 'bi-trash', edit: 'bi-pencil-square' })[action] || 'bi-arrow-right-circle';
	const buttonRole = ({ delete: 'danger', edit: 'edit' })[action] || 'execute';
	return el('button', { 'data-qlpk-button': buttonRole, 'data-qlpk-button-variant': 'soft', class: buttonClass, type: 'button', title, 'aria-label': title, ...attrs },
		el('i', { class: `bi ${fallbackIcon}`, 'aria-hidden': 'true' }));
}

function buildActions(actionConfigs = [], options = {}) {
	const configs = actionConfigs
		.map(actionConfig => normalizeActionConfig(actionConfig, options.appointment))
		.filter(Boolean);
	const leading = (options.leading || []).filter(Boolean);
	if (!configs.length && !leading.length) return null;
	return el('div', { class: joinClasses('qlpk-waiting-card__actions', options.className) },
		leading,
		configs.length ? el('div', { class: 'qlpk-waiting-card__action-buttons', role: 'group', 'aria-label': options.actionGroupLabel || 'Thao tác lịch hẹn' },
			configs.map(config => buildActionButton(config.action, config.title, config.attrs, config.className))) : null);
}

function buildSchedule(timeText) {
	if (!timeText) return null;
	return el('div', { class: 'qlpk-waiting-card__schedule', 'aria-label': 'Giờ hẹn' },
		el('span', { class: 'qlpk-waiting-card__schedule-label' }, 'Giờ hẹn'),
		el('strong', { class: 'qlpk-waiting-card__schedule-time' }, timeText));
}

function buildCardMeta(options, { practitionerText, dateText, timeText, schedule }) {
	return [
		options.includePractitioner === false || !practitionerText ? null
			: el('div', { class: 'qlpk-waiting-card__meta-item qlpk-waiting-card__meta-item--practitioner' },
				el('span', { class: 'qlpk-waiting-card__practitioner-line' },
					el('i', { class: 'bi bi-heart-pulse-fill qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--practitioner', 'aria-hidden': 'true' }),
					el('span', { class: 'qlpk-waiting-card__practitioner-text' }, buildPractitionerName(practitionerText, options.practitionerLabel || 'BS/TLG:')))),
		options.includeDateTime === false || (!dateText && !timeText) ? null
			: el('div', { class: 'qlpk-waiting-card__meta-item qlpk-waiting-card__meta-item--datetime' },
				el('span', { class: 'qlpk-waiting-card__datetime' },
					dateText ? el('span', { class: 'qlpk-waiting-card__meta-label' },
						el('i', { class: 'bi bi-calendar3 qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--date', 'aria-hidden': 'true' }), dateText) : null,
					!schedule && timeText ? el('strong', { class: 'qlpk-waiting-card__meta-value' },
						el('i', { class: 'bi bi-clock-history qlpk-waiting-card__meta-icon qlpk-waiting-card__meta-icon--time', 'aria-hidden': 'true' }), timeText) : null))
	].filter(Boolean);
}

function buildCardLeading(appointment, options, status) {
	return [
		status.statusInActions ? el('div', { class: 'qlpk-waiting-card__status-wrap qlpk-waiting-card__status-wrap--actions' }, buildStatusBadge(status.statusText, status.statusClass, options.statusBadgeClass)) : null,
		options.showRecentlyEdited && options.showRecentlyEditedBadge !== false ? buildRecentlyEditedBadge(Boolean(appointment.is_latest_edited)) : null
	].filter(Boolean);
}

function buildAppointmentCardModel(options) {
	const appointment = options.appointment || {};
	const status = resolveCardStatus(appointment, options);
	const timeText = formatAppointmentTimeText(appointment);
	const patientName = appointment.patient_full_name || options.fallbackPatientName || '';
	return {
		appointment,
		status,
		timeText,
		index: Number.isFinite(options.index) ? options.index : 0,
		dateText: formatAppointmentDateText(appointment, options),
		practitionerText: appointment.doctor_name || appointment.psychologist_name || appointment.practitioner_name || '',
		schedule: options.includeSchedule === false ? null : buildSchedule(timeText),
		identityItems: buildCardIdentityItems(appointment, options),
		leading: buildCardLeading(appointment, options, status),
		attrs: Object.assign({ 'data-appointment-id': appointment.id || '' }, options.attrs || {}),
		cardClass: joinClasses(options.cardClass, status.isRecentlyEdited && options.showRecentlyEdited ? 'qlpk-waiting-card--recently-edited' : ''),
		patientName: patientName || 'Chưa có tên',
		patientAfter: options.showSeverity ? buildSeverityIcon(appointment) : null,
		initials: normalizeInitials(patientName)
	};
}

function article(cardClass, attrs, ...children) {
	return el('article', { class: cardClass, ...attrs }, ...children);
}

function buildTimelineCard(model, options) {
	const scheduleItems = [model.timeText, model.dateText].filter(Boolean);
	const statusText = model.status.statusText;
	return article(joinClasses('qlpk-waiting-card', 'qlpk-waiting-card--timeline', model.cardClass), model.attrs,
		el('div', { class: 'qlpk-waiting-card__timeline-marker', 'aria-hidden': 'true' },
			el('span', { class: 'qlpk-waiting-card__avatar' }, model.initials || 'BN')),
		el('div', { class: 'qlpk-waiting-card__timeline-content' },
			el('header', { class: 'qlpk-waiting-card__head' },
				el('strong', { class: 'qlpk-waiting-card__patient-name' },
					el('span', { class: 'qlpk-waiting-card__patient-name-text' }, model.patientName), model.patientAfter)),
			scheduleItems.length ? el('div', { class: 'qlpk-waiting-card__timeline-line qlpk-waiting-card__timeline-line--schedule' }, identitySpans(scheduleItems)) : null,
			model.identityItems.length ? el('div', { class: 'qlpk-waiting-card__identity' }, identitySpans(model.identityItems)) : null,
			statusText ? el('div', { class: 'qlpk-waiting-card__status-wrap' },
				el('span', { class: joinClasses('qlpk-status', 'qlpk-waiting-card__status', model.status.statusClass) }, statusText)) : null,
			buildActions(options.actions || [], { appointment: model.appointment, leading: model.leading, actionGroupLabel: options.actionGroupLabel })));
}

function buildQueueCard(model, options) {
	const { status } = model;
	const statusBadge = buildStatusBadge(status.statusInActions ? '' : status.statusText, status.statusClass);
	const meta = buildCardMeta(options, { practitionerText: model.practitionerText, dateText: model.dateText, timeText: model.timeText, schedule: model.schedule });
	const content = [
		el('header', { class: 'qlpk-waiting-card__head' },
			el('div', { class: 'qlpk-waiting-card__patient' },
				el('strong', { class: 'qlpk-waiting-card__patient-name' },
					el('span', { class: 'qlpk-waiting-card__patient-name-text' }, model.patientName), model.patientAfter),
				model.identityItems.length ? el('span', { class: 'qlpk-waiting-card__identity' }, identitySpans(model.identityItems)) : null),
			statusBadge ? el('div', { class: 'qlpk-waiting-card__status-wrap' }, statusBadge) : null,
			el('span', { class: 'qlpk-waiting-card__index' }, options.indexText || `#${resolveSequenceNumber(options, model.index)}`)),
		meta.length ? el('div', { class: 'qlpk-waiting-card__meta' }, meta) : null,
		buildActions(options.actions || [], {
			appointment: model.appointment,
			leading: model.leading,
			actionGroupLabel: options.actionGroupLabel,
			className: status.statusInActions ? 'qlpk-waiting-card__actions--status-leading' : ''
		})
	];
	return article(joinClasses('qlpk-waiting-card', model.cardClass), model.attrs,
		model.schedule ? el('div', { class: 'qlpk-waiting-card__layout' }, model.schedule, el('div', { class: 'qlpk-waiting-card__content' }, content)) : content);
}

function buildAppointmentCard(options = {}) {
	const model = buildAppointmentCardModel(options);
	return options.variant === 'timeline' ? buildTimelineCard(model, options) : buildQueueCard(model, options);
}

window.QLPKWaitingQueueCardUi = Object.freeze({
	joinClasses,
	buildAppointmentCard,
	formatPatientCodeText,
	formatPatientGenderText
});
window.QLPKDoctorModuleRegistry?.register?.('waitingQueueCardUi', window.QLPKWaitingQueueCardUi);
