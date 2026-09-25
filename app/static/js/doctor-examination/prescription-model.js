(function (window) {
	'use strict';

	const RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const { textOf, toNumber } = RUNTIME;

	const TYPE_CONTRACT = window.PrescriptionTypeContract;
	if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');

	const PRESCRIPTION_USAGE_MODES = {
		TIME_SLOTS: 'time_slots',
		TIMES_PER_DAY: 'times_per_day'
	};
	const PRESCRIPTION_USAGE_NOTE_MODES = {
		GENERATED: 'generated',
		MANUAL: 'manual'
	};

	const PRESCRIPTION_SLOT_DEFS = [
		{ key: 'morning', field: 'morning', label: 'Sáng' },
		{ key: 'noon', field: 'noon', label: 'Trưa' },
		{ key: 'afternoon', field: 'afternoon', label: 'Chiều' },
		{ key: 'evening', field: 'evening', label: 'Tối' }
	];

	function normalizePrescriptionType(value) {
		return TYPE_CONTRACT.normalizeCatalogType(value);
	}

	function ensurePrescriptionUsageMode(value) {
		const raw = textOf(value);
		return raw === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			: PRESCRIPTION_USAGE_MODES.TIME_SLOTS;
	}

	function normalizeUsageNoteMode(value, fallback = PRESCRIPTION_USAGE_NOTE_MODES.MANUAL) {
		return textOf(value).toLowerCase() === PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
			? PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
			: fallback;
	}

	function parseDoseValue(value, fallback = 0) {
		const raw = textOf(value);
		if (!raw || raw === '-') return fallback;
		if (typeof window.parseFractionalQuantity === 'function') {
			const parsed = window.parseFractionalQuantity(raw);
			return Number.isFinite(parsed) ? parsed : fallback;
		}
		if (raw.includes('/')) {
			const [num, den] = raw.split('/').map(item => Number(item.trim().replace(',', '.')));
			if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) return num / den;
		}
		const parsed = Number(raw.replace(',', '.'));
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function formatDoseValue(value) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) return '';
		if (typeof window.formatDoseAsFraction === 'function') {
			const formatted = window.formatDoseAsFraction(parsed);
			return formatted === '0' ? '' : formatted;
		}
		return parsed % 1 === 0 ? String(parsed) : String(parsed).replace('.', ',');
	}

	function parseMedicineDays(value, fallback = null) {
		const raw = textOf(value);
		if (!raw) return fallback;
		const parsed = Number.parseInt(raw, 10);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
	}

	function roundPrescriptionQuantity(value) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.ceil(Math.max(0, parsed)) : 0;
	}

	function normalizeSchedulePayload(rawSchedule = {}, mode) {
		const normalizedMode = ensurePrescriptionUsageMode(mode || rawSchedule.mode || PRESCRIPTION_USAGE_MODES.TIME_SLOTS);
		const source = { ...rawSchedule, mode: normalizedMode };
		if (typeof window.normalizeScheduleData === 'function') {
			const normalized = window.normalizeScheduleData(source);
			return { ...normalized, mode: normalizedMode };
		}
		const timesPerDay = source.times_per_day || {};
		const timeSlots = source.time_slots || {};
		return {
			mode: normalizedMode,
			times_per_day: {
				qty_per_time: Math.max(0.001, parseDoseValue(timesPerDay.qty_per_time, 1) || 1),
				times_per_day: Math.max(1, toNumber(timesPerDay.times_per_day, 1))
			},
			time_slots: {
				morning: Math.max(0, parseDoseValue(timeSlots.morning, 0)),
				noon: Math.max(0, parseDoseValue(timeSlots.noon, 0)),
				afternoon: Math.max(0, parseDoseValue(timeSlots.afternoon, 0)),
				evening: Math.max(0, parseDoseValue(timeSlots.evening, 0))
			}
		};
	}

	function calculatePrescriptionQuantity(row = {}, medicineDays, mode) {
		const days = parseMedicineDays(medicineDays, 1);

		const schedule = normalizeSchedulePayload(row.schedule || {}, mode);
		const dailyDose = schedule.mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY
			? schedule.times_per_day.qty_per_time * schedule.times_per_day.times_per_day
			: PRESCRIPTION_SLOT_DEFS.reduce((sum, slot) => sum + schedule.time_slots[slot.field], 0);
		return roundPrescriptionQuantity(dailyDose * days);
	}

	function buildMedicineUsageNote(row = {}, medicineDays, mode) {
		const days = parseMedicineDays(medicineDays);
		if (days === null || days <= 0) return '';

		const schedule = normalizeSchedulePayload(row.schedule || {}, mode);
		const route = textOf(row.route) || 'Dùng';
		const unit = textOf(row.unit) || 'đơn vị';
		if (schedule.mode === PRESCRIPTION_USAGE_MODES.TIMES_PER_DAY) {
			const qtyPerTime = formatDoseValue(schedule.times_per_day.qty_per_time);
			const timesPerDay = schedule.times_per_day.times_per_day;
			if (!qtyPerTime || timesPerDay <= 0) return '';
			return `${route} ${qtyPerTime} ${unit}/lần, ${timesPerDay} lần/ngày, trong ${days} ngày.`;
		}

		const slotParts = PRESCRIPTION_SLOT_DEFS
			.filter(slot => schedule.time_slots[slot.field] > 0)
			.map(slot => `${formatDoseValue(schedule.time_slots[slot.field])} ${unit} buổi ${slot.label.toLowerCase()}`);
		return slotParts.length ? `${route} ${slotParts.join(', ')}, trong ${days} ngày.` : '';
	}

	function parseMedicineUsage(rawUsage, mode) {
		const rawText = textOf(rawUsage);
		const fallback = {
			note: rawText,
			noteMode: rawText ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED,
			schedule: normalizeSchedulePayload({}, mode)
		};
		if (!rawText) return fallback;
		if (typeof window.parseMedicineUsagePayload === 'function') {
			const parsed = window.parseMedicineUsagePayload(rawUsage);
			return {
				note: textOf(parsed && parsed.note),
				noteMode: normalizeUsageNoteMode(
					parsed && (parsed.note_mode || parsed.noteMode),
					parsed && parsed.note ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
				),
				schedule: normalizeSchedulePayload(parsed && parsed.schedule ? parsed.schedule : {}, mode)
			};
		}
		try {
			const parsed = JSON.parse(textOf(rawUsage));
			return {
				note: textOf(parsed.note),
				noteMode: normalizeUsageNoteMode(
					parsed.note_mode || parsed.noteMode,
					parsed.note ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
				),
				schedule: normalizeSchedulePayload(parsed.schedule || {}, mode)
			};
		} catch (error) {
			return fallback;
		}
	}

	function buildMedicineUsagePayload(row, mode) {
		const schedule = normalizeSchedulePayload(row.schedule || {}, mode);
		return JSON.stringify({
			note: row.usageNote || '',
			note_mode: normalizeUsageNoteMode(
				row.usageNoteMode,
				row.usageNote ? PRESCRIPTION_USAGE_NOTE_MODES.MANUAL : PRESCRIPTION_USAGE_NOTE_MODES.GENERATED
			),
			schedule
		});
	}

	function parseGlobalUsageInstructions(rawUsage, fallbackMode) {
		const raw = textOf(rawUsage);
		if (!raw) return { globalUsage: '', medicineDays: '', scheduleMode: ensurePrescriptionUsageMode(fallbackMode) };
		if (raw.startsWith('{')) {
			try {
				const parsed = JSON.parse(raw);
				return {
					globalUsage: textOf(parsed.global_usage || parsed.note || parsed.globalUsage),
					medicineDays: parsed.medicine_days ?? parsed.medicineDays ?? '',
					scheduleMode: ensurePrescriptionUsageMode(parsed.schedule_mode || parsed.scheduleMode || parsed.mode || fallbackMode)
				};
			} catch (error) {
				return { globalUsage: raw, medicineDays: '', scheduleMode: ensurePrescriptionUsageMode(fallbackMode) };
			}
		}
		return { globalUsage: raw, medicineDays: '', scheduleMode: ensurePrescriptionUsageMode(fallbackMode) };
	}

	function buildGlobalUsageInstructions(globalUsage, mode, medicineDays) {
		const parsedDays = Math.max(0, parseInt(medicineDays, 10) || 0);
		return JSON.stringify({
			global_usage: globalUsage || '',
			schedule_mode: ensurePrescriptionUsageMode(mode),
			medicine_days: parsedDays || null
		});
	}

	function formatDateTimeForInput(date) {
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
	}

	function calculateReExaminationDateTime(medicineDays, currentDate = new Date()) {
		const rawDays = textOf(medicineDays);
		if (!/^\d+$/.test(rawDays)) return '';
		const days = Number(rawDays);
		if (!Number.isSafeInteger(days) || days < 0) return '';

		const targetDate = currentDate instanceof Date
			? new Date(currentDate.getTime())
			: new Date(currentDate);
		if (Number.isNaN(targetDate.getTime())) return '';
		targetDate.setHours(9, 0, 0, 0);
		targetDate.setDate(targetDate.getDate() + days);
		return formatDateTimeForInput(targetDate);
	}

	function buildDateTimeInputValue(dateValue, timeValue) {
		const rawDate = textOf(dateValue);
		if (!rawDate) return '';
		const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
		const datePart = dateMatch ? dateMatch[1] : rawDate.slice(0, 10);
		const rawTime = textOf(timeValue);
		const timeMatch = rawTime.match(/^(\d{2}):(\d{2})/) || (dateMatch && dateMatch[2] ? ['', dateMatch[2], dateMatch[3]] : null);
		const timePart = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : '09:00';
		return `${datePart} ${timePart}`;
	}

	function parseDateTimeInputValue(value) {
		const raw = textOf(value);
		if (!raw) return { date: '', time: '' };
		const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);
		if (match) {
			return {
				date: `${match[1]}-${match[2]}-${match[3]}`,
				time: match[4] ? `${match[4]}:${match[5]}` : '09:00'
			};
		}
		const parsed = new Date(raw);
		if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
		return {
			date: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
			time: `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`
		};
	}

	const api = {
		PRESCRIPTION_USAGE_MODES,
		PRESCRIPTION_USAGE_NOTE_MODES,
		PRESCRIPTION_SLOT_DEFS,
		normalizePrescriptionType,
		ensurePrescriptionUsageMode,
		normalizeUsageNoteMode,
		parseDoseValue,
		formatDoseValue,
		parseMedicineDays,
		roundPrescriptionQuantity,
		normalizeSchedulePayload,
		calculatePrescriptionQuantity,
		buildMedicineUsageNote,
		parseMedicineUsage,
		buildMedicineUsagePayload,
		parseGlobalUsageInstructions,
		buildGlobalUsageInstructions,
		formatDateTimeForInput,
		calculateReExaminationDateTime,
		buildDateTimeInputValue,
		parseDateTimeInputValue
	};
	window.QLPKDoctorModuleRegistry.register('prescriptionModel', api);
})(window);
