// Selection-only modal. Prescription form owns patient context, draft and save.
let calendarAssets;
function loadCalendarAssets() {
	if (window.FullCalendar) return Promise.resolve();
	if (!calendarAssets) calendarAssets = new Promise((resolve, reject) => {
		const css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css';
		document.head.append(css);
		const script = document.createElement('script');
		script.src = 'https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js';
		script.onload = resolve;
		script.onerror = () => { script.remove(); css.remove(); calendarAssets = null; reject(new Error('Không tải được giao diện lịch. Vui lòng thử lại.')); };
		document.head.append(script);
	});
	return calendarAssets;
}

const statuses = {
	SCHEDULED: { label: 'Chờ xác nhận', color: 'var(--qlpk-feedback-warning)' },
	CONFIRMED: { label: 'Đã xác nhận', color: 'var(--qlpk-feedback-success)' },
	NO_SHOW: { label: 'Không đến', color: 'var(--qlpk-feedback-neutral)' },
	CANCELLED: { label: 'Hủy', color: 'var(--qlpk-feedback-error)' }
};
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const pretty = value => value ? `${new Date(value.replace(' ', 'T')).toLocaleDateString('vi-VN', {
	weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
})} — ${value.slice(11, 16)}` : 'Chưa chọn ngày giờ';

