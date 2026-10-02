import { QLPKUserFeedback } from '../shared/user-feedback.js';
import { setDatepickerValue } from '../datepicker-init.js';

(function (window, document) {
	'use strict';

	const CONFIG = {
		apiCall: null,
		showToast: null,
		getAppointmentId: null,
		getPatientId: null
	};

	function configure(options = {}) {
		['apiCall', 'showToast', 'getAppointmentId', 'getPatientId'].forEach(key => {
			if (Object.prototype.hasOwnProperty.call(options, key) && options[key]) CONFIG[key] = options[key];
		});
	}

	function getDocument(options) {
		return options?.document || document;
	}

	function getScopedDocument(context, config = {}) {
		return window.QLPKDoctorModuleRegistry.require('componentDomScope').create({
			document: getDocument(context),
			rootId: config.rootId,
			strictRoot: config.strictRoot
		});
	}

	function mergeConfig(defaults, config, nestedKeys = []) {
		const source = config || {};
		return {
			...defaults,
			...source,
			...Object.fromEntries(nestedKeys.map(key => [key, { ...(defaults[key] || {}), ...(source[key] || {}) }]))
		};
	}

	function createChangeTracker(state, { revisionKey, dirtyKey }) {
		return Object.freeze({
			mark() {
				state[revisionKey] += 1;
				state[dirtyKey] = true;
			},
			restore(dirty) {
				state[dirtyKey] = Boolean(dirty);
				if (state[dirtyKey]) state[revisionKey] += 1;
			},
			reset() {
				state[dirtyKey] = false;
				state[revisionKey] = 0;
			},
			capture: () => state[revisionKey],
			changedSince: revision => revision !== state[revisionKey],
			settle(revision) {
				if (revision !== state[revisionKey]) return false;
				state[dirtyKey] = false;
				return true;
			}
		});
	}

	function createSectionChangeTracker(state, { revisionsKey, dirtyKey }) {
		return Object.freeze({
			mark(section) {
				state[revisionsKey][section] = (state[revisionsKey][section] || 0) + 1;
				state[dirtyKey].add(section);
			},
			reset() {
				state[dirtyKey].clear();
				state[revisionsKey] = {};
			},
			capture: section => state[revisionsKey][section] || 0,
			settle(section, revision) {
				if (revision !== (state[revisionsKey][section] || 0)) return false;
				state[dirtyKey].delete(section);
				return true;
			}
		});
	}

	function getElement(doc, id) {
		return doc.getElementById(id);
	}

	function textOf(value) {
		if (value === undefined || value === null) return '';
		if (Array.isArray(value)) return value.filter(Boolean).join(', ');
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value).trim();
	}

	function hasText(value) {
		return textOf(value) !== '';
	}

	function hasValue(value) {
		if (value === undefined || value === null) return false;
		if (Array.isArray(value)) return value.length > 0;
		return textOf(value) !== '';
	}

	function toNumber(value, fallback = 0) {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : fallback;
	}

	function normalizeId(value) {
		const parsed = Number(value);
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	}

	function calculateAge(value) {
		if (!value) return '';
		const raw = String(value);
		const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
		const birthDate = match
			? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
			: new Date(raw);
		if (Number.isNaN(birthDate.getTime())) return '';

		const today = new Date();
		let age = today.getFullYear() - birthDate.getFullYear();
		const monthDelta = today.getMonth() - birthDate.getMonth();
		if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
		return age >= 0 ? String(age) : '';
	}

	function escapeHtml(value) {
		return textOf(value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function escapeAttr(value) {
		return escapeHtml(value);
	}

	function resolveElement(doc, id, options = {}) {
		return typeof options.resolveElement === 'function'
			? options.resolveElement(doc, id)
			: getElement(doc, id);
	}

	function setText(doc, id, value, options = {}) {
		const element = resolveElement(doc, id, options);
		if (!element) return;
		const text = textOf(value);
		element.textContent = text || textOf(options.fallback);
		if (options.hideWhenEmpty) element.hidden = !text;
	}

	function setValue(doc, id, value, options = {}) {
		const element = resolveElement(doc, id, options);
		if (!element) return;
		const text = textOf(value);
		if (element instanceof window.HTMLInputElement || element instanceof window.HTMLTextAreaElement || element instanceof window.HTMLSelectElement) {
			element.value = text;
			return;
		}
		element.textContent = text;
	}

	function getValue(doc, id, options = {}) {
		const element = resolveElement(doc, id, options);
		return element ? textOf(element.value) : '';
	}

	function setChecked(doc, id, value) {
		const element = getElement(doc, id);
		if (element) element.checked = Boolean(value);
	}

	function isChecked(doc, id) {
		const element = getElement(doc, id);
		return Boolean(element && element.checked);
	}

	function formatCurrency(value) {
		const amount = toNumber(value, 0);
		try {
			return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(amount);
		} catch (error) {
			return Math.round(amount).toLocaleString('vi-VN') + ' ₫';
		}
	}

	function setDateTimePickerValue(element, value, triggerChange = false) {
		if (!element) return;
		if (element._flatpickr && typeof setDatepickerValue === 'function') {
			setDatepickerValue(element, value || null, triggerChange);
		} else if (element._flatpickr) {
			element._flatpickr.setDate(value || null, triggerChange);
		} else {
			element.value = value || '';
		}
	}

	function setDateTimeInputDisabled(element, disabled) {
		if (!element) return;
		element.disabled = disabled;
		if (element._flatpickr && element._flatpickr.altInput) {
			element._flatpickr.altInput.disabled = disabled;
		}
	}

	async function readResponseFailure(response, fallback) {
		const fallbackMessage = textOf(fallback) || 'Không thể xử lý yêu cầu';
		if (!response) {
			return {
				code: 'network.unavailable',
				message: QLPKUserFeedback?.resolveError(
					{ status: 0 },
					{ fallback: fallbackMessage }
				) || fallbackMessage,
				payload: {},
				status: 0
			};
		}

		let payload = {};
		try {
			const text = await response.text();
			if (text) payload = JSON.parse(text);
		} catch (error) {
			payload = {};
		}

		const feedbackError = { status: response.status, responseJSON: payload };
		return {
			code: QLPKUserFeedback?.codeOf(feedbackError) || textOf(payload.code),
			message: QLPKUserFeedback?.resolveError(
				feedbackError,
				{ fallback: fallbackMessage }
			) || fallbackMessage,
			payload,
			status: response.status
		};
	}

	async function readResponseError(response, fallback) {
		return (await readResponseFailure(response, fallback)).message;
	}

	async function requestJson(url, options = {}) {
		if (typeof CONFIG.apiCall !== 'function') {
			throw new Error('Thiếu API caller cho module bác sĩ');
		}
		const requestOptions = { ...options };
		const headers = new Headers(requestOptions.headers || {});
		if (requestOptions.body && typeof requestOptions.body !== 'string' && !(requestOptions.body instanceof FormData)) {
			headers.set('Content-Type', 'application/json');
			requestOptions.body = JSON.stringify(requestOptions.body);
		}
		requestOptions.headers = headers;
		const response = await CONFIG.apiCall(url, requestOptions);
		if (!response || !response.ok) {
			const failure = await readResponseFailure(response, 'Không thể xử lý yêu cầu');
			const error = new Error(failure.message);
			error.code = failure.code;
			error.status = failure.status;
			error.payload = failure.payload;
			throw error;
		}
		const text = await response.text();
		if (!text) return null;
		try {
			return JSON.parse(text);
		} catch (error) {
			return text;
		}
	}

	function showToast(type, message, options = {}) {
		if (options.silent) return;
		if (typeof CONFIG.showToast === 'function') CONFIG.showToast(type, message);
	}

	function getCurrentAppointmentId(state) {
		return normalizeId(state.appointmentId) || normalizeId(CONFIG.getAppointmentId && CONFIG.getAppointmentId());
	}

	function getCurrentPatientId(state) {
		return normalizeId(state.patientId) || normalizeId(CONFIG.getPatientId && CONFIG.getPatientId());
	}

	function isCurrentToken(state, token, appointmentId = state.appointmentId) {
		return token === state.contextToken && normalizeId(appointmentId) === normalizeId(state.appointmentId);
	}

	function cloneDraftValue(value) {
		return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
	}

	function draftRowsWithoutRuntimeIds(rows) {
		return (Array.isArray(rows) ? rows : []).map(row => {
			const draftRow = { ...(row || {}) };
			delete draftRow.uid;
			return cloneDraftValue(draftRow);
		});
	}

	function markRestoredRows(doc, selector, rows) {
		const changedRows = Array.isArray(rows) ? rows : [];
		doc.querySelectorAll(selector).forEach((row, index) => {
			if (!changedRows.includes(index)) return;
			row.classList.add('is-draft-restored');
			row.dataset.draftRestored = 'true';
			row.setAttribute('title', 'Dòng này được khôi phục từ bản nháp và chưa lưu.');
		});
	}

	function changedRowIndexes(baseRows, draftRows) {
		const base = Array.isArray(baseRows) ? baseRows : [];
		const draft = Array.isArray(draftRows) ? draftRows : [];
		const length = Math.max(base.length, draft.length);
		const normalized = value => JSON.stringify(value || {});
		return Array.from({ length }, (_, index) => index).filter(index => normalized(base[index]) !== normalized(draft[index]));
	}

	function getRowUidFromTarget(target, selector, attributeName) {
		const row = target.closest(selector);
		return row ? row.getAttribute(attributeName) : '';
	}

	function hideDropdown(dropdown) {
		if (!dropdown) return;
		dropdown.hidden = true;
		dropdown.replaceChildren();
	}

	function hideAllDropdowns(doc = document) {
		doc.querySelectorAll('.doctor-support-dropdown').forEach(hideDropdown);
	}

	const api = {
		configure,
		getDocument,
		getScopedDocument,
		mergeConfig,
		createChangeTracker,
		createSectionChangeTracker,
		getElement,
		textOf,
		hasText,
		hasValue,
		toNumber,
		normalizeId,
		calculateAge,
		escapeHtml,
		escapeAttr,
		setText,
		setValue,
		getValue,
		setChecked,
		isChecked,
		formatCurrency,
		setDateTimePickerValue,
		setDateTimeInputDisabled,
		readResponseError,
		readResponseFailure,
		requestJson,
		showToast,
		getCurrentAppointmentId,
		getCurrentPatientId,
		isCurrentToken,
		cloneDraftValue,
		draftRowsWithoutRuntimeIds,
		markRestoredRows,
		changedRowIndexes,
		getRowUidFromTarget,
		hideDropdown,
		hideAllDropdowns
	};
	window.QLPKDoctorModuleRegistry.register('supportRuntime', api);
})(window, document);
