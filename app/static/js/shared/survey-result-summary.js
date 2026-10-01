import { el } from './dom.js';

// Configured survey result (score + conclusions + alerts) shared by the survey page and the order detail.
const LABELS = { sum: 'Tổng điểm', average: 'Điểm trung bình', scale_conversion: 'Điểm quy đổi' };

const formatScore = value => (typeof value === 'number' ? value.toLocaleString('vi-VN', { maximumFractionDigits: 4 }) : 'Chưa có điểm');
const messages = items => (items || []).map(item => el('p', {}, String(item.conclusion ?? ''), item.note ? ` · ${item.note}` : null));

export function surveyResultSummary(summary) {
    if (!summary) return null;
    const label = LABELS[summary.calculation_type] || 'Điểm';
    const body = summary.scoring_method === 'by_group'
        ? Object.entries(summary.groups || {}).map(([name, group]) => el('div', {}, el('strong', {}, `${name}: ${formatScore(group.score)}`), messages(group.conclusions)))
        : [el('strong', {}, `${label}: ${formatScore(summary.score)}`), messages(summary.conclusions)];
    return el('section', { class: 'survey-configured-result mb-3', 'aria-label': 'Kết quả theo cấu hình' }, body,
        summary.alerts?.length ? el('div', { class: 'text-danger' }, el('strong', {}, 'Lưu ý đặc biệt'), messages(summary.alerts)) : null);
}
