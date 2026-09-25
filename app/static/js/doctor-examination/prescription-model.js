(function (window) {
	'use strict';

	const RUNTIME = window.QLPKDoctorModuleRegistry.get('supportRuntime');
	if (!RUNTIME) throw new Error('Thiếu Doctor support runtime');

	const { textOf, toNumber } = RUNTIME;

	const TYPE_CONTRACT = window.PrescriptionTypeContract;
	if (!TYPE_CONTRACT) throw new Error('Thiếu contract loại đơn thuốc dùng chung');

	const DOSE = window.PrescriptionDoseUtils;
	if (!DOSE) throw new Error('Thiếu tiện ích liều thuốc dùng chung');

	const PRESCRIPTION_USAGE_MODES = DOSE.USAGE_MODES;
	const PRESCRIPTION_USAGE_NOTE_MODES = DOSE.NOTE_MODES;
	const ensurePrescriptionUsageMode = DOSE.ensureUsageMode;
	const normalizeUsageNoteMode = DOSE.normalizeNoteMode;
	const parseDoseValue = DOSE.parseDose;
	const normalizeSchedulePayload = DOSE.normalizeSchedule;
	const parseMedicineUsage = DOSE.parseUsage;

	const PRESCRIPTION_SLOT_DEFS = [
		{ key: 'morning', field: 'morning', label: 'Sáng' },
		{ key: 'noon', field: 'noon', label: 'Trưa' },
		{ key: 'afternoon', field: 'afternoon', label: 'Chiều' },
		{ key: 'evening', field: 'evening', label: 'Tối' }
	];

	function normalizePrescriptionType(value) {
		return TYPE_CONTRACT.normalizeCatalogType(value);
	}

	function formatDoseValue(value) {
		const parsed = Number(value);
		if (!Number.isFinite(parsed) || parsed <= 0) return '';
		const formatted = DOSE.formatDose(parsed);
		return formatted === '0' ? '' : formatted;
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
