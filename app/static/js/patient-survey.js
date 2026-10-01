import { state } from './patient-survey/state.js';
import { byId, el, icon, replace } from './shared/dom.js';
import { requestJson } from './shared/http-json.js';
import { disableSurveyInputs, setShown, setText, showNoSurveyMessage } from './patient-survey/view.js';
import { loadOrderSurveyResult, queueSurveyDraft } from './patient-survey/review-draft.js';
import { hideActionButtons, showAlert, submitSurvey } from './patient-survey/submit.js';
import { updateSessionStatus } from './patient-survey/responses.js';
import { loadSurveyTemplates, prepareQuestions, renderSingleQuestion, showQuestion } from './patient-survey/questions.js';
import { bindNavigationEvents, bindQuestionEvents, updateProgress } from './patient-survey/interaction.js';
import { appendSurveyTimeInfo, buildSurveyExpiresText, displayPatientInfo, formatDateTime, formatDuration, setSurveyProgressBar, showPreviewNotice } from './patient-survey-parts/display.js';

// Global variables
state.surveyTemplates = [];
let patientInfo = {};
state.surveyResponses = {};
state.allQuestions = [];
state.currentQuestionIndex = 0;
state.totalQuestions = 0;
state.isSurveyClosed = false; // Survey đã đóng - read-only tuyệt đối
state.isSurveyCompleted = false; // Survey đã hoàn thành - có thể xem lại nhưng không sửa
state.isSurveyExpired = false; // Survey đã hết hạn - không thể điền hoặc submit
const reviewOrderId = new URLSearchParams(window.location.search).get('review_order_id');
state.reviewData = null;
state.reviewTimer = null;
state.draftData = null;
state.draftRevision = 0;
state.draftTimer = null;
state.draftSaving = null;
state.lastSavedDraft = '';
state.draftBlocked = false;
state.draftBlockMessage = '';
state.surveySessionData = null; // Lưu thông tin session (expires_at, started_at, etc.)

// Helper functions for localStorage
// Helper function to get current template ID
function getCurrentTemplateId() {
    const urlParams = new URLSearchParams(window.location.search);
    const templateId = urlParams.get('template_id');
    if (templateId) {
        return templateId;
    }
    // If no template_id in URL, use first template
    if (state.surveyTemplates && state.surveyTemplates.length > 0) {
        return state.surveyTemplates[0].id.toString();
    }
    return null;
}

function saveSurveyResponsesToStorage() {
    if (reviewOrderId !== null) return;
    if (state.draftData) { queueSurveyDraft(); return; }
    const examinationId = localStorage.getItem('current_examination_id');
    const templateId = getCurrentTemplateId();

    if (examinationId && templateId && Object.keys(state.surveyResponses).length > 0) {
        // Use composite key: examinationId_templateId to avoid collision
        localStorage.setItem(`survey_responses_${examinationId}_${templateId}`, JSON.stringify(state.surveyResponses));
        localStorage.setItem(`survey_current_index_${examinationId}_${templateId}`, state.currentQuestionIndex.toString());
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
            state.surveyResponses = JSON.parse(savedResponses);
            if (savedIndex) {
                const parsedIndex = parseInt(savedIndex);
                // Store the parsed index, will be validated later in prepareQuestions
                state.currentQuestionIndex = parsedIndex;
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

// Initialize when page loads (module scripts run before DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
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

    // Preview mode - load specific template with full interaction
    if (isPreview && templateId) {
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
        if (!state.isSurveyClosed && !state.isSurveyCompleted && !state.isSurveyExpired) {
            updateSessionStatus('in_progress');
        }
        if (state.isSurveyExpired) {
            showExpiredSurveyMessage();
        }
        loadPatientInfo(patientId);
        loadSurveyTemplates();
    });

    bindNavigationEvents();
});

const SESSION_FLAGS = { closed: 'isSurveyClosed', completed: 'isSurveyCompleted', expired: 'isSurveyExpired' };

// Check session status to determine if survey is closed or completed
async function checkSessionStatus(sessionToken) {
    if (!sessionToken) return;
    try {
        const response = await requestJson(`/api/survey-sessions/status/${sessionToken}`);
        if (response?.success && response.data) {
            // Lưu thông tin session để hiển thị thời gian
            state.surveySessionData = response.data;
            // closed: read-only tuyệt đối; completed: xem lại không sửa; expired: không thể điền hoặc submit
            const flag = SESSION_FLAGS[response.data.status];
            if (flag) state[flag] = true;
            displaySurveyTimeInfo();
        }
    } catch {
        // Public survey status must be resolved by session token only.
    }
}

// Hiển thị câu hỏi hiện tại ở chế độ chỉ đọc, rồi cập nhật tiến độ và ẩn nút hành động
function showReadOnlyCurrentQuestion() {
    if (state.allQuestions.length > 0) {
        if (state.currentQuestionIndex < 0 || state.currentQuestionIndex >= state.allQuestions.length) {
            state.currentQuestionIndex = 0;
        }
        showQuestion(state.currentQuestionIndex);
    }
    updateProgress();
    hideActionButtons();
}

// Show message when survey is closed or completed (completed: inputs vẫn enabled để xem)
function showClosedSurveyMessage() {
    if (state.isSurveyClosed) disableSurveyInputs();
    showReadOnlyCurrentQuestion();
}

