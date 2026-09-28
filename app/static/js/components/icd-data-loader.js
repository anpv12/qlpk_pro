(function (window) {
	'use strict';

	const DEFAULT_PAGE_SIZE = 100;
	const DEFAULT_EMPTY_QUERY_PAGE_SIZE = 30;

	function toFiniteInteger(value, fallback) {
		const number = Number(value);
		return Number.isFinite(number) ? Math.trunc(number) : fallback;
	}

	function resolveFetch(options = {}) {
		if (typeof options.fetch === 'function') return options.fetch;
		return window.fetch ? window.fetch.bind(window) : null;
	}

	function buildIcdUrl(query = '', options = {}) {
		const limit = Math.max(1, toFiniteInteger(options.limit, DEFAULT_PAGE_SIZE));
		const skip = Math.max(0, toFiniteInteger(options.skip, 0));
		let url = `/api/icd/?skip=${skip}&limit=${limit}`;
		const ids = Array.isArray(options.ids)
			? options.ids.map(value => String(value).trim()).filter(Boolean)
			: [];
		if (ids.length) url += `&ids=${encodeURIComponent(ids.join(','))}`;
		if (query && query.length > 0) {
			url += `&search=${encodeURIComponent(query)}`;
		}
		return url;
	}

	function emptyPage(options = {}) {
		const skip = Math.max(0, toFiniteInteger(options.skip, 0));
		const limit = Math.max(1, toFiniteInteger(options.limit, DEFAULT_PAGE_SIZE));
		return {
			data: [],
			pagination: {
				current_page: Math.floor(skip / limit) + 1,
				per_page: limit,
				total_count: 0,
				total_pages: 0,
				has_next: false,
				has_prev: skip > 0
			}
		};
	}

	function normalizePage(payload, options = {}) {
		const data = Array.isArray(payload?.data) ? payload.data : [];
		const fallback = emptyPage(options).pagination;
		const rawPagination = payload?.pagination && typeof payload.pagination === 'object'
			? payload.pagination
			: {};
		const perPage = Math.max(1, toFiniteInteger(rawPagination.per_page, fallback.per_page));
		const currentPage = Math.max(1, toFiniteInteger(rawPagination.current_page, fallback.current_page));
		const totalCount = Math.max(0, toFiniteInteger(rawPagination.total_count, data.length));
		const totalPages = Math.max(0, toFiniteInteger(rawPagination.total_pages, data.length ? 1 : 0));
		return {
			data,
			pagination: {
				...fallback,
				...rawPagination,
				per_page: perPage,
				current_page: currentPage,
				total_count: totalCount,
				total_pages: totalPages,
				has_next: rawPagination.has_next === undefined ? false : Boolean(rawPagination.has_next),
				has_prev: rawPagination.has_prev === undefined
					? toFiniteInteger(options.skip, 0) > 0
					: Boolean(rawPagination.has_prev)
			}
		};
	}

	async function loadICDPage(query = '', options = {}) {
		try {
			const fetcher = resolveFetch(options);
			if (!fetcher) {
				if (options.throwOnError) throw new Error('missing-icd-fetch');
				console.error('Fetch API is not available');
				return emptyPage(options);
			}

			const response = await fetcher(buildIcdUrl(query, options), {
				method: 'GET',
				signal: options.signal,
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const result = await response.json();
				return normalizePage(result, options);
			}

			if (options.throwOnError) throw new Error('icd-search-failed');
			console.error('Error loading ICD data:', response.statusText);
			return emptyPage(options);
		} catch (error) {
			if (options.throwOnError || error.name === 'AbortError' || error.code?.startsWith('session.')) throw error;
			console.error('Error loading ICD data:', error);
			return emptyPage(options);
		}
	}

	/**
	 * Backward-compatible array contract for non-paginated callers.
	 * The autocomplete component uses loadICDPage so it can consume metadata.
	 */
	async function loadICDData(query = '', options = {}) {
		const page = await loadICDPage(query, options);
		const data = page.data;
		Object.defineProperty(data, 'pagination', {
			value: page.pagination,
			enumerable: false,
			configurable: true
		});
		return data;
	}

	window.ClinicalIcdDataLoader = {
		buildIcdUrl,
		DEFAULT_EMPTY_QUERY_PAGE_SIZE,
		DEFAULT_PAGE_SIZE,
		loadICDPage,
		loadICDData
	};
})(window);
