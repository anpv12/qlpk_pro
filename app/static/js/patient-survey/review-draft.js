/* global allQuestions, currentQuestionIndex: writable, displayPatientInfo, draftBlockMessage: writable, draftBlocked: writable, draftData: writable, draftRevision: writable, draftSaving: writable, draftTimer: writable, formatDateTime, isSurveyClosed: writable, isSurveyCompleted: writable, isSurveyExpired: writable, lastSavedDraft: writable, prepareQuestions, restoreSavedSurveyResponses, reviewData: writable, reviewOrderId, reviewTimer: writable, showClosedSurveyMessage, showQuestion, surveyResponses, surveyTemplates: writable */
/* exported loadOrderSurveyResult, reviewSummary */

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
    if (!window.QLPKApiTransport.hasSession()) { fail('Vui lòng đăng nhập tài khoản phòng khám rồi mở lại Xem kết quả.'); return; }
    try {
        if (!/^\d+$/.test(orderId)) throw new Error('Liên kết kết quả không hợp lệ.');
        const response = await fetch(`/api/chi-dinh/${orderId}/survey-result`, {cache: 'no-store'});
        if (!response.ok) {
            const message = REVIEW_RESULT_ERRORS[response.status] || 'Không tải được kết quả. Vui lòng tải lại trang.';
            if ([401, 403, 404].includes(response.status)) { fail(message); return; }
            throw new Error(message);
        }
        const {data} = await response.json();
        const changed = JSON.stringify(data) !== JSON.stringify(reviewData);
        reviewData = data;
        $('#survey-result-summary').html(window.renderSurveyResultSummary?.(data.result_summary) || '');
        if (changed && !renderOrderSurveyReview(data)) {
            fail('Không có cấu trúc câu hỏi hợp lệ để hiển thị.'); return;
        }
        $('#survey-sync-state').text(reviewSyncStateText(data));
        if (data.can_live) reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    } catch (error) {
        if (!refresh) fail('Không tải được kết quả khảo sát. Hệ thống đang thử kết nối lại.');
        $('#survey-sync-state').text('Mất kết nối — dữ liệu có thể chưa mới nhất. Đang thử lại…');
        reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    }
}

const REVIEW_RESULT_ERRORS = {
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền xem kết quả chỉ định này.',
    404: 'Không tìm thấy khảo sát.',
};

// Returns false when the template has no renderable questions.
function renderOrderSurveyReview(data) {
    surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
    displayPatientInfo(data.patient);
    $('#survey-name').text(data.template_name);
    if (prepareQuestions() === false || !allQuestions.length) return false;
    restoreSavedSurveyResponses(data.responses || {});
    currentQuestionIndex = Math.max(0, Math.min(currentQuestionIndex, allQuestions.length - 1));
    $('#loading-spinner, #no-survey-message').hide();
    $('.actions').show();
    showClosedSurveyMessage();
    return true;
}

function reviewSyncStateText(data) {
    let live = 'Tự cập nhật mỗi 3 giây';
    if (data.order_status === 'completed') live = 'Đã kết thúc';
    else if (data.review_state === 'submitted') live = 'Đã nộp bài';
    return `${live}${data.review_updated_at ? ' · Cập nhật: ' + formatDateTime(data.review_updated_at) : ''}`;
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
        if (!draftMatchesSurveyLink(data)) {
            throw new Error('Liên kết không khớp phiên khảo sát.');
        }
        draftData = data; draftRevision = data.revision;
        $('#survey-result-summary').html(window.renderSurveyResultSummary?.(data.result_summary) || '');
        isSurveyCompleted = data.submitted;
        isSurveyClosed = data.session_status === 'closed';
        isSurveyExpired = data.session_status === 'expired';
        const isReadOnly = isSurveyCompleted || isSurveyClosed || isSurveyExpired;
        if (data.validation_message && !isReadOnly) {
            $('#loading-spinner').hide();
            $('#no-survey-message').text('Mẫu khảo sát cần được cấu hình đầy đủ trước khi làm bài. Vui lòng liên hệ phòng khám để cập nhật liên kết.').show();
            return;
        }
        surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
        $('#survey-name').text(data.template_name);
        if (prepareQuestions() === false) return;
        restoreSavedSurveyResponses(data.responses || {});
        lastSavedDraft = JSON.stringify(collectTemplateResponses(data.survey_template_id));
        if (!isReadOnly) restoreLocalSurveyDraft();
        $('#loading-spinner').hide(); $('.actions').show();
        if (isReadOnly) {
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

function draftMatchesSurveyLink(data) {
    const params = new URLSearchParams(window.location.search);
    if (String(data.patient_id) !== params.get('patient_id') || String(data.examination_id) !== params.get('examination_id')) return false;
    return !(params.get('template_id') && String(data.survey_template_id) !== params.get('template_id'));
}

// A local copy of the same server revision wins (offline edits not yet flushed).
function restoreLocalSurveyDraft() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(draftStorageKey()) || 'null'); } catch (_) { /* Server draft is still usable. */ }
    if (saved && saved.revision === draftRevision) {
        restoreSavedSurveyResponses(saved.responses); queueSurveyDraft();
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
