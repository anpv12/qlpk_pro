(function (window) {
	'use strict';

	function resolveFetch(options = {}) {
		if (typeof options.fetch === 'function') return options.fetch;
		return window.fetch ? window.fetch.bind(window) : null;
	}

	function resolveAuthHeader(options = {}) {
		if (typeof options.getAuthHeader === 'function') {
			return options.getAuthHeader();
		}

		const storage = options.localStorage || window.localStorage;
		const token = storage ? storage.getItem('qlpk_token') : null;
		if (!token) return null;
		return token.startsWith('Bearer ') ? token : `Bearer ${token}`;
	}

	function buildIcdUrl(query = '', options = {}) {
		const limit = Number.isFinite(options.limit) ? options.limit : 1000;
		let url = `/api/icd/?limit=${limit}`;
		const ids = Array.isArray(options.ids)
			? options.ids.map(value => String(value).trim()).filter(Boolean)
			: [];
		if (ids.length) url += `&ids=${encodeURIComponent(ids.join(','))}`;
		if (query && query.length > 0) {
			url += `&search=${encodeURIComponent(query)}`;
		}
		return url;
	}

	async function loadICDData(query = '', options = {}) {
		try {
			const authHeader = resolveAuthHeader(options);
			if (!authHeader) {
				console.error(options.missingTokenMessage || 'No token found');
				return [];
			}

			const fetcher = resolveFetch(options);
			if (!fetcher) {
				console.error('Fetch API is not available');
				return [];
			}

			const response = await fetcher(buildIcdUrl(query, options), {
				method: 'GET',
				headers: {
					'Authorization': authHeader,
					'Content-Type': 'application/json'
				}
			});

			if (response.ok) {
				const result = await response.json();
				return result.data || [];
			}

			console.error('Error loading ICD data:', response.statusText);
			return [];
		} catch (error) {
			console.error('Error loading ICD data:', error);
			return [];
		}
	}

	window.ClinicalIcdDataLoader = {
		buildIcdUrl,
		loadICDData
	};
})(window);
