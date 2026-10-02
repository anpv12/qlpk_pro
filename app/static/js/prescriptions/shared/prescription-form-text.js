// Text helpers of the printed prescription form (escaping, quantity in words, usage note, medicine title).
/** Pure formatting only: never normalize missing dosage into a clinical default. */
function prescriptionFormEscape(value) {
	return String(value ?? '').replace(/[&<>"']/g, char => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
	})[char]);
}

function readUnitDigit(one, ten, digits) {
	if (one === 1 && ten > 1) return 'mốt';
	if (one === 5 && ten) return 'lăm';
	return digits[one];
}

function prescriptionQuantityWords(value) {
	const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || number > 9999999999) return '';
	const integerWords = (number) => {
		if (number === 0) return digits[0];
		const triplet = (number, full) => {
			const hundred = Math.floor(number / 100);
			const ten = Math.floor(number / 10) % 10;
			const one = number % 10;
			const parts = [];
			if (hundred || full) parts.push(digits[hundred], 'trăm');
			if (ten > 1) parts.push(digits[ten], 'mươi');
			else if (ten === 1) parts.push('mười');
			else if (one && (hundred || full)) parts.push('lẻ');
			if (one) parts.push(readUnitDigit(one, ten, digits));
			return parts.join(' ');
		};
		const groups = [];
		let rest = number;
		while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
		return groups.map((group, index) => group
			? triplet(group, index < groups.length - 1 && group < 100) + (['', ' nghìn', ' triệu', ' tỷ'][index])
			: '').reverse().filter(Boolean).join(' ');
	};
	const [integer, decimal] = String(number).split('.');
	return integerWords(Number(integer)) + (decimal ? ' phẩy ' + [...decimal].map(digit => digits[Number(digit)]).join(' ') : '');
}

function prescriptionFormUsage(medicine) {
	let payload = {};
	try {
		payload = typeof medicine.usage === 'object' && medicine.usage !== null
			? medicine.usage : JSON.parse(medicine.usage || '{}');
	} catch (_) { payload = { note: medicine.usage || '' }; }
	if (!payload || typeof payload !== 'object') payload = { note: String(payload ?? '') };
	const note = String(payload.note || '').trim();
	return prescriptionFormEscape(note);
}

function prescriptionMedicineTitle(medicine) {
	const generic = String(medicine.generic_name || '').trim();
	const name = String(medicine.name || '').trim();
	let title = generic && !name.toLowerCase().startsWith(generic.toLowerCase()) ? generic + ' (' + name + ')' : name;
	const strength = String(medicine.strength || '').trim();
	if (!strength) return title;
	const compact = value => value.toLowerCase().replace(/\s+/g, '');
	const literal = compact(strength).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Match the complete strength, never a substring of 110 mg or 10 mg/ml.
	if (new RegExp('(^|[^\\d.,])' + literal + '(?=$|[(),;])').test(compact(title))) return title;
	const amount = strength.match(/^(\d+(?:[.,]\d+)?)\s+\S/);
	if (amount && generic && title.toLowerCase() === (generic + ' ' + amount[1]).toLowerCase()) title = generic;
	return title + ' ' + strength;
}

export { prescriptionFormEscape, prescriptionFormUsage, prescriptionMedicineTitle, prescriptionQuantityWords };
