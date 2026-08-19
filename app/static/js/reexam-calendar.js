/**
 * REEXAM CALENDAR MODULE
 * Lịch tái khám dạng Google Calendar (month view)
 * Load DRY template + render calendar + handle interactions
 * Nối real API: GET /api/appointments, GET /services, POST /api/appointments/re-examination
 */
(function () {
	'use strict';

	// ========== STATE ==========
	const state = {
		currentDate: new Date(),
		selectedDate: null,
		selectedTime: null,
		selectedService: null,
		viewMonth: new Date().getMonth(),
		viewYear: new Date().getFullYear(),
		activeFilters: new Set(['pending', 'confirmed', 'no-show', 'cancelled']),
		appointments: [],
		services: [],
		viewMode: 'month', // 'month' or 'week'
		viewWeekStart: null, // Date — Monday of current week
		// Options truyền từ bên ngoài (appointmentId, doctorId)
		options: {}
	};

	// ========== STATUS MAPPING ==========
	const STATUS_MAP = {
		'SCHEDULED': 'pending',
		'CONFIRMED': 'confirmed',
		'NO_SHOW': 'no-show',
		'CANCELLED': 'cancelled'
	};

	function mapStatus(dbStatus) {
		return STATUS_MAP[dbStatus] || 'pending';
	}

	// ========== API CALLS ==========
	async function fetchAppointments() {
		try {
			const firstDay = new Date(state.viewYear, state.viewMonth, 1);
			const lastDay = new Date(state.viewYear, state.viewMonth + 1, 0);
			const dateFrom = formatDateISO(firstDay);
			const dateTo = formatDateISO(lastDay);

			const token = localStorage.getItem('qlpk_token');
			const resp = await fetch(`/api/appointments/?date_from=${dateFrom}&date_to=${dateTo}&per_page=10000`, {
				headers: { 'Authorization': `Bearer ${token}` }
			});
			if (!resp.ok) throw new Error(`API error: ${resp.status}`);
			const data = await resp.json();

			state.appointments = (data.appointments || []).map(a => {
				const dateObj = a.appointment_date ? new Date(a.appointment_date) : null;
				return {
					id: a.id,
					date: dateObj ? formatDateISO(dateObj) : '',
					time: dateObj ? `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}` : '',
					patient: a.patient_full_name || '',
					status: mapStatus(a.status),
					service: a.service_name || '',
					serviceId: a.service_id || null,
					doctor: a.doctor_name || ''
				};
			});
		} catch (err) {
			console.error('[ReexamCalendar] fetchAppointments error:', err);
			state.appointments = [];
		}
	}

	async function fetchServices() {
		try {
			const resp = await fetch('/services/');
			if (!resp.ok) throw new Error(`API error: ${resp.status}`);
			const data = await resp.json();

			state.services = (Array.isArray(data) ? data : []).map(s => ({
				id: s.id,
				name: s.name,
				duration: s.duration_minutes || 60,
				price: s.default_price || 0,
				icon: 'bi-heart-pulse',
				color: '#2563eb'
			}));
		} catch (err) {
			console.error('[ReexamCalendar] fetchServices error:', err);
			state.services = [];
		}
	}

	// ========== DATE HELPERS ==========
	function formatDateISO(dateObj) {
		return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
	}

	function isSameDate(dateA, dateB) {
		return dateA && dateB
			&& dateA.getFullYear() === dateB.getFullYear()
			&& dateA.getMonth() === dateB.getMonth()
			&& dateA.getDate() === dateB.getDate();
	}

	function formatTime(dateObj) {
		return `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
	}

	function buildDateTime(dateObj, timeStr) {
		if (!dateObj || !timeStr) return null;
		const [hoursRaw, minutesRaw] = timeStr.split(':');
		const hours = parseInt(hoursRaw, 10);
		const minutes = parseInt(minutesRaw, 10);
		if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
		return new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate(), hours, minutes, 0, 0);
	}

	function isFutureReexamSlot(dateObj, timeStr) {
		const selectedDateTime = buildDateTime(dateObj, timeStr);
		return selectedDateTime ? selectedDateTime > new Date() : false;
	}

	function getDefaultFutureTimeForDate(dateObj) {
		const now = new Date();
		if (isSameDate(dateObj, now)) {
			const nextSlot = new Date(now.getTime() + 15 * 60 * 1000);
			nextSlot.setSeconds(0, 0);
			const roundedMinutes = Math.ceil(nextSlot.getMinutes() / 15) * 15;
			nextSlot.setMinutes(roundedMinutes, 0, 0);

			if (!isSameDate(nextSlot, now)) {
				return null;
			}

			return formatTime(nextSlot);
		}

		return '09:00';
	}

	function showReexamWarning(message) {
		if (typeof showToast === 'function') {
			showToast('warning', message);
		} else if (typeof window.showCustomToast === 'function') {
			window.showCustomToast('warning', message);
		} else {
			alert(message);
		}
	}

	// ========== TEMPLATE LOADER ==========
	let _loaded = false;
	let _containerId = null;

	async function loadTemplate(containerId) {
		if (_loaded) return;
		const container = document.querySelector(containerId);
		if (!container) return;

		try {
			const resp = await fetch('/static/templates/dry-reexam-calendar/reexam-calendar.html');
			if (!resp.ok) throw new Error('Template load failed');
			container.innerHTML = await resp.text();
			// Fetch data từ API song song
			await Promise.all([fetchAppointments(), fetchServices()]);
			initCalendar();
			_loaded = true;
		} catch (err) {
			console.error('[ReexamCalendar] Template load error:', err);
		}
	}

	// ========== INIT ==========
	function initCalendar() {
		renderMiniCalendar();
		renderMonthGrid();
		renderServiceDropdown();
		updateBadgeCounts();
		bindEvents();
		bindBadgeFilters();
		updateBottomBar();
	}

	// ========== MINI CALENDAR ==========
	function renderMiniCalendar() {
		const grid = document.getElementById('reexamMiniCalGrid');
		const title = document.getElementById('reexamMiniCalTitle');
		if (!grid || !title) return;

		const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
			'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
		title.textContent = `${monthNames[state.viewMonth]}, ${state.viewYear}`;

		const dows = ['Chủ nhật', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
		let html = dows.map(d => `<div class="reexam-dow">${d}</div>`).join('');

		const firstDay = new Date(state.viewYear, state.viewMonth, 1).getDay();
		const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
		const today = new Date();

		// Previous month fill
		const prevMonthDays = new Date(state.viewYear, state.viewMonth, 0).getDate();
		for (let i = firstDay - 1; i >= 0; i--) {
			html += `<div class="reexam-day other">${prevMonthDays - i}</div>`;
		}

		// Current month
		const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
		for (let d = 1; d <= daysInMonth; d++) {
			const cellDate = new Date(state.viewYear, state.viewMonth, d);
			const isPast = cellDate < todayStart;
			const isToday = d === today.getDate() && state.viewMonth === today.getMonth() && state.viewYear === today.getFullYear();
			const isSelected = state.selectedDate &&
				d === state.selectedDate.getDate() &&
				state.viewMonth === state.selectedDate.getMonth() &&
				state.viewYear === state.selectedDate.getFullYear();

			let cls = 'reexam-day';
			if (isPast) cls += ' past';
			if (isToday) cls += ' today';
			if (isSelected) cls += ' selected';

			html += `<div class="${cls}" data-day="${d}">${d}</div>`;
		}

		// Next month fill
		const totalCells = firstDay + daysInMonth;
		const remaining = (7 - totalCells % 7) % 7;
		for (let i = 1; i <= remaining; i++) {
			html += `<div class="reexam-day other">${i}</div>`;
		}

		grid.innerHTML = html;

		// Click handler on mini cal days
		grid.querySelectorAll('.reexam-day:not(.other):not(.past)').forEach(el => {
			el.addEventListener('click', function () {
				const day = parseInt(this.dataset.day);
				state.selectedDate = new Date(state.viewYear, state.viewMonth, day);
				state.selectedTime = getDefaultFutureTimeForDate(state.selectedDate);
				if (!state.selectedTime) {
					state.selectedDate = null;
					showReexamWarning('Không còn khung giờ tái khám hợp lệ trong hôm nay. Vui lòng chọn ngày khác.');
					return;
				}
				renderMiniCalendar();
				renderMonthGrid();
				updateFieldBar();
				updateBottomBar();
			});
		});
	}

	// ========== MONTH GRID ==========
	function renderMonthGrid() {
		const grid = document.getElementById('reexamMonthGrid');
		const monthTitle = document.getElementById('reexamMonthTitle');
		if (!grid || !monthTitle) return;

		const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
			'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
		monthTitle.textContent = `${monthNames[state.viewMonth]}, ${state.viewYear}`;

		const dows = ['Chủ nhật', 'THỨ 2', 'THỨ 3', 'THỨ 4', 'THỨ 5', 'THỨ 6', 'THỨ 7'];
		let html = dows.map(d => `<div class="reexam-dow-header">${d}</div>`).join('');

		const firstDay = new Date(state.viewYear, state.viewMonth, 1).getDay();
		const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
		const today = new Date();
		const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

		// Previous month fill
		const prevMonthDays = new Date(state.viewYear, state.viewMonth, 0).getDate();
		for (let i = firstDay - 1; i >= 0; i--) {
			html += `<div class="reexam-day-cell other-month"><div class="reexam-cell-day">${prevMonthDays - i}</div></div>`;
		}

		// Calculate MAX_VISIBLE dynamically from available cell height
		const totalCellsInGrid = firstDay + daysInMonth;
		const numRows = Math.ceil(totalCellsInGrid / 7);
		const gridHeight = grid.clientHeight;
		const DOW_HEADER_HEIGHT = 28;
		const DAY_NUM_HEIGHT = 18;
		const MORE_LINK_HEIGHT = 16;
		const EVENT_HEIGHT = 16;
		const cellHeight = (gridHeight - DOW_HEADER_HEIGHT) / numRows;
		const MAX_VISIBLE = Math.max(1, Math.floor((cellHeight - DAY_NUM_HEIGHT - MORE_LINK_HEIGHT) / EVENT_HEIGHT));

		// Current month days
		for (let d = 1; d <= daysInMonth; d++) {
			const dateStr = formatDateISO(new Date(state.viewYear, state.viewMonth, d));
			const date = new Date(state.viewYear, state.viewMonth, d);
			const isToday = d === today.getDate() && state.viewMonth === today.getMonth() && state.viewYear === today.getFullYear();
			const isSelected = state.selectedDate &&
				d === state.selectedDate.getDate() &&
				state.viewMonth === state.selectedDate.getMonth() &&
				state.viewYear === state.selectedDate.getFullYear();

			const isPast = date < todayStart;
			let cellCls = 'reexam-day-cell';
			if (isPast) cellCls += ' past';
			if (isToday) cellCls += ' today';
			if (isSelected) cellCls += ' selected';

			// Get appointments for this day (filtered by active badges)
			const dayAppts = state.appointments
				.filter(a => a.date === dateStr)
				.filter(a => state.activeFilters.has(a.status));

			// Render visible items (max MAX_VISIBLE)
			let eventsHtml = '';
			const visibleAppts = dayAppts.slice(0, MAX_VISIBLE);
			const hiddenCount = dayAppts.length - MAX_VISIBLE;

			visibleAppts.forEach(a => {
				eventsHtml += `<div class="reexam-cell-event ${a.status}">${a.time} ${a.patient}</div>`;
			});

			// "+N more" link if overflow
			if (hiddenCount > 0) {
				eventsHtml += `<div class="reexam-more-events" data-day="${d}" data-date="${dateStr}">+${hiddenCount} lịch hẹn</div>`;
			}

			html += `<div class="${cellCls}" data-day="${d}">`;
			html += `<div class="reexam-cell-day">${d}</div>`;
			if (eventsHtml) html += `<div class="reexam-cell-events">${eventsHtml}</div>`;
			html += `</div>`;
		}

		// Next month fill
		const totalCells = firstDay + daysInMonth;
		const remaining = (7 - totalCells % 7) % 7;
		for (let i = 1; i <= remaining; i++) {
			html += `<div class="reexam-day-cell other-month"><div class="reexam-cell-day">${i}</div></div>`;
		}

		grid.innerHTML = html;

		// Click "+N lịch hẹn" → open popover
		grid.querySelectorAll('.reexam-more-events').forEach(el => {
			el.addEventListener('click', function (e) {
				e.stopPropagation();
				const day = parseInt(this.dataset.day);
				const dateStr = this.dataset.date;
				showPopover(this, day, dateStr);
			});
		});

		// Click day cell
		grid.querySelectorAll('.reexam-day-cell:not(.other-month):not(.past)').forEach(el => {
			el.addEventListener('click', function () {
				const day = parseInt(this.dataset.day);
				state.selectedDate = new Date(state.viewYear, state.viewMonth, day);
				state.selectedTime = getDefaultFutureTimeForDate(state.selectedDate);
				if (!state.selectedTime) {
					state.selectedDate = null;
					showReexamWarning('Không còn khung giờ tái khám hợp lệ trong hôm nay. Vui lòng chọn ngày khác.');
					return;
				}
				closePopover();
				renderMiniCalendar();
				renderMonthGrid();
				updateFieldBar();
				updateBottomBar();
			});
		});
	}

	// ========== WEEK GRID ==========
	function getWeekStart(date) {
		const d = new Date(date);
		const day = d.getDay(); // 0=Sun
		const diff = day === 0 ? -6 : 1 - day; // Monday
		d.setDate(d.getDate() + diff);
		d.setHours(0, 0, 0, 0);
		return d;
	}

	function renderWeekGrid() {
		const grid = document.getElementById('reexamWeekGrid');
		const monthTitle = document.getElementById('reexamMonthTitle');
		if (!grid || !monthTitle) return;

		// Init week start if null
		if (!state.viewWeekStart) {
			state.viewWeekStart = getWeekStart(new Date());
		}

		const weekStart = new Date(state.viewWeekStart);
		const weekDays = [];
		for (let i = 0; i < 7; i++) {
			const d = new Date(weekStart);
			d.setDate(weekStart.getDate() + i);
			weekDays.push(d);
		}

		// Update title
		const first = weekDays[0];
		const last = weekDays[6];
		const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
			'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
		if (first.getMonth() === last.getMonth()) {
			monthTitle.textContent = `${monthNames[first.getMonth()]}, ${first.getFullYear()}`;
		} else {
			monthTitle.textContent = `${String(first.getDate()).padStart(2, '0')}/${String(first.getMonth() + 1).padStart(2, '0')} — ${String(last.getDate()).padStart(2, '0')}/${String(last.getMonth() + 1).padStart(2, '0')}, ${last.getFullYear()}`;
		}

		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const dayLabels = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
		const START_HOUR = 7;
		const END_HOUR = 23;

		// Header row
		let html = '<div class="reexam-week-header">';
		html += '<div class="reexam-week-time-col"></div>'; // empty corner
		weekDays.forEach(d => {
			const isToday = d.getTime() === todayStart.getTime();
			const isPast = d < todayStart;
			const isSelected = state.selectedDate &&
				d.getDate() === state.selectedDate.getDate() &&
				d.getMonth() === state.selectedDate.getMonth() &&
				d.getFullYear() === state.selectedDate.getFullYear();
			let cls = 'reexam-week-day-header';
			if (isToday) cls += ' today';
			if (isPast) cls += ' past';
			if (isSelected) cls += ' selected';
			html += `<div class="${cls}"><span class="reexam-week-day-name">${dayLabels[d.getDay()]}</span><span class="reexam-week-day-num">${String(d.getDate()).padStart(2, '0')}</span></div>`;
		});
		html += '</div>';

		// Body with time slots
		html += '<div class="reexam-week-body">';
		for (let h = START_HOUR; h <= END_HOUR; h++) {
			html += '<div class="reexam-week-row">';
			html += `<div class="reexam-week-time-col">${String(h).padStart(2, '0')}:00</div>`;
			weekDays.forEach(d => {
				const dateStr = formatDateISO(d);
				const timeStr = `${String(h).padStart(2, '0')}:00`;
				const cellDateTime = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
				const isPast = cellDateTime <= now;

				// Find appointments in this hour
				const hourAppts = state.appointments
					.filter(a => a.date === dateStr && state.activeFilters.has(a.status))
					.filter(a => {
						const parts = a.time.split(':');
						return parseInt(parts[0]) === h;
					});

				let cellHtml = '';
				hourAppts.forEach(a => {
					cellHtml += `<div class="reexam-week-event ${a.status}" title="${a.time} ${a.patient}">${a.time} ${a.patient}</div>`;
				});

				const pastCls = isPast ? ' past' : '';
				html += `<div class="reexam-week-cell${pastCls}" data-date="${dateStr}" data-time="${timeStr}">${cellHtml}</div>`;
			});
			html += '</div>';
		}
		html += '</div>';

		grid.innerHTML = html;

		// Click handler on cells (not past)
		grid.querySelectorAll('.reexam-week-cell:not(.past)').forEach(el => {
			el.addEventListener('click', function () {
				const dateStr = this.dataset.date;
				const timeStr = this.dataset.time;
				const parts = dateStr.split('-');
				state.selectedDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
				state.selectedTime = timeStr;
				renderWeekGrid();
				renderMiniCalendar();
				updateFieldBar();
				updateBottomBar();
			});
		});
	}

	// ========== SERVICE DROPDOWN ==========
	function renderServiceDropdown() {
		const dropdown = document.getElementById('reexamServiceDropdown');
		if (!dropdown) return;

		let html = '';
		state.services.forEach(s => {
			html += `
				<div class="reexam-ac-item" data-service-id="${s.id}" data-service-name="${s.name}">
					<div class="reexam-ac-avatar" style="background:${s.color};"><i class="bi ${s.icon}"></i></div>
					<div class="reexam-ac-info">
						<div class="reexam-ac-name">${s.name}</div>
						<div class="reexam-ac-detail">${s.duration} phút</div>
					</div>
					<div class="reexam-ac-price">${Number(s.price).toLocaleString('vi-VN')}đ</div>
				</div>`;
		});
		dropdown.innerHTML = html;

		// Click service item
		dropdown.querySelectorAll('.reexam-ac-item').forEach(el => {
			el.addEventListener('click', function () {
				const name = this.dataset.serviceName;
				const id = parseInt(this.dataset.serviceId);
				state.selectedService = state.services.find(s => s.id === id);
				document.getElementById('reexamServiceSearch').value = name;
				dropdown.classList.remove('show');
				updateSelectedServiceDisplay();
			});
		});
	}

	// ========== UPDATE HELPERS ==========
	function updateFieldBar() {
		const dateInput = document.getElementById('reexamDateInput');
		const timeInput = document.getElementById('reexamTimeInput');
		if (!dateInput || !timeInput) return;

		if (state.selectedDate) {
			const d = state.selectedDate;
			dateInput.value = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
		} else {
			dateInput.value = '';
		}

		timeInput.value = state.selectedTime || '';

		// Fill service search input if selected
		const serviceInput = document.getElementById('reexamServiceSearch');
		if (serviceInput) {
			serviceInput.value = state.selectedService ? (state.selectedService.name || '') : '';
		}
		updateSelectedServiceDisplay();
	}

	function updateSelectedServiceDisplay() {
		const displayEl = document.getElementById('reexamSelectedServiceDisplay');
		const nameEl = document.getElementById('reexamSelectedServiceName');
		if (!displayEl || !nameEl) return;

		if (state.selectedService && state.selectedService.name) {
			nameEl.textContent = state.selectedService.name;
			displayEl.style.display = 'flex';
		} else {
			nameEl.textContent = '';
			displayEl.style.display = 'none';
		}
	}

	function syncToMainField() {
		const mainField = document.getElementById('prescriptionReExaminationDateTime');
		if (!mainField || !state.selectedDate) return;

		const d = state.selectedDate;
		const dateStr = formatDateISO(d);
		const timeStr = state.selectedTime || '09:00';
		mainField.value = `${dateStr} ${timeStr}`;

		// Trigger flatpickr update if available
		if (mainField._flatpickr) {
			mainField._flatpickr.setDate(`${dateStr} ${timeStr}`, true);
		}

		// Auto-check reexamination checkbox if not checked
		const checkbox = document.getElementById('prescriptionReExaminationCheck');
		if (checkbox && !checkbox.checked) {
			checkbox.checked = true;
			if (typeof toggleReExaminationDate === 'function') {
				// Don't call toggleReExaminationDate as it would overwrite our date
				// Just enable the input
				if (mainField._flatpickr && mainField._flatpickr.altInput) {
					mainField._flatpickr.altInput.disabled = false;
				}
				mainField.disabled = false;
			}
		}

		// Reverse sync: calculate medication days from selected date
		const daysInput = document.getElementById('prescriptionMedicineDays');
		if (daysInput) {
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const selected = new Date(d);
			selected.setHours(0, 0, 0, 0);
			const diffMs = selected - today;
			const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
			if (diffDays > 0) {
				daysInput.value = diffDays;
				// Recalculate prescription quantities with new days
				if (typeof updateAllPrescriptionRowTotals === 'function') {
					updateAllPrescriptionRowTotals();
				}
			}
		}
	}

	function updateBottomBar() {
		const text = document.getElementById('reexamSelectedText');
		if (!text) return;

		if (state.selectedDate && state.selectedTime) {
			const d = state.selectedDate;
			const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
			const dayName = dayNames[d.getDay()];
			const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
			text.innerHTML = `<i class="bi bi-calendar-check"></i> &nbsp;Đã chọn: <strong>${dayName}, ${dateStr} — ${state.selectedTime}</strong>`;
		} else {
			text.innerHTML = `<i class="bi bi-calendar-check"></i> &nbsp;Chưa chọn lịch tái khám`;
		}
	}

	// ========== EVENT BINDINGS ==========
	function bindEvents() {
		// Toggle button handler is in initReexamCalendar (lazy load)

		// Re-render grid after modal animation completes (grid has real height now)
		const calModalEl = document.getElementById('reexamCalendarModal');
		if (calModalEl) {
			calModalEl.addEventListener('shown.bs.modal', function () {
				renderMiniCalendar();
				if (state.viewMode === 'week') renderWeekGrid();
				else renderMonthGrid();
				updateFieldBar();
				updateBottomBar();
			});
		}

		// Time input manual edit → sync to state
		const timeInputEl = document.getElementById('reexamTimeInput');
		if (timeInputEl) {
			timeInputEl.addEventListener('change', function () {
				state.selectedTime = this.value || null;
				updateBottomBar();
			});
		}

		// Today button
		const todayBtn = document.getElementById('reexamBtnToday');
		if (todayBtn) {
			todayBtn.addEventListener('click', async function () {
				const today = new Date();
				state.viewMonth = today.getMonth();
				state.viewYear = today.getFullYear();
				state.viewWeekStart = getWeekStart(today);
				await fetchAppointments();
				renderMiniCalendar();
				if (state.viewMode === 'week') renderWeekGrid();
				else renderMonthGrid();
				updateBadgeCounts();
			});
		}

		// Month navigation (main)
		const prevBtn = document.getElementById('reexamPrevMonth');
		const nextBtn = document.getElementById('reexamNextMonth');
		if (prevBtn) prevBtn.addEventListener('click', () => {
			if (state.viewMode === 'week') navigateWeek(-1);
			else navigateMonth(-1);
		});
		if (nextBtn) nextBtn.addEventListener('click', () => {
			if (state.viewMode === 'week') navigateWeek(1);
			else navigateMonth(1);
		});

		// View toggle (Tuần / Tháng)
		const viewBtns = document.querySelectorAll('.reexam-view-btns button');
		viewBtns.forEach(btn => {
			btn.addEventListener('click', function () {
				const view = this.dataset.view;
				if (view === state.viewMode) return;
				state.viewMode = view;

				// Toggle active class
				viewBtns.forEach(b => b.classList.remove('active'));
				this.classList.add('active');

				const monthGrid = document.getElementById('reexamMonthGrid');
				const weekGrid = document.getElementById('reexamWeekGrid');

				if (view === 'week') {
					if (!state.viewWeekStart) state.viewWeekStart = getWeekStart(new Date());
					if (monthGrid) monthGrid.style.display = 'none';
					if (weekGrid) weekGrid.style.display = '';
					renderWeekGrid();
				} else {
					if (weekGrid) weekGrid.style.display = 'none';
					if (monthGrid) monthGrid.style.display = '';
					renderMonthGrid();
				}
			});
		});

		// Mini calendar navigation
		const miniPrev = document.getElementById('reexamMiniPrev');
		const miniNext = document.getElementById('reexamMiniNext');
		if (miniPrev) miniPrev.addEventListener('click', () => navigateMonth(-1));
		if (miniNext) miniNext.addEventListener('click', () => navigateMonth(1));

		// Service search
		const searchInput = document.getElementById('reexamServiceSearch');
		const dropdown = document.getElementById('reexamServiceDropdown');
		if (searchInput && dropdown) {
			searchInput.addEventListener('focus', () => dropdown.classList.add('show'));
			searchInput.addEventListener('input', function () {
				const term = this.value.toLowerCase();
				dropdown.querySelectorAll('.reexam-ac-item').forEach(item => {
					const name = item.dataset.serviceName.toLowerCase();
					item.style.display = name.includes(term) ? '' : 'none';
				});
				dropdown.classList.add('show');
			});
		}

		// Close dropdown on outside click
		document.addEventListener('click', function (e) {
			if (!e.target.closest('.reexam-fg-auto')) {
				const dd = document.getElementById('reexamServiceDropdown');
				if (dd) dd.classList.remove('show');
			}
		});

		// Confirm button
		const confirmBtn = document.getElementById('reexamBtnConfirm');
		if (confirmBtn) {
			confirmBtn.addEventListener('click', async function () {
				if (state.selectedDate && state.selectedTime) {
					if (!isFutureReexamSlot(state.selectedDate, state.selectedTime)) {
						showReexamWarning('Thời điểm tái khám phải nằm trong tương lai. Vui lòng chọn lại ngày giờ.');
						return;
					}

					syncToMainField();
					// Auto-check the re-examination checkbox
					const checkbox = document.getElementById('prescriptionReExaminationCheck');
					if (checkbox && !checkbox.checked) {
						checkbox.checked = true;
						if (typeof toggleReExaminationDate === 'function') {
							toggleReExaminationDate();
						}
					}
					// Ghi service_id đã chọn vào hidden input
					const serviceIdInput = document.getElementById('reexamSelectedServiceId');
					if (serviceIdInput) {
						serviceIdInput.value = state.selectedService ? state.selectedService.id : '';
					}
					const mainField = document.getElementById('prescriptionReExaminationDateTime');
					if (mainField) {
						mainField.dataset.reexamServiceId = state.selectedService ? String(state.selectedService.id) : '';
					}

					// Save prescription to trigger backend re-exam appointment creation
					if (typeof savePrescriptionToServer === 'function') {
						await savePrescriptionToServer();
					}

					// Close modal
					const modalEl = document.getElementById('reexamCalendarModal');
					if (modalEl) {
						const modal = bootstrap.Modal.getInstance(modalEl);
						if (modal) modal.hide();
					}
					// Show success feedback
					if (typeof showToast === 'function') {
						showToast('success', 'Đã chọn lịch tái khám thành công!');
					}
				}
			});
		}
	}

	// ========== BADGE COUNTS ==========
	function updateBadgeCounts() {
		const badges = document.getElementById('reexamStatusBadges');
		if (!badges) return;

		// Đếm từ data theo tháng đang xem
		const counts = { pending: 0, confirmed: 0, 'no-show': 0, cancelled: 0 };
		state.appointments.forEach(a => {
			if (counts.hasOwnProperty(a.status)) counts[a.status]++;
		});

		badges.querySelectorAll('.reexam-legend-tag').forEach(tag => {
			const status = tag.dataset.status;
			const countEl = tag.querySelector('.reexam-badge-count');
			if (countEl && counts.hasOwnProperty(status)) {
				countEl.textContent = counts[status];
			}
		});
	}

	// ========== BADGE FILTER ==========
	function bindBadgeFilters() {
		const badges = document.getElementById('reexamStatusBadges');
		if (!badges) return;

		badges.querySelectorAll('.reexam-legend-tag').forEach(tag => {
			tag.addEventListener('click', function () {
				const status = this.dataset.status;
				if (state.activeFilters.has(status)) {
					state.activeFilters.delete(status);
					this.classList.remove('active');
				} else {
					state.activeFilters.add(status);
					this.classList.add('active');
				}
				renderMonthGrid();
			});
		});
	}

	// ========== POPOVER ==========
	function closePopover() {
		document.querySelectorAll('.reexam-popover, .reexam-popover-backdrop').forEach(el => el.remove());
	}

	function showPopover(triggerEl, day, dateStr) {
		closePopover();

		const date = new Date(state.viewYear, state.viewMonth, day);

		// Get all appointments for this day
		const dayAppts = state.appointments
			.filter(a => a.date === dateStr)
			.filter(a => state.activeFilters.has(a.status));

		if (dayAppts.length === 0) return;

		// Build popover HTML
		const dayNames = ['Chủ nhật', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
		const dayLabel = `${dayNames[date.getDay()]}, ${String(day).padStart(2, '0')}/${String(state.viewMonth + 1).padStart(2, '0')}`;

		let itemsHtml = '';
		dayAppts.forEach(a => {
			itemsHtml += `<div class="reexam-cell-event ${a.status}">${a.time} ${a.patient}</div>`;
		});

		const popover = document.createElement('div');
		popover.className = 'reexam-popover';
		popover.innerHTML = `
			<div class="reexam-popover-header">
				<span class="reexam-popover-title">${dayLabel} — ${dayAppts.length} lịch hẹn</span>
				<button class="reexam-popover-close" title="Đóng">✕</button>
			</div>
			${itemsHtml}
		`;

		// Position popover near trigger element
		const triggerRect = triggerEl.getBoundingClientRect();
		const modalBody = triggerEl.closest('.modal-body') || document.body;
		const modalRect = modalBody.getBoundingClientRect();

		popover.style.left = (triggerRect.left - modalRect.left) + 'px';
		popover.style.top = (triggerRect.bottom - modalRect.top + 4) + 'px';

		// Backdrop to close on outside click
		const backdrop = document.createElement('div');
		backdrop.className = 'reexam-popover-backdrop';
		backdrop.addEventListener('click', closePopover);

		modalBody.appendChild(backdrop);
		modalBody.appendChild(popover);

		// Adjust if popover overflows right edge
		const popoverRect = popover.getBoundingClientRect();
		if (popoverRect.right > modalRect.right - 10) {
			popover.style.left = (modalRect.width - popoverRect.width - 10) + 'px';
		}
		// Adjust if popover overflows bottom
		if (popoverRect.bottom > modalRect.bottom - 10) {
			popover.style.top = (triggerRect.top - modalRect.top - popoverRect.height - 4) + 'px';
		}

		// Bind close button
		popover.querySelector('.reexam-popover-close').addEventListener('click', closePopover);
	}

	async function navigateMonth(delta) {
		state.viewMonth += delta;
		if (state.viewMonth > 11) { state.viewMonth = 0; state.viewYear++; }
		if (state.viewMonth < 0) { state.viewMonth = 11; state.viewYear--; }
		await fetchAppointments();
		renderMiniCalendar();
		renderMonthGrid();
		updateBadgeCounts();
	}

	async function navigateWeek(delta) {
		const ws = state.viewWeekStart || getWeekStart(new Date());
		ws.setDate(ws.getDate() + delta * 7);
		state.viewWeekStart = new Date(ws);
		// Also update viewMonth/viewYear to keep mini calendar in sync
		state.viewMonth = ws.getMonth();
		state.viewYear = ws.getFullYear();
		await fetchAppointments();
		renderMiniCalendar();
		renderWeekGrid();
		updateBadgeCounts();
	}

	// ========== PUBLIC API ==========
	window.initReexamCalendar = function (containerId, options) {
		if (options) {
			if (options.viewMonth !== undefined) state.viewMonth = options.viewMonth;
			if (options.viewYear !== undefined) state.viewYear = options.viewYear;
			state.options = options;
		}
		_containerId = containerId;

		// Lazy load: only load template on first click of toggle button
		const toggleBtn = document.getElementById('reexamToggleBtn');
		if (toggleBtn) {
			toggleBtn.addEventListener('click', async function () {
				// Parse existing date/time FIRST to set correct month for fetch
				const mainField = document.getElementById('prescriptionReExaminationDateTime');
				if (mainField && mainField.value) {
					const val = mainField.value.trim();
					const parts = val.split(' ');
					if (parts.length >= 1) {
						const dateParts = parts[0].split('-');
						if (dateParts.length === 3) {
							state.selectedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
							state.viewMonth = state.selectedDate.getMonth();
							state.viewYear = state.selectedDate.getFullYear();
							state.viewWeekStart = getWeekStart(state.selectedDate);
						}
						if (parts[1]) {
							state.selectedTime = parts[1].substring(0, 5);
						}
					}
				} else {
					// Clear stale values from previous patient
					state.selectedDate = null;
					state.selectedTime = null;
					state.selectedService = null;
					const today = new Date();
					state.viewMonth = today.getMonth();
					state.viewYear = today.getFullYear();
					state.viewWeekStart = getWeekStart(today);
				}

				// Load template + fetch data (uses correct viewMonth now)
				if (!_loaded) {
					await loadTemplate(_containerId);
				} else {
					// Already loaded, re-fetch for correct month
					await fetchAppointments();
				}

				if (_loaded) {
					// Find matching appointment to pre-fill service
					if (state.selectedDate) {
						const selectedServiceId = mainField?.dataset?.reexamServiceId || document.getElementById('reexamSelectedServiceId')?.value || '';
						const dateStr = formatDateISO(state.selectedDate);
						const matchAppt = state.appointments.find(a => a.date === dateStr && a.time === state.selectedTime);
						if (selectedServiceId) {
							state.selectedService = state.services.find(s => String(s.id) === String(selectedServiceId)) || null;
						} else if (matchAppt && matchAppt.serviceId) {
							state.selectedService = state.services.find(s => s.id === matchAppt.serviceId) || null;
						}
					}
					const modalEl = document.getElementById('reexamCalendarModal');
					if (modalEl) {
						const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
						modal.show();
					}
				}
			});
		}
	};

})();
