(function (window, document) {
	'use strict';

	function normalizeTypes(types) {
		return new Set((Array.isArray(types) ? types : [types]).filter(Boolean));
	}

	function register(options = {}) {
		const types = normalizeTypes(options.types || []);
		const handler = options.handler;
		const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 250;
		let timer = null;
		let lastEvent = null;
		const pendingEvents = new Map();

		if (!types.size || typeof handler !== 'function') return function noop() {};

		const listener = function (event) {
			const realtimeEvent = event && event.detail ? event.detail : null;
			if (!realtimeEvent || !types.has(realtimeEvent.type)) return;
			if (typeof options.filter === 'function' && !options.filter(realtimeEvent)) return;

			lastEvent = realtimeEvent;
			if (options.batch) {
				const payload = realtimeEvent.payload || {};
				const key = [realtimeEvent.type, payload.appointment_id, payload.patient_id, payload.order_id, payload.examination_id].join(':');
				pendingEvents.set(key, realtimeEvent);
				if (timer !== null) return;
			}
			window.clearTimeout(timer);
			timer = window.setTimeout(function () {
				timer = null;
				const events = Array.from(pendingEvents.values());
				pendingEvents.clear();
				handler(options.batch ? events : lastEvent);
			}, debounceMs);
		};

		window.addEventListener('qlpk:realtime:event', listener);
		document.addEventListener('qlpk:realtime:event', listener);

		return function unregister() {
			window.clearTimeout(timer);
			pendingEvents.clear();
			window.removeEventListener('qlpk:realtime:event', listener);
			document.removeEventListener('qlpk:realtime:event', listener);
		};
	}

	window.QLPKRealtimePageHooks = Object.freeze({ register });
	window.QLPKDoctorModuleRegistry?.register?.('realtimePageHooks', window.QLPKRealtimePageHooks);
})(window, document);
