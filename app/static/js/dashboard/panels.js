// Dashboard panels built as DOM nodes: today's appointments, staff presence, referral source tags and
// the rows of the three detail modals.
import { el, icon, replace } from '../shared/dom.js';

export const emptyState = (iconName, text) => el('div', { class: 'empty-state' }, icon(iconName), text);

function formatAppointmentCountdown(diffMinutes) {
	if (!(diffMinutes > 0)) return '';
	if (diffMinutes < 60) return `Còn ${diffMinutes} phút`;
	const totalHours = Math.floor(diffMinutes / 60);
	const remMinutes = diffMinutes % 60;
	if (totalHours < 24) return remMinutes > 0 ? `Còn ${totalHours} giờ ${remMinutes} phút` : `Còn ${totalHours} giờ`;
	const days = Math.floor(totalHours / 24);
	const remHours = totalHours % 24;
	return remHours > 0 ? `Còn ${days} ngày ${remHours} giờ` : `Còn ${days} ngày`;
}

export function renderAppointments(container, appointments) {
	const now = new Date();
	const items = appointments.filter(apt => ['SCHEDULED', 'CONFIRMED'].includes((apt.status || '').toUpperCase()))
		.sort((a, b) => new Date(a.appointment_date) - new Date(b.appointment_date));
	if (!items.length) {
		replace(container, emptyState('bi-calendar-x', 'Không có lịch hẹn hôm nay'));
		return;
	}
	replace(container, items.map(apt => {
		const aptDate = new Date(apt.appointment_date);
		const confirmed = (apt.status || '').toUpperCase() === 'CONFIRMED';
		const statusClass = confirmed ? 'confirmed' : 'pending';
		const countdown = formatAppointmentCountdown(Math.round((aptDate - now) / 60000));
		const info = [apt.patient_full_name || apt.full_name || 'Bệnh nhân', apt.patient_phone, apt.service_name, apt.doctor_name].filter(Boolean).join(' - ');
		return el('div', { class: 'apt-item' },
			el('div', { class: 'apt-time' }, aptDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })),
			el('div', { class: `apt-dot ${statusClass}` }),
			el('div', { class: 'apt-info' }, info, countdown ? el('div', { class: 'apt-countdown' }, countdown) : null),
			el('div', { class: `apt-status ${statusClass}` }, confirmed ? 'Đã xác nhận' : 'Chờ xác nhận'));
	}));
}

function timeAgo(isoString) {
	const mins = Math.floor((new Date() - new Date(isoString)) / 60000);
	if (mins < 60) return `${mins} phút trước`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours} giờ trước`;
	return `${Math.floor(hours / 24)} ngày trước`;
}

export function renderStaffOnline(container, badge, data) {
	const items = (data.items || []).sort((a, b) => (a.is_online !== b.is_online ? b.is_online - a.is_online : (a.full_name || '').localeCompare(b.full_name || '')));
	const onlineCount = data.online_count || 0;
	if (badge) {
		badge.textContent = `${onlineCount} online`;
		badge.className = `online-badge ${onlineCount > 0 ? 'has-online' : ''}`;
	}
	if (!items.length) {
		replace(container, emptyState('bi-people', 'Chưa có nhân viên'));
		return;
	}
	replace(container, items.map(staff => {
		const dot = staff.is_online ? 'online' : 'offline';
		let status = 'Đang hoạt động';
		if (!staff.is_online) status = staff.last_login ? timeAgo(staff.last_login) : 'Chưa đăng nhập';
		const initials = (staff.full_name || '').split(' ').map(word => word[0]).slice(-2).join('').toUpperCase();
		return el('div', { class: 'staff-item' },
			staff.avatar ? el('img', { class: 'staff-avatar staff-avatar-img', src: staff.avatar, alt: staff.full_name ?? '' }) : el('div', { class: 'staff-avatar' }, initials),
			el('div', { class: 'staff-info' }, el('div', { class: 'staff-name' }, staff.full_name ?? ''), el('div', { class: 'staff-role' }, staff.role_label ?? '')),
			el('div', { class: 'staff-status' }, el('span', { class: `status-dot ${dot}` }), el('span', { class: `status-text ${dot}` }, status)));
	}));
}

const FALLBACK_COLORS = { facebook: '#1877F2', website: '#22C55E', referral: '#F59E0B', medpro: '#EF4444', walk_in: '#06B6D4', other: '#8B5CF6' };
const SOURCE_ICONS = { facebook: 'bi-facebook', website: 'bi-globe2', referral: 'bi-people-fill', medpro: 'bi-heart-pulse-fill', walk_in: 'bi-door-open-fill', other: 'bi-grid-3x3-gap-fill' };

function sourceTag(item, total) {
	const count = item.count || 0;
	const percent = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
	const color = /^#[0-9a-f]{6}$/i.test(String(item.color || '').trim()) ? String(item.color).trim() : (FALLBACK_COLORS[item.key] || '#8B5CF6');
	const tag = el('button', { type: 'button', class: `referral-source-tag referral-source-tag--${String(item.key || 'unknown').replace(/[^a-z0-9_-]/gi, '')}`,
		dataset: { sourceKey: item.key, sourceLabel: item.label, sourceCount: count }, title: `${item.label}: ${count} lượt khám` },
	el('span', { class: 'referral-source-tag-icon' }, icon(SOURCE_ICONS[item.key] || 'bi-tag-fill')),
	el('span', { class: 'referral-source-tag-main' }, el('span', { class: 'referral-source-tag-label' }, item.label ?? ''),
		el('span', { class: 'referral-source-tag-metrics' }, el('span', { class: 'referral-source-tag-count' }, `${count} lượt`),
			el('span', { class: 'referral-source-tag-share' }, Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`))),
	el('span', { class: 'referral-source-tag-bar' }, el('span')));
	[['--tag-color', color], ['--tag-bg', `${color}14`], ['--tag-shadow', `${color}26`], ['--tag-width', `${percent}%`]].forEach(([name, value]) => tag.style.setProperty(name, value));
	return tag;
}

