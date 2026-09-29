/* global bindNavigationEvents, bindQuestionEvents, hideActionButtons, loadOrderSurveyResult, loadSurveyTemplates, prepareQuestions, queueSurveyDraft, renderSingleQuestion, showAlert, showQuestion, submitSurvey, updateProgress, updateSessionStatus */
/* exported allQuestions, currentQuestionIndex, draftBlockMessage, draftBlocked, draftData, draftRevision, draftSaving, draftTimer, isSurveyClosed, isSurveyCompleted, isSurveyExpired, lastSavedDraft, loadSurveyResponsesFromStorage, reviewData, reviewTimer, saveSurveyResponsesToStorage, showClosedSurveyMessage, surveyResponses, surveySessionData, surveyTemplates, totalQuestions */

// Global variables
let surveyTemplates = [];
let patientInfo = {};
let surveyResponses = {};
let allQuestions = [];
let currentQuestionIndex = 0;
let totalQuestions = 0;
let isSurveyClosed = false; // Survey đã đóng - read-only tuyệt đối
let isSurveyCompleted = false; // Survey đã hoàn thành - có thể xem lại nhưng không sửa
let isSurveyExpired = false; // Survey đã hết hạn - không thể điền hoặc submit
const reviewOrderId = new URLSearchParams(window.location.search).get('review_order_id');
let reviewData = null;
let reviewTimer = null;
let draftData = null;
let draftRevision = 0;
let draftTimer = null;
let draftSaving = null;
let lastSavedDraft = '';
let draftBlocked = false;
let draftBlockMessage = '';
let surveySessionData = null; // Lưu thông tin session (expires_at, started_at, etc.)

function setSurveyProgressBar(percentage) {
    const bar = document.getElementById('bar');
    if (!bar) return;
    const safePercentage = Math.min(100, Math.max(0, Number(percentage) || 0));
    bar.style.insetInlineEnd = (100 - safePercentage) + '%';
}

// Helper functions for localStorage
// Helper function to get current template ID
function getCurrentTemplateId() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('template_id');
    if (templateId) {
        return templateId;
    }
    // If no template_id in URL, use first template
    if (surveyTemplates && surveyTemplates.length > 0) {
        return surveyTemplates[0].id.toString();
    }
    return null;
}

function saveSurveyResponsesToStorage() {
    if (reviewOrderId !== null) return;
    if (draftData) { queueSurveyDraft(); return; }
    const examinationId = localStorage.getItem('current_examination_id');
    const templateId = getCurrentTemplateId();
    
    if (examinationId && templateId && Object.keys(surveyResponses).length > 0) {
        // Use composite key: examinationId_templateId to avoid collision
        localStorage.setItem(`survey_responses_${examinationId}_${templateId}`, JSON.stringify(surveyResponses));
        localStorage.setItem(`survey_current_index_${examinationId}_${templateId}`, currentQuestionIndex.toString());
        localStorage.setItem(`survey_template_id_${examinationId}`, templateId);
    }
}

function loadSurveyResponsesFromStorage() {
    const examinationId = localStorage.getItem('current_examination_id');
    if (!examinationId) {
        return false;
    }
    
    // Check template ID first before loading
    const currentTemplateId = getCurrentTemplateId();
    const storedTemplateId = localStorage.getItem(`survey_template_id_${examinationId}`);
    
    // If template IDs don't match, don't load old responses
    if (currentTemplateId && storedTemplateId && storedTemplateId !== currentTemplateId) {
        // Clear old data
        clearSurveyResponsesFromStorage();
        return false;
    }
    
    // If no current template ID yet (surveyTemplates not loaded), don't load
    if (!currentTemplateId) {
        return false;
    }
    
    // Use composite key: examinationId_templateId
    const savedResponses = localStorage.getItem(`survey_responses_${examinationId}_${currentTemplateId}`);
    const savedIndex = localStorage.getItem(`survey_current_index_${examinationId}_${currentTemplateId}`);
    
    if (savedResponses) {
        try {
            surveyResponses = JSON.parse(savedResponses);
            if (savedIndex) {
                const parsedIndex = parseInt(savedIndex);
                // Store the parsed index, will be validated later in prepareQuestions
                currentQuestionIndex = parsedIndex;
            }
            return true;
        } catch (e) {
            // If parsing fails, clear corrupted data
            clearSurveyResponsesFromStorage();
        }
    }
    return false;
}

