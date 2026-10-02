import { rebind, setFieldValue, setProp, toggleClass } from '../shared/dom-query.js';
import { icon, replace } from '../shared/dom.js';
import { clearAllFieldErrors as clearAllEditFieldErrors, clearFieldError as clearEditFieldError, showFieldError as showEditFieldError } from './field-errors.js';

const STATUS_FLAG_CLASSES = ['appointment-status-flag--scheduled', 'appointment-status-flag--confirmed', 'appointment-status-flag--no-show', 'appointment-status-flag--cancelled'];

function updateEditStatusFlag(options) {
	const flag = document.getElementById('editStatusFlag');
	if (!flag) return;
	const status = options.status;
	flag.classList.remove(...STATUS_FLAG_CLASSES);
	flag.classList.add(`appointment-status-flag--${String(status || '').toLowerCase().replace(/_/g, '-')}`);
	replace(flag, icon(options.getStatusIcon(status), 'me-1'), options.getStatusText(status));
}

const NS = 'appointmentEditValidation';

function initializeEditFormValidation(options) {
	rebind('#editPatientName, #editPatientPhone, #editPatientEmail', 'input', NS, function () {
		options.clearEditFieldError(this);
	});
	rebind('input[name="editAppointmentType"]', 'change', NS, function () {
		const selectedType = this.value;
		if (selectedType !== 'service' && selectedType !== 'package') return;
		const isService = selectedType === 'service';
		toggleClass('#editServiceSelection', 'appointment-hidden', !isService);
		toggleClass('#editPackageSelection', 'appointment-hidden', isService);
		if (isService) {
			setFieldValue('#editPackage', '');
		} else {
			setFieldValue('#editService', '');
			setFieldValue('#editServiceId', '');
		}
		setProp('#editService', 'required', isService);
		setProp('#editPackage', 'required', !isService);
	});
	rebind('#editPackage', 'change', NS, function () {
		const duration = this.selectedOptions[0]?.dataset.duration;
		if (duration) setFieldValue('#editDuration', duration);
	});
}

const AppointmentManagementEditModalUiUtils = {
	clearAllEditFieldErrors,
	clearEditFieldError,
	initializeEditFormValidation,
	showEditFieldError,
	updateEditStatusFlag
};

export { AppointmentManagementEditModalUiUtils };
