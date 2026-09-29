/* global allQuestions, clearSurveyResponsesFromStorage, currentQuestionIndex: writable, displaySurveyTimeInfo, getCurrentTemplateId, isSurveyCompleted: writable, isSurveyExpired: writable, loadSurveyResponsesFromStorage, restoreSavedSurveyResponses, reviewOrderId, showExpiredSurveyMessage, surveyResponses: writable, surveySessionData: writable, totalQuestions, updateNavigationButtons, updateProgress */
/* exported loadExistingResponses, updateSessionStatus */

// Load existing responses
function loadExistingResponses() {
    return new Promise((resolve, reject) => {
        const examinationId = localStorage.getItem('current_examination_id');
        const sessionToken = localStorage.getItem('session_token');

        if (restoreLocalSurveyProgress(examinationId)) {
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
                applyServerSurveyResponses(response, sessionCreatedAt);

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

// Restores unsaved progress from localStorage; returns true when it can be used.
function restoreLocalSurveyProgress(examinationId) {
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
        return true;
    }
    return false;
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
}

// Newest response (walking from the end) that belongs to the current template/session and is complete.
function findCompletedServerResponse(responses, currentTemplateId, sessionCreatedAt) {
    for (let i = responses.length - 1; i >= 0; i--) {
        const responseData = responses[i];
        // Check 1: Template ID must match
        const responseTemplateId = responseData.survey_template_id ? responseData.survey_template_id.toString() : null;
        if (currentTemplateId && responseTemplateId && responseTemplateId !== currentTemplateId) continue;
        // Check 2: responses created BEFORE the current session only count once the survey is completed
        if (!isSurveyCompleted && sessionCreatedAt && responseData.created_at
            && new Date(responseData.created_at) < new Date(sessionCreatedAt)) continue;
        // Check 3: completed sessions take the newest match; otherwise every question must be answered
        const responseCount = responseData.responses ? Object.keys(responseData.responses).length : 0;
        const isValidResponse = isSurveyCompleted || (totalQuestions > 0 && responseCount >= totalQuestions);
        if (isValidResponse && responseCount > 0) return responseData;
    }
    return null;
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
