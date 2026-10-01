// Expense type icons/colours; unknown types get a stable colour derived from their name.
// ===== CATEGORY CONFIG =====
export const CAT = {
	'Thuê nhà': { icon: 'bi-house', color: '#8b5cf6', bg: '#f5f3ff' },
	'Tiền điện': { icon: 'bi-lightning', color: '#eab308', bg: '#fefce8' },
	'Nước': { icon: 'bi-droplet', color: '#06b6d4', bg: '#ecfeff' },
	'Rác': { icon: 'bi-trash', color: '#78716c', bg: '#fafaf9' },
	'Tiền lương': { icon: 'bi-wallet2', color: '#ef4444', bg: '#fef2f2' },
	'Sửa chữa vật tư': { icon: 'bi-tools', color: '#f97316', bg: '#fff7ed' },
	'Mua sắm vật tư': { icon: 'bi-cart3', color: '#10b981', bg: '#ecfdf5' },
	'Khác': { icon: 'bi-three-dots', color: '#64748b', bg: '#f8fafc' },
	'Từ thiện': { icon: 'bi-heart', color: '#ec4899', bg: '#fdf2f8' },
	'Quan hệ': { icon: 'bi-people', color: '#6366f1', bg: '#eef2ff' },
	'Hàng ngày': { icon: 'bi-calendar-day', color: '#0ea5e9', bg: '#f0f9ff' },
	'Hợp đồng': { icon: 'bi-file-earmark-text', color: '#14b8a6', bg: '#f0fdfa' },
};
export function getCat(type) {
	if (CAT[type]) return CAT[type];
	// Generate unique color from category name hash
	let hash = 0;
	for (let i = 0; i < type.length; i++) hash = type.charCodeAt(i) + ((hash << 5) - hash);
	const hue = ((hash % 360) + 360) % 360;
	const color = `hsl(${hue}, 55%, 50%)`;
	const bg = `hsl(${hue}, 40%, 95%)`;
	return { icon: 'bi-tag', color, bg };
}
