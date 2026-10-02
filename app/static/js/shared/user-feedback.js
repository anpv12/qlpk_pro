(function (window) {
	'use strict';

	const TYPES = new Set(['success', 'info', 'warning', 'error', 'critical']);
	const ICONS = {
		success: 'bi-check-circle-fill',
		info: 'bi-info-circle-fill',
		warning: 'bi-exclamation-triangle-fill',
		error: 'bi-x-circle-fill',
		critical: 'bi-exclamation-octagon-fill'
	};
	const STATUS_CODES = {
		400: 'request.invalid',
		401: 'auth.required',
		403: 'auth.forbidden',
		404: 'resource.not_found',
		409: 'resource.conflict',
		410: 'resource.expired',
		413: 'request.too_large',
		422: 'request.invalid',
		429: 'request.rate_limited'
	};
	const DEFAULT_ERROR_MESSAGES = {
		'inventory.insufficient': 'Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.',
		'auth.required': 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
		'auth.forbidden': 'Bạn không có quyền thực hiện thao tác này.',
		'request.invalid': 'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại.',
		'request.too_large': 'Dữ liệu gửi lên quá lớn. Vui lòng giảm dung lượng và thử lại.',
		'request.rate_limited': 'Có quá nhiều thao tác liên tiếp. Vui lòng chờ một chút rồi thử lại.',
		'resource.not_found': 'Không tìm thấy dữ liệu cần thao tác. Vui lòng tải lại màn hình.',
		'resource.conflict': 'Dữ liệu đã thay đổi. Vui lòng tải lại và thử lại.',
		'resource.expired': 'Dữ liệu này đã hết hiệu lực. Vui lòng tạo lại.',
		'network.unavailable': 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.',
		'system.unavailable': 'Không thể xử lý lúc này. Vui lòng thử lại.'
	};

	function normalizeType(type) {
		if (type === 'danger') return 'error';
		if (type === 'primary') return 'info';
		return TYPES.has(type) ? type : 'info';
	}

	function escapeHtml(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	function getHostWindow(options = {}) {
		const currentWindow = options.window || window;
		const candidates = [currentWindow];
		try {
			if (currentWindow.parent && currentWindow.parent !== currentWindow) candidates.push(currentWindow.parent);
		} catch (error) { /* cửa sổ cha khác origin: bỏ qua */ }
		try {
			if (currentWindow.top && !candidates.includes(currentWindow.top)) candidates.push(currentWindow.top);
		} catch (error) { /* cửa sổ cha khác origin: bỏ qua */ }

		for (const candidate of candidates) {
			try {
				if (candidate.document && candidate.document.getElementById('qlpkWorkspaceTabs')) return candidate;
			} catch (error) { /* cửa sổ cha khác origin: bỏ qua */ }
		}
		return currentWindow;
	}

	function positionHost(host, hostWindow) {
		const tabs = hostWindow.document.getElementById('qlpkWorkspaceTabs');
		if (!tabs || typeof tabs.getBoundingClientRect !== 'function') return;

		hostWindow.requestAnimationFrame(() => {
			const tabsRect = tabs.getBoundingClientRect();
			if (!tabsRect.width || !tabsRect.height) return;
			host.style.setProperty('--qlpk-toast-topbar-offset', `${Math.max(0, tabsRect.top + 2)}px`);
			host.style.setProperty('--qlpk-toast-inline-offset', `${Math.max(8, hostWindow.innerWidth - tabsRect.right + 8)}px`);
			host.style.setProperty('--qlpk-toast-tabs-height', `${Math.max(28, tabsRect.height - 4)}px`);
		});
	}

	function render(type, message, options = {}) {
		const structured = message && typeof message === 'object' && typeof message.title === 'string';
		const text = toastText(message, structured);
		if (!text) return false;

		const hostWindow = getHostWindow(options);
		const host = ensureToastHost(hostWindow.document);

		const toastType = normalizeType(type);
		const defaultDuration = structured ? 12000 : 3000;
		host.classList.toggle('qlpk-workspace-toast-host--detailed', Boolean(structured));
		positionHost(host, hostWindow);
		hostWindow.setTimeout(() => positionHost(host, hostWindow), 250);
		host.innerHTML = buildToastHtml(toastType, structured, message, text);

		hostWindow.clearTimeout(host._qlpkToastTimer);
		hostWindow.clearTimeout(host._qlpkToastHideTimer);
		if (structured) {
			host.querySelector('.qlpk-toast__close').addEventListener('click', () => { host.replaceChildren(); });
		}
		const duration = Number(options.duration) > 0 ? Number(options.duration) : defaultDuration;
		host._qlpkToastTimer = hostWindow.setTimeout(() => hideToast(host, hostWindow), duration);
		return true;
	}

	function toastText(message, structured) {
		return structured
			? [message.title, message.label, message.emphasis, message.detail, message.guidance].filter(Boolean).join(' ')
			: String(message || '').trim();
	}

	function buildToastHtml(toastType, structured, message, text) {
		return `
			<div class="qlpk-workspace-toast qlpk-toast qlpk-toast--${toastType}${structured ? ' qlpk-toast--detailed' : ''}" role="status" aria-live="polite">
				<span class="qlpk-toast__icon" aria-hidden="true"><i class="bi ${ICONS[toastType]}"></i></span>
				${structured ? `<div class="qlpk-toast__content">
					<strong class="qlpk-toast__heading">${escapeHtml(message.title)}</strong>
					<div><strong>${escapeHtml(message.label || '')}</strong> <strong class="qlpk-toast__emphasis">${escapeHtml(message.emphasis || '')}</strong></div>
					${message.detail ? `<div>${escapeHtml(message.detail)}</div>` : ''}
					<div class="qlpk-toast__guidance">${escapeHtml(message.guidance || '')}</div>
				</div><button type="button" class="qlpk-toast__close" aria-label="Đóng thông báo">×</button>`
				: `<span class="qlpk-toast__title" title="${escapeHtml(text)}">${escapeHtml(text)}</span>`}
			</div>
		`;
	}

	function ensureToastHost(documentRef) {
		let host = documentRef.getElementById('qlpkWorkspaceToastHost');
		if (!host) {
			host = documentRef.createElement('div');
			host.id = 'qlpkWorkspaceToastHost';
			host.className = 'qlpk-workspace-toast-host';
			documentRef.body.appendChild(host);
		}
		return host;
	}

	function hideToast(host, hostWindow) {
		const toast = host.querySelector('.qlpk-workspace-toast');
		if (!toast) {
			host.replaceChildren();
			return;
		}
		toast.classList.add('is-hiding');
		host._qlpkToastHideTimer = hostWindow.setTimeout(() => {
			host.replaceChildren();
		}, 180);
	}

	function statusOf(error) {
		const value = error && (error.status ?? error.statusCode ?? error.response?.status ?? error.xhr?.status);
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	function payloadOf(error) {
		if (!error || typeof error !== 'object') return {};
		return error.payload || error.responseJSON || error.response?.data || {};
	}

	function codeOf(error) {
		const payload = payloadOf(error);
		if (payload && typeof payload.code === 'string' && payload.code.trim()) return payload.code.trim();
		if (error && typeof error.code === 'string' && error.code.trim()) return error.code.trim();
		const status = statusOf(error);
		if (status === 0) return 'network.unavailable';
		if (status && status >= 500) return 'system.unavailable';
		return STATUS_CODES[status] || '';
	}

	function resolveError(error, options = {}) {
		const code = codeOf(error);
		if (['inventory.batch_missing', 'inventory.batch_expired', 'inventory.receipt_invalid'].includes(code)) {
			const detail = payloadOf(error).detail;
			if (typeof detail === 'string' && detail.trim()) return detail.trim();
		}
		const messages = options.messages || {};
		return messages[code]
			|| DEFAULT_ERROR_MESSAGES[code]
			|| options.fallback
			|| DEFAULT_ERROR_MESSAGES['system.unavailable'];
	}

	function show(type, message, options = {}) {
		if (typeof options.renderer === 'function') {
			const text = message && typeof message === 'object'
				? [message.title, message.label, message.emphasis, message.detail, message.guidance].filter(Boolean).join(' ')
				: String(message || '').trim();
			options.renderer(normalizeType(type), text);
			return true;
		}
		return render(type, message, options);
	}

	function reportError(error, options = {}) {
		if (window.console && typeof window.console.error === 'function') {
			window.console.error(options.logLabel || 'QLPK action failed', error);
		}
		const message = resolveError(error, options);
		show(options.type || 'error', message, options);
		return message;
	}

	window.QLPKUserFeedback = {
		codeOf,
		normalizeType,
		render,
		reportError,
		resolveError,
		show
	};
})(window);
