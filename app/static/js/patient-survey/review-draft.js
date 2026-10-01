import { state } from './state.js';
import { disableSurveyInputs, setShown, setText, showNoSurveyMessage, showResultSummary } from './view.js';
import { displayPatientInfo, formatDateTime } from '../patient-survey-parts/display.js';
import { prepareQuestions, showQuestion } from './questions.js';
import { restoreSavedSurveyResponses } from './interaction-parts/grid-and-restore.js';
import { reviewOrderId, showClosedSurveyMessage } from '../patient-survey.js';

// Use the same question renderer for live progress and submitted results.
async function loadOrderSurveyResult(orderId, refresh = false) {
    clearTimeout(state.reviewTimer);
    state.isSurveyClosed = true;
    document.body.classList.add('survey-review');
    if (!refresh) {
        setShown('.actions, #survey-content, #no-survey-message', false);
        setText('title', 'Kết quả khảo sát');
    }
    const fail = message => {
        setShown('#loading-spinner, #survey-content, .actions', false);
        setText('survey-name', 'Không thể xem kết quả');
        setText('patient-name', '—');
        setText('patient-phone', '—');
        showNoSurveyMessage(message);
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
        const changed = JSON.stringify(data) !== JSON.stringify(state.reviewData);
        state.reviewData = data;
        showResultSummary(data.result_summary);
        if (changed && !renderOrderSurveyReview(data)) {
            fail('Không có cấu trúc câu hỏi hợp lệ để hiển thị.'); return;
        }
        setText('survey-sync-state', reviewSyncStateText(data));
        if (data.can_live) state.reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    } catch (error) {
        if (!refresh) fail('Không tải được kết quả khảo sát. Hệ thống đang thử kết nối lại.');
        setText('survey-sync-state', 'Mất kết nối — dữ liệu có thể chưa mới nhất. Đang thử lại…');
        state.reviewTimer = setTimeout(() => loadOrderSurveyResult(orderId, true), 3000);
    }
}

const REVIEW_RESULT_ERRORS = {
    401: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    403: 'Bạn không có quyền xem kết quả chỉ định này.',
    404: 'Không tìm thấy khảo sát.',
};

// Returns false when the template has no renderable questions.
function renderOrderSurveyReview(data) {
    state.surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
    displayPatientInfo(data.patient);
    setText('survey-name', data.template_name);
    if (prepareQuestions() === false || !state.allQuestions.length) return false;
    restoreSavedSurveyResponses(data.responses || {});
    state.currentQuestionIndex = Math.max(0, Math.min(state.currentQuestionIndex, state.allQuestions.length - 1));
    setShown('#loading-spinner, #no-survey-message', false);
    setShown('.actions', true);
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
    if (state.reviewData?.review_state === 'submitted') {
        return {title: 'Bài đã nộp — chỉ xem', text: 'Đây là đáp án đã nộp và lưu thành công.'};
    }
    if (state.reviewData?.order_status === 'completed') {
        return {title: 'Đã kết thúc — chưa nộp bài', text: 'Chỉ hiển thị phần đã được lưu trước khi khảo sát kết thúc.'};
    }
    if (state.reviewData?.review_state === 'empty') {
        return {title: 'Chưa có câu trả lời — chưa nộp', text: 'Màn hình sẽ tự cập nhật khi bệnh nhân bắt đầu trả lời.'};
    }
    return {title: 'Đang làm — chưa nộp', text: 'Đáp án đang được cập nhật. Câu chưa trả lời sẽ để trống; đây chưa phải kết quả chính thức.'};
}