export function renderReferralSources(container, items) {
	if (!items.length) {
		replace(container, emptyState('bi-diagram-3', 'Chưa có dữ liệu nguồn giới thiệu'));
		return;
	}
	const total = items.reduce((sum, item) => sum + (item.count || 0), 0);
	replace(container, el('div', { class: 'referral-source-tag-summary' }, el('span', { class: 'referral-source-tag-summary-label' }, 'Tổng lượt khám'),
		el('span', { class: 'referral-source-tag-summary-value' }, total)), el('div', { class: 'referral-source-tag-grid' }, items.map(item => sourceTag(item, total))));
}

const cell = (className, value) => el('td', { class: className }, value ?? '');
const greenRow = (index, cells) => el('tr', { class: index % 2 === 0 ? '' : 'dashboard-row-green-alt' }, cells);

export const referralDetailRows = items => items.map((item, index) => greenRow(index, [
	cell('ps-3 py-2 text-center fw-semibold dashboard-cell-accent', index + 1), cell('py-2 fw-semibold', item.patient_name || ''),
	cell('py-2 dashboard-cell-muted', item.phone || ''), cell('py-2 text-center dashboard-cell-muted', item.exam_date || ''),
	cell('py-2 text-center dashboard-cell-accent dashboard-cell-semibold', item.exam_time || ''), cell('py-2 referral-source-detail-reason', item.main_reason || '—'),
	cell('pe-3 py-2 referral-source-detail-source', item.source_value || item.source_label || '')]));

export const icdDetailRows = items => items.map((item, index) => greenRow(index, [
	cell('ps-3 py-2 text-center fw-semibold dashboard-cell-accent', index + 1), cell('py-2 fw-semibold', item.patient_name),
	cell('py-2 dashboard-cell-muted', item.doctor_name), cell('py-2 text-center dashboard-cell-muted', item.exam_date),
	cell('pe-3 py-2 text-center dashboard-cell-accent dashboard-cell-semibold', item.exam_time)]));

const EXAM_STATUS = { 'Hoàn thành': 'dashboard-status-pill--done', 'Đang khám': 'dashboard-status-pill--active', 'Đã xác nhận': 'dashboard-status-pill--confirmed', 'Chờ xác nhận': 'dashboard-status-pill--waiting' };

export const examDetailRows = items => items.map((item, index) => {
	const psych = (item.doctor_role || '').toUpperCase() === 'PSYCHOLOGIST';
	const stripe = index % 2 === 0 ? '' : 'dashboard-row-alt';
	return el('tr', { class: psych ? 'dashboard-row-psych' : stripe },
		cell(`ps-3 py-2 text-center fw-semibold ${psych ? 'dashboard-cell-psych dashboard-cell-psych-marker' : 'dashboard-cell-accent dashboard-cell-accent-marker'}`, item.time),
		cell('py-2 fw-semibold', item.patient_name), cell('py-2 dashboard-cell-muted', item.phone), cell('py-2', item.doctor_name),
		cell('py-2 dashboard-cell-muted', item.service || '—'),
		el('td', { class: 'pe-3 py-2 text-center' }, el('span', { class: `qlpk-status dashboard-status-pill ${EXAM_STATUS[item.status] || 'dashboard-status-pill--muted'}` }, item.status ?? '')));
});
