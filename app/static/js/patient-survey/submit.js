import { state } from './state.js';
import { byId, el, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { disableSurveyInputs, showResultSummary } from './view.js';
import { collectTemplateResponses, draftStorageKey, flushSurveyDraft, reviewSummary } from './review-draft.js';
import { checkSessionStatus, clearSurveyResponsesFromStorage, displaySurveyTimeInfo, reviewOrderId } from '../patient-survey.js';
import { canProceedSurveyQuestion, isPreviewMode, updateProgress } from './interaction.js';
import { showQuestion } from './questions.js';

function setSubmitButton(button, text, disabled) {
    if (!button) return;
    button.textContent = text;
    button.disabled = disabled;
}

// One submission per template that has answers
function buildSubmissions() {
    const examinationId = localStorage.getItem('current_examination_id');
    const patientId = localStorage.getItem('current_patient_id');
    const sessionToken = new URLSearchParams(window.location.search).get('session_token');
    return state.surveyTemplates
        .map(template => ({ template, responses: collectTemplateResponses(template.id) }))
        .filter(({ responses }) => Object.keys(responses).length > 0)
        .map(({ template, responses }) => ({
            examination_id: parseInt(examinationId),
            survey_template_id: parseInt(template.id),
            patient_id: parseInt(patientId),
            session_token: sessionToken,
            responses
        }));
}

function finishSubmission(submitBtn) {
    setSubmitButton(submitBtn, 'Hoàn thành!', true);
    showAlert('success', 'Khảo sát đã được gửi thành công!');
    state.isSurveyCompleted = true;
    clearTimeout(state.draftTimer);
    localStorage.removeItem(draftStorageKey());
    // Reload session data để hiển thị thời gian hoàn thành
    checkSessionStatus(new URLSearchParams(window.location.search).get('session_token')).then(() => {
        if (state.surveySessionData) displaySurveyTimeInfo();
    });
    clearSurveyResponsesFromStorage();
    // Update progress TRƯỚC KHI hideActionButtons để đảm bảo progress hiển thị đúng
    updateProgress();
    hideActionButtons();
}

// Each template is posted independently; the page completes when every post succeeded
function postSubmissions(submissions, submitBtn, originalText) {
    let submittedCount = 0;
    submissions.forEach(async submission => {
        try {
            const response = await requestJson('/api/survey-responses/public', { method: 'POST', json: submission });
            submittedCount++;
            showResultSummary(response?.data?.result_summary);
            if (submittedCount === submissions.length) finishSubmission(submitBtn);
        } catch {
            setSubmitButton(submitBtn, originalText, false);
            showAlert('error', 'Lỗi khi gửi kết quả khảo sát. Vui lòng thử lại.');
        }
    });
}

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
    if (state.isSurveyClosed) {
        showAlert('info', 'Khảo sát đã được đóng và không thể gửi thêm kết quả.');
        return; // Ngăn chặn gửi nếu khảo sát đã đóng
    }
    if (state.isSurveyCompleted) {
        showAlert('info', 'Bài khảo sát đã được nộp. Bạn có thể xem lại nhưng không thể gửi thêm.');
        return; // Ngăn chặn gửi nếu khảo sát đã hoàn thành
    }
    if (state.isSurveyExpired) {
        showAlert('error', 'Khảo sát đã hết hạn và ngừng nhận bài nộp. Vui lòng liên hệ cơ sở y tế nếu cần làm khảo sát mới.');
        return; // Ngăn chặn gửi nếu khảo sát đã hết hạn
    }
    const missingRequired = state.allQuestions.find(question =>
        !canProceedSurveyQuestion(question, state.surveyResponses[`q_${question.id}`]));
    if (missingRequired) {
        state.currentQuestionIndex = state.allQuestions.indexOf(missingRequired);
        showQuestion(state.currentQuestionIndex);
        showAlert('error', 'Vui lòng trả lời đủ các câu hỏi bắt buộc trước khi nộp bài.');
        return;
    }
    if (!await flushSurveyDraft()) {
        showAlert('error', 'Chưa đồng bộ được bài khảo sát. Vui lòng kiểm tra thông báo lưu tiến độ.');
        return;
    }
    const submitBtn = byId('next');
    const originalText = submitBtn?.textContent || '';
    setSubmitButton(submitBtn, 'Đang gửi...', true);
    const submissions = buildSubmissions();
    if (!submissions.length) {
        setSubmitButton(submitBtn, originalText, false);
        showAlert('error', 'Vui lòng trả lời ít nhất một câu hỏi trước khi nộp bài.');
        return;
    }
    postSubmissions(submissions, submitBtn, originalText);
}

