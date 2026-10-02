const DEFAULT_DOM = {
	root: 'doctorServicePanel',
	selectionTotal: 'doctorServiceSelectionTotal',
	selectionTotalValue: 'doctorServiceSelectionTotalValue',
	catalogPagination: 'doctorServiceCatalogPagination',
	catalogPageStatus: 'doctorServiceCatalogPageStatus',
	catalogPageSelect: 'doctorServiceCatalogPageSelect',
	catalogList: 'doctorServiceCatalogList',
	catalogEmpty: 'doctorServiceCatalogEmptyState',
	selectionList: 'doctorServiceSelectionList',
	selectionEmpty: 'doctorServiceEmptyState'
};

const DEFAULT_ENDPOINTS = {
	appointment: ({ appointmentId }) => `/services/appointment/${appointmentId}`,
	catalog: ({ page, perPage }) => `/services/?page=${page}&per_page=${perPage}`,
	sync: ({ appointmentId }) => `/services/appointment/${appointmentId}/sync`
};

const DEFAULT_CONFIG = {
	rootId: 'doctorServicePanel',
	strictRoot: true,
	perPage: 24,
	dom: DEFAULT_DOM,
	endpoints: DEFAULT_ENDPOINTS
};

function installServicesFormFns7(ctx) {
	function restoreDraftSnapshot(snapshot = {}, restoreOptions = {}) {
		const doc = ctx.getDocument(restoreOptions);
		ctx.STATE.services = (Array.isArray(snapshot.rows) ? snapshot.rows : []).map(row => ctx.normalizeService({
			id: row.id,
			service_id: row.serviceId,
			service_name: row.name,
			quantity: row.quantity,
			duration_minutes: row.duration,
			unit_price: row.amount,
			note: row.note,
			discount_percent: row.discountPercent,
			tax_percent: row.taxPercent
		}));
		ctx.CHANGES.restore(restoreOptions.dirty);
		ctx.renderServices(doc);
		return true;
	}

	Object.assign(ctx, { restoreDraftSnapshot });
}

export { DEFAULT_CONFIG, DEFAULT_DOM, DEFAULT_ENDPOINTS, installServicesFormFns7 };
