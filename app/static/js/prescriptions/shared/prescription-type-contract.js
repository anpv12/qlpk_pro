const CATALOG_TYPES = ['BASIC', 'H', 'N', 'TOXIC'];
const DOCUMENT_TYPES = ['BASIC', 'H', 'N'];

const LABELS = {
	BASIC: 'Đơn cơ bản',
	H: 'Đơn hướng thần (H)',
	N: 'Đơn gây nghiện (N)',
	TOXIC: 'Đơn thuốc độc'
};

const SHORT_LABELS = {
	BASIC: 'Cơ bản',
	H: 'Thuốc H',
	N: 'Thuốc N',
	TOXIC: 'Thuốc độc'
};

function normalizeCatalogType(value) {
	const raw = String(value == null ? '' : value).trim().toUpperCase();
	if (raw === 'H' || raw.includes('HƯỚNG')) return 'H';
	if (raw === 'N' || raw.includes('NGHIỆN')) return 'N';
	if (raw === 'TOXIC' || raw.includes('ĐỘC')) return 'TOXIC';
	return 'BASIC';
}

function toDocumentType(value) {
	const type = normalizeCatalogType(value);
	return DOCUMENT_TYPES.indexOf(type) === -1 ? 'BASIC' : type;
}

function getLabel(value) {
	return LABELS[normalizeCatalogType(value)];
}

function getShortLabel(value) {
	return SHORT_LABELS[normalizeCatalogType(value)];
}

export const PrescriptionTypeContract = {
	CATALOG_TYPES: CATALOG_TYPES.slice(),
	DOCUMENT_TYPES: DOCUMENT_TYPES.slice(),
	normalizeCatalogType,
	toDocumentType,
	getLabel,
	getShortLabel
};