// Show alert message (one at a time, auto-dismissed after 5 seconds)
function showAlert(type, message) {
    const closeButton = el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'alert-close' }, '×');
    const alertNode = el('div', { class: type === 'error' ? 'custom-alert error' : 'custom-alert', role: 'alert' }, el('div', { class: 'alert-message' }, message), ' ', closeButton);
    closeButton.addEventListener('click', () => closeAlert(alertNode));
    replace(byId('alert-container'), alertNode);
    setTimeout(() => closeAlert(document.querySelector('.custom-alert')), 5000);
}

function closeAlert(alertNode) {
    if (!alertNode) return;
    alertNode.classList.add('fade-out');
    setTimeout(() => alertNode.remove(), 300);
}

// Hide action buttons and show completion state
function completionCopy() {
    if (reviewOrderId !== null) return reviewSummary();
    if (state.isSurveyCompleted) return { title: 'Nộp bài thành công!', text: 'Cảm ơn bạn đã tham gia khảo sát tâm lý. Kết quả đã được gửi đến bác sĩ.' };
    return { title: 'Khảo sát đã kết thúc', text: 'Các câu trả lời đã lưu được giữ lại. Khảo sát không nhận thêm thay đổi.' };
}

function hideActionButtons() {
    document.querySelectorAll('.btn-start-over, .btn-previous, .btn-next, .btn-submit').forEach(button => { button.hidden = true; });
    const completion = completionCopy();
    const pending = reviewOrderId !== null && state.reviewData?.review_state !== 'submitted';
    const returnButton = el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: ['btn btn-outline btn-return-to-view', state.currentQuestionIndex === 0 && 'survey-action-hidden'].filter(Boolean).join(' ') }, 'Trở lại');
    const nextButton = el('button', { type: 'button', class: ['btn btn-primary btn-next-to-view', state.currentQuestionIndex === state.allQuestions.length - 1 && 'survey-action-hidden'].filter(Boolean).join(' ') }, 'Tiếp theo');
    // Replace action buttons with completion message
    const row = document.querySelector('.actions .row');
    if (row) replace(row, el('div', { class: 'completion-message' },
        el('div', { class: 'completion-content' },
            el('div', { class: pending ? 'completion-icon completion-icon--pending' : 'completion-icon' }, pending ? '…' : '✓'),
            el('div', { class: 'completion-text' }, el('h4', {}, completion.title), el('p', {}, completion.text))),
        el('div', { class: 'completion-buttons' }, returnButton, ' ', nextButton)));

    // Only disable inputs if survey is closed (not if just completed - allow review)
    if (state.isSurveyClosed) disableSurveyInputs();

    returnButton.addEventListener('click', () => {
        if (state.currentQuestionIndex > 0) {
            state.currentQuestionIndex--;
            showQuestion(state.currentQuestionIndex);
        }
    });
    nextButton.addEventListener('click', () => {
        if (state.currentQuestionIndex < state.allQuestions.length - 1) {
            state.currentQuestionIndex++;
            showQuestion(state.currentQuestionIndex);
        }
    });
}

export { hideActionButtons, showAlert, submitSurvey };
