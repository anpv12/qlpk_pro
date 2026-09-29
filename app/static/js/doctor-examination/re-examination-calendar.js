// Selection-only modal. Prescription form owns patient context, draft and save.
import '../components/appointment-calendar.js';
const calendarPresentation = globalThis.QLPKAppointmentCalendar;
let calendarAssets;
function loadCalendarAssets() {
	if (window.FullCalendar) return Promise.resolve();
	if (!calendarAssets) calendarAssets = new Promise((resolve, reject) => {
		const css = document.createElement('link');
		css.rel = 'stylesheet';
		css.href = '/static/vendor/fullcalendar@5.11.3/main.min.css';
		document.head.append(css);
		const script = document.createElement('script');
		script.src = '/static/vendor/fullcalendar@5.11.3/main.min.js';
		script.onload = resolve;
		script.onerror = () => { script.remove(); css.remove(); calendarAssets = null; reject(new Error('Không tải được giao diện lịch. Vui lòng thử lại.')); };
		document.head.append(script);
	});
	return calendarAssets;
}

const statuses = calendarPresentation.STATUS_LABELS;
const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const pretty = value => value ? `${new Date(value.replace(' ', 'T')).toLocaleDateString('vi-VN', {
	weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric'
})} — ${value.slice(11, 16)}` : 'Chưa chọn ngày giờ';

