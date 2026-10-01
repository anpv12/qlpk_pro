import { state } from './state.js';
import { byId, el, replace } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { disableSurveyInputs, setShown, setText, showNoSurveyMessage } from './view.js';
import { loadSessionSurveyDraft } from './review-draft.js';
import { loadExistingResponses } from './responses.js';
import { reviewOrderId, showClosedSurveyMessage, showExpiredSurveyMessage } from '../patient-survey.js';
import { showAlert } from './submit.js';
import { bindQuestionEvents, updateNavigationButtons, updateProgress } from './interaction.js';
import { restoreAnswer } from './interaction-parts/grid-and-restore.js';
import { renderCheckboxOption, renderDateQuestion, renderGridQuestion, renderLinearScaleQuestion, renderRadioOption, renderTimeQuestion, surveyOptionId } from './questions-parts/answer-renderers.js';

// Sau khi có câu hỏi: tải câu trả lời đã lưu, hiện câu đầu tiên, rồi hiển thị trạng thái đóng/hết hạn
function startSurvey(templateName) {
    if (prepareQuestions() === false) return;
    setText('survey-name', `🛡️ ${templateName}`);
    loadExistingResponses().then(() => {
        state.currentQuestionIndex = 0;
        showQuestion(0);
        if (state.isSurveyClosed || state.isSurveyCompleted) {
            showClosedSurveyMessage();
        } else if (state.isSurveyExpired) {
            showExpiredSurveyMessage();
        }
    });
}

// Load survey templates: one template from the URL, otherwise every active template for the examination (legacy)
async function loadSurveyTemplates() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('session_token');
    if (token) { loadSessionSurveyDraft(token); return; }

    setShown('#survey-content, #no-survey-message', false);
    setShown('#loading-spinner', true);

    const examinationId = urlParams.get('examination_id');
    const templateIdFromUrl = urlParams.get('template_id');
    let url = '/api/survey-templates/active/public';
    if (templateIdFromUrl) url = `/api/survey-templates/${templateIdFromUrl}/public`;
    else if (examinationId) url = `/api/survey-templates/examination/${examinationId}/public`;

    let response;
    try {
        response = await requestJson(url);
    } catch {
        setShown('#loading-spinner', false);
        showAlert('error', 'Lỗi khi tải câu hỏi khảo sát.');
        return;
    }
    setShown('#loading-spinner', false);
    const templates = templateIdFromUrl ? [response?.data].filter(Boolean) : (response?.data || []);
    if (!response?.success || !templates.length) {
        showNoSurveyMessage();
        return;
    }
    state.surveyTemplates = templates;
    startSurvey(templates[0].name);
}

// Prepare all questions from templates
function prepareQuestions() {
    state.allQuestions = [];
    const invalidTemplate = state.surveyTemplates.some(template => {
        const content = template.content;
        const questions = Array.isArray(content) ? content : content?.questions
            || Object.values(template.questions_by_criteria || {}).flat();
        return questions.some(question => question.id === undefined || question.id === null || question.id === '');
    });
    if (invalidTemplate) {
        setShown('#loading-spinner, .actions, #survey-content', false);
        showNoSurveyMessage('Mẫu khảo sát chưa sẵn sàng. Vui lòng liên hệ phòng khám để cập nhật mẫu và liên kết khảo sát.');
        const nextButton = byId('next');
        if (nextButton) nextButton.disabled = true;
        showAlert('error', 'Mẫu khảo sát cần được cập nhật. Vui lòng liên hệ phòng khám.');
        return false;
    }

    state.surveyTemplates.forEach(template => {
        // Handle new structure (content.questions array)
        if (template.content && template.content.questions) {
            template.content.questions.forEach((question) => {
                state.allQuestions.push({
                    ...question,
                    template_id: template.id
                });
            });
        }
        // Handle old structure (questions_by_criteria)
        else if (template.questions_by_criteria) {
            Object.keys(template.questions_by_criteria).forEach(criteria => {
                const questions = template.questions_by_criteria[criteria];
                questions.forEach((question) => {
                    state.allQuestions.push({
                        ...question,
                        template_id: template.id,
                        criteria: criteria
                    });
                });
            });
        }
        // Handle direct content array (like DASS-21)
        else if (Array.isArray(template.content)) {
            template.content.forEach((question) => {

                state.allQuestions.push({
                    ...question,
                    template_id: template.id
                });
            });
        }
    });

    // Calculate total questions including subquestions in grid questions
    let totalCount = 0;
    state.allQuestions.forEach(question => {
        if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
            // For grid questions, count each subquestion (row) as a separate question
            const gridRows = question.grid ? question.grid.rows : [];
            totalCount += gridRows.length > 0 ? gridRows.length : 1; // Fallback to 1 if no rows
        } else {
            // For regular questions, count as 1
            totalCount += 1;
        }
    });

    state.totalQuestions = totalCount;

    // Validate currentQuestionIndex after questions are prepared
    if (state.currentQuestionIndex >= state.allQuestions.length) {
        state.currentQuestionIndex = 0;
        // Clear the corrupted saved index
        const examinationId = localStorage.getItem('current_examination_id');
        if (examinationId) {
            localStorage.removeItem(`survey_current_index_${examinationId}`);
        }
    }
}

