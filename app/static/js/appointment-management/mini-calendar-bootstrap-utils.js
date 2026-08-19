(function () {
	function navigateCalendar(date) {
		if (window.calendar) {
			window.calendar.gotoDate(date);
		}
	}

	function findMiniCalendarElement() {
		return document.querySelector('#miniCalendar .flatpickr-calendar')
			|| document.querySelector('#miniCalendar + .flatpickr-calendar')
			|| document.querySelector('.appt-panel-section .flatpickr-calendar.inline');
	}

	function replaceYearInput(miniCal, calendarElement) {
		const calendarContainer = calendarElement || document.querySelector('#miniCalendar + .flatpickr-calendar');
		if (!calendarContainer || !miniCal) return;

		const numWrapper = calendarContainer.querySelector('.numInputWrapper');
		if (!numWrapper) return;

		const currentYear = miniCal.currentYear || new Date().getFullYear();
		const yearSelect = document.createElement('select');
		yearSelect.className = 'flatpickr-yearDropdown';

		const startYear = currentYear - 5;
		const endYear = currentYear + 5;
		for (let year = startYear; year <= endYear; year += 1) {
			const option = document.createElement('option');
			option.value = year;
			option.textContent = year;
			if (year === currentYear) option.selected = true;
			yearSelect.appendChild(option);
		}

		yearSelect.addEventListener('change', function () {
			const newYear = parseInt(this.value, 10);
			miniCal.changeYear(newYear, false);
			navigateCalendar(new Date(newYear, miniCal.currentMonth, 1));
		});

		numWrapper.replaceWith(yearSelect);

		miniCal.config.onMonthChange.push(function (selectedDates, dateStr, instance) {
			yearSelect.value = instance.currentYear;
		});
		miniCal.config.onYearChange.push(function (selectedDates, dateStr, instance) {
			yearSelect.value = instance.currentYear;
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (typeof flatpickr !== 'function' || !document.getElementById('miniCalendar')) return;

		const miniCal = flatpickr('#miniCalendar', {
			inline: true,
			locale: typeof flatpickr.l10ns.vn !== 'undefined' ? 'vn' : 'default',
			dateFormat: 'Y-m-d',
			defaultDate: new Date(),
			monthSelectorType: 'dropdown',
			onChange: function (selectedDates, dateStr) {
				if (!selectedDates.length) return;
				navigateCalendar(selectedDates[0]);
				if (typeof window.openAddAppointmentWithDate === 'function') {
					window.openAddAppointmentWithDate(dateStr);
				}
			},
			onMonthChange: function (selectedDates, dateStr, instance) {
				navigateCalendar(new Date(instance.currentYear, instance.currentMonth, 1));
			},
			onYearChange: function (selectedDates, dateStr, instance) {
				navigateCalendar(new Date(instance.currentYear, instance.currentMonth, 1));
			}
		});

		const calendarElement = findMiniCalendarElement();
		replaceYearInput(miniCal, calendarElement);
	});
})();
