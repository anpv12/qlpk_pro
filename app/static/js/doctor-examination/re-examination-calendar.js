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

function installReExamCalendarFns1(ctx) {
	const hasChoices = () => ctx.choiceFields.service?.getSelected().length && ctx.choiceFields.doctor?.getSelected().length;

	const el = name => ctx.dialog.querySelector(`[data-reexam="${name}"]`);

	const value = () => el('date').value && el('time').value ? `${el('date').value} ${el('time').value}` : '';

	function selectedIdentity() {
        const service = ctx.choiceFields.service.getSelected()[0];
        return { doctor_id: Number(ctx.choiceFields.doctor.getSelected()[0].id), service_id: service.kind === 'service' ? Number(service.id) : null,
            package_id: service.kind === 'package' ? Number(service.id) : null };
    }

	function populateSelection(result, saved) {
        const chosen = saved || result.selection;
        const kind = chosen?.package_id ? 'package' : 'service';
        const serviceId = chosen?.package_id || chosen?.service_id;
        ctx.choiceFields.service.setSelected(result.services.filter(item => item.kind === kind && Number(item.id) === Number(serviceId)));
        ctx.choiceFields.doctor.setSelected(result.doctors.filter(item => Number(item.id) === Number(chosen?.doctor_id)));
    }

	function initializeChoices() {
		const Autocomplete = window.QLPKDoctorModuleRegistry.require('autocompleteField');
		const normalize = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
		for (const [name, collection] of [['service', 'services'], ['doctor', 'doctors']]) {
			ctx.choiceFields[name] = new Autocomplete(el(`${name}-field`), {
				multiple: false, limit: 20,
				getKey: item => `${item.kind || 'doctor'}:${item.id}`,
				getLabel: item => item.name,
				isEnabled: () => !!ctx.context && !ctx.loading && !ctx.loadError && ctx.data?.schedule?.editable !== false,
				loadOptions: async (query, { skip, limit }) => {
					const items = (ctx.data?.[collection] || []).filter(item => !item.disabled && normalize(item.name).includes(normalize(query)));
					return { data: items.slice(skip, skip + limit), pagination: { per_page: limit, has_next: skip + limit < items.length } };
				},
				onChange: () => { error(''); ctx.syncSelection(); }
			});
			el(name).addEventListener('input', event => {
				const field = ctx.choiceFields[name], query = el(name).value;
				if (field.getSelected().length && query !== field.getSelected()[0].name) {
					field.clear({ silent: false }); el(name).value = query;
					if (!event.isComposing) field.scheduleRefresh(query);
				}
			});
		}
	}

	function close() {
		ctx.generation++; ctx.requestGeneration++;
		ctx.context = null; ctx.data = null;
		Object.values(ctx.choiceFields).forEach(field => field.clear());
		ctx.resizeObserver?.disconnect(); ctx.resizeObserver = null;
		ctx.calendar?.destroy(); ctx.calendar = null;
		if (el('detail').open) el('detail').close();
		if (ctx.dialog?.open) ctx.dialog.close();
		ctx.opener?.focus();
	}

	function error(message) {
		el('error').textContent = message;
		el('error').hidden = !message;
	}

	Object.assign(ctx, { hasChoices, el, value, selectedIdentity, populateSelection, initializeChoices, close, error });
}

