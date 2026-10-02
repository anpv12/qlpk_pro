import { AppointmentManagementAllergyFormatUtils } from './allergy-format-utils.js';
import { fieldValue, rebind, removeClass, setAttr, setFieldValue, setProp, showModal, toggleClass } from '../shared/dom-query.js';
import { clearAllFieldErrors, clearFieldError, showFieldError } from './field-errors.js';
function getTodayAndCurrentTime(now) {
	const date = now || new Date();
	return {
		today: date.toISOString().slice(0, 10),
		currentTime: date.toTimeString().slice(0, 5)
	};
}

function isValidEmail(email) {
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	return emailRegex.test(email);
}

function isValidPhone(phone) {
	const phoneRegex = /^[0-9]{8,11}$/;
	return phoneRegex.test(phone.replace(/\s/g, ''));
}

const FIELD_RULES = [
	['addPatientName', 'blur', value => (value.trim() ? '' : 'Vui lòng nhập họ và tên')],
	['addPatientPhone', 'blur', value => (value.trim() && !isValidPhone(value.trim()) ? 'Số điện thoại không hợp lệ' : '')],
	['addPatientEmail', 'blur', value => (value.trim() && !isValidEmail(value.trim()) ? 'Email không hợp lệ' : '')],
	['addAppointmentDate', 'blur', value => (value ? '' : 'Vui lòng chọn ngày hẹn')],
	['addAppointmentTime', 'blur', value => (value ? '' : 'Vui lòng chọn giờ hẹn')],
	['addDoctor', 'change', value => (value ? '' : 'Vui lòng chọn bác sĩ')],
];

function initializeFormValidation() {
	FIELD_RULES.forEach(([id, type, check]) => rebind(`#${id}`, type, 'appointmentAddValidation', function () {
		const message = check(this.value);
		if (message) showFieldError(this, message);
		else clearFieldError(this);
	}));
}

// Date chosen on the calendar for the next opening of the add modal (consumed by prepareAddModalShown).
let selectedAddDate;

function openAddAppointmentWithDate(options) {
	const current = getTodayAndCurrentTime();
	const dateStr = options.dateStr;

	selectedAddDate = dateStr || current.today;
	setFieldValue('#addAppointmentDate', dateStr || current.today);
	setAttr('#addAppointmentDate', 'min', current.today);
	setFieldValue('#addAppointmentTime', current.currentTime);

	showModal('#addAppointmentModal');
	options.loadDoctorsForAdd();
	options.loadServices();
	options.loadPackages();
}

const showSection = (selector, visible) => toggleClass(selector, 'appointment-hidden', !visible);

function resetAddAppointmentForm() {
	document.querySelector('#addAppointmentForm')?.reset();
	showSection('#serviceSelection', true);
	showSection('#packageSelection', false);
}

function applyAppointmentTypeSelection(type, shouldClearOpposite) {
	showSection('#serviceSelection', type === 'service');
	showSection('#packageSelection', type !== 'service');
	if (type === 'service') {
		if (shouldClearOpposite) {
			setFieldValue('#addPackage', '');
		}
	} else {
		if (shouldClearOpposite) {
			setFieldValue('#addService', '');
			setFieldValue('#addServiceId', '');
		}
	}
	if (!fieldValue('#addDuration')) {
		setFieldValue('#addDuration', '60');
	}
}

function applySelectedDuration(element, includeLegacyDurationSelect) {
	const duration = element?.selectedOptions?.[0]?.dataset.duration;
	if (duration) {
		setFieldValue('#addDuration', duration);
		if (includeLegacyDurationSelect) {
			setFieldValue('select[name="duration_minutes"]', duration);
		}
	}
}

function prepareAddModalShown(options) {
	const current = getTodayAndCurrentTime();
	const selectedDate = selectedAddDate;
	const defaultDate = selectedDate || current.today;
	const dateInput = options.document.getElementById('addAppointmentDate');

	options.setDatepickerValue(dateInput, defaultDate, true);
	setAttr('#addAppointmentDate', 'min', current.today);

	if (!fieldValue('#addAppointmentTime')) {
		setFieldValue('#addAppointmentTime', current.currentTime);
	}

	selectedAddDate = undefined;
	options.setupICDMultiSelect('addMedicalHistory', 'add');
	options.initializePhase3Features();
}