export function createReExaminationCalendar({ requestJson }) {
	let dialog, calendar, mini, context, generation = 0, requestGeneration = 0, opener;
	let loading = false, loadError = '', data = null, selectionInitialized = false;
	const el = name => dialog.querySelector(`[data-reexam="${name}"]`);
	const value = () => el('date').value && el('time').value ? `${el('date').value} ${el('time').value}` : '';
    function selectedIdentity() {
        const [kind, id] = el('service').value.split(':');
        return { doctor_id: Number(el('doctor').value), service_id: kind === 'service' ? Number(id) : null,
            package_id: kind === 'package' ? Number(id) : null };
    }
    function populateSelection(result, saved) {
        const chosen = saved || result.selection;
        el('service').replaceChildren(); el('doctor').replaceChildren();
        for (const item of result.services) {
            const option = new Option(item.name, `${item.kind}:${item.id}`);
            option.disabled = !!item.disabled; el('service').append(option);
        }
        for (const item of result.doctors) {
            const option = new Option(item.name, item.id);
            option.disabled = !!item.disabled; el('doctor').append(option);
        }
        el('service').value = chosen?.package_id ? `package:${chosen.package_id}` : `service:${chosen?.service_id}`;
        el('doctor').value = chosen?.doctor_id || '';
    }
	function close() {
		generation++; requestGeneration++;
		context = null; data = null;
		calendar?.destroy(); calendar = null;
		mini?.destroy(); mini = null;
		if (dialog?.open) dialog.close();
		opener?.focus();
	}
	function error(message) {
		el('error').textContent = message;
		el('error').hidden = !message;
	}
	function syncSelection() {
		const selected = value();
		el('selection').textContent = selected ? `Đã chọn: ${pretty(selected)}` : 'Chọn ngày và giờ tái khám';
		el('confirm').disabled = loading || !!loadError || !selected || !el('service').value || !el('doctor').value || data?.schedule?.editable === false;
		mini?.setDate(el('date').value, false);
		dialog.querySelectorAll('.fc-daygrid-day[data-date]').forEach(cell => cell.classList.toggle('reexam-selected', cell.dataset.date === el('date').value));
		el('service').disabled = el('doctor').disabled = loading || !!loadError || data?.schedule?.editable === false;
	}
	function selectDate(date) {
		el('date').value = dayKey(date);
		error('');
		syncSelection();
	}
	function initialize() {
		if (dialog) return;
		dialog = document.createElement('dialog');
		dialog.className = 'doctor-reexam-calendar';
		dialog.setAttribute('aria-labelledby', 'doctorReexamCalendarTitle');
		dialog.innerHTML = `
			<header class="doctor-reexam-calendar__header"><strong id="doctorReexamCalendarTitle"><i class="bi bi-calendar3"></i> Lịch tái khám — Chọn ngày & giờ</strong><button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="close-top" aria-label="Đóng">×</button></header>
			<div class="doctor-reexam-calendar__body">
				<aside class="doctor-reexam-calendar__sidebar">
					<div data-reexam="mini"></div>
					<section><h3>Lịch tái khám</h3><div class="doctor-reexam-calendar__inputs">
						<label>Ngày<input type="date" data-reexam="date"></label><label>Giờ<input type="time" data-reexam="time" step="60"></label>
					</div></section>
					<section class="doctor-reexam-calendar__choices"><label for="reexamService">Dịch vụ</label><select id="reexamService" data-reexam="service"></select><label for="reexamDoctor">Bác sĩ khám</label><select id="reexamDoctor" data-reexam="doctor"></select></section>
					<section><h3>Trạng thái</h3><div data-reexam="counts"></div></section>
					<section data-reexam="detail" aria-live="polite" hidden></section>
				</aside>
				<main class="doctor-reexam-calendar__main"><div class="doctor-reexam-calendar__notice" data-reexam="loading" role="status"></div><div data-reexam="calendar"></div></main>
			</div>
			<footer class="doctor-reexam-calendar__footer"><div><strong data-reexam="selection"></strong><div><small>Bấm Lưu ở màn khám để lưu thay đổi.</small></div><p data-reexam="error" role="alert" hidden></p></div><div class="doctor-reexam-calendar__actions">
				<button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" data-reexam="clear" class="btn btn-outline-danger btn-sm">Bỏ hẹn tái khám</button>
				<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="retry" class="btn btn-outline-secondary btn-sm" hidden>Thử lại</button>
				<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="close" class="btn btn-outline-secondary btn-sm">Đóng</button>
				<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" data-reexam="confirm" class="btn btn-success btn-sm">✓ Xác nhận lịch tái khám</button>
			</div></footer>`;
		document.body.append(dialog);
		el('close').onclick = el('close-top').onclick = close;
		dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
		el('date').onchange = () => {
			if (el('date').value) calendar?.gotoDate(el('date').value);
			error(''); syncSelection();
		};
		el('service').onchange = el('doctor').onchange = () => { error(''); syncSelection(); };
		el('time').oninput = () => { error(''); syncSelection(); };
		el('retry').onclick = () => { const options = context; close(); if (options) open(options); };
		el('confirm').onclick = () => {
			if (loading || loadError || !context || data?.schedule?.editable === false) return;
			if (!el('service').value || !el('doctor').value) { error('Vui lòng chọn dịch vụ và bác sĩ.'); return; }
			if (!value() || new Date(value().replace(' ', 'T')) <= new Date()) {
				error('Ngày giờ tái khám phải ở tương lai. Vui lòng chọn lại.'); return;
			}
			const selected = value(), identity = selectedIdentity(), callback = context.onConfirm;
			close(); callback(selected, identity);
		};
		el('clear').onclick = () => {
			if (!context || loading || loadError || data?.schedule?.editable === false) return;
			const callback = context.onConfirm; close(); callback('', null);
		};
	}
	async function open(options) {
		initialize(); close();
		opener = document.activeElement;
		context = options;
		const token = generation;
		loading = true; loadError = ''; data = null; selectionInitialized = false;
		el('date').min = dayKey(new Date());
		el('date').value = options.value?.slice(0, 10) || '';
		el('time').value = options.value?.slice(11, 16) || '09:00';
		el('service').replaceChildren(new Option('Đang tải…', '')); el('doctor').replaceChildren(new Option('Đang tải…', ''));
		el('counts').replaceChildren(); el('detail').replaceChildren(); el('detail').hidden = true;
		el('clear').hidden = !options.hasSelection;
		el('clear').disabled = true;
		el('retry').hidden = true;
		el('loading').textContent = 'Đang tải lịch…';
		error(''); dialog.showModal(); syncSelection();
		try {
			await loadCalendarAssets();
			if (token !== generation) return;
			mini = window.flatpickr(el('mini'), {
				inline: true, locale: 'vn', defaultDate: el('date').value || new Date(),
                onDayCreate(_dates, _value, instance, day) {
                    // Keep the final week containing this month, not Flatpickr's filler weeks.
                    const end = new Date(instance.currentYear, instance.currentMonth + 1, 1);
                    const trailingDays = (7 + instance.l10n.firstDayOfWeek - end.getDay()) % 7;
                    end.setDate(end.getDate() + trailingDays);
                    day.hidden = day.dateObj >= end;
                },
				onChange(dates) { if (dates[0]) { selectDate(dates[0]); calendar?.gotoDate(dates[0]); } }
			});
			calendar = new window.FullCalendar.Calendar(el('calendar'), {
				initialView: 'dayGridMonth', initialDate: el('date').value || new Date(),
				locale: 'vi', firstDay: 0, height: '100%', fixedWeekCount: false,
				headerToolbar: { left: 'today prev,next title', right: 'dayGridWeek,dayGridMonth' },
				buttonText: { today: 'Hôm nay', month: 'Tháng', week: 'Tuần' },
				eventTimeFormat: { hour: '2-digit', minute: '2-digit', hour12: false },
				dayMaxEvents: true, moreLinkText: count => `+${count} lịch`,
				dateClick(info) { selectDate(info.date); },
				eventDidMount(info) {
					const item = info.event.extendedProps;
					info.el.title = `${pretty(item.start)} • ${item.patient_name}\nDịch vụ: ${item.service_name || 'Chưa có'}\nBác sĩ: ${item.doctor_name || 'Chưa có'}\n${statuses[item.status]?.label || item.status}`;
				},
				eventClick(info) {
					const item = info.event.extendedProps;
					el('detail').replaceChildren(); el('detail').hidden = false;
					for (const text of [item.patient_name, pretty(item.start), `Dịch vụ: ${item.service_name || 'Chưa có'}`, `Bác sĩ: ${item.doctor_name || 'Chưa có'}`, statuses[item.status]?.label || item.status]) {
						const line = document.createElement('p'); line.textContent = text; el('detail').append(line);
					}
				},
				datesSet() { syncSelection(); },
				events: async (range, success, failure) => {
					const revision = ++requestGeneration;
					loading = true; loadError = ''; el('retry').hidden = true;
					el('loading').textContent = 'Đang tải lịch…'; syncSelection();
					try {
						const params = new URLSearchParams({ start: dayKey(range.start), end: dayKey(range.end) });
						const result = await requestJson(`/api/prescription/appointment/${options.appointmentId}/re-examination-calendar?${params}`);
						if (token !== generation || revision !== requestGeneration) return;
						data = result;
						if (!selectionInitialized) { populateSelection(result, options.selection); selectionInitialized = true; }
						el('counts').replaceChildren();
						for (const [status, config] of Object.entries(statuses)) {
							const line = document.createElement('div');
							line.className = 'doctor-reexam-calendar__count'; line.style.color = config.color;
							const label = document.createElement('span'); label.textContent = config.label;
							const count = document.createElement('strong'); count.textContent = result.events.filter(item => item.status === status).length;
							line.append(label, count); el('counts').append(line);
						}
						success(result.events.map(item => ({
							id: String(item.id), title: item.patient_name, start: item.start,
							end: new Date(new Date(item.start).getTime() + item.duration * 60000),
							backgroundColor: statuses[item.status]?.color, borderColor: statuses[item.status]?.color,
							display: 'block', extendedProps: item
						})));
						el('loading').textContent = result.events.length ? '' : 'Không có lịch hẹn trong khoảng đang xem.';
						if (!result.schedule.editable) error(result.schedule.lock_reason);
					} catch (err) {
						if (token !== generation || revision !== requestGeneration) return;
						loadError = err.message || 'Không tải được lịch.'; failure(err);
						error(loadError); el('retry').hidden = false; el('loading').textContent = 'Chưa tải được lịch hẹn.';
					} finally {
						if (token === generation && revision === requestGeneration) {
							loading = false; el('clear').disabled = !!loadError || data?.schedule?.editable === false;
							syncSelection();
						}
					}
				}
			});
			calendar.render();
		} catch (err) {
			if (token !== generation) return;
			loading = false; loadError = err.message; error(loadError); el('retry').hidden = false; syncSelection();
		}
	}
	return { open, close };
}
