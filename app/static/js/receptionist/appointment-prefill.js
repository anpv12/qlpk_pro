function getSafeSetValue(options) {
	return options && options.safeSetValue ? options.safeSetValue : function () { return false; };
}

function getDocument(options) {
	return options && options.document ? options.document : window.document;
}

function triggerChange(elementId, options) {
	const doc = getDocument(options);
	const element = doc.getElementById(elementId);
	if (!element) return;

	element.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function applyDoctor(appointment, options) {
	if (!appointment || !appointment.doctor_id) return;
	const safeSetValue = getSafeSetValue(options);
	safeSetValue('doctorId', appointment.doctor_id);
	triggerChange('doctorId', options || {});
}

function applyServiceSelection(appointment, options) {
	if (!appointment || !appointment.service_id) return;
	const opts = options || {};
	const servicePackage = window.ReceptionistServicePackage;
	if (servicePackage && servicePackage.setServiceSelection) {
		servicePackage.setServiceSelection(appointment, opts.allServices || []);
	}
}

function applyNotes(appointment, options) {
	const safeSetValue = getSafeSetValue(options);
	if (appointment && typeof appointment.notes !== 'undefined' && appointment.notes !== null) {
		safeSetValue('notes', appointment.notes);
	} else {
		safeSetValue('notes', '');
	}
}

function applyLatestAppointmentFields(appointmentData, options) {
	const appointment = appointmentData && appointmentData.appointment;
	if (appointment) {
		applyDoctor(appointment, options);
		applyServiceSelection(appointment, options);
	}
	applyNotes(appointment, options);
	return !!appointment;
}

function applyLatestReExamState(appointmentData, options) {
	const opts = options || {};
	const doc = getDocument(opts);
	const appointment = appointmentData && appointmentData.appointment;
	const reExamCheckbox = doc.getElementById('reExaminationCheck');
	if (reExamCheckbox) {
		reExamCheckbox.checked = !!appointment;
	}

	if (opts.setOriginalAppointmentId) {
		const originalInput = doc.getElementById('originalAppointmentId');
		if (originalInput) {
			originalInput.value = appointment && appointment.id ? appointment.id : '';
		}
	}
}

function applyEditReExamState(appointment, options) {
	const doc = getDocument(options || {});
	const reExamCheckbox = doc.getElementById('reExaminationCheck');
	const originalInput = doc.getElementById('originalAppointmentId');
	const originalAppointmentId = appointment && appointment.original_appointment_id ? appointment.original_appointment_id : '';
	if (reExamCheckbox) {
		reExamCheckbox.checked = !!appointment && (
			appointment.appointment_category === 'RE_EXAMINATION' || !!originalAppointmentId
		);
	}
	if (originalInput) {
		originalInput.value = originalAppointmentId;
	}
}

function clearOriginalAppointmentId(options) {
	const doc = getDocument(options || {});
	const originalInput = doc.getElementById('originalAppointmentId');
	if (originalInput) {
		originalInput.value = '';
	}
}

function bindReExamSourceReset(options) {
	const doc = getDocument(options || {});
	const reExamCheckbox = doc.getElementById('reExaminationCheck');
	if (!reExamCheckbox || reExamCheckbox._reExamSourceResetBound) return;

	reExamCheckbox.addEventListener('change', function () {
		if (!this.checked) {
			clearOriginalAppointmentId(options || {});
		}
	});
	reExamCheckbox._reExamSourceResetBound = true;
}

export const ReceptionistAppointmentPrefill = {
	applyDoctor,
	applyServiceSelection,
	applyNotes,
	applyLatestAppointmentFields,
	applyLatestReExamState,
	applyEditReExamState,
	clearOriginalAppointmentId,
	bindReExamSourceReset
};