// Show message when survey is expired
function showExpiredSurveyMessage() {
    disableSurveyInputs();
    showReadOnlyCurrentQuestion();
    showAlert('error', 'Khảo sát đã hết hạn và ngừng nhận bài nộp. Vui lòng liên hệ cơ sở y tế nếu cần làm khảo sát mới.');
}

// Load patient information
async function loadPatientInfo(patientId) {
    try {
        const response = await requestJson(`/api/patients/${patientId}/public`);
        if (response?.success && response.data) {
            patientInfo = response.data;
            displayPatientInfo(patientInfo);
        } else {
            showAlert('error', 'Không thể tải thông tin bệnh nhân.');
        }
    } catch {
        showAlert('error', 'Lỗi khi tải thông tin bệnh nhân.');
    }
}

const timeValue = (className, text) => el('span', { class: className }, text);

// Display survey time information (started_at and expires_at)
function displaySurveyTimeInfo() {
    const session = state.surveySessionData;
    if (!session) return;
    const userInfoDiv = document.querySelector('.user > div');
    if (!userInfoDiv) return;

    ['survey-started-time', 'survey-expires-time', 'survey-duration-time'].forEach(id => byId(id)?.remove());

    // Thời gian bắt đầu (nếu chưa có started_at, dùng created_at)
    if (session.started_at) {
        appendSurveyTimeInfo(userInfoDiv, 'survey-started-time', 'time-info survey-time-info', '🕐 Bắt đầu: ', timeValue('survey-time-value', formatDateTime(session.started_at)));
    } else if (session.created_at) {
        appendSurveyTimeInfo(userInfoDiv, 'survey-started-time', 'time-info survey-time-info', '🕐 Tạo lúc: ', timeValue('survey-time-value', formatDateTime(session.created_at)));
    }
    if (session.expires_at) {
        appendSurveyTimeInfo(userInfoDiv, 'survey-expires-time', 'time-info survey-time-info survey-time-info--expires', ...buildSurveyExpiresText(session.expires_at));
    }
    // Thời gian hoàn thành (duration) nếu đã completed
    const duration = state.isSurveyCompleted && session.started_at && session.updated_at
        ? formatDuration(session.started_at, session.updated_at) : '';
    if (duration) {
        appendSurveyTimeInfo(userInfoDiv, 'survey-duration-time', 'time-info survey-time-info', '✅ Hoàn thành trong: ', timeValue('survey-time-success', duration));
    }
}

// Load preview template
async function loadPreviewTemplate(templateId) {
    setShown('#survey-content, #no-survey-message', false);
    setShown('#loading-spinner', true);
    setText('survey-name', '🛡️ Trải nghiệm mẫu khảo sát');
    setText('patient-name', 'Người dùng thử nghiệm');
    setText('patient-phone', 'Chế độ trải nghiệm');

    let response;
    try {
        response = await requestJson(`/api/survey-templates/${templateId}/public`);
    } catch {
        setShown('#loading-spinner', false);
        showAlert('error', 'Lỗi khi tải mẫu khảo sát để xem trước.');
        return;
    }
    setShown('#loading-spinner', false);
    if (!response?.success || !response.data) {
        showAlert('error', 'Không thể tải mẫu khảo sát để xem trước.');
        return;
    }
    const template = response.data;
    state.surveyTemplates = [template];
    setText('survey-name', `🛡️ ${template.name}`);
    if (prepareQuestions() === false) return;
    if (state.allQuestions.length > 0) {
        // Show all questions at once (Google Forms style)
        showAllQuestions();
        showPreviewNotice();
    } else {
        showNoSurveyMessage();
    }
}

// Show all questions at once (Google Forms style)
function showAllQuestions() {
    const surveyContent = byId('survey-content');
    const submitButton = el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', type: 'button', id: 'submitAllQuestions', class: 'btn btn-primary survey-submit-button' },
        icon('bi-check-circle', 'me-2'), 'Gửi khảo sát');
    replace(surveyContent,
        state.allQuestions.map((question, index) => renderSingleQuestion(question, index, index + 1)),
        el('div', { class: 'submit-section survey-submit-section' }, submitButton));
    surveyContent.hidden = false;
    bindQuestionEvents();
    updateProgressForAllQuestions();
    // Hide navigation buttons since we show all questions
    setShown('.actions', false);
    submitButton.addEventListener('click', () => submitSurvey());
}

// Update progress for all questions view
function updateProgressForAllQuestions() {
    const answeredCount = Object.keys(state.surveyResponses).length;
    const percentage = state.totalQuestions > 0 ? Math.min(100, Math.round((answeredCount / state.totalQuestions) * 100)) : 0;
    setText('cur', answeredCount);
    setText('total', state.totalQuestions);
    setText('kpi', percentage + '%');
    setSurveyProgressBar(percentage);
}

export { checkSessionStatus, clearSurveyResponsesFromStorage, displaySurveyTimeInfo, getCurrentTemplateId, loadSurveyResponsesFromStorage, reviewOrderId, saveSurveyResponsesToStorage, showClosedSurveyMessage, showExpiredSurveyMessage, updateProgressForAllQuestions };
