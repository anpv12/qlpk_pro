(function (window) {
	'use strict';

	const USAGE_MODES = Object.freeze({
		TIME_SLOTS: 'time_slots',
		TIMES_PER_DAY: 'times_per_day'
	});
	const NOTE_MODES = Object.freeze({
		GENERATED: 'generated',
		MANUAL: 'manual'
	});
	const SLOT_FIELDS = Object.freeze(['morning', 'noon', 'afternoon', 'evening']);

	function textOf(value) {
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return value.filter(Boolean).join(', ');
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value).trim();
	}

	function toNumber(value, fallback = 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function ensureUsageMode(value) {
		return textOf(value) === USAGE_MODES.TIMES_PER_DAY
			? USAGE_MODES.TIMES_PER_DAY
			: USAGE_MODES.TIME_SLOTS;
	}

	function resolveStoredMode(value, defaultMode) {
		const raw = textOf(value);
		if (raw === USAGE_MODES.TIMES_PER_DAY || raw === USAGE_MODES.TIME_SLOTS) return raw;
		return defaultMode === USAGE_MODES.TIMES_PER_DAY ? USAGE_MODES.TIMES_PER_DAY : USAGE_MODES.TIME_SLOTS;
	}

	function normalizeNoteMode(value, fallback = NOTE_MODES.MANUAL) {
		return textOf(value).toLowerCase() === NOTE_MODES.GENERATED
			? NOTE_MODES.GENERATED
			: fallback;
	}

	function parseDose(value, fallback = 0) {
		const raw = textOf(value);
		if (!raw || raw === '-') return fallback;
		if (raw.includes('/')) {
			const [numerator, denominator] = raw.split('/').map(item => Number(item.trim().replace(',', '.')));
			if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
				return numerator / denominator;
			}
		}
		const parsed = Number(raw.replace(',', '.'));
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function greatestCommonDivisor(first, second) {
		let left = Math.abs(first);
		let right = Math.abs(second);
		while (right) {
			const remainder = left % right;
			left = right;
			right = remainder;
		}
		return left;
	}

	function decimalToFraction(decimal) {
		if (decimal === 0) return null;
		for (let denominator = 2; denominator <= 10; denominator++) {
			const numerator = Math.round(decimal * denominator);
			if (numerator > 0 && Math.abs(numerator / denominator - decimal) < 0.0001) {
				const divisor = greatestCommonDivisor(numerator, denominator);
				return { numerator: numerator / divisor, denominator: denominator / divisor };
			}
		}
		return null;
	}

	function formatDose(value) {
		if (value === null || value === undefined || value === '') return '0';
		const parsed = parseFloat(value);
		if (Number.isNaN(parsed) || parsed <= 0) return '0';
		if (parsed === Math.floor(parsed)) return parsed.toString();
		if (parsed < 1) {
			const fraction = decimalToFraction(parsed);
			if (fraction) return `${fraction.numerator}/${fraction.denominator}`;
		}
		return parsed.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
	}

	function normalizeSchedule(rawSchedule, mode, options = {}) {
		const source = rawSchedule && typeof rawSchedule === 'object' ? rawSchedule : {};
		const timesPerDay = source.times_per_day || {};
		const timeSlots = source.time_slots || {};
		return {
			mode: mode ? ensureUsageMode(mode) : resolveStoredMode(source.mode, options.defaultMode),
			times_per_day: {
				qty_per_time: Math.max(0.001, parseDose(timesPerDay.qty_per_time, 1) || 1),
				times_per_day: Math.max(1, toNumber(timesPerDay.times_per_day, 1))
			},
			time_slots: Object.fromEntries(SLOT_FIELDS.map(field => [field, Math.max(0, parseDose(timeSlots[field], 0))]))
		};
	}

	function parseUsage(rawUsage, mode, options = {}) {
		const rawText = textOf(rawUsage);
		const fallback = {
			note: rawText,
			noteMode: rawText ? NOTE_MODES.MANUAL : NOTE_MODES.GENERATED,
			schedule: normalizeSchedule({}, mode, options)
		};
		if (!rawText) return fallback;
		try {
			const parsed = JSON.parse(rawText);
			return {
				note: textOf(parsed.note),
				noteMode: normalizeNoteMode(
					parsed.note_mode || parsed.noteMode,
					parsed.note ? NOTE_MODES.MANUAL : NOTE_MODES.GENERATED
				),
				schedule: normalizeSchedule(parsed.schedule || {}, mode, options)
			};
		} catch (error) {
			return fallback;
		}
	}

	window.PrescriptionDoseUtils = Object.freeze({
		USAGE_MODES,
		NOTE_MODES,
		SLOT_FIELDS,
		ensureUsageMode,
		normalizeNoteMode,
		parseDose,
		formatDose,
		normalizeSchedule,
		parseUsage
	});
})(window);
