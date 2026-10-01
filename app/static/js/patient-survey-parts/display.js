import { el } from '../shared/dom.js';
function setSurveyProgressBar(percentage) {
    const bar = document.getElementById('bar');
    if (!bar) return;
    const safePercentage = Math.min(100, Math.max(0, Number(percentage) || 0));
    bar.style.insetInlineEnd = (100 - safePercentage) + '%';
}

// Display patient information
function displayPatientInfo(patient) {
    const patientName = document.getElementById('patient-name');
    const patientPhone = document.getElementById('patient-phone');

    if (patient.full_name) {
        patientName.textContent = patient.full_name;
    } else {
        patientName.textContent = 'Không có tên';
    }

    if (patient.phone) {
        patientPhone.textContent = patient.phone;
    } else {
        patientPhone.textContent = 'Không có SĐT';
    }
}

// Format date time for display (convert từ UTC sang GMT+7)
function formatDateTime(dateString) {
    if (!dateString) return '—';
    const source = /(?:Z|[+-]\d{2}:?\d{2})$/.test(dateString) ? dateString : dateString + 'Z';
    const date = new Date(source);
    if (!Number.isFinite(date.getTime())) return '—';
    return date.toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit'});
}

// Format duration (thời gian hoàn thành) từ milliseconds sang "X phút Y giây"
function formatDuration(startTime, endTime) {
    if (!startTime || !endTime) return null;
    try {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const durationMs = end - start;

        if (durationMs < 0) return null; // Invalid duration

        const totalSeconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        if (minutes === 0) {
            return `${seconds} giây`;
        } else if (seconds === 0) {
            return `${minutes} phút`;
        } else {
            return `${minutes} phút ${seconds} giây`;
        }
    } catch (e) {
        return null;
    }
}

function appendSurveyTimeInfo(parent, id, className, ...content) {
    parent.append(el('div', { id, class: className }, ...content));
}

const warning = text => el('span', { class: 'survey-time-warning' }, text);

function buildSurveyExpiresText(expiresAt) {
    // Check nếu đã hết hạn (so sánh ở UTC, convert sang GMT+7 để hiển thị)
    // Nếu date string không có timezone info, assume là UTC
    const hasZone = expiresAt.includes('Z') || expiresAt.includes('+') || expiresAt.includes('-', 10);
    const expiresDateUTC = new Date(hasZone ? expiresAt : expiresAt + 'Z');
    const nowUTC = new Date();
    const timeRemaining = expiresDateUTC - nowUTC;
    const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
    const when = formatDateTime(expiresAt);
    if (nowUTC > expiresDateUTC) return [warning(`⏰ Đã hết hạn: ${when}`)];
    if (hoursRemaining < 1) return [warning(`⏰ Còn ${minutesRemaining} phút: ${when}`)];
    if (hoursRemaining < 6) return [warning(`⏰ Còn ${hoursRemaining} giờ: ${when}`)];
    return ['⏰ Hết hạn: ', el('span', { class: 'survey-time-value' }, when)];
}

// Show preview notice with full interaction
function showPreviewNotice() {
    document.querySelector('.container')?.append(el('div', { class: 'preview-notice' },
        el('div', { class: 'preview-notice-content' },
            el('div', { class: 'preview-notice-icon' }, '🎯'),
            el('div', {},
                el('h4', {}, 'Chế độ trải nghiệm'),
                el('p', {}, 'Đây là bản trải nghiệm mẫu khảo sát. Bạn có thể tương tác đầy đủ như người dùng thật!')))));
}

export { appendSurveyTimeInfo, buildSurveyExpiresText, displayPatientInfo, formatDateTime, formatDuration, setSurveyProgressBar, showPreviewNotice };
