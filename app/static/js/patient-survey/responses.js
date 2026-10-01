import { state } from './state.js';
import { HttpError, requestJson } from '../shared/http-json.js';
import { updateNavigationButtons, updateProgress } from './interaction.js';
import { clearSurveyResponsesFromStorage, displaySurveyTimeInfo, getCurrentTemplateId, loadSurveyResponsesFromStorage, reviewOrderId, showExpiredSurveyMessage } from '../patient-survey.js';
import { restoreSavedSurveyResponses } from './interaction-parts/grid-and-restore.js';

const sessionStatusUrl = token => `/api/survey-sessions/status/${token}`;

// Load existing responses: local unsaved progress first, otherwise the server copy (filtered by session start)
async function loadExistingResponses() {
    const examinationId = localStorage.getItem('current_examination_id');
    const sessionToken = localStorage.getItem('session_token');
    if (!restoreLocalSurveyProgress(examinationId)) {
        let sessionCreatedAt = null;
        if (sessionToken) {
            try {
                const sessionResponse = await requestJson(sessionStatusUrl(sessionToken));
                if (sessionResponse?.success && sessionResponse.data) sessionCreatedAt = sessionResponse.data.created_at;
            } catch { /* Load responses without timestamp check */ }
        }
        const token = encodeURIComponent(new URLSearchParams(window.location.search).get('session_token') || '');
        try {
            const response = await requestJson(`/api/survey-responses/examination/${examinationId}/public?session_token=${token}`);
            applyServerSurveyResponses(response, sessionCreatedAt);
            if (state.currentQuestionIndex >= state.allQuestions.length && state.allQuestions.length > 0) {
                state.currentQuestionIndex = 0;
            }
        } catch {
            // Continue with survey even if loading existing responses fails
            state.surveyResponses = {};
            state.currentQuestionIndex = 0;
        }
    }
    updateProgress();
    updateNavigationButtons();
}

// Restores unsaved progress from localStorage; returns true when it can be used.
function restoreLocalSurveyProgress(examinationId) {
    // Check if localStorage has responses from a different template
    const currentTemplateId = getCurrentTemplateId();
    const storedTemplateId = examinationId ? localStorage.getItem(`survey_template_id_${examinationId}`) : null;

    const shouldReset = Boolean(currentTemplateId && storedTemplateId && storedTemplateId !== currentTemplateId);
    // Template changed, clear old responses
    if (shouldReset && examinationId) clearSurveyResponsesFromStorage();

    // First, try to load from localStorage (for unsaved progress)
    // This function now checks template ID internally
    const hasLocalData = loadSurveyResponsesFromStorage();

    // CHỈ reset khi chắc chắn cần reset (không có local data và không có template mismatch)
    if (shouldReset || !hasLocalData) {
        state.surveyResponses = {};
        state.currentQuestionIndex = 0;
    }

    if (!hasLocalData) return false;

    // Validate currentQuestionIndex after loading from localStorage
    if (isQuestionIndexOutOfRange()) {
        state.currentQuestionIndex = 0;
        // Clear the corrupted saved index
        if (examinationId) {
            localStorage.removeItem(`survey_current_index_${examinationId}`);
        }
    }

    discardResponsesFromOtherTemplate(examinationId);

    // Final validation before updateProgress
    if (isQuestionIndexOutOfRange()) state.currentQuestionIndex = 0;
    return true;
}

function isQuestionIndexOutOfRange() {
    return state.currentQuestionIndex >= state.allQuestions.length && state.allQuestions.length > 0;
}

// Double-check: if surveyResponses has data but doesn't match current template, clear it
function discardResponsesFromOtherTemplate(examinationId) {
    const currentTemplateId = getCurrentTemplateId();
    const storedTemplateId = examinationId ? localStorage.getItem(`survey_template_id_${examinationId}`) : null;
    if (Object.keys(state.surveyResponses).length > 0 && currentTemplateId && storedTemplateId !== currentTemplateId) {
        state.surveyResponses = {};
        state.currentQuestionIndex = 0;
        clearSurveyResponsesFromStorage();
    }
}

function applyServerSurveyResponses(response, sessionCreatedAt) {
    if (response.success && response.data && response.data.length > 0) {
        const currentTemplateId = getCurrentTemplateId();
        // Find the most recent COMPLETED response for CURRENT template and CURRENT session
        const completeResponse = findCompletedServerResponse(response.data, currentTemplateId, sessionCreatedAt);

        if (completeResponse) {

            restoreSavedSurveyResponses(completeResponse.responses || {});

            // Clear local storage since we're using server data
            clearSurveyResponsesFromStorage();

            // Reset index to 0 when loading completed responses
            state.currentQuestionIndex = 0;
        } else {
            state.surveyResponses = {}; // Ensure empty
            state.currentQuestionIndex = 0; // Reset index
        }
    } else {
        // No server data, start fresh
        state.surveyResponses = {}; // Ensure empty
        state.currentQuestionIndex = 0; // Reset index
    }
}

// Newest response (walking from the end) that belongs to the current template/session and is complete.
function findCompletedServerResponse(responses, currentTemplateId, sessionCreatedAt) {
    for (let i = responses.length - 1; i >= 0; i--) {
        const responseData = responses[i];
        // Check 1: Template ID must match
        const responseTemplateId = responseData.survey_template_id ? responseData.survey_template_id.toString() : null;
        if (currentTemplateId && responseTemplateId && responseTemplateId !== currentTemplateId) continue;
        // Check 2: responses created BEFORE the current session only count once the survey is completed
        if (!state.isSurveyCompleted && sessionCreatedAt && responseData.created_at
            && new Date(responseData.created_at) < new Date(sessionCreatedAt)) continue;
        // Check 3: completed sessions take the newest match; otherwise every question must be answered
        const responseCount = responseData.responses ? Object.keys(responseData.responses).length : 0;
        const isValidResponse = state.isSurveyCompleted || (state.totalQuestions > 0 && responseCount >= state.totalQuestions);
        if (isValidResponse && responseCount > 0) return responseData;
    }
    return null;
}

// Update session status
async function updateSessionStatus(status) {
    // Không update status khi đang xem kết quả hoặc survey đã expired
    if (reviewOrderId !== null || state.isSurveyExpired) return;
    const sessionToken = localStorage.getItem('session_token');
    if (!sessionToken) return;

    try {
        await requestJson('/api/survey-sessions/update-status-by-token', { method: 'PUT', json: { session_token: sessionToken, status } });
    } catch (error) {
        // 410 (Gone): session đã expired
        if (error instanceof HttpError && error.status === 410) {
            state.isSurveyExpired = true;
            showExpiredSurveyMessage();
        }
        return;
    }
    // Reload session data để lấy started_at hoặc updated_at mới
    if (status !== 'in_progress' && status !== 'completed') return;
    const latestToken = localStorage.getItem('session_token');
    if (!latestToken) return;
    try {
        const sessionResponse = await requestJson(sessionStatusUrl(latestToken));
        if (sessionResponse?.success && sessionResponse.data) {
            state.surveySessionData = sessionResponse.data;
            if (status === 'completed') state.isSurveyCompleted = true;
            displaySurveyTimeInfo();
        }
    } catch { /* still resolve so the flow continues */ }
}

export { loadExistingResponses, updateSessionStatus };
