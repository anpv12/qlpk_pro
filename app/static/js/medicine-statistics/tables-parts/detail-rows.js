/* global expandedDoctors */
/* exported formatMoney, formatNumber, getFilterParams, toggleDoctorGroup, toggleMedicineDetail */
// tables.js: toggleDoctorGroup, toggleMedicineDetail, getFilterParams, convertDateFormat, formatNumber, formatMoney (nạp trước tables.js, cùng scope trang).

function toggleDoctorGroup(doctorId) {
	const isExpanded = expandedDoctors.has(doctorId);

	if (isExpanded) {
		expandedDoctors.delete(doctorId);
	} else {
		expandedDoctors.add(doctorId);
	}

	// Update icon
	const icon = document.getElementById(`doctorIcon${doctorId}`);
	if (icon) {
		icon.className = `bi bi-caret-${!isExpanded ? 'down' : 'right'}-fill me-2`;
	}

	// Toggle visibility of prescription rows
	document.querySelectorAll(`.doctor-${doctorId}`).forEach(row => {
		row.classList.toggle('medicine-stats-hidden', isExpanded);
	});

	// Also hide medicine detail rows when collapsing
	if (isExpanded) {
		document.querySelectorAll(`.doctor-${doctorId}`).forEach(row => {
			const presId = row.dataset.prescription;
			if (presId) {
				const detailRow = document.getElementById(`medicine-detail-${presId}`);
				if (detailRow) detailRow.classList.add('medicine-stats-hidden');
				const medIcon = document.getElementById(`medIcon${presId}`);
				if (medIcon) medIcon.className = 'bi bi-caret-right-fill me-1';
			}
		});
	}
}

function toggleMedicineDetail(presId) {
	const detailRow = document.getElementById(`medicine-detail-${presId}`);
	const icon = document.getElementById(`medIcon${presId}`);

	if (!detailRow) return;

	const isVisible = !detailRow.classList.contains('medicine-stats-hidden');
	detailRow.classList.toggle('medicine-stats-hidden', isVisible);

	if (icon) {
		icon.className = `bi bi-caret-${isVisible ? 'right' : 'down'}-fill me-1`;
	}
}

function getFilterParams() {
	const params = new URLSearchParams();

	const fromDate = document.getElementById('dateFrom')?.value;
	const toDate = document.getElementById('dateTo')?.value;
	const doctorId = document.getElementById('doctorFilter')?.value;
	const medicineType = document.getElementById('medicineTypeFilter')?.value;
	const search = document.getElementById('searchInput')?.value;

	if (fromDate) params.set('from_date', convertDateFormat(fromDate));
	if (toDate) params.set('to_date', convertDateFormat(toDate));
	if (doctorId) params.set('doctor_id', doctorId);
	if (medicineType) params.set('medicine_type', medicineType);
	if (search) params.set('search', search);

	return params.toString();
}

function convertDateFormat(dateStr) {
	if (!dateStr) return '';
	const parts = dateStr.split('/');
	if (parts.length === 3) {
		return `${parts[2]}-${parts[1]}-${parts[0]}`;
	}
	return dateStr;
}

function formatNumber(num) {
	return (num || 0).toLocaleString('vi-VN');
}

function formatMoney(amount) {
	return (amount || 0).toLocaleString('vi-VN') + ' đ';
}
