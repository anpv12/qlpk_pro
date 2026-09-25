(function () {
    const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const messages = items => (items || []).map(item => `<p>${escape(item.conclusion)}${item.note ? ' · ' + escape(item.note) : ''}</p>`).join('');
    window.renderSurveyResultSummary = summary => {
        if (!summary) return '';
        const label = {sum: 'Tổng điểm', average: 'Điểm trung bình', scale_conversion: 'Điểm quy đổi'}[summary.calculation_type] || 'Điểm';
        const format = value => typeof value === 'number' ? value.toLocaleString('vi-VN', {maximumFractionDigits: 4}) : 'Chưa có điểm';
        const groups = Object.entries(summary.groups || {}).map(([name, group]) => `<div><strong>${escape(name)}: ${format(group.score)}</strong>${messages(group.conclusions)}</div>`).join('');
        return `<section class="survey-configured-result mb-3" aria-label="Kết quả theo cấu hình">${summary.scoring_method === 'by_group' ? groups : `<strong>${label}: ${format(summary.score)}</strong>${messages(summary.conclusions)}`}${summary.alerts?.length ? `<div class="text-danger"><strong>Lưu ý đặc biệt</strong>${messages(summary.alerts)}</div>` : ''}</section>`;
    };
})();
