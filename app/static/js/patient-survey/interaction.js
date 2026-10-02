import { state } from './state.js';
import { byId, delegate, on } from '../shared/dom.js';
import { setText } from './view.js';
import { handleGridQuestionResponse, validateGridQuestion } from './interaction-parts/grid-and-restore.js';
import { clearSurveyResponsesFromStorage, reviewOrderId, saveSurveyResponsesToStorage, updateProgressForAllQuestions } from '../patient-survey.js';
import { showQuestion } from './questions.js';
import { submitSurvey } from './submit.js';
import { setSurveyProgressBar } from '../patient-survey-parts/display.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';

// data-* values coerced the way the former data() helper did ("3" -> 3, "true" -> true), so stored scores keep their types.
function dataValue(node, name) {
    const raw = node.getAttribute(`data-${name}`);
    if (raw === null) return undefined;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (raw === 'null') return null;
    if (raw === String(Number(raw))) return Number(raw);
    if (/^(?:\{[\w\W]*\}|\[[\w\W]*\])$/.test(raw)) {
        try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
}

function afterAnswerChange() {
    saveSurveyResponsesToStorage();
    updateNavigationButtons();
    updateProgressIfPreview();
}

// Grid inputs carry data-question-id/data-row-id; older markup is resolved from the "q_<id>_row_<index>" name.
function recordGridAnswer(input, questionId, inputType) {
    const questionIdAttr = dataValue(input, 'question-id');
    const rowIdAttr = dataValue(input, 'row-id');
    if (questionIdAttr && rowIdAttr) {
        handleGridQuestionResponse(questionIdAttr, rowIdAttr, input.value, inputType);
        return true;
    }
    if (questionId.includes('_row_')) {
        handleGridQuestionResponse(null, null, input.value, inputType, questionId);
        return true;
    }
    return false;
}

const QUESTION_HANDLERS = [
    ['change', 'input[type="radio"]', input => {
        const questionId = input.getAttribute('name');
        if (!recordGridAnswer(input, questionId, 'radio')) {
            state.surveyResponses[questionId] = { answer_id: input.value, score: dataValue(input, 'score') };
        }
    }],
    ['change', 'input[type="checkbox"]', input => {
        const questionId = input.getAttribute('name').replace('[]', '');
        if (!recordGridAnswer(input, questionId, 'checkbox')) {
            const checkedBoxes = [...document.querySelectorAll(`input[name="${CSS.escape(questionId)}[]"]:checked`)];
            state.surveyResponses[questionId] = {
                answer_ids: checkedBoxes.map(box => box.value),
                scores: checkedBoxes.map(box => dataValue(box, 'score'))
            };
        }
    }],
    ['change', 'select', select => {
        state.surveyResponses[select.getAttribute('name')] = { answer_id: select.value, score: 0 };
    }],
    ['input', 'input[type="text"], textarea', input => {
        state.surveyResponses[input.getAttribute('name')] = { answer_text: input.value, score: 0 };
        updateCharacterCounter(input);
    }],
    ['change', 'input[type="date"], input[type="time"], input[type="datetime-local"]', input => {
        state.surveyResponses[input.getAttribute('name')] = { answer_value: input.value, score: 0 };
    }],
];

const isVisible = node => Boolean(node.offsetWidth || node.offsetHeight || node.getClientRects().length);

// Keyboard shortcuts 1-9 pick an option in the first visible question card
function handleShortcutKey(event) {
    if (!['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(event.key)) return;
    const currentCard = [...document.querySelectorAll('.card')].find(isVisible);
    const radio = currentCard?.querySelectorAll('input[type="radio"]')[parseInt(event.key, 10) - 1];
    if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

let questionEventsBound = false;

// Delegated once on #survey-content, so re-rendered questions keep working
function bindQuestionEvents() {
    if (reviewOrderId !== null || state.isSurveyClosed || state.isSurveyCompleted || state.isSurveyExpired) return;
    if (questionEventsBound) return;
    questionEventsBound = true;
    const content = byId('survey-content');
    QUESTION_HANDLERS.forEach(([type, selector, record]) => delegate(content, type, selector, (event, input) => {
        record(input);
        afterAnswerChange();
    }));
    document.addEventListener('keydown', handleShortcutKey);
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

// Update character counter next to a text input/textarea
function updateCharacterCounter(input) {
    const counter = [...(input.parentElement?.children || [])].find(node => node !== input && node.classList.contains('character-counter'));
    if (!counter) return;
    const currentCount = input.value.length;
    const maxLength = input.getAttribute('maxlength');
    const count = counter.querySelector('.current-count');
    if (count) count.textContent = currentCount;
    if (!maxLength) return;
    const percentage = (currentCount / parseInt(maxLength, 10)) * 100;
    counter.classList.toggle('character-counter--danger', percentage >= 90);
    counter.classList.toggle('character-counter--warning', percentage >= 75 && percentage < 90);
}

// Bind navigation events
function bindNavigationEvents() {
    // Next button - navigation dùng allQuestions.length; câu cuối thì nộp bài
    on(byId('next'), 'click', () => {
        if (state.currentQuestionIndex < state.allQuestions.length - 1) {
            state.currentQuestionIndex++;
            saveSurveyResponsesToStorage();
            showQuestion(state.currentQuestionIndex);
        } else {
            submitSurvey();
        }
    });
    on(byId('previous'), 'click', () => {
        if (state.currentQuestionIndex > 0) {
            state.currentQuestionIndex--;
            saveSurveyResponsesToStorage();
            showQuestion(state.currentQuestionIndex);
        }
    });
    on(byId('start-over'), 'click', async () => {
        const confirmed = await QLPKConfirmationDialog.confirm({
            text: 'Bạn có chắc muốn bắt đầu lại? Tất cả câu trả lời sẽ bị mất.',
            confirmText: 'Bắt đầu lại',
            variant: 'warning',
            showToast: (type, message) => window.QLPKUserFeedback?.show(type, message)
        });
        if (confirmed) {
            state.surveyResponses = {};
            state.currentQuestionIndex = 0;
            clearSurveyResponsesFromStorage();
            saveSurveyResponsesToStorage();
            showQuestion(0);
        }
    });
}

// Update progress
function updateProgress() {
    // Safety check: if totalQuestions is not set yet, don't update progress
    if (!state.totalQuestions || state.totalQuestions === 0) {
        // Set default values - show 0% progress when questions not loaded yet
        setText('cur', 1);
        setText('total', '?');
        setText('kpi', '0%');
        setSurveyProgressBar(0);
        return; // Exit early
    }

    // Count actual responses (including grid_responses)
    // Only count responses that have valid answers
    let actualResponseCount = 0;
    Object.keys(state.surveyResponses).forEach(key => {
        const response = state.surveyResponses[key];
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
    actualResponseCount = Math.min(actualResponseCount, state.totalQuestions);

    // Calculate percentage with safety checks
    let percentage = 0;
    if (state.totalQuestions > 0) {
        const rawPercentage = (actualResponseCount / state.totalQuestions) * 100;
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
    setText('cur', actualResponseCount);
    setText('total', state.totalQuestions);
    setText('kpi', percentage + '%');

    // Update progress bar
    // insetInlineEnd: 100% = empty bar (0% filled), 0% = full bar (100% filled)
    setSurveyProgressBar(percentage);
}

// Update navigation buttons
function updateNavigationButtons() {
    // Safety check: ensure currentQuestionIndex is within bounds
    if (state.currentQuestionIndex >= state.allQuestions.length) {

        state.currentQuestionIndex = state.allQuestions.length - 1; // Set to last valid index
    }

    const currentQuestion = state.allQuestions[state.currentQuestionIndex];
    if (!currentQuestion) {
        return;
    }

    // Navigation dùng allQuestions.length, không dùng totalQuestions
    const mainQuestionId = `q_${currentQuestion.id}`;
    const response = state.surveyResponses[mainQuestionId];
    const isFirstQuestion = state.currentQuestionIndex === 0;
    const isLastQuestion = state.currentQuestionIndex === state.allQuestions.length - 1;

    // Check if question has a valid answer
    const hasAnswer = canProceedSurveyQuestion(currentQuestion, response);

    // Previous button
    // The buttons are gone once hideActionButtons() replaced the action row.
    const previousButton = byId('previous');
    if (previousButton) previousButton.disabled = isFirstQuestion;
    const nextButton = byId('next');
    if (nextButton) {
        nextButton.textContent = isLastQuestion ? 'Hoàn thành' : 'Tiếp theo';
        nextButton.disabled = !hasAnswer;
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

export { bindNavigationEvents, bindQuestionEvents, canProceedSurveyQuestion, hasSurveyAnswer, isPreviewMode, updateCharacterCounter, updateNavigationButtons, updateProgress };