function installReExamCalendarFns2(ctx) {
	function syncSelection() {
		const selected = ctx.value();
		ctx.el('selection').textContent = selected ? `Đã chọn: ${pretty(selected)}` : 'Chọn ngày và giờ tái khám';
		ctx.el('confirm').disabled = ctx.loading || !!ctx.loadError || !selected || !ctx.hasChoices() || ctx.data?.schedule?.editable === false;
		ctx.dialog.querySelectorAll('.fc-daygrid-day[data-date]').forEach(cell => cell.classList.toggle('reexam-selected', cell.dataset.date === ctx.el('date').value));
		ctx.el('service').disabled = ctx.el('doctor').disabled = ctx.loading || !!ctx.loadError || ctx.data?.schedule?.editable === false;
		if (ctx.el('service').disabled) Object.values(ctx.choiceFields).forEach(field => field.close());
	}

	function selectDate(date) {
		ctx.el('date').value = dayKey(date);
		ctx.error('');
		syncSelection();
	}

	function showDayEvents(events, page = 0) {
		ctx.el('detail-content').replaceChildren();
		const pageSize = 4;
		for (const event of events.slice(page * pageSize, (page + 1) * pageSize)) {
			const row = document.createElement('p');
			row.className = 'doctor-reexam-calendar__event';
			row.textContent = `${event.extendedProps.start.slice(11, 16)} — ${event.title}`;
			ctx.el('detail-content').append(row);
		}
		const navigation = document.createElement('div'); navigation.className = 'doctor-reexam-calendar__pagination';
		for (const [label, target] of [['Trước', page - 1], ['Sau', page + 1]]) {
			const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-sm';
			button.dataset.qlpkButton = 'neutral'; button.dataset.qlpkButtonVariant = 'soft';
			button.textContent = label; button.disabled = target < 0 || target * pageSize >= events.length;
			button.onclick = () => showDayEvents(events, target); navigation.append(button);
		}
		const summary = document.createElement('span'); summary.textContent = `${page + 1}/${Math.ceil(events.length / pageSize)} · ${events.length} lịch`;
		navigation.prepend(summary); ctx.el('detail-content').append(navigation); ctx.el('detail').showModal();
	}

	Object.assign(ctx, { syncSelection, selectDate, showDayEvents });
}