export function createReExaminationCalendar({ requestJson }) {
	let dialog, calendar, resizeObserver, context, generation = 0, requestGeneration = 0, opener;
	let loading = false, loadError = '', data = null, selectionInitialized = false;
	const choiceFields = {};
	const hasChoices = () => choiceFields.service?.getSelected().length && choiceFields.doctor?.getSelected().length;
	const el = name => dialog.querySelector(`[data-reexam="${name}"]`);
	const value = () => el('date').value && el('time').value ? `${el('date').value} ${el('time').value}` : '';
    function selectedIdentity() {
        const service = choiceFields.service.getSelected()[0];
        return { doctor_id: Number(choiceFields.doctor.getSelected()[0].id), service_id: service.kind === 'service' ? Number(service.id) : null,
            package_id: service.kind === 'package' ? Number(service.id) : null };
    }
    function populateSelection(result, saved) {
        const chosen = saved || result.selection;
        const kind = chosen?.package_id ? 'package' : 'service';
        const serviceId = chosen?.package_id || chosen?.service_id;
        choiceFields.service.setSelected(result.services.filter(item => item.kind === kind && Number(item.id) === Number(serviceId)));
        choiceFields.doctor.setSelected(result.doctors.filter(item => Number(item.id) === Number(chosen?.doctor_id)));
    }
	function initializeChoices() {
		const Autocomplete = window.QLPKDoctorModuleRegistry.require('autocompleteField');
		const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
		for (const [name, collection] of [['service', 'services'], ['doctor', 'doctors']]) {
			choiceFields[name] = new Autocomplete(el(`${name}-field`), {
				multiple: false, limit: 20,
				getKey: item => `${item.kind || 'doctor'}:${item.id}`,
				getLabel: item => item.name,
				isEnabled: () => !!context && !loading && !loadError && data?.schedule?.editable !== false,
				loadOptions: async (query, { skip, limit }) => {
					const items = (data?.[collection] || []).filter(item => !item.disabled && normalize(item.name).includes(normalize(query)));
					return { data: items.slice(skip, skip + limit), pagination: { per_page: limit, has_next: skip + limit < items.length } };
				},
				onChange: () => { error(''); syncSelection(); }
			});
			el(name).addEventListener('input', event => {
				const field = choiceFields[name], query = el(name).value;
				if (field.getSelected().length && query !== field.getSelected()[0].name) {
					field.clear({ silent: false }); el(name).value = query;
					if (!event.isComposing) field.scheduleRefresh(query);
				}
			});
		}
	}
	function close() {
		generation++; requestGeneration++;
		context = null; data = null;
		Object.values(choiceFields).forEach(field => field.clear());
		resizeObserver?.disconnect(); resizeObserver = null;
		calendar?.destroy(); calendar = null;
		if (el('detail').open) el('detail').close();
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
		el('confirm').disabled = loading || !!loadError || !selected || !hasChoices() || data?.schedule?.editable === false;
		dialog.querySelectorAll('.fc-daygrid-day[data-date]').forEach(cell => cell.classList.toggle('reexam-selected', cell.dataset.date === el('date').value));
		el('service').disabled = el('doctor').disabled = loading || !!loadError || data?.schedule?.editable === false;
		if (el('service').disabled) Object.values(choiceFields).forEach(field => field.close());
	}
	function selectDate(date) {
		el('date').value = dayKey(date);
		error('');
		syncSelection();
	}
	function showDayEvents(events, page = 0) {
		el('detail-content').replaceChildren();
		const pageSize = 4;
		for (const event of events.slice(page * pageSize, (page + 1) * pageSize)) {
			const row = document.createElement('p');
			row.className = 'doctor-reexam-calendar__event';
			row.textContent = `${event.extendedProps.start.slice(11, 16)} — ${event.title}`;
			el('detail-content').append(row);
		}
		const navigation = document.createElement('div'); navigation.className = 'doctor-reexam-calendar__pagination';
		for (const [label, target] of [['Trước', page - 1], ['Sau', page + 1]]) {
			const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm';
			button.dataset.qlpkButton = 'neutral'; button.dataset.qlpkButtonVariant = 'soft';
			button.textContent = label; button.disabled = target < 0 || target * pageSize >= events.length;
			button.onclick = () => showDayEvents(events, target); navigation.append(button);
		}
		const summary = document.createElement('span'); summary.textContent = `${page + 1}/${Math.ceil(events.length / pageSize)} · ${events.length} lịch`;
		navigation.prepend(summary); el('detail-content').append(navigation); el('detail').showModal();
	}
	function initialize() {
		if (dialog) return;
		dialog = document.createElement('dialog');
		dialog.className = 'doctor-reexam-calendar';
		dialog.setAttribute('aria-labelledby', 'doctorReexamCalendarTitle');
		dialog.innerHTML = `
			<header class="doctor-reexam-calendar__header" data-qlpk-button-surface="dark"><strong id="doctorReexamCalendarTitle"><i class="bi bi-calendar3"></i> Lịch tái khám — Chọn ngày & giờ</strong><button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="close-top" aria-label="Đóng">×</button></header>
			<div class="doctor-reexam-calendar__body">
				<aside class="doctor-reexam-calendar__sidebar">
					<section><h3>Lịch tái khám</h3><div class="doctor-reexam-calendar__inputs">
						<label>Ngày<input type="date" data-reexam="date"></label><label>Giờ<input type="time" data-reexam="time" step="60"></label>
					</div></section>
					<section class="doctor-reexam-calendar__choices" data-reexam="choices"></section>
					<section class="doctor-reexam-calendar__statuses"><h3>Trạng thái</h3><div data-reexam="counts"></div></section>
				</aside>
				<main class="doctor-reexam-calendar__main"><div class="doctor-reexam-calendar__notice" data-reexam="loading" role="status"></div><div data-reexam="calendar"></div></main>
			</div>
			<footer class="doctor-reexam-calendar__footer"><div><strong data-reexam="selection"></strong><div><small>Bấm Lưu ở màn khám để lưu thay đổi.</small></div><p data-reexam="error" role="alert" hidden></p></div><div class="doctor-reexam-calendar__actions">
				<button data-qlpk-button="danger" data-qlpk-button-variant="soft" type="button" data-reexam="clear" class="btn btn-outline-danger btn-sm">Bỏ hẹn tái khám</button>
				<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="retry" class="btn btn-outline-secondary btn-sm" hidden>Thử lại</button>
				<button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" data-reexam="close" class="btn btn-outline-secondary btn-sm">Đóng</button>
				<button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" data-reexam="confirm" class="btn btn-success btn-sm">✓ Xác nhận lịch tái khám</button>
			</div></footer>
			<dialog class="doctor-reexam-calendar__detail" data-reexam="detail" aria-labelledby="doctorReexamDetailTitle">
				<h3 id="doctorReexamDetailTitle">Lịch hẹn trong ngày</h3><div data-reexam="detail-content"></div>
				<button type="button" class="btn btn-sm" data-qlpk-button="neutral" data-qlpk-button-variant="soft" data-reexam="close-detail">Đóng danh sách</button>
			</dialog>`;
		document.body.append(dialog);
		el('choices').append(document.getElementById('doctorReexamChoiceFields').content.cloneNode(true));
		initializeChoices();
		el('close').onclick = el('close-top').onclick = close;
		el('close-detail').onclick = () => el('detail').close();
		el('detail').addEventListener('cancel', event => event.stopPropagation());
		dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
		el('date').onchange = () => {
			if (el('date').value) calendar?.gotoDate(el('date').value);
			error(''); syncSelection();
		};
		el('time').oninput = () => { error(''); syncSelection(); };
		el('retry').onclick = () => { const options = context; close(); if (options) open(options); };
		el('confirm').onclick = () => {
			if (loading || loadError || !context || data?.schedule?.editable === false) return;
			if (!hasChoices()) { error('Vui lòng chọn dịch vụ và bác sĩ.'); return; }
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
		el('counts').replaceChildren(); el('detail-content').replaceChildren();
		el('clear').hidden = !options.hasSelection;
		el('clear').disabled = true;
		el('retry').hidden = true;
		el('loading').textContent = 'Đang tải lịch…';
		error(''); dialog.showModal(); syncSelection();
		try {
			await loadCalendarAssets();
			if (token !== generation) return;
			calendar = calendarPresentation.create(el('calendar'), {
				initialDate: el('date').value || new Date(),
				moreLinkClick(info) { showDayEvents(info.allSegs.map(segment => segment.event)); return false; },
				dateClick(info) { selectDate(info.date); },
				eventDidMount(info) {
					const item = info.event.extendedProps;
					info.el.title = `${pretty(item.start)} • ${item.patient_name}\nDịch vụ: ${item.service_name || 'Chưa có'}\nBác sĩ: ${item.doctor_name || 'Chưa có'}\n${statuses[item.status] || item.status}`;
				},
				datesSet() {
					syncSelection();
				},
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
						calendarPresentation.renderStatusCounts(el('counts'), Object.fromEntries(
							Object.keys(statuses).map(status => [status, result.events.filter(item => item.status === status).length])
						));
						success(result.events.map(item => ({
							id: String(item.id), title: item.patient_name, start: item.start,
							end: new Date(new Date(item.start).getTime() + item.duration * 60000),
							classNames: ['appointment-event', `status-${item.status.toLowerCase()}`],
							display: 'block', extendedProps: { ...item, patientName: item.patient_name, doctorId: item.doctor_id, doctorName: item.doctor_name, doctorColor: item.doctor_color }
						})));
						el('loading').textContent = '';
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
			}, { monthOnly: true, getDoctors: () => data?.doctors || [] });
			calendar.render();
			resizeObserver = new ResizeObserver(() => calendar?.updateSize());
			resizeObserver.observe(el('calendar'));
		} catch (err) {
			if (token !== generation) return;
			loading = false; loadError = err.message; error(loadError); el('retry').hidden = false; syncSelection();
		}
	}
	return { open, close };
}
