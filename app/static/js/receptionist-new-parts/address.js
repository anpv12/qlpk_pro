import { apiCall } from '../receptionist-new.js';
import { ReceptionistAddressMainForm } from '../receptionist/address-main-form.js';
// Main-form address helpers for the receptionist page (ES module).

function buildFullAddressFromParts(addressDetail, ward, district, province) {
	return ReceptionistAddressMainForm.buildFullAddressFromParts(addressDetail, ward, district, province);
}

// Load regions (main form) - replacing Provinces
async function loadProvinces() {
	return ReceptionistAddressMainForm.loadProvinces({
		document,
		apiCall,
		console
	});
}

// Load units (main form) - replacing Wards
async function loadWards(provinceName, districtNameIgnored) {
	return ReceptionistAddressMainForm.loadWards(provinceName, districtNameIgnored, {
		document,
		apiCall,
		console
	});
}

// Update address summary
function updateAddressSummary() {
	ReceptionistAddressMainForm.updateAddressSummary({ document });
}

function bindAddressFieldChanges() {
	ReceptionistAddressMainForm.bindAddressFieldChanges({
		document,
		apiCall,
		loadWards
	});
}

export { bindAddressFieldChanges, buildFullAddressFromParts, loadProvinces, loadWards, updateAddressSummary };
