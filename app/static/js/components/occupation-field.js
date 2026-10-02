// The page's active occupation autocomplete (one per page), shared by the forms that read or reset it.
let active = null;

export function getOccupationAutocomplete() {
	return active;
}

export function setOccupationAutocomplete(instance) {
	active = instance || null;
	return active;
}