function clearSurveyResponsesFromStorage() {
    const examinationId = localStorage.getItem('current_examination_id');
    const templateId = getCurrentTemplateId();
    
    if (examinationId) {
        // Clear old format (backward compatibility)
        localStorage.removeItem(`survey_responses_${examinationId}`);
        localStorage.removeItem(`survey_current_index_${examinationId}`);
        
        // Clear new format with templateId
        if (templateId) {
            localStorage.removeItem(`survey_responses_${examinationId}_${templateId}`);
            localStorage.removeItem(`survey_current_index_${examinationId}_${templateId}`);
        }
        
        // Clear all template-specific keys for this examination (in case of multiple templates)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(`survey_responses_${examinationId}_`)) {
                keysToRemove.push(key);
            }
            if (key && key.startsWith(`survey_current_index_${examinationId}_`)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        localStorage.removeItem(`survey_template_id_${examinationId}`);
    }
}

// Initialize when page loads
$(document).ready(function() {
    
    // Get patient info from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const patientId = urlParams.get('patient_id');
    const examinationId = urlParams.get('examination_id');
    const sessionToken = urlParams.get('session_token');
    const templateId = urlParams.get('template_id');
    const isPreview = urlParams.get('preview') === 'true';
    
    
    if (reviewOrderId !== null) {
        loadOrderSurveyResult(reviewOrderId);
        return;
    }

    // Check if this is a preview mode
    if (isPreview && templateId) {
        // Preview mode - load specific template with full interaction
        loadPreviewTemplate(templateId);
        return;
    }
    
    if (!patientId || !examinationId) {
        showAlert('error', 'Thiếu thông tin bệnh nhân hoặc lần khám. Vui lòng kiểm tra lại URL.');
        return;
    }
    
    // Store IDs in localStorage for API calls
    localStorage.setItem('current_patient_id', patientId);
    localStorage.setItem('current_examination_id', examinationId);
    if (sessionToken) {
        localStorage.setItem('session_token', sessionToken);
    }
    
    
    // Check session status first
    checkSessionStatus(sessionToken).then(() => {
        
        // Update session status to in_progress only if not closed, completed or expired
        if (!isSurveyClosed && !isSurveyCompleted && !isSurveyExpired) {
            updateSessionStatus('in_progress');
        }
        
        // Hiển thị thông báo nếu expired
        if (isSurveyExpired) {
            showExpiredSurveyMessage();
        }
        
        // Load patient information
        loadPatientInfo(patientId);
        
        // Load survey templates
        loadSurveyTemplates();
    });
    
    // Bind navigation events
    bindNavigationEvents();
});

// Check session status to determine if survey is closed or completed
function checkSessionStatus(sessionToken) {
    return new Promise((resolve) => {
        if (!sessionToken) {
            resolve(); // Continue normally if no session token
            return;
        }
        
        $.ajax({
            url: `/api/survey-sessions/status/${sessionToken}`,
            method: 'GET',
            success: function(response) {
                if (response.success && response.data) {
                    const status = response.data.status;
                    
                    // Lưu thông tin session để hiển thị thời gian
                    surveySessionData = response.data;
                    
                    // Tách riêng closed, completed và expired
                    if (status === 'closed') {
                        isSurveyClosed = true; // Read-only tuyệt đối
                    } else if (status === 'completed') {
                        isSurveyCompleted = true; // Có thể xem lại nhưng không sửa
                    } else if (status === 'expired') {
                        isSurveyExpired = true; // Đã hết hạn - không thể điền hoặc submit
                    }
                    
                    // Hiển thị thời gian sau khi có dữ liệu session
                    displaySurveyTimeInfo();
                }
                resolve(); // Luôn resolve để cho phép các hàm tải dữ liệu khác chạy
            },
            error: function() {
                resolve(); // Public survey status must be resolved by session token only.
            }
        });
    });
}

// Show message when survey is closed or completed
function showClosedSurveyMessage() {
    // Đảm bảo tất cả các input bị vô hiệu hóa nếu closed (read-only tuyệt đối)
    if (isSurveyClosed) {
        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
    }
    // Completed: có thể xem lại nhưng không submit (inputs vẫn enabled để xem)
    
    // Đảm bảo câu hỏi hiện tại được hiển thị ở chế độ chỉ đọc TRƯỚC
    if (allQuestions.length > 0) {
        // Đảm bảo currentQuestionIndex hợp lệ
        if (currentQuestionIndex < 0 || currentQuestionIndex >= allQuestions.length) {
            currentQuestionIndex = 0;
        }
        
        // Hiển thị câu hỏi và restore answers TRƯỚC khi update progress
        showQuestion(currentQuestionIndex);
    }
    
    // Update progress SAU KHI đã restore answers
    updateProgress();
    
    // Ẩn các nút hành động thông thường và hiển thị thông báo hoàn thành
    hideActionButtons();
}

