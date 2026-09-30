/* exported appendSurveyTimeInfo, buildSurveyExpiresText, displayPatientInfo, formatDuration, setSurveyProgressBar, showPreviewNotice */
// patient-survey.js: setSurveyProgressBar, displayPatientInfo, formatDateTime, formatDuration, appendSurveyTimeInfo, buildSurveyExpiresText, showPreviewNotice (nạp trước patient-survey.js, cùng scope trang).

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

function appendSurveyTimeInfo(parent, id, className, html) {
    const div = document.createElement('div');
    div.id = id;
    div.className = className;
    div.innerHTML = html;
    parent.appendChild(div);
}

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
    if (nowUTC > expiresDateUTC) return `<span class="survey-time-warning">⏰ Đã hết hạn: ${when}</span>`;
    if (hoursRemaining < 1) return `<span class="survey-time-warning">⏰ Còn ${minutesRemaining} phút: ${when}</span>`;
    if (hoursRemaining < 6) return `<span class="survey-time-warning">⏰ Còn ${hoursRemaining} giờ: ${when}</span>`;
    return `⏰ Hết hạn: <span class="survey-time-value">${when}</span>`;
}

// Show preview notice with full interaction
function showPreviewNotice() {
    // Add preview notice
    const previewNotice = `
        <div class="preview-notice">
            <div class="preview-notice-content">
                <div class="preview-notice-icon">🎯</div>
                <div>
                    <h4>Chế độ trải nghiệm</h4>
                    <p>Đây là bản trải nghiệm mẫu khảo sát. Bạn có thể tương tác đầy đủ như người dùng thật!</p>
                </div>
            </div>
        </div>
    `;
    
    $('.container').append(previewNotice);
}
