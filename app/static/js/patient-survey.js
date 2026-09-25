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
    return new Promise((resolve, reject) => {
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
            error: function(xhr, status, error) {
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
        error: function(xhr, status, error) {
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
        error: function(xhr, status, error) {
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

// Load survey templates
function loadSurveyTemplates() {
    const token = new URLSearchParams(window.location.search).get('session_token');
    if (token) { loadSessionSurveyDraft(token); return; }
    
    const surveyContent = $('#survey-content');
    const surveyLoading = $('#loading-spinner');
    const noSurveyMessage = $('#no-survey-message');
    
    // Show loading
    surveyContent.hide();
    noSurveyMessage.hide();
    surveyLoading.show();
    
    // Lấy examination_id và template_id từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const examinationId = urlParams.get('examination_id');
    const templateIdFromUrl = urlParams.get('template_id');
    
    
    // If template_id is provided in URL, load only that template
    if (templateIdFromUrl) {
        // Load specific template
        $.ajax({
            url: `/api/survey-templates/${templateIdFromUrl}/public`,
            method: 'GET',
            success: function(response) {
                surveyLoading.hide();
                
                
                if (response.success && response.data) {
                    surveyTemplates = [response.data];  // Single template array
                    if (prepareQuestions() === false) return;
                    
                    // Update header with template info
                    $('#survey-name').text(`🛡️ ${response.data.name}`);
                    
                    // Load existing responses first, then show first question
                    loadExistingResponses().then(() => {
                        currentQuestionIndex = 0;
                        showQuestion(0);
                        
                        if (isSurveyClosed || isSurveyCompleted) {
                            showClosedSurveyMessage();
                        } else if (isSurveyExpired) {
                            showExpiredSurveyMessage();
                        }
                    });
                } else {
                    noSurveyMessage.show();
                }
            },
            error: function(xhr, status, error) {
                surveyLoading.hide();
                showAlert('error', 'Lỗi khi tải câu hỏi khảo sát.');
            }
        });
        return;  // Exit early, don't load all templates
    }
    
    // No template_id in URL - load all active templates for examination (legacy behavior)
    const apiUrl = examinationId ? 
        `/api/survey-templates/examination/${examinationId}/public` : 
        '/api/survey-templates/active/public';
    
    $.ajax({
        url: apiUrl,
        method: 'GET',
        success: function(response) {
            surveyLoading.hide();
            
            
            if (response.success && response.data && response.data.length > 0) {
                surveyTemplates = response.data;
                if (prepareQuestions() === false) return;
                
                // Update header with first template info
                if (surveyTemplates.length > 0) {
                    const firstTemplate = surveyTemplates[0];
                    $('#survey-name').text(`🛡️ ${firstTemplate.name}`);
                }
                
                // Load existing responses first, then show first question
                loadExistingResponses().then(() => {
                    // Show first question after loading responses
                    currentQuestionIndex = 0;
                    showQuestion(0);
                    
                    // Nếu khảo sát đã đóng, hoàn thành hoặc hết hạn, hiển thị trạng thái
                    if (isSurveyClosed || isSurveyCompleted) {
                        showClosedSurveyMessage();
                    } else if (isSurveyExpired) {
                        showExpiredSurveyMessage();
                    }
                });
            } else {
                noSurveyMessage.show();
            }
        },
        error: function(xhr, status, error) {
            surveyLoading.hide();
            showAlert('error', 'Lỗi khi tải câu hỏi khảo sát.');
        }
    });
}

// Prepare all questions from templates
function prepareQuestions() {
    allQuestions = [];
    const invalidTemplate = surveyTemplates.some(template => {
        const content = template.content;
        const questions = Array.isArray(content) ? content : content?.questions
            || Object.values(template.questions_by_criteria || {}).flat();
        return questions.some(question => question.id === undefined || question.id === null || question.id === '');
    });
    if (invalidTemplate) {
        $('#loading-spinner, .actions, #survey-content').hide();
        $('#no-survey-message').text('Mẫu khảo sát chưa sẵn sàng. Vui lòng liên hệ phòng khám để cập nhật mẫu và liên kết khảo sát.').show();
        $('#next').prop('disabled', true);
        showAlert('error', 'Mẫu khảo sát cần được cập nhật. Vui lòng liên hệ phòng khám.');
        return false;
    }

    surveyTemplates.forEach(template => {
        // Handle new structure (content.questions array)
        if (template.content && template.content.questions) {
            template.content.questions.forEach((question, index) => {
                allQuestions.push({
                    ...question,
                    template_id: template.id
                });
            });
        }
        // Handle old structure (questions_by_criteria)
        else if (template.questions_by_criteria) {
            Object.keys(template.questions_by_criteria).forEach(criteria => {
                const questions = template.questions_by_criteria[criteria];
                questions.forEach((question, index) => {
                    allQuestions.push({
                        ...question,
                        template_id: template.id,
                        criteria: criteria
                    });
                });
            });
        }
        // Handle direct content array (like DASS-21)
        else if (Array.isArray(template.content)) {
            template.content.forEach((question, index) => {
                                              
                allQuestions.push({
                    ...question,
                    template_id: template.id
                });
            });
        }
    });
    
    // Calculate total questions including subquestions in grid questions
    let totalCount = 0;
    allQuestions.forEach(question => {
        if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
            // For grid questions, count each subquestion (row) as a separate question
            const gridRows = question.grid ? question.grid.rows : [];
            totalCount += gridRows.length > 0 ? gridRows.length : 1; // Fallback to 1 if no rows
        } else {
            // For regular questions, count as 1
            totalCount += 1;
        }
    });
    
    totalQuestions = totalCount;
    
    // Validate currentQuestionIndex after questions are prepared
    if (currentQuestionIndex >= allQuestions.length) {
        currentQuestionIndex = 0;
        // Clear the corrupted saved index
        const examinationId = localStorage.getItem('current_examination_id');
        if (examinationId) {
            localStorage.removeItem(`survey_current_index_${examinationId}`);
        }
    }
}

// Show specific question
function showQuestion(index) {
    
    if (index < 0 || index >= allQuestions.length) {
        return;
    }
    
    // currentQuestionIndex is now managed by button handlers
    const question = allQuestions[index];
    
    // Update progress
    updateProgress();
    
    // Render question
    const surveyContent = $('#survey-content');
    const questionHtml = renderSingleQuestion(question, index);
    
    surveyContent.html(questionHtml);
    surveyContent.show(); // Make sure content is visible
    
    // Restore previous answer if exists
    restoreAnswer(question.id);
    if (isSurveyClosed || isSurveyCompleted || isSurveyExpired) {
        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
    }
    
    // Bind question events
    bindQuestionEvents();
    
    // Update navigation buttons
    updateNavigationButtons();
    
    // Update completion navigation buttons if they exist
    updateCompletionButtons();
}

// Update completion navigation buttons visibility
function updateCompletionButtons() {
    const returnBtn = $('.btn-return-to-view');
    const nextBtn = $('.btn-next-to-view');
    
    returnBtn.toggleClass('survey-action-hidden', currentQuestionIndex === 0);
    nextBtn.toggleClass('survey-action-hidden', currentQuestionIndex === allQuestions.length - 1);
}

// Render single question
function renderSingleQuestion(question, index, questionNumber = null) {
    const questionId = `q_${question.id}`;
    const questionText = question.text || question.question || '';
    const questionType = question.type || 'multiple_choice';
    const required = question.required || false;
    
    // Use provided questionNumber or calculate from index
    const qNumber = questionNumber || (index + 1);
    
    let questionHtml = `
        <section class="card survey-question-card" aria-labelledby="${questionId}">
            <h2 id="${questionId}" class="survey-question-title">
                <span class="survey-question-number">Câu ${qNumber}</span><br>
                <span class="survey-question-text">${questionText}</span>
                ${required ? '<span class="survey-required-mark">*</span>' : ''}
            </h2>
    `;
    
    // Render based on question type
    switch (questionType) {
        case 'short_answer':
            questionHtml += renderShortAnswerQuestion(question, questionId);
            break;
        case 'paragraph':
            questionHtml += renderParagraphQuestion(question, questionId);
            break;
        case 'multiple_choice':
            questionHtml += renderMultipleChoiceQuestion(question, questionId);
            break;
        case 'checkboxes':
            questionHtml += renderCheckboxesQuestion(question, questionId);
            break;
        case 'dropdown':
            questionHtml += renderDropdownQuestion(question, questionId);
            break;
        case 'linear_scale':
            questionHtml += renderLinearScaleQuestion(question, questionId);
            break;
        case 'multiple_choice_grid':
        case 'checkbox_grid':
            questionHtml += renderGridQuestion(question, questionId);
            break;
        case 'date':
            questionHtml += renderDateQuestion(question, questionId);
            break;
        case 'time':
            questionHtml += renderTimeQuestion(question, questionId);
            break;
        default:
            // Fallback to multiple choice for unknown types
            questionHtml += renderMultipleChoiceQuestion(question, questionId);
    }
    
    questionHtml += '</section>';
    return questionHtml;
}

// Render Short Answer Question
function renderShortAnswerQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    const maxLengthAttr = characterLimit ? `maxlength="${characterLimit}"` : '';
    
    let html = `
        <div class="form-group">
            <input type="text" 
                   name="${questionId}" 
                   id="${questionId}_input" 
                   class="form-control" 
                   placeholder="Nhập câu trả lời ngắn..."
                   ${disabledAttr} 
                   ${maxLengthAttr}>
    `;
    
    if (characterLimit) {
        html += `
            <div class="character-counter">
                <span class="current-count">0</span>/${characterLimit} ký tự
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

// Render Paragraph Question
function renderParagraphQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    const maxLengthAttr = characterLimit ? `maxlength="${characterLimit}"` : '';
    
    let html = `
        <div class="form-group">
            <textarea name="${questionId}" 
                      id="${questionId}_textarea" 
                      class="form-control" 
                      placeholder="Nhập câu trả lời dài..."
                      rows="4"
                      ${disabledAttr} 
                      ${maxLengthAttr}></textarea>
    `;
    
    if (characterLimit) {
        html += `
            <div class="character-counter">
                <span class="current-count">0</span>/${characterLimit} ký tự
            </div>
        `;
    }
    
    html += '</div>';
    return html;
}

// Render Multiple Choice Question
function renderMultipleChoiceQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
            <div class="group" role="radiogroup" aria-labelledby="${questionId}">
            ${answers.map((answer, answerIndex) => renderRadioOption(answer, questionId, answerIndex, disabledAttr)).join('')}
                ${reviewOrderId === null ? `<div class="note">Mẹo: bấm phím <b>1–${answers.length}</b> để chọn nhanh</div>` : ''}
            </div>
    `;
    return html;
}

// Render Checkboxes Question
function renderCheckboxesQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="group" role="group" aria-labelledby="${questionId}">
            ${answers.map((answer, answerIndex) => renderCheckboxOption(answer, questionId, answerIndex, disabledAttr)).join('')}
        </div>
    `;
    return html;
}

// Render Dropdown Question
function renderDropdownQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="form-group">
            <select name="${questionId}" 
                    id="${questionId}_select" 
                    class="form-control" 
                    ${disabledAttr}>
                <option value="">Chọn một đáp án...</option>
                ${answers.map((answer, answerIndex) => {
                    const answerId = surveyOptionId(answer, answerIndex);
                    const answerText = answer.text || '';
                    return `<option value="${answerId}">${answerText}</option>`;
                }).join('')}
            </select>
        </div>
    `;
    return html;
}

// Render Linear Scale Question
function renderLinearScaleQuestion(question, questionId) {
    const scale = question.linear_scale || { min: 1, max: 5 };
    const lowLabel = scale.low_label || '';
    const highLabel = scale.high_label || '';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="linear-scale-container">
            <div class="scale-labels">
                <span class="scale-label-text">${lowLabel}</span>
                <span class="scale-label-text">${highLabel}</span>
            </div>
            <div class="scale-options">
    `;
    
    for (let i = scale.min; i <= scale.max; i++) {
        html += `
            <div class="scale-option">
                <input type="radio" 
                       name="${questionId}" 
                       id="${questionId}_scale_${i}" 
                       value="${i}" 
                       ${disabledAttr}>
                <label for="${questionId}_scale_${i}">${i}</label>
            </div>
        `;
    }
    
    html += `
            </div>
        </div>
    `;
    return html;
}

// Render Grid Question
function renderGridQuestion(question, questionId) {
    const grid = question.grid || { rows: [], columns: [] };
    const isCheckbox = question.type === 'checkbox_grid';
    const inputType = isCheckbox ? 'checkbox' : 'radio';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="grid-container">
            <table class="grid-table">
                <thead>
                    <tr>
                        <th class="grid-row-header"></th>
                        ${grid.columns.map(col => `
                            <th class="grid-column-header">
                                ${col.text || col.label || col}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${grid.rows.map((row, rowIndex) => `
                        <tr>
                            <td class="grid-row-label">
                                ${row.text || row}
                            </td>
                            ${grid.columns.map((col, colIndex) => {
                                const cellId = `${questionId}_row_${rowIndex}_col_${colIndex}`;
                                const rowId = row.id || rowIndex.toString();
                                return `
                                    <td class="grid-answer-cell">
                                        <input type="${inputType}" 
                                               name="${questionId}_row_${rowIndex}" 
                                               id="${cellId}" 
                                               value="${surveyOptionId(col, colIndex)}"
                                               data-question-id="${question.id}"
                                               data-row-id="${rowId}"
                                               data-row-index="${rowIndex}"
                                               ${disabledAttr}>
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    return html;
}

// Render Date Question
function renderDateQuestion(question, questionId) {
    const includeTime = question.include_time || false;
    const inputType = includeTime ? 'datetime-local' : 'date';
    const placeholder = includeTime ? 'Chọn ngày và giờ' : 'Chọn ngày';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="form-group">
            <input type="${inputType}" 
                   name="${questionId}" 
                   id="${questionId}_date" 
                   class="form-control" 
                   placeholder="${placeholder}"
                   ${disabledAttr}>
        </div>
    `;
    return html;
}

// Render Time Question
function renderTimeQuestion(question, questionId) {
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    
    let html = `
        <div class="form-group">
            <input type="time" 
                   name="${questionId}" 
                   id="${questionId}_time" 
                   class="form-control" 
                   placeholder="Chọn giờ"
                   ${disabledAttr}>
        </div>
    `;
    return html;
}

// Render Radio Option (for Multiple Choice)
function surveyOptionId(answer, index) {
    return answer.id === undefined || answer.id === null || answer.id === '' ? index : answer.id;
}

function renderRadioOption(answer, questionId, index, disabledAttr) {
    const answerId = surveyOptionId(answer, index);
    const answerText = answer.text || '';
    const answerScore = answer.score || answer.value || 0;
    const optionId = `${questionId}_${answerId}`;
    
    return `
        <div class="opt">
            <input type="radio" name="${questionId}" id="${optionId}" value="${answerId}" data-score="${answerScore}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${answerText}
            </label>
        </div>
    `;
}

// Render Checkbox Option (for Checkboxes)
function renderCheckboxOption(answer, questionId, index, disabledAttr) {
    const answerId = surveyOptionId(answer, index);
    const answerText = answer.text || '';
    const answerScore = answer.score || answer.value || 0;
    const optionId = `${questionId}_${answerId}`;
    
    return `
        <div class="opt">
            <input type="checkbox" name="${questionId}[]" id="${optionId}" value="${answerId}" data-score="${answerScore}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${answerText}
            </label>
        </div>
    `;
}

// Bind question events
function bindQuestionEvents() {
    if (reviewOrderId !== null || isSurveyClosed || isSurveyCompleted || isSurveyExpired) return;
    
    // Radio button change event
    $('#survey-content').off('change', 'input[type="radio"]').on('change', 'input[type="radio"]', function() {
        const questionId = $(this).attr('name');
        const answerId = $(this).val();
        const score = $(this).data('score');
        
        // Check if this is a grid question - dùng data attributes thay vì parse string
        const $this = $(this);
        const questionIdAttr = $this.data('question-id');
        const rowIdAttr = $this.data('row-id');
        
        if (questionIdAttr && rowIdAttr) {
            // Handle grid question response với data attributes
            handleGridQuestionResponse(questionIdAttr, rowIdAttr, answerId, 'radio');
        } else if (questionId.includes('_row_')) {
            // Fallback: parse string nếu không có data attributes (backward compatibility)
            handleGridQuestionResponse(null, null, answerId, 'radio', questionId);
        } else {
            // Regular question response
            surveyResponses[questionId] = {
                answer_id: answerId,
                score: score
            };
        }
        
        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });
    
    // Checkbox change event
    $('#survey-content').off('change', 'input[type="checkbox"]').on('change', 'input[type="checkbox"]', function() {
        const questionId = $(this).attr('name').replace('[]', '');
        
        // Check if this is a grid question - dùng data attributes
        const $this = $(this);
        const questionIdAttr = $this.data('question-id');
        const rowIdAttr = $this.data('row-id');
        
        if (questionIdAttr && rowIdAttr) {
            // Handle grid question response với data attributes
            handleGridQuestionResponse(questionIdAttr, rowIdAttr, $this.val(), 'checkbox');
        } else if (questionId.includes('_row_')) {
            // Fallback: parse string nếu không có data attributes
            handleGridQuestionResponse(null, null, $this.val(), 'checkbox', questionId);
        } else {
            // Regular checkbox question
            const checkedBoxes = $(`input[name="${questionId}[]"]:checked`);
            const selectedValues = checkedBoxes.map(function() { return $(this).val(); }).get();
            const selectedScores = checkedBoxes.map(function() { return $(this).data('score'); }).get();
            
            // Store response
            surveyResponses[questionId] = {
                answer_ids: selectedValues,
                scores: selectedScores
            };
        }
        
        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });
    
    // Dropdown change event
    $('#survey-content').off('change', 'select').on('change', 'select', function() {
        const questionId = $(this).attr('name');
        const answerId = $(this).val();
        
        // Store response
        surveyResponses[questionId] = {
            answer_id: answerId,
            score: 0
        };
        
        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });
    
    // Text input change event (Short Answer, Paragraph)
    $('#survey-content').off('input', 'input[type="text"], textarea').on('input', 'input[type="text"], textarea', function() {
        const questionId = $(this).attr('name');
        const answerText = $(this).val();
        
        // Store response
        surveyResponses[questionId] = {
            answer_text: answerText,
            score: 0
        };
        
        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update character counter
        updateCharacterCounter($(this));
        
        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });
    
    // Date/Time input change event
    $('#survey-content').off('change', 'input[type="date"], input[type="time"], input[type="datetime-local"]').on('change', 'input[type="date"], input[type="time"], input[type="datetime-local"]', function() {
        const questionId = $(this).attr('name');
        const answerValue = $(this).val();
        
        // Store response
        surveyResponses[questionId] = {
            answer_value: answerValue,
            score: 0
        };
        
        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });
    
    // Keyboard shortcuts for multiple choice
    $(document).off('keydown.survey').on('keydown.survey', function(e) {
        const key = e.key;
        const currentCard = $('.card:visible').first();
        const radioInputs = currentCard.find('input[type="radio"]');
        
        if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
            const index = parseInt(key) - 1;
            
            if (radioInputs[index]) {
                radioInputs[index].checked = true;
                // Use vanilla JavaScript event dispatch
                radioInputs[index].dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });
    
}

// Helper function to check if in preview mode
function isPreviewMode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('preview') === 'true';
}

// Helper function to update progress for preview mode
function updateProgressIfPreview() {
    if (isPreviewMode()) {
        updateProgressForAllQuestions();
    }
}

// Update character counter
function updateCharacterCounter(input) {
    const counter = input.siblings('.character-counter');
    if (counter.length) {
        const currentCount = input.val().length;
        const maxLength = input.attr('maxlength');
        
        counter.find('.current-count').text(currentCount);
        
        // Change color based on usage
        if (maxLength) {
            const percentage = (currentCount / parseInt(maxLength)) * 100;
            if (percentage >= 90) {
                counter.removeClass('character-counter--warning').addClass('character-counter--danger');
            } else if (percentage >= 75) {
                counter.removeClass('character-counter--danger').addClass('character-counter--warning');
            } else {
                counter.removeClass('character-counter--danger character-counter--warning');
            }
        }
    }
}

// Bind navigation events
function bindNavigationEvents() {
    
    // Next button - navigation dùng allQuestions.length
    $('#next').off('click').on('click', function() {
        if (currentQuestionIndex < allQuestions.length - 1) {
            currentQuestionIndex++;
            saveSurveyResponsesToStorage();
            showQuestion(currentQuestionIndex);
        } else {
            // Last question - submit survey
            submitSurvey();
        }
    });
    
    // Previous button
    $('#previous').off('click').on('click', function() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            saveSurveyResponsesToStorage();
            showQuestion(currentQuestionIndex);
        }
    });
    
    // Start over button
    $('#start-over').off('click').on('click', function() {
        if (confirm('Bạn có chắc muốn bắt đầu lại? Tất cả câu trả lời sẽ bị mất.')) {
            surveyResponses = {};
            currentQuestionIndex = 0;
            clearSurveyResponsesFromStorage();
            saveSurveyResponsesToStorage();
            showQuestion(0);
        }
    });
    
}

// Update progress
function updateProgress() {
    // Safety check: if totalQuestions is not set yet, don't update progress
    if (!totalQuestions || totalQuestions === 0) {
        // Set default values - show 0% progress when questions not loaded yet
        $('#cur').text(1);
        $('#total').text('?');
        $('#kpi').text('0%');
        setSurveyProgressBar(0);
        return; // Exit early
    }
    
    // Count actual responses (including grid_responses)
    // Only count responses that have valid answers
    let actualResponseCount = 0;
    Object.keys(surveyResponses).forEach(key => {
        const response = surveyResponses[key];
        if (response && response.grid_responses) {
            // For grid questions, count each subquestion that has a valid answer
            Object.keys(response.grid_responses).forEach(subKey => {
                const subResponse = response.grid_responses[subKey];
                // Only count if subquestion has a valid answer (not empty string, null, or undefined)
                if (subResponse !== null && subResponse !== undefined && subResponse !== '') {
                    if (Array.isArray(subResponse)) {
                        // For checkbox arrays, count if at least one item is selected
                        if (subResponse.length > 0) {
                            actualResponseCount += 1;
                        }
                    } else {
                        // For single answers, count if not empty
                        actualResponseCount += 1;
                    }
                }
            });
        } else if (response) {
            // Numeric answer ID/value 0 is a saved answer too.
            const hasValidAnswer = [response.answer_id, response.answer_ids,
                response.answer_text, response.answer_value].some(value =>
                value !== undefined && value !== null &&
                (Array.isArray(value) ? value.length > 0 : String(value).trim() !== ''));
            if (hasValidAnswer) actualResponseCount += 1;
        }
    });
    
    // Clamp actualResponseCount to prevent overflow (should never exceed totalQuestions)
    actualResponseCount = Math.min(actualResponseCount, totalQuestions);
    
    // Calculate percentage with safety checks
    let percentage = 0;
    if (totalQuestions > 0) {
        const rawPercentage = (actualResponseCount / totalQuestions) * 100;
        // Ensure percentage is a valid number and doesn't exceed 100%
        if (isNaN(rawPercentage) || !isFinite(rawPercentage)) {
            percentage = 0;
        } else {
            percentage = Math.min(100, Math.max(0, Math.round(rawPercentage)));
        }
    }
    
    // Ensure percentage is never 100% unless all questions are actually answered
    // This prevents showing 100% when survey just started
    if (actualResponseCount === 0 && percentage > 0) {
        percentage = 0;
    }

    
    // cur = số câu đã trả lời (actualResponseCount), không phải index hiện tại
    $('#cur').text(actualResponseCount);
    $('#total').text(totalQuestions);
    $('#kpi').text(percentage + '%');
    
    // Update progress bar
    // insetInlineEnd: 100% = empty bar (0% filled), 0% = full bar (100% filled)
    setSurveyProgressBar(percentage);
}

// Update navigation buttons
function updateNavigationButtons() {
    // Safety check: ensure currentQuestionIndex is within bounds
    if (currentQuestionIndex >= allQuestions.length) {

        currentQuestionIndex = allQuestions.length - 1; // Set to last valid index
    }
    
    const currentQuestion = allQuestions[currentQuestionIndex];
    if (!currentQuestion) {
        return;
    }
    
    // Navigation dùng allQuestions.length, không dùng totalQuestions
    const mainQuestionId = `q_${currentQuestion.id}`;
    const response = surveyResponses[mainQuestionId];
    const isFirstQuestion = currentQuestionIndex === 0;
    const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;
    
    // Check if question has a valid answer
    const hasAnswer = canProceedSurveyQuestion(currentQuestion, response);
    
    // Previous button
    $('#previous').prop('disabled', isFirstQuestion);
    
    // Next button - isLastQuestion đã được tính ở trên
    if (isLastQuestion) {
        $('#next').text('Hoàn thành').prop('disabled', !hasAnswer);
    } else {
        $('#next').text('Tiếp theo').prop('disabled', !hasAnswer);
    }
    
}

function hasSurveyAnswer(value) {
    return value !== undefined && value !== null &&
        (Array.isArray(value) ? value.length > 0 : String(value).trim() !== '');
}

function canProceedSurveyQuestion(question, response) {
    if (!question.required) return true;
    return ['multiple_choice_grid', 'checkbox_grid'].includes(question.type)
        ? validateGridQuestion(question, response) : validateRegularQuestion(response);
}

// Validate regular question, including numeric ID/value zero.
function validateRegularQuestion(response) {
    return !!response && [response.answer_id, response.answer_ids,
        response.answer_text, response.answer_value].some(hasSurveyAnswer);
}

// Validate grid question (DASS-21 with subquestions)
function validateGridQuestion(question, response) {

    
    if (!response || !response.grid_responses) {
        return false;
    }
    
    // Get all subquestions (rows)
    const subquestions = question.grid ? question.grid.rows : [];
    
    if (subquestions.length === 0) {
        return false;
    }
    
    // Check if all subquestions have been answered
    for (let i = 0; i < subquestions.length; i++) {
        const subquestionId = subquestions[i].id ?? i.toString();
        const subquestionResponse = response.grid_responses[subquestionId];

        
        // Check if this subquestion has been answered
        if (!hasSurveyAnswer(subquestionResponse)) {
            return false;
        }
        
        // For multiple choice grid, empty string check is already covered above
        
        // For checkbox grid, check if at least one option was selected
        if (question.type === 'checkbox_grid') {
            if (!Array.isArray(subquestionResponse) || subquestionResponse.length === 0) {
                return false;
            }
        }
    }
    
    return true;
}

// Handle grid question response - dùng data attributes thay vì parse string
function handleGridQuestionResponse(questionId, rowId, answerId, inputType, fallbackQuestionId = null) {

    
    let mainQuestionId = null;
    let actualSubquestionId = rowId;
    
    // Ưu tiên dùng data attributes (cách mới - an toàn)
    if (questionId && rowId) {
        mainQuestionId = `q_${questionId}`;
        actualSubquestionId = rowId;

    } 
    // Fallback: parse string nếu không có data attributes (backward compatibility)
    else if (fallbackQuestionId && fallbackQuestionId.includes('_row_')) {
        const parts = fallbackQuestionId.split('_row_');
        mainQuestionId = parts[0];
        const rowIndex = parseInt(parts[1], 10);
        
        // Tìm question object
        let targetQuestion = null;
        for (let q of allQuestions) {
            const qId = `q_${q.id}`;
            if (qId === mainQuestionId) {
                targetQuestion = q;
                break;
            }
        }
        
        // Fallback: dùng currentQuestionIndex
        if (!targetQuestion) {
            targetQuestion = allQuestions[currentQuestionIndex];
            if (targetQuestion && targetQuestion.id) {
                mainQuestionId = `q_${targetQuestion.id}`;
            }
        }
        
        // Lấy row ID từ grid structure
        if (targetQuestion && targetQuestion.grid && targetQuestion.grid.rows && targetQuestion.grid.rows[rowIndex]) {
            actualSubquestionId = targetQuestion.grid.rows[rowIndex].id || rowIndex.toString();
        } else {
            actualSubquestionId = rowIndex.toString();
        }
        

    } else {
        return;
    }
    
    // Initialize grid_responses if not exists
    if (!surveyResponses[mainQuestionId]) {
        surveyResponses[mainQuestionId] = {};
    }
    if (!surveyResponses[mainQuestionId].grid_responses) {
        surveyResponses[mainQuestionId].grid_responses = {};
    }
    
    // Store the response for this specific row using the actualSubquestionId
    if (inputType === 'radio') {
        surveyResponses[mainQuestionId].grid_responses[actualSubquestionId] = answerId;

    } else if (inputType === 'checkbox') {
        // For checkbox, we need to collect all checked values for this row
        // Tìm tất cả checkbox cùng row bằng data attributes
        const checkedBoxes = $(`input[data-question-id="${questionId}"][data-row-id="${rowId}"]:checked`);
        const checkedValues = [];
        checkedBoxes.each(function() {
            checkedValues.push($(this).val());
        });
        surveyResponses[mainQuestionId].grid_responses[actualSubquestionId] = checkedValues;

    }
}

// Restore previous answer
function restoreAnswer(questionId) {
    const response = surveyResponses[`q_${questionId}`];
    if (response) {
        // Handle grid questions first (like DASS-21 with subquestions)
        if (response.grid_responses) {
            Object.keys(response.grid_responses).forEach(rowId => {
                const value = response.grid_responses[rowId];
                if (Array.isArray(value)) {
                    // Checkbox grid: restore multiple selections
                    value.forEach(v => {
                        const checkbox = $(`input[data-row-id="${rowId}"][value="${v}"]`);
                        if (checkbox.length) {
                            checkbox.prop('checked', true);
                        }
                    });
                } else {
                    // Radio grid: restore single selection
                    const radio = $(`input[data-row-id="${rowId}"][value="${value}"]`);
                    if (radio.length) {
                        radio.prop('checked', true);
                    }
                }
            });
        }
        // Handle different response types for regular questions
        else if (response.answer_id !== undefined && response.answer_id !== null) {
            // Radio button or dropdown
            const input = $(`input[name="q_${questionId}"][value="${response.answer_id}"], select[name="q_${questionId}"]`);
            if (input.length) {
                if (input.is('select')) {
                    input.val(response.answer_id);
                } else {
                    input.prop('checked', true);
                }
            }
        } else if (response.answer_ids) {
            // Checkboxes
            response.answer_ids.forEach(answerId => {
                const checkbox = $(`input[name="q_${questionId}[]"][value="${answerId}"]`);
                if (checkbox.length) {
                    checkbox.prop('checked', true);
                }
            });
        } else if (response.answer_text) {
            // Text input or textarea
            const textInput = $(`input[name="q_${questionId}"], textarea[name="q_${questionId}"]`);
            if (textInput.length) {
                textInput.val(response.answer_text);
                updateCharacterCounter(textInput);
            }
        } else if (response.answer_value !== undefined && response.answer_value !== null) {
            // Date, time, or datetime-local
            const dateInput = $(`input[name="q_${questionId}"]`);
            if (dateInput.length) {
                dateInput.val(response.answer_value);
            }
        }
    }
}

// Hydrate stored answer IDs into the existing question renderer's state.
function restoreSavedSurveyResponses(answers) {
    surveyResponses = {};
    allQuestions.forEach(question => {
        const key = `q_${question.id}`;
        if (['multiple_choice_grid', 'checkbox_grid'].includes(question.type)) {
            const gridResponses = {};
            (question.grid?.rows || []).forEach((row, index) => {
                const savedKey = String(row.question_id ?? row.id ?? index);
                if (Object.prototype.hasOwnProperty.call(answers, savedKey)) {
                    gridResponses[String(row.id ?? index)] = answers[savedKey];
                }
            });
            if (Object.keys(gridResponses).length) surveyResponses[key] = {grid_responses: gridResponses};
        } else if (Object.prototype.hasOwnProperty.call(answers, String(question.id))) {
            const value = answers[String(question.id)];
            const field = ['short_answer', 'paragraph'].includes(question.type) ? 'answer_text'
                : ['date', 'time'].includes(question.type) ? 'answer_value'
                : Array.isArray(value) ? 'answer_ids' : 'answer_id';
            surveyResponses[key] = {[field]: value};
        }
    });
}

// Use the same question renderer for live progress and submitted results.
async function loadOrderSurveyResult(orderId, refresh = false) {
    clearTimeout(reviewTimer);
    isSurveyClosed = true;
    document.body.classList.add('survey-review');
    if (!refresh) {
        $('.actions, #survey-content, #no-survey-message').hide();
        $('#title').text('Kết quả khảo sát');
    }
    const fail = message => {
        $('#loading-spinner, #survey-content, .actions').hide();
        $('#survey-name').text('Không thể xem kết quả');
        $('#patient-name, #patient-phone').text('—');
        $('#no-survey-message').text(message).show();
    };
    const token = localStorage.getItem('qlpk_token');
    if (!token) { fail('Vui lòng đăng nhập tài khoản phòng khám rồi mở lại Xem kết quả.'); return; }
    try {
        if (!/^\d+$/.test(orderId)) throw new Error('Liên kết kết quả không hợp lệ.');
        const response = await fetch(`/api/chi-dinh/${orderId}/survey-result`, {
            headers: {Authorization: `Bearer ${token}`}, cache: 'no-store'
        });
        if (!response.ok) {
            const message = response.status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
                : response.status === 403 ? 'Bạn không có quyền xem kết quả chỉ định này.'
                : response.status === 404 ? 'Không tìm thấy khảo sát.' : 'Không tải được kết quả. Vui lòng tải lại trang.';
            if ([401, 403, 404].includes(response.status)) { fail(message); return; }
            throw new Error(message);
        }
        const {data} = await response.json();
        const changed = JSON.stringify(data) !== JSON.stringify(reviewData);
        reviewData = data;
        $('#survey-result-summary').html(window.renderSurveyResultSummary?.(data.result_summary) || '');
        if (changed) {
            surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
            displayPatientInfo(data.patient);
            $('#survey-name').text(data.template_name);
            if (prepareQuestions() === false || !allQuestions.length) {
                fail('Không có cấu trúc câu hỏi hợp lệ để hiển thị.'); return;
            }
            restoreSavedSurveyResponses(data.responses || {});
            currentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, allQuestions.length - 1));
            $('#loading-spinner, #no-survey-message').hide();
            $('.actions').show();
            showClosedSurveyMessage();
        }
        const live = data.order_status === 'completed' ? 'Đã kết thúc'
            : data.review_state === 'submitted' ? 'Đã nộp bài' : 'Tự cập nhật mỗi 3 giây';
        $('#survey-sync-state').text(`${live}${data.review_updated_at ? ' · Cập nhật: ' + formatDateTime(data.review_updated_at) : ''}`);
        if (data.can_live) reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    } catch (error) {
        if (!refresh) fail('Không tải được kết quả khảo sát. Hệ thống đang thử kết nối lại.');
        $('#survey-sync-state').text('Mất kết nối — dữ liệu có thể chưa mới nhất. Đang thử lại…');
        reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    }
}

function reviewSummary() {
    if (reviewData?.review_state === 'submitted') {
        return {title: 'Bài đã nộp — chỉ xem', text: 'Đây là đáp án đã nộp và lưu thành công.'};
    }
    if (reviewData?.order_status === 'completed') {
        return {title: 'Đã kết thúc — chưa nộp bài', text: 'Chỉ hiển thị phần đã được lưu trước khi khảo sát kết thúc.'};
    }
    if (reviewData?.review_state === 'empty') {
        return {title: 'Chưa có câu trả lời — chưa nộp', text: 'Màn hình sẽ tự cập nhật khi bệnh nhân bắt đầu trả lời.'};
    }
    return {title: 'Đang làm — chưa nộp', text: 'Đáp án đang được cập nhật. Câu chưa trả lời sẽ để trống; đây chưa phải kết quả chính thức.'};
}

// Flatten one template's answers once for both autosave and final submission.
function collectTemplateResponses(templateId) {
    const answers = {};
    allQuestions.filter(question => String(question.template_id) === String(templateId)).forEach(question => {
        const response = surveyResponses[`q_${question.id}`];
        if (!response) return;
        if (response.grid_responses) {
            (question.grid?.rows || []).forEach((row, index) => {
                const value = response.grid_responses[String(row.id ?? index)];
                if (value !== undefined) answers[String(row.question_id ?? row.id ?? index)] = value;
            });
        } else {
            for (const field of ['answer_id', 'answer_ids', 'answer_text', 'answer_value']) {
                if (response[field] !== undefined && response[field] !== null) {
                    answers[String(question.id)] = response[field]; break;
                }
            }
        }
    });
    return answers;
}

function draftStorageKey() {
    return 'survey_draft_' + new URLSearchParams(window.location.search).get('session_token');
}

async function loadSessionSurveyDraft(token) {
    $('.actions, #survey-content, #no-survey-message').hide();
    $('#loading-spinner').show();
    try {
        const response = await fetch(`/api/survey-sessions/draft?session_token=${encodeURIComponent(token)}`, {cache: 'no-store'});
        if (!response.ok) throw new Error('Không tải được tiến độ khảo sát. Vui lòng tải lại trang.');
        const {data} = await response.json();
        const params = new URLSearchParams(window.location.search);
        if (String(data.patient_id) !== params.get('patient_id') || String(data.examination_id) !== params.get('examination_id') ||
            (params.get('template_id') && String(data.survey_template_id) !== params.get('template_id'))) {
            throw new Error('Liên kết không khớp phiên khảo sát.');
        }
        draftData = data; draftRevision = data.revision;
        $('#survey-result-summary').html(window.renderSurveyResultSummary?.(data.result_summary) || '');
        isSurveyCompleted = data.submitted;
        isSurveyClosed = data.session_status === 'closed';
        isSurveyExpired = data.session_status === 'expired';
        if (data.validation_message && !isSurveyCompleted && !isSurveyClosed && !isSurveyExpired) {
            $('#loading-spinner').hide();
            $('#no-survey-message').text('Mẫu khảo sát cần được cấu hình đầy đủ trước khi làm bài. Vui lòng liên hệ phòng khám để cập nhật liên kết.').show();
            return;
        }
        surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
        $('#survey-name').text(data.template_name);
        if (prepareQuestions() === false) return;
        restoreSavedSurveyResponses(data.responses || {});
        lastSavedDraft = JSON.stringify(collectTemplateResponses(data.survey_template_id));
        if (!isSurveyCompleted && !isSurveyClosed && !isSurveyExpired) {
            let saved = null;
            try { saved = JSON.parse(localStorage.getItem(draftStorageKey()) || 'null'); } catch (_) { /* Server draft is still usable. */ }
            if (saved && saved.revision === draftRevision) {
                restoreSavedSurveyResponses(saved.responses); queueSurveyDraft();
            }
        }
        $('#loading-spinner').hide(); $('.actions').show();
        if (isSurveyClosed || isSurveyCompleted || isSurveyExpired) {
            showClosedSurveyMessage();
        } else {
            showQuestion(0);
            $('#survey-sync-state').text('Tiến độ tự động lưu để bác sĩ theo dõi.');
        }
    } catch (error) {
        $('#loading-spinner').hide();
        $('#no-survey-message').text('Không tải được tiến độ khảo sát. Vui lòng kiểm tra liên kết hoặc tải lại trang.').show();
    }
}

function queueSurveyDraft() {
    if (!draftData || draftBlocked || reviewOrderId !== null || isSurveyCompleted || isSurveyClosed || isSurveyExpired) return;
    const responses = collectTemplateResponses(draftData.survey_template_id);
    localStorage.setItem(draftStorageKey(), JSON.stringify({revision: draftRevision, responses}));
    clearTimeout(draftTimer);
    $('#survey-sync-state').text('Đang lưu tiến độ…');
    draftTimer = setTimeout(() => flushSurveyDraft(), 500);
}

async function flushSurveyDraft() {
    clearTimeout(draftTimer);
    if (!draftData || reviewOrderId !== null) return true;
    if (draftBlocked || isSurveyClosed || isSurveyExpired) return false;
    if (isSurveyCompleted) return true;
    if (draftSaving) { await draftSaving; return flushSurveyDraft(); }
    const responses = collectTemplateResponses(draftData.survey_template_id);
    const sent = JSON.stringify(responses);
    if (sent === lastSavedDraft) { $('#survey-sync-state').text('Đã lưu tiến độ'); return true; }
    draftSaving = (async () => {
        try {
            const response = await fetch('/api/survey-sessions/draft', {method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_token: new URLSearchParams(window.location.search).get('session_token'),
                    patient_id: draftData.patient_id, examination_id: draftData.examination_id,
                    survey_template_id: draftData.survey_template_id, revision: draftRevision, responses})});
            const payload = await response.json();
            if (!response.ok) {
                if (response.status === 409 || response.status === 410) {
                    draftBlocked = true;
                    draftBlockMessage = response.status === 409
                        ? 'Bài đang được thay đổi ở phiên khác. Vui lòng tải lại trước khi tiếp tục.'
                        : 'Khảo sát đã nộp hoặc đã kết thúc. Không nhận thêm thay đổi.';
                    if (response.status === 410) {
                        isSurveyClosed = true;
                        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
                        loadSessionSurveyDraft(new URLSearchParams(window.location.search).get('session_token'));
                    }
                }
                throw new Error(payload.message || 'Không lưu được tiến độ');
            }
            draftRevision = payload.data.revision; lastSavedDraft = sent;
            const latest = collectTemplateResponses(draftData.survey_template_id);
            localStorage.setItem(draftStorageKey(), JSON.stringify({revision: draftRevision, responses: latest}));
            $('#survey-sync-state').text('Đã lưu tiến độ');
            if (JSON.stringify(latest) !== sent) queueSurveyDraft();
            return true;
        } catch (error) {
            $('#survey-sync-state').text(draftBlocked ? draftBlockMessage : 'Chưa đồng bộ — đang giữ trên máy và thử lại.');
            if (!draftBlocked) draftTimer = setTimeout(() => flushSurveyDraft(), 3000);
            return false;
        } finally { draftSaving = null; }
    })();
    return draftSaving;
}

window.addEventListener('online', () => { if (draftData && !draftBlocked) queueSurveyDraft(); });
window.addEventListener('pagehide', () => { clearTimeout(reviewTimer); clearTimeout(draftTimer); });

// Load existing responses
function loadExistingResponses() {
    return new Promise((resolve, reject) => {
        const examinationId = localStorage.getItem('current_examination_id');
        const sessionToken = localStorage.getItem('session_token');
        
        // Check if localStorage has responses from a different template
        const currentTemplateId = getCurrentTemplateId();
        const storedTemplateId = examinationId ? localStorage.getItem(`survey_template_id_${examinationId}`) : null;
        
        let shouldReset = false;
        
        if (currentTemplateId && storedTemplateId && storedTemplateId !== currentTemplateId) {
            // Template changed, clear old responses
            if (examinationId) {
                clearSurveyResponsesFromStorage();
            }
            shouldReset = true;
        }
        
        // First, try to load from localStorage (for unsaved progress)
        // This function now checks template ID internally
        const hasLocalData = loadSurveyResponsesFromStorage();
        
        // CHỈ reset khi chắc chắn cần reset (không có local data và không có template mismatch)
        if (shouldReset || !hasLocalData) {
            surveyResponses = {};
            currentQuestionIndex = 0;
        }
        
        // Validate currentQuestionIndex after loading from localStorage
        if (hasLocalData && currentQuestionIndex >= allQuestions.length && allQuestions.length > 0) {

            currentQuestionIndex = 0;
            // Clear the corrupted saved index
            if (examinationId) {
                localStorage.removeItem(`survey_current_index_${examinationId}`);
            }
        }
        
        if (hasLocalData) {

            
            // Double-check: if surveyResponses has data but doesn't match current template, clear it
            const currentTemplateId = getCurrentTemplateId();
            const storedTemplateId = examinationId ? localStorage.getItem(`survey_template_id_${examinationId}`) : null;
            if (Object.keys(surveyResponses).length > 0 && currentTemplateId && storedTemplateId !== currentTemplateId) {
                surveyResponses = {};
                currentQuestionIndex = 0;
                clearSurveyResponsesFromStorage();
            }
            
            // Final validation before updateProgress
            if (currentQuestionIndex >= allQuestions.length && allQuestions.length > 0) {
                currentQuestionIndex = 0;
            }
            
            updateProgress();
            updateNavigationButtons();
            resolve();
            return;
        }
        
        // Get session info to check timestamp, then load responses
        if (sessionToken) {
            // First get session info
            $.ajax({
                url: `/api/survey-sessions/status/${sessionToken}`,
                method: 'GET',
                success: function(sessionResponse) {
                    let sessionCreatedAt = null;
                    if (sessionResponse.success && sessionResponse.data) {
                        sessionCreatedAt = sessionResponse.data.created_at;
                    }
                    
                    // Then load responses from server
                    loadResponsesFromServer(examinationId, sessionCreatedAt);
                },
                error: function(xhr, status, error) {
                    // Load responses without timestamp check
                    loadResponsesFromServer(examinationId, null);
                }
            });
        } else {
            // No session token, load responses without timestamp check
            loadResponsesFromServer(examinationId, null);
        }
        
        // Helper function to load responses from server
        function loadResponsesFromServer(examinationId, sessionCreatedAt) {
            $.ajax({
                url: `/api/survey-responses/examination/${examinationId}/public?session_token=${encodeURIComponent(new URLSearchParams(window.location.search).get('session_token') || '')}`,
                method: 'GET',
                success: function(response) {

                
                if (response.success && response.data && response.data.length > 0) {
                    const currentTemplateId = getCurrentTemplateId();
                    // Find the most recent COMPLETED response for CURRENT template and CURRENT session
                    let completeResponse = null;
                    let bestMatch = null;
                    
                    for (let i = response.data.length - 1; i >= 0; i--) {
                        const responseData = response.data[i];                                              
                        // Check 1: Template ID must match
                        const responseTemplateId = responseData.survey_template_id ? responseData.survey_template_id.toString() : null;
                        if (currentTemplateId && responseTemplateId && responseTemplateId !== currentTemplateId) {
                            continue;
                        }
                        
                        // Check 2: Timestamp check - CHỈ áp dụng khi session CHƯA completed
                        // Nếu session đã completed, bỏ qua timestamp check vì đã có kết quả rồi
                        // This ensures we don't load responses from old sessions when a new session is created
                        if (!isSurveyCompleted && sessionCreatedAt && responseData.created_at) {
                            const responseCreatedAt = new Date(responseData.created_at);
                            const sessionCreatedAtDate = new Date(sessionCreatedAt);
                            
                            // Skip responses created BEFORE the current session
                            if (responseCreatedAt < sessionCreatedAtDate) {
                                continue;
                            }
                        }
                        
                        // Check 3: Response count check
                        // Nếu session đã completed, load response mới nhất matching template (không cần check count)
                        // Nếu session chưa completed, cần check response count >= totalQuestions
                        const responseCount = responseData.responses ? Object.keys(responseData.responses).length : 0;
                        const isValidResponse = isSurveyCompleted || (totalQuestions > 0 && responseCount >= totalQuestions);
                        
                        if (isValidResponse && responseCount > 0) {
                            // This is a valid response for the current session
                            if (!completeResponse || !bestMatch) {
                                completeResponse = responseData;
                                bestMatch = {
                                    id: responseData.id,
                                    templateId: responseTemplateId,
                                    responseCount: responseCount,
                                    totalQuestions: totalQuestions,
                                    created_at: responseData.created_at
                                };
                            }
                            // Don't break - continue to check all responses to find the most recent one
                        }
                    }
                   
                    if (completeResponse) {
                        
                        restoreSavedSurveyResponses(completeResponse.responses || {});

                        // Clear local storage since we're using server data
                        clearSurveyResponsesFromStorage();
                        
                        // Reset index to 0 when loading completed responses
                        currentQuestionIndex = 0;
                    } else {
                        surveyResponses = {}; // Ensure empty
                        currentQuestionIndex = 0; // Reset index
                    }
                } else {
                    // No server data, start fresh
                    surveyResponses = {}; // Ensure empty
                    currentQuestionIndex = 0; // Reset index
                }
                

                
                // Validate currentQuestionIndex one more time before updateProgress
                if (currentQuestionIndex >= allQuestions.length && allQuestions.length > 0) {
                    currentQuestionIndex = 0;
                }
                
                updateProgress();
                updateNavigationButtons();
                resolve();
            },
            error: function(xhr, status, error) {
                // Continue with survey even if loading existing responses fails
                surveyResponses = {};
                currentQuestionIndex = 0; // Reset index
                updateProgress();
                updateNavigationButtons();
                resolve(); // Still resolve to continue
            }
            });
        }
    });
}

// Update session status
function updateSessionStatus(status) {
    if (reviewOrderId !== null) return Promise.resolve();
    // Không update status nếu survey đã expired
    if (isSurveyExpired) {
        return Promise.resolve();
    }
    
    const sessionToken = localStorage.getItem('session_token');
    if (!sessionToken) {
        return Promise.resolve();
    }
    
    // Return promise để có thể chain
    return new Promise((resolve, reject) => {
        // Find session ID from token (we'll need to get this from the server)
        $.ajax({
            url: `/api/survey-sessions/update-status-by-token`,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                session_token: sessionToken,
                status: status
            }),
            success: function(response) {
                // Nếu update status thành công, reload session data để lấy started_at hoặc updated_at mới
                if (status === 'in_progress' || status === 'completed') {
                    const sessionToken = localStorage.getItem('session_token');
                    if (sessionToken) {
                        // Reload session data để cập nhật started_at hoặc updated_at
                        $.ajax({
                            url: `/api/survey-sessions/status/${sessionToken}`,
                            method: 'GET',
                            success: function(sessionResponse) {
                                if (sessionResponse.success && sessionResponse.data) {
                                    surveySessionData = sessionResponse.data;
                                    // Đảm bảo flag được set trước khi hiển thị
                                    if (status === 'completed') {
                                        isSurveyCompleted = true;
                                    }
                                    displaySurveyTimeInfo();
                                }
                                resolve();
                            },
                            error: function() {
                                resolve(); // Still resolve even on error
                            }
                        });
                    } else {
                        resolve();
                    }
                } else {
                    resolve();
                }
            },
            error: function(xhr, status, error) {
                // Nếu API trả về 410 (Gone), có nghĩa là session đã expired
                if (xhr.status === 410) {
                    isSurveyExpired = true;
                    showExpiredSurveyMessage();
                }
                resolve(); // Still resolve to not block the flow
            }
        });
    });
}

// Submit survey
async function submitSurvey() {
    if (reviewOrderId !== null) return;
    // Check if this is preview mode
    if (isPreviewMode()) {
        // In preview mode, show success message but don't actually submit
        showAlert('success', '🎉 Trải nghiệm hoàn thành! Đây chỉ là chế độ xem trước, dữ liệu không được lưu.');
        
        // Hide action buttons and show completion state
        hideActionButtons();
        return;
    }
    
    if (isSurveyClosed) {
        showAlert('info', 'Khảo sát đã được đóng và không thể gửi thêm kết quả.');
        return; // Ngăn chặn gửi nếu khảo sát đã đóng
    }
    
    if (isSurveyCompleted) {
        showAlert('info', 'Bài khảo sát đã được nộp. Bạn có thể xem lại nhưng không thể gửi thêm.');
        return; // Ngăn chặn gửi nếu khảo sát đã hoàn thành
    }
    
    if (isSurveyExpired) {
        showAlert('error', 'Khảo sát đã hết hạn và ngừng nhận bài nộp. Vui lòng liên hệ cơ sở y tế nếu cần làm khảo sát mới.');
        return; // Ngăn chặn gửi nếu khảo sát đã hết hạn
    }
    
    const missingRequired = allQuestions.find(question =>
        !canProceedSurveyQuestion(question, surveyResponses[`q_${question.id}`]));
    if (missingRequired) {
        currentQuestionIndex = allQuestions.indexOf(missingRequired);
        showQuestion(currentQuestionIndex);
        showAlert('error', 'Vui lòng trả lời đủ các câu hỏi bắt buộc trước khi nộp bài.');
        return;
    }
    
    if (!await flushSurveyDraft()) {
        showAlert('error', 'Chưa đồng bộ được bài khảo sát. Vui lòng kiểm tra thông báo lưu tiến độ.');
        return;
    }
    const submitBtn = $('#next');
    const originalText = submitBtn.text();
    
    // Disable button and show loading
    submitBtn.prop('disabled', true).text('Đang gửi...');
    
    const examinationId = localStorage.getItem('current_examination_id');
    const patientId = localStorage.getItem('current_patient_id');
    
    // Prepare data for each template
    const submissions = [];
    
    surveyTemplates.forEach(template => {
        const templateResponses = collectTemplateResponses(template.id);
        const hasResponses = Object.keys(templateResponses).length > 0;
        if (hasResponses) {
            submissions.push({
                examination_id: parseInt(examinationId),
                survey_template_id: parseInt(template.id),
                patient_id: parseInt(patientId),
                session_token: new URLSearchParams(window.location.search).get('session_token'),
                responses: templateResponses
            });
        }
    });
    
    
    // Submit each template response
    let submittedCount = 0;
    const totalSubmissions = submissions.length;
    
    if (totalSubmissions === 0) {
        submitBtn.prop('disabled', false).text(originalText);
        showAlert('error', 'Vui lòng trả lời ít nhất một câu hỏi trước khi nộp bài.');
        return;
    }
    
    submissions.forEach((submission, index) => {

        
        $.ajax({
            url: '/api/survey-responses/public',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            data: JSON.stringify(submission),
            success: function(response) {
                submittedCount++;
                $('#survey-result-summary').html(window.renderSurveyResultSummary?.(response.data?.result_summary) || '');
                
                if (submittedCount === totalSubmissions) {
                    // All submissions completed
                    submitBtn.text('Hoàn thành!');
                    showAlert('success', 'Khảo sát đã được gửi thành công!');
                    
                    // Set flag completed trước
                    isSurveyCompleted = true;
                    clearTimeout(draftTimer);
                    localStorage.removeItem(draftStorageKey());
                    
                    // Update session status to completed và đợi reload session data
                    checkSessionStatus(new URLSearchParams(window.location.search).get('session_token')).then(() => {
                        // Đảm bảo hiển thị thời gian hoàn thành ngay lập tức
                        if (surveySessionData) {
                            displaySurveyTimeInfo();
                        }
                    });
                    
                    // Clear localStorage since survey is completed
                    clearSurveyResponsesFromStorage();
                    
                    // Update progress TRƯỚC KHI hideActionButtons để đảm bảo progress hiển thị đúng
                    updateProgress();
                    
                    // Hide action buttons and show completion state
                    hideActionButtons();
                }
            },
            error: function(xhr, status, error) {
                submitBtn.prop('disabled', false).text(originalText);
                showAlert('error', 'Lỗi khi gửi kết quả khảo sát. Vui lòng thử lại.');
            }
        });
    });
}

// Show alert message
function showAlert(type, message) {
    const alertClass = type === 'error' ? 'error' : '';
    const alertHtml = `
        <div class="custom-alert ${alertClass}" role="alert">
            <div class="alert-message">${message}</div>
            <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="alert-close" onclick="closeAlert(this)">×</button>
        </div>
    `;
    
    // Remove existing alerts
    $('#alert-container').empty();
    
    // Add new alert
    $('#alert-container').html(alertHtml);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        closeAlert($('.custom-alert .alert-close')[0]);
    }, 5000);
}

// Close alert function
function closeAlert(button) {
    const alert = $(button).closest('.custom-alert');
    alert.addClass('fade-out');
    setTimeout(() => {
        alert.remove();
    }, 300);
}

// Hide action buttons and show completion state
function hideActionButtons() {
    // Hide all action buttons
    $('.btn-start-over, .btn-previous, .btn-next, .btn-submit').hide();
    
    // Show completion message
    const completionHtml = `
        <div class="completion-message">
            <div class="completion-content">
                <div class="completion-icon ${reviewOrderId !== null && reviewData?.review_state !== 'submitted' ? 'completion-icon--pending' : ''}">${reviewOrderId !== null && reviewData?.review_state !== 'submitted' ? '…' : '✓'}</div>
                <div class="completion-text">
                    <h4>${reviewOrderId !== null ? reviewSummary().title : isSurveyCompleted ? 'Nộp bài thành công!' : 'Khảo sát đã kết thúc'}</h4>
                    <p>${reviewOrderId !== null ? reviewSummary().text : isSurveyCompleted ? 'Cảm ơn bạn đã tham gia khảo sát tâm lý. Kết quả đã được gửi đến bác sĩ.' : 'Các câu trả lời đã lưu được giữ lại. Khảo sát không nhận thêm thay đổi.'}</p>
                </div>
            </div>
            <div class="completion-buttons">
                <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-outline btn-return-to-view ${currentQuestionIndex === 0 ? 'survey-action-hidden' : ''}">Trở lại</button>
                <button type="button" class="btn btn-primary btn-next-to-view ${currentQuestionIndex === allQuestions.length - 1 ? 'survey-action-hidden' : ''}">Tiếp theo</button>
            </div>
        </div>
    `;
    
    // Replace action buttons with completion message
    $('.actions .row').html(completionHtml);
    
    // Only disable inputs if survey is closed (not if just completed - allow review)
    if (isSurveyClosed) {
        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
    }
    
    // KHÔNG gọi updateProgress() ở đây nữa vì đã được gọi trước đó trong showClosedSurveyMessage()
    // Progress sẽ được update trong showQuestion() mỗi khi chuyển câu hỏi
    
    // Bind events for navigation buttons
    $('.btn-return-to-view').on('click', function() {
        // Go to previous question
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            showQuestion(currentQuestionIndex);
        }
    });
    
    $('.btn-next-to-view').on('click', function() {
        // Go to next question
        if (currentQuestionIndex < allQuestions.length - 1) {
            currentQuestionIndex++;
            showQuestion(currentQuestionIndex);
        }
    });
}