// Flatten one template's answers once for both autosave and final submission.
function collectTemplateResponses(templateId) {
    const answers = {};
    state.allQuestions.filter(question => String(question.template_id) === String(templateId)).forEach(question => {
        const response = state.surveyResponses[`q_${question.id}`];
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
    setShown('.actions, #survey-content, #no-survey-message', false);
    setShown('#loading-spinner', true);
    try {
        const response = await fetch(`/api/survey-sessions/draft?session_token=${encodeURIComponent(token)}`, {cache: 'no-store'});
        if (!response.ok) throw new Error('Không tải được tiến độ khảo sát. Vui lòng tải lại trang.');
        const {data} = await response.json();
        if (!draftMatchesSurveyLink(data)) {
            throw new Error('Liên kết không khớp phiên khảo sát.');
        }
        state.draftData = data; state.draftRevision = data.revision;
        showResultSummary(data.result_summary);
        state.isSurveyCompleted = data.submitted;
        state.isSurveyClosed = data.session_status === 'closed';
        state.isSurveyExpired = data.session_status === 'expired';
        const isReadOnly = state.isSurveyCompleted || state.isSurveyClosed || state.isSurveyExpired;
        if (data.validation_message && !isReadOnly) {
            setShown('#loading-spinner', false);
            showNoSurveyMessage('Mẫu khảo sát cần được cấu hình đầy đủ trước khi làm bài. Vui lòng liên hệ phòng khám để cập nhật liên kết.');
            return;
        }
        state.surveyTemplates = [{id: data.survey_template_id, name: data.template_name, content: data.template_content}];
        setText('survey-name', data.template_name);
        if (prepareQuestions() === false) return;
        restoreSavedSurveyResponses(data.responses || {});
        state.lastSavedDraft = JSON.stringify(collectTemplateResponses(data.survey_template_id));
        if (!isReadOnly) restoreLocalSurveyDraft();
        setShown('#loading-spinner', false); setShown('.actions', true);
        if (isReadOnly) {
            showClosedSurveyMessage();
        } else {
            showQuestion(0);
            setText('survey-sync-state', 'Tiến độ tự động lưu để bác sĩ theo dõi.');
        }
    } catch (error) {
        setShown('#loading-spinner', false);
        showNoSurveyMessage('Không tải được tiến độ khảo sát. Vui lòng kiểm tra liên kết hoặc tải lại trang.');
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
    if (saved && saved.revision === state.draftRevision) {
        restoreSavedSurveyResponses(saved.responses); queueSurveyDraft();
    }
}

function queueSurveyDraft() {
    if (!state.draftData || state.draftBlocked || reviewOrderId !== null || state.isSurveyCompleted || state.isSurveyClosed || state.isSurveyExpired) return;
    const responses = collectTemplateResponses(state.draftData.survey_template_id);
    localStorage.setItem(draftStorageKey(), JSON.stringify({revision: state.draftRevision, responses}));
    clearTimeout(state.draftTimer);
    setText('survey-sync-state', 'Đang lưu tiến độ…');
    state.draftTimer = setTimeout(() => flushSurveyDraft(), 500);
}

async function flushSurveyDraft() {
    clearTimeout(state.draftTimer);
    if (!state.draftData || reviewOrderId !== null) return true;
    if (state.draftBlocked || state.isSurveyClosed || state.isSurveyExpired) return false;
    if (state.isSurveyCompleted) return true;
    if (state.draftSaving) { await state.draftSaving; return flushSurveyDraft(); }
    const responses = collectTemplateResponses(state.draftData.survey_template_id);
    const sent = JSON.stringify(responses);
    if (sent === state.lastSavedDraft) { setText('survey-sync-state', 'Đã lưu tiến độ'); return true; }
    state.draftSaving = (async () => {
        try {
            const response = await fetch('/api/survey-sessions/draft', {method: 'PUT', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({session_token: new URLSearchParams(window.location.search).get('session_token'),
                    patient_id: state.draftData.patient_id, examination_id: state.draftData.examination_id,
                    survey_template_id: state.draftData.survey_template_id, revision: state.draftRevision, responses})});
            const payload = await response.json();
            if (!response.ok) {
                if (response.status === 409 || response.status === 410) {
                    state.draftBlocked = true;
                    state.draftBlockMessage = response.status === 409
                        ? 'Bài đang được thay đổi ở phiên khác. Vui lòng tải lại trước khi tiếp tục.'
                        : 'Khảo sát đã nộp hoặc đã kết thúc. Không nhận thêm thay đổi.';
                    if (response.status === 410) {
                        state.isSurveyClosed = true;
                        disableSurveyInputs();
                        loadSessionSurveyDraft(new URLSearchParams(window.location.search).get('session_token'));
                    }
                }
                throw new Error(payload.message || 'Không lưu được tiến độ');
            }
            state.draftRevision = payload.data.revision; state.lastSavedDraft = sent;
            const latest = collectTemplateResponses(state.draftData.survey_template_id);
            localStorage.setItem(draftStorageKey(), JSON.stringify({revision: state.draftRevision, responses: latest}));
            setText('survey-sync-state', 'Đã lưu tiến độ');
            if (JSON.stringify(latest) !== sent) queueSurveyDraft();
            return true;
        } catch (error) {
            setText('survey-sync-state', state.draftBlocked ? state.draftBlockMessage : 'Chưa đồng bộ — đang giữ trên máy và thử lại.');
            if (!state.draftBlocked) state.draftTimer = setTimeout(() => flushSurveyDraft(), 3000);
            return false;
        } finally { state.draftSaving = null; }
    })();
    return state.draftSaving;
}

window.addEventListener('online', () => { if (state.draftData && !state.draftBlocked) queueSurveyDraft(); });
window.addEventListener('pagehide', () => { clearTimeout(state.reviewTimer); clearTimeout(state.draftTimer); });

export { collectTemplateResponses, draftStorageKey, flushSurveyDraft, loadOrderSurveyResult, loadSessionSurveyDraft, queueSurveyDraft, reviewSummary };
