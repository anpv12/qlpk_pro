(function (window) {
	'use strict';
	const text = value => value == null ? '' : String(value).trim();
	const label = item => [text(item?.icd_code), text(item?.disease_name)].filter(Boolean).join(' - ');

	// ICD supplies its data contract; the shared field owns all UI and lifecycle.
	class QLPKIcdAutocomplete extends window.QLPKAutocompleteField {
		constructor(root, options = {}) {
			super(root, {
				limit: 100,
				emptyQueryLimit: 30,
				getLabel: label,
				getKey: item => options.getKey ? options.getKey(item)
					: options.selectionKey === 'code'
						? text(item?.icd_code).toUpperCase() || text(item?.id)
						: text(item?.id),
				loadOptions: (query, page) => window.ClinicalIcdDataLoader.loadICDPage(query, {
					...page,
					getAuthHeader: options.getAuthHeader,
					throwOnError: true,
					missingTokenMessage: options.missingTokenMessage
				}),
				...options
			});
		}
	}
	window.QLPKIcdAutocomplete = QLPKIcdAutocomplete;
})(window);
