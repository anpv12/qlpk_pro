const STATUS_LABELS = { SCHEDULED: 'Chờ xác nhận', CONFIRMED: 'Đã xác nhận', NO_SHOW: 'Không đến', CANCELLED: 'Hủy' };

function escapeHtml(value) {
	return String(value ?? '')
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function resolveDoctorDotColor(doctorId, doctors) {
	let dotColor = '';
	if (doctorId && doctors && doctors.length) {
		const doctor = doctors.find(item => String(item.id) === String(doctorId));
		if (doctor && doctor.calendar_color) dotColor = doctor.calendar_color;
	}

	if (!dotColor) {
		dotColor = 'var(--qlpk-feedback-neutral)';
	}

	return dotColor;
}

function buildHolidayEventContent(event) {
	const holidayName = event.title;
	return {
		html: `
          <div class="holiday-date">
                <div class="holiday-content">
                  <div class="holiday-icon"></div>
                  <div class="holiday-text">${escapeHtml(holidayName)}</div>
                </div>
              </div>
            `
	};
}

function buildAppointmentEventContent(arg, options = {}) {
	const doc = options.document || window.document;
	const doctors = options.doctors || [];
	const patientName = arg.event.extendedProps.patientName || arg.event.title;
	const doctorName = arg.event.extendedProps.doctorName || '';
	const doctorId = arg.event.extendedProps.doctorId;

	const eventContent = doc.createElement('div');
	eventContent.className = 'fc-event-compact';

	if (doctorName) {
		const dotColor = arg.event.extendedProps.doctorColor || resolveDoctorDotColor(doctorId, doctors);
		const dot = doc.createElement('span');
		dot.className = 'fc-doc-dot';
		dot.title = doctorName;
		dot.style.backgroundColor = dotColor;
		eventContent.appendChild(dot);
	}

	if (arg.timeText) {
		const time = doc.createElement('span');
		time.className = 'fc-event-compact-time';
		time.textContent = arg.timeText;
		eventContent.appendChild(time);
	}

	const title = doc.createElement('span');
	title.className = 'fc-event-compact-title';
	title.textContent = patientName;
	eventContent.appendChild(title);

	return {
		domNodes: [eventContent]
	};
}

function buildEventContent(arg, options = {}) {
	if (arg.event.extendedProps.type === 'holiday') {
		return buildHolidayEventContent(arg.event);
	}

	return buildAppointmentEventContent(arg, options);
}

function decorateToolbar(host, info) {
	const date = info.view.currentStart;
	const title = host.querySelector('.fc-toolbar-title');
	if (title) title.textContent = `Tháng ${date.getMonth() + 1}, ${date.getFullYear()}`;
	host.querySelectorAll('.fc-button').forEach(button => {
		button.dataset.qlpkButton = 'neutral'; button.dataset.qlpkButtonVariant = 'soft';
		button.classList.remove('fc-button-primary');
	});
}

function create(host, options = {}, presentation = {}) {
	host.classList.add('qlpk-appointment-calendar');
	return new window.FullCalendar.Calendar(host, {
		...options,
		locale: 'vi', firstDay: 1, initialView: 'dayGridMonth',
		fixedWeekCount: false, height: '100%', dayMaxEvents: true,
		headerToolbar: { left: 'today prev,next title', center: '', right: presentation.monthOnly ? '' : 'timeGridWeek,dayGridMonth' },
		buttonText: { today: 'Hôm nay', week: 'Tuần', month: 'Tháng' },
		dayHeaderFormat: { weekday: 'short' },
		eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
		moreLinkText: count => `+${count} lịch`,
		eventContent: arg => buildEventContent(arg, { doctors: presentation.getDoctors?.() || [] }),
		datesSet(info) { decorateToolbar(host, info); options.datesSet?.(info); }
	});
}

function renderStatusCounts(host, counts) {
	host.replaceChildren(); host.classList.add('qlpk-calendar-statuses');
	const total = Object.keys(STATUS_LABELS).reduce((sum, status) => sum + (Number(counts[status]) || 0), 0);
	for (const [status, label] of Object.entries(STATUS_LABELS)) {
		const value = Number(counts[status]) || 0;
		const row = host.ownerDocument.createElement('div'); row.className = `qlpk-appointment-status status-${status.toLowerCase()}`;
		const name = host.ownerDocument.createElement('span'); name.textContent = label;
		const count = host.ownerDocument.createElement('strong'); count.textContent = value;
		// Thanh tỉ lệ: phần của trạng thái trong tổng lịch đang hiển thị.
		const track = host.ownerDocument.createElement('span'); track.className = 'qlpk-appointment-status__track'; track.setAttribute('aria-hidden', 'true');
		const fill = host.ownerDocument.createElement('i'); fill.style.setProperty('--status-share', `${total ? Math.round(value / total * 100) : 0}%`);
		track.append(fill);
		row.title = `${label}: ${value}${total ? ` / ${total} lịch (${Math.round(value / total * 100)}%)` : ''}`;
		row.append(name, count, track); host.append(row);
	}
}

export const QLPKAppointmentCalendar = {
	create, renderStatusCounts, STATUS_LABELS,
	buildAppointmentEventContent,
	buildEventContent,
	buildHolidayEventContent,
	resolveDoctorDotColor
};
