import { AppointmentManagementAddModalUiUtils } from './add-modal-ui-utils.js';
import { loadDoctorsForAdd } from './page-calendar.js';
import { loadPackages, loadServices } from './page-data.js';

// Opens the add-appointment modal for a date (header button, calendar day and mini calendar).
function openAddAppointmentWithDate(dateStr) {
	AppointmentManagementAddModalUiUtils.openAddAppointmentWithDate({ dateStr, loadDoctorsForAdd, loadServices, loadPackages });
}

export { openAddAppointmentWithDate };