// Show message when survey is expired
function showExpiredSurveyMessage() {
    // Disable tất cả inputs khi expired
    $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
    
    // Đảm bảo câu hỏi hiện tại được hiển thị ở chế độ chỉ đọc TRƯỚC
    if (allQuestions.length > 0) {
        // Đảm bảo currentQuestionIndex hợp lệ
        if (currentQuestionIndex < 0 || currentQuestionIndex >= allQuestions.length) {
            currentQuestionIndex = 0;
        }
        
        // Hiển thị câu hỏi và restore answers TRƯỚC khi update progress
        showQuestion(currentQuestionIndex);
    }
    
    // Update progress SAU KHI đã restore answers
    updateProgress();
    
    // Ẩn các nút hành động
    hideActionButtons();
    
    // Hiển thị thông báo hết hạn
    showAlert('error', 'Khảo sát đã hết hạn và ngừng nhận bài nộp. Vui lòng liên hệ cơ sở y tế nếu cần làm khảo sát mới.');
}

// Load patient information
function loadPatientInfo(patientId) {
    
    $.ajax({
        url: `/api/patients/${patientId}/public`,
        method: 'GET',
        success: function(response) {
            if (response.success && response.data) {
                patientInfo = response.data;
                displayPatientInfo(patientInfo);
            } else {
                showAlert('error', 'Không thể tải thông tin bệnh nhân.');
            }
        },
        error: function() {
            showAlert('error', 'Lỗi khi tải thông tin bệnh nhân.');
        }
    });
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

// Display survey time information (started_at and expires_at)
function displaySurveyTimeInfo() {
    if (!surveySessionData) return;
    
    // Tạo hoặc cập nhật elements để hiển thị thời gian
    const userInfoDiv = document.querySelector('.user > div');
    if (!userInfoDiv) return;
    
    // Xóa các elements cũ nếu có
    const oldStartedTime = document.getElementById('survey-started-time');
    const oldExpiresTime = document.getElementById('survey-expires-time');
    const oldDurationTime = document.getElementById('survey-duration-time');
    if (oldStartedTime) oldStartedTime.remove();
    if (oldExpiresTime) oldExpiresTime.remove();
    if (oldDurationTime) oldDurationTime.remove();
    
    // Hiển thị thời gian bắt đầu (nếu có)
    if (surveySessionData.started_at) {
        const startedTimeDiv = document.createElement('div');
        startedTimeDiv.id = 'survey-started-time';
        startedTimeDiv.className = 'time-info survey-time-info';
        startedTimeDiv.innerHTML = `🕐 Bắt đầu: <span class="survey-time-value">${formatDateTime(surveySessionData.started_at)}</span>`;
        userInfoDiv.appendChild(startedTimeDiv);
    } else if (surveySessionData.created_at) {
        // Nếu chưa có started_at, dùng created_at
        const startedTimeDiv = document.createElement('div');
        startedTimeDiv.id = 'survey-started-time';
        startedTimeDiv.className = 'time-info survey-time-info';
        startedTimeDiv.innerHTML = `🕐 Tạo lúc: <span class="survey-time-value">${formatDateTime(surveySessionData.created_at)}</span>`;
        userInfoDiv.appendChild(startedTimeDiv);
    }
    
    // Hiển thị thời gian hết hạn
    if (surveySessionData.expires_at) {
        const expiresTimeDiv = document.createElement('div');
        expiresTimeDiv.id = 'survey-expires-time';
        expiresTimeDiv.className = 'time-info survey-time-info survey-time-info--expires';
        
        // Check nếu đã hết hạn (so sánh ở UTC, convert sang GMT+7 để hiển thị)
        let expiresDateUTC = new Date(surveySessionData.expires_at);
        // Nếu date string không có timezone info, assume là UTC
        if (!surveySessionData.expires_at.includes('Z') && !surveySessionData.expires_at.includes('+') && !surveySessionData.expires_at.includes('-', 10)) {
            expiresDateUTC = new Date(surveySessionData.expires_at + 'Z');
        }
        
        // So sánh ở UTC
        const nowUTC = new Date();
        const isExpired = nowUTC > expiresDateUTC;
        const timeRemaining = expiresDateUTC - nowUTC;
        const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        
        let expiresText = '';
        if (isExpired) {
            expiresText = `<span class="survey-time-warning">⏰ Đã hết hạn: ${formatDateTime(surveySessionData.expires_at)}</span>`;
        } else if (hoursRemaining < 1) {
            expiresText = `<span class="survey-time-warning">⏰ Còn ${minutesRemaining} phút: ${formatDateTime(surveySessionData.expires_at)}</span>`;
        } else if (hoursRemaining < 6) {
            expiresText = `<span class="survey-time-warning">⏰ Còn ${hoursRemaining} giờ: ${formatDateTime(surveySessionData.expires_at)}</span>`;
        } else {
            expiresText = `⏰ Hết hạn: <span class="survey-time-value">${formatDateTime(surveySessionData.expires_at)}</span>`;
        }
        
        expiresTimeDiv.innerHTML = expiresText;
        userInfoDiv.appendChild(expiresTimeDiv);
    }
    
    // Hiển thị thời gian hoàn thành (duration) nếu đã completed
    if (isSurveyCompleted && surveySessionData.started_at && surveySessionData.updated_at) {
        const duration = formatDuration(surveySessionData.started_at, surveySessionData.updated_at);
        if (duration) {
            const durationTimeDiv = document.createElement('div');
            durationTimeDiv.id = 'survey-duration-time';
            durationTimeDiv.className = 'time-info survey-time-info';
            durationTimeDiv.innerHTML = `✅ Hoàn thành trong: <span class="survey-time-success">${duration}</span>`;
            userInfoDiv.appendChild(durationTimeDiv);
        }
    }
}

// Load preview template
function loadPreviewTemplate(templateId) {
    
    const surveyContent = $('#survey-content');
    const surveyLoading = $('#loading-spinner');
    const noSurveyMessage = $('#no-survey-message');
    
    // Show loading
    surveyContent.hide();
    noSurveyMessage.hide();
    surveyLoading.show();
    
    // Update header for preview mode
    $('#survey-name').text('🛡️ Trải nghiệm mẫu khảo sát');
    $('#patient-name').text('Người dùng thử nghiệm');
    $('#patient-phone').text('Chế độ trải nghiệm');
    
    $.ajax({
        url: `/api/survey-templates/${templateId}/public`,
        method: 'GET',
        success: function(response) {
            surveyLoading.hide();
            
            if (response.success && response.data) {
                const template = response.data;
                surveyTemplates = [template]; // Set as single template array
                
                // Update header with template info
                $('#survey-name').text(`🛡️ ${template.name}`);
                
                // Prepare questions from the template
                if (prepareQuestions() === false) return;
                
                
                if (allQuestions.length > 0) {
                    // Show all questions at once (Google Forms style)
                    showAllQuestions();
                    
                    // Show preview notice with full interaction
                    showPreviewNotice();
                } else {
                    noSurveyMessage.show();
                }
            } else {
                showAlert('error', 'Không thể tải mẫu khảo sát để xem trước.');
            }
        },
        error: function() {
            surveyLoading.hide();
            showAlert('error', 'Lỗi khi tải mẫu khảo sát để xem trước.');
        }
    });
}

// Show all questions at once (Google Forms style)
function showAllQuestions() {
    const surveyContent = $('#survey-content');
    let allQuestionsHtml = '';
    
    allQuestions.forEach((question, index) => {
        const questionNumber = index + 1;
        const questionHtml = renderSingleQuestion(question, index, questionNumber);
        allQuestionsHtml += questionHtml;
    });
    
    surveyContent.html(allQuestionsHtml);
    surveyContent.show();
    
    // Bind events for all questions
    bindQuestionEvents();
    
    // Update progress to show all questions answered
    updateProgressForAllQuestions();
    
    // Hide navigation buttons since we show all questions
    $('.actions').hide();
    
    // Add submit button at the bottom
    const submitButton = `
        <div class="submit-section survey-submit-section">
            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" id="submitAllQuestions" class="btn btn-primary survey-submit-button">
                <i class="bi bi-check-circle me-2"></i>Gửi khảo sát
            </button>
        </div>
    `;
    
    surveyContent.append(submitButton);
    
    // Bind submit button event
    $('#submitAllQuestions').on('click', function() {
        submitSurvey();
    });
}

// Update progress for all questions view
function updateProgressForAllQuestions() {
    const answeredCount = Object.keys(surveyResponses).length;
    const percentage = totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / totalQuestions) * 100)) : 0;
    
    $('#cur').text(answeredCount);
    $('#total').text(totalQuestions);
    $('#kpi').text(percentage + '%');
    
    // Update progress bar
    setSurveyProgressBar(percentage);
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