function installReExamCalendarFns3(ctx) {
	function initialize() {
		if (ctx.dialog) return;
		ctx.dialog = document.createElement('dialog');
		ctx.dialog.className = 'doctor-reexam-calendar';
		ctx.dialog.setAttribute('aria-labelledby', 'doctorReexamCalendarTitle');
		ctx.dialog.innerHTML = `
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
		document.body.append(ctx.dialog);
		ctx.el('choices').append(document.getElementById('doctorReexamChoiceFields').content.cloneNode(true));
		ctx.initializeChoices();
		ctx.el('close').onclick = ctx.el('close-top').onclick = ctx.close;
		ctx.el('close-detail').onclick = () => ctx.el('detail').close();
		ctx.el('detail').addEventListener('cancel', event => event.stopPropagation());
		ctx.dialog.addEventListener('cancel', event => { event.preventDefault(); ctx.close(); });
		ctx.el('date').onchange = () => {
			if (ctx.el('date').value) ctx.calendar?.gotoDate(ctx.el('date').value);
			ctx.error(''); ctx.syncSelection();
		};
		ctx.el('time').oninput = () => { ctx.error(''); ctx.syncSelection(); };
		ctx.el('retry').onclick = () => { const options = ctx.context; ctx.close(); if (options) ctx.open(options); };
		ctx.el('confirm').onclick = () => {
			if (ctx.loading || ctx.loadError || !ctx.context || ctx.data?.schedule?.editable === false) return;
			if (!ctx.hasChoices()) { ctx.error('Vui lòng chọn dịch vụ và bác sĩ.'); return; }
			if (!ctx.value() || new Date(ctx.value().replace(' ', 'T')) <= new Date()) {
				ctx.error('Ngày giờ tái khám phải ở tương lai. Vui lòng chọn lại.'); return;
			}
			const selected = ctx.value(), identity = ctx.selectedIdentity(), callback = ctx.context.onConfirm;
			ctx.close(); callback(selected, identity);
		};
		ctx.el('clear').onclick = () => {
			if (!ctx.context || ctx.loading || ctx.loadError || ctx.data?.schedule?.editable === false) return;
			const callback = ctx.context.onConfirm; ctx.close(); callback('', null);
		};
	}

	Object.assign(ctx, { initialize });
}

function installReExamCalendarFns4(ctx) {
	async function open(options) {
		ctx.initialize(); ctx.close();
		ctx.opener = document.activeElement;
		ctx.context = options;
		const token = ctx.generation;
		ctx.loading = true; ctx.loadError = ''; ctx.data = null; ctx.selectionInitialized = false;
		ctx.el('date').min = dayKey(new Date());
		ctx.el('date').value = options.value?.slice(0, 10) || '';
		ctx.el('time').value = options.value?.slice(11, 16) || '09:00';
		ctx.el('counts').replaceChildren(); ctx.el('detail-content').replaceChildren();
		ctx.el('clear').hidden = !options.hasSelection;
		ctx.el('clear').disabled = true;
		ctx.el('retry').hidden = true;
		ctx.el('loading').textContent = 'Đang tải lịch…';
		ctx.error(''); ctx.dialog.showModal(); ctx.syncSelection();
		try {
			await loadCalendarAssets();
			if (token !== ctx.generation) return;
			ctx.calendar = calendarPresentation.create(ctx.el('calendar'), {
				initialDate: ctx.el('date').value || new Date(),
				moreLinkClick(info) { ctx.showDayEvents(info.allSegs.map(segment => segment.event)); return false; },
				dateClick(info) { ctx.selectDate(info.date); },
				eventDidMount(info) {
					const item = info.event.extendedProps;
					info.el.title = `${pretty(item.start)} • ${item.patient_name}\nDịch vụ: ${item.service_name || 'Chưa có'}\nBác sĩ: ${item.doctor_name || 'Chưa có'}\n${statuses[item.status] || item.status}`;
				},
				datesSet() {
					ctx.syncSelection();
				},
				events: async (range, success, failure) => {
					const revision = ++ctx.requestGeneration;
					ctx.loading = true; ctx.loadError = ''; ctx.el('retry').hidden = true;
					ctx.el('loading').textContent = 'Đang tải lịch…'; ctx.syncSelection();
					try {
						const params = new URLSearchParams({ start: dayKey(range.start), end: dayKey(range.end) });
						const result = await ctx.requestJson(`/api/prescription/appointment/${options.appointmentId}/re-examination-calendar?${params}`);
						if (token !== ctx.generation || revision !== ctx.requestGeneration) return;
						ctx.data = result;
						if (!ctx.selectionInitialized) { ctx.populateSelection(result, options.selection); ctx.selectionInitialized = true; }
						calendarPresentation.renderStatusCounts(ctx.el('counts'), Object.fromEntries(
							Object.keys(statuses).map(status => [status, result.events.filter(item => item.status === status).length])
						));
						success(result.events.map(item => ({
							id: String(item.id), title: item.patient_name, start: item.start,
							end: new Date(new Date(item.start).getTime() + item.duration * 60000),
							classNames: ['appointment-event', `status-${item.status.toLowerCase()}`],
							display: 'block', extendedProps: { ...item, patientName: item.patient_name, doctorId: item.doctor_id, doctorName: item.doctor_name, doctorColor: item.doctor_color }
						})));
						ctx.el('loading').textContent = '';
						if (!result.schedule.editable) ctx.error(result.schedule.lock_reason);
					} catch (err) {
						if (token !== ctx.generation || revision !== ctx.requestGeneration) return;
						ctx.loadError = err.message || 'Không tải được lịch.'; failure(err);
						ctx.error(ctx.loadError); ctx.el('retry').hidden = false; ctx.el('loading').textContent = 'Chưa tải được lịch hẹn.';
					} finally {
						if (token === ctx.generation && revision === ctx.requestGeneration) {
							ctx.loading = false; ctx.el('clear').disabled = !!ctx.loadError || ctx.data?.schedule?.editable === false;
							ctx.syncSelection();
						}
					}
				}
			}, { monthOnly: true, getDoctors: () => ctx.data?.doctors || [] });
			ctx.calendar.render();
			ctx.resizeObserver = new ResizeObserver(() => ctx.calendar?.updateSize());
			ctx.resizeObserver.observe(ctx.el('calendar'));
		} catch (err) {
			if (token !== ctx.generation) return;
			ctx.loading = false; ctx.loadError = err.message; ctx.error(ctx.loadError); ctx.el('retry').hidden = false; ctx.syncSelection();
		}
	}

	Object.assign(ctx, { open });
}

export function createReExaminationCalendar({ requestJson }) {
	const ctx = {};
	ctx.requestJson = requestJson;
	installReExamCalendarFns1(ctx);
	installReExamCalendarFns2(ctx);
	installReExamCalendarFns3(ctx);
	installReExamCalendarFns4(ctx);

	ctx.dialog = undefined;
	ctx.calendar = undefined;
	ctx.resizeObserver = undefined;
	ctx.context = undefined;
	ctx.generation = 0;
	ctx.requestGeneration = 0;
	ctx.opener = undefined;
	ctx.loading = false;
	ctx.loadError = '';
	ctx.data = null;
	ctx.selectionInitialized = false;
	ctx.choiceFields = {};
	return { open: ctx.open, close: ctx.close };
}