// Show specific question
function showQuestion(index) {

    if (index < 0 || index >= state.allQuestions.length) {
        return;
    }

    // currentQuestionIndex is now managed by button handlers
    const question = state.allQuestions[index];

    // Update progress
    updateProgress();

    // Render question
    const surveyContent = byId('survey-content');
    replace(surveyContent, renderSingleQuestion(question, index));
    surveyContent.hidden = false;

    // Restore previous answer if exists
    restoreAnswer(question.id);
    if (state.isSurveyClosed || state.isSurveyCompleted || state.isSurveyExpired) {
        disableSurveyInputs();
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
    document.querySelectorAll('.btn-return-to-view').forEach(button => button.classList.toggle('survey-action-hidden', state.currentQuestionIndex === 0));
    document.querySelectorAll('.btn-next-to-view').forEach(button => button.classList.toggle('survey-action-hidden', state.currentQuestionIndex === state.allQuestions.length - 1));
}

// Render single question as a card node
function renderSingleQuestion(question, index, questionNumber = null) {
    const questionId = `q_${question.id}`;
    const questionType = question.type || 'multiple_choice';
    const renderers = {
        short_answer: renderShortAnswerQuestion,
        paragraph: renderParagraphQuestion,
        multiple_choice: renderMultipleChoiceQuestion,
        checkboxes: renderCheckboxesQuestion,
        dropdown: renderDropdownQuestion,
        linear_scale: renderLinearScaleQuestion,
        multiple_choice_grid: renderGridQuestion,
        checkbox_grid: renderGridQuestion,
        date: renderDateQuestion,
        time: renderTimeQuestion
    };
    // Unknown types fall back to multiple choice
    const render = Object.prototype.hasOwnProperty.call(renderers, questionType) ? renderers[questionType] : renderMultipleChoiceQuestion;
    return el('section', { class: 'card survey-question-card', 'aria-labelledby': questionId },
        el('h2', { id: questionId, class: 'survey-question-title' },
            el('span', { class: 'survey-question-number' }, `Câu ${questionNumber || (index + 1)}`), el('br'), ' ',
            el('span', { class: 'survey-question-text' }, question.text || question.question || ''),
            question.required ? [' ', el('span', { class: 'survey-required-mark' }, '*')] : null),
        render(question, questionId));
}

function characterCounter(characterLimit) {
    return characterLimit ? el('div', { class: 'character-counter' }, el('span', { class: 'current-count' }, '0'), `/${characterLimit} ký tự`) : null;
}

// Render Short Answer Question
function renderShortAnswerQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    return el('div', { class: 'form-group' },
        el('input', { type: 'text', name: questionId, id: `${questionId}_input`, class: 'form-control', placeholder: 'Nhập câu trả lời ngắn...', disabled: state.isSurveyClosed, maxlength: characterLimit || null }),
        characterCounter(characterLimit));
}

// Render Paragraph Question
function renderParagraphQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    return el('div', { class: 'form-group' },
        el('textarea', { name: questionId, id: `${questionId}_textarea`, class: 'form-control', placeholder: 'Nhập câu trả lời dài...', rows: '4', disabled: state.isSurveyClosed, maxlength: characterLimit || null }),
        characterCounter(characterLimit));
}

// Render Multiple Choice Question
function renderMultipleChoiceQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    return el('div', { class: 'group', role: 'radiogroup', 'aria-labelledby': questionId },
        answers.map((answer, answerIndex) => renderRadioOption(answer, questionId, answerIndex)),
        reviewOrderId === null ? el('div', { class: 'note' }, 'Mẹo: bấm phím ', el('b', {}, `1–${answers.length}`), ' để chọn nhanh') : null);
}

// Render Checkboxes Question
function renderCheckboxesQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    return el('div', { class: 'group', role: 'group', 'aria-labelledby': questionId },
        answers.map((answer, answerIndex) => renderCheckboxOption(answer, questionId, answerIndex)));
}

// Render Dropdown Question
function renderDropdownQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    return el('div', { class: 'form-group' },
        el('select', { name: questionId, id: `${questionId}_select`, class: 'form-control', disabled: state.isSurveyClosed },
            el('option', { value: '' }, 'Chọn một đáp án...'),
            answers.map((answer, answerIndex) => el('option', { value: surveyOptionId(answer, answerIndex) }, answer.text || ''))));
}

export { loadSurveyTemplates, prepareQuestions, renderSingleQuestion, showQuestion };