function resetAddModalForOpen(options) {
	const form = document.querySelector('#addAppointmentForm');
	if (form) {
		form.reset();
	}

	clearAllFieldErrors();
	setFieldValue('#addDuration', '60');
	setProp('#addPatientName, #addPatientPhone, #addPatientEmail, #addPatientDOB', 'disabled', false);
	setProp('#addMedicalHistory, #addAllergies, #addCurrentMedication', 'disabled', false);
	removeClass('#addPatientName, #addPatientPhone, #addPatientEmail, #addPatientDOB', 'bg-light');
	removeClass('#addMedicalHistory, #addAllergies, #addCurrentMedication', 'bg-light');
	AppointmentManagementAllergyFormatUtils.clearFieldValue(document.getElementById('addAllergies'));

	options.clearSelectedICDs('add');
	options.loadDoctorsForAdd();
	options.loadServices();
	options.loadPackages();

	selectedAddDate = options.dateStr;
	showModal('#addAppointmentModal');
}

function isAddFormValid() {
	const appointmentType = fieldValue('input[name="appointmentType"]:checked');
	const invalid = {
		'#addAppointmentDate': !fieldValue('#addAppointmentDate'),
		'#addAppointmentTime': !fieldValue('#addAppointmentTime'),
		'#addDoctor': !fieldValue('#addDoctor'),
		'#addService': appointmentType === 'service' && !fieldValue('#addServiceId'),
		'#addPackage': appointmentType === 'package' && !fieldValue('#addPackage'),
	};
	Object.entries(invalid).forEach(([selector, isInvalid]) => toggleClass(selector, 'is-invalid', isInvalid));
	return !Object.values(invalid).some(Boolean);
}

function buildAddAppointmentFormData(options) {
	const appointmentDate = fieldValue('#addAppointmentDate');
	const appointmentTime = fieldValue('#addAppointmentTime');
	const fullDateTime = appointmentDate + 'T' + appointmentTime;
	const appointmentType = fieldValue('input[name="appointmentType"]:checked');
	const durationMinutes = parseInt(fieldValue('#addDuration'), 10) || 60;

	const formData = {
		appointment_date: fullDateTime,
		doctor_id: fieldValue('#addDoctor'),
		appointment_category: fieldValue('input[name="appointmentCategory"]:checked'),
		appointment_type: appointmentType,
		service_id: appointmentType === 'service' ? (fieldValue('#addServiceId') || null) : null,
		package_id: appointmentType === 'package' ? (fieldValue('#addPackage') || null) : null,
		duration_minutes: durationMinutes,
		status: fieldValue('#addStatus'),
		main_reason: fieldValue('#addMainReason').trim(),
		main_symptoms: fieldValue('#addSymptoms').trim()
	};

	formData.full_name = fieldValue('#addPatientName').trim();
	formData.phone = fieldValue('#addPatientPhone').trim();
	formData.id_number = fieldValue('#addPatientCCCD').trim();
	formData.email = fieldValue('#addPatientEmail').trim();
	formData.physical_history = options.getSelectedICDsString('add');
	formData.allergies = AppointmentManagementAllergyFormatUtils.getSubmitValue(document.getElementById('addAllergies'));
	formData.current_medication = fieldValue('#addCurrentMedication').trim();
	formData.main_symptoms = fieldValue('#addSymptoms').trim();

	const dob = fieldValue('#addPatientDOB');
	if (dob && dob.trim()) {
		formData.date_of_birth = dob;
	}

	return formData;
}

const AppointmentManagementAddModalUiUtils = {
	applyAppointmentTypeSelection,
	applySelectedDuration,
	buildAddAppointmentFormData,
	clearAllFieldErrors,
	clearFieldError,
	getTodayAndCurrentTime,
	initializeFormValidation,
	isAddFormValid,
	isValidEmail,
	isValidPhone,
	openAddAppointmentWithDate,
	prepareAddModalShown,
	resetAddAppointmentForm,
	resetAddModalForOpen,
	showFieldError
};

export { AppointmentManagementAddModalUiUtils };
