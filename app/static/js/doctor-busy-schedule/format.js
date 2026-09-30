// Display formats for busy schedules (vi-VN).
import { el } from '../shared/dom.js';

const DATE = { day: '2-digit', month: '2-digit', year: 'numeric' };
const TIME = { hour: '2-digit', minute: '2-digit' };

export function formatTimeRangeReadable(startTime, endTime) {
	const startDate = startTime.toLocaleDateString('vi-VN', DATE);
	const startTimeStr = startTime.toLocaleTimeString('vi-VN', TIME);
	const endTimeStr = endTime.toLocaleTimeString('vi-VN', TIME);
	if (startTime.toDateString() === endTime.toDateString()) return `Từ ${startTimeStr} đến ${endTimeStr} ngày ${startDate}`;
	return `Từ ${startTimeStr} ${startDate} đến ${endTimeStr} ${endTime.toLocaleDateString('vi-VN', DATE)}`;
}

export function formatDateTime(date) {
	return date.toLocaleString('vi-VN', { ...DATE, ...TIME });
}

export function statusIndicator(startTime, endTime, status) {
	const now = new Date();
	const badge = (tone, title, mark) => el('span', { class: `badge qlpk-status--${tone}`, title }, mark);
	if (status === 'cancelled') return badge('neutral', 'Đã hủy', '❌');
	if (endTime < now) return badge('neutral', 'Đã kết thúc', '⏰');
	if (startTime <= now && endTime >= now) return badge('error', 'Đang diễn ra', '🔴');
	return badge('warning', 'Sắp diễn ra', '⏳');
}
