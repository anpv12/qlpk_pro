import { state } from '../state.js';
import { hasSurveyAnswer, updateCharacterCounter } from '../interaction.js';

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
    const target = resolveGridResponseTarget(questionId, rowId, fallbackQuestionId);
    if (!target) return;
    const { mainQuestionId, actualSubquestionId } = target;

    // Initialize grid_responses if not exists
    if (!state.surveyResponses[mainQuestionId]) {
        state.surveyResponses[mainQuestionId] = {};
    }
    if (!state.surveyResponses[mainQuestionId].grid_responses) {
        state.surveyResponses[mainQuestionId].grid_responses = {};
    }

    // Store the response for this specific row using the actualSubquestionId
    if (inputType === 'radio') {
        state.surveyResponses[mainQuestionId].grid_responses[actualSubquestionId] = answerId;
    } else if (inputType === 'checkbox') {
        // Tìm tất cả checkbox cùng row bằng data attributes
        const checkedBoxes = queryAll(`input[data-question-id="${attr(questionId)}"][data-row-id="${attr(rowId)}"]:checked`);
        state.surveyResponses[mainQuestionId].grid_responses[actualSubquestionId] = checkedBoxes.map(box => box.value);
    }
}

// Ưu tiên data attributes; fallback parse "q_<id>_row_<index>" (tương thích cũ).
function resolveGridResponseTarget(questionId, rowId, fallbackQuestionId) {
    if (questionId && rowId) {
        return { mainQuestionId: `q_${questionId}`, actualSubquestionId: rowId };
    }
    if (!fallbackQuestionId || !fallbackQuestionId.includes('_row_')) return null;

    const parts = fallbackQuestionId.split('_row_');
    let mainQuestionId = parts[0];
    const rowIndex = parseInt(parts[1], 10);
    let targetQuestion = state.allQuestions.find(q => `q_${q.id}` === mainQuestionId) || null;
    // Fallback: dùng currentQuestionIndex
    if (!targetQuestion) {
        targetQuestion = state.allQuestions[state.currentQuestionIndex];
        if (targetQuestion && targetQuestion.id) {
            mainQuestionId = `q_${targetQuestion.id}`;
        }
    }
    const gridRow = targetQuestion?.grid?.rows?.[rowIndex];
    return { mainQuestionId, actualSubquestionId: gridRow ? (gridRow.id || rowIndex.toString()) : rowIndex.toString() };
}

const queryAll = selector => [...document.querySelectorAll(selector)];
const attr = value => CSS.escape(String(value));
const check = nodes => nodes.forEach(node => { node.checked = true; });

// Restore previous answer into the rendered question
function restoreAnswer(questionId) {
    const response = state.surveyResponses[`q_${questionId}`];
    if (!response) return;
    const name = attr(`q_${questionId}`);
    if (response.grid_responses) {
        // Grid questions (like DASS-21 with subquestions): checkbox rows hold arrays, radio rows a single value
        Object.entries(response.grid_responses).forEach(([rowId, value]) => {
            (Array.isArray(value) ? value : [value]).forEach(v => check(queryAll(`input[data-row-id="${attr(rowId)}"][value="${attr(v)}"]`)));
        });
    } else if (response.answer_id !== undefined && response.answer_id !== null) {
        // Radio button or dropdown
        const inputs = queryAll(`input[name="${name}"][value="${attr(response.answer_id)}"], select[name="${name}"]`);
        if (inputs.some(node => node.tagName === 'SELECT')) inputs.forEach(node => { node.value = String(response.answer_id); });
        else check(inputs);
    } else if (response.answer_ids) {
        response.answer_ids.forEach(answerId => check(queryAll(`input[name="${name}[]"][value="${attr(answerId)}"]`)));
    } else if (response.answer_text) {
        // Text input or textarea
        const textInputs = queryAll(`input[name="${name}"], textarea[name="${name}"]`);
        textInputs.forEach(node => { node.value = response.answer_text; });
        if (textInputs.length) updateCharacterCounter(textInputs[0]);
    } else if (response.answer_value !== undefined && response.answer_value !== null) {
        // Date, time, or datetime-local
        queryAll(`input[name="${name}"]`).forEach(node => { node.value = response.answer_value; });
    }
}

// Hydrate stored answer IDs into the existing question renderer's state.
function restoreSavedSurveyResponses(answers) {
    state.surveyResponses = {};
    state.allQuestions.forEach(question => {
        const key = `q_${question.id}`;
        if (['multiple_choice_grid', 'checkbox_grid'].includes(question.type)) {
            const gridResponses = {};
            (question.grid?.rows || []).forEach((row, index) => {
                const savedKey = String(row.question_id ?? row.id ?? index);
                if (Object.prototype.hasOwnProperty.call(answers, savedKey)) {
                    gridResponses[String(row.id ?? index)] = answers[savedKey];
                }
            });
            if (Object.keys(gridResponses).length) state.surveyResponses[key] = {grid_responses: gridResponses};
        } else if (Object.prototype.hasOwnProperty.call(answers, String(question.id))) {
            const value = answers[String(question.id)];
            let field = Array.isArray(value) ? 'answer_ids' : 'answer_id';
            if (['short_answer', 'paragraph'].includes(question.type)) field = 'answer_text';
            else if (['date', 'time'].includes(question.type)) field = 'answer_value';
            state.surveyResponses[key] = {[field]: value};
        }
    });
}

export { handleGridQuestionResponse, restoreAnswer, restoreSavedSurveyResponses, validateGridQuestion };
