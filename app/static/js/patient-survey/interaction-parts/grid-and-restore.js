/* global allQuestions, currentQuestionIndex, hasSurveyAnswer, surveyResponses: writable, updateCharacterCounter */
/* exported handleGridQuestionResponse, restoreAnswer, restoreSavedSurveyResponses, validateGridQuestion */
// interaction.js: validateGridQuestion, handleGridQuestionResponse, resolveGridResponseTarget, restoreAnswer, restoreSavedSurveyResponses (nạp trước interaction.js, cùng scope trang).

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
        // Tìm tất cả checkbox cùng row bằng data attributes
        const checkedBoxes = $(`input[data-question-id="${questionId}"][data-row-id="${rowId}"]:checked`);
        const checkedValues = [];
        checkedBoxes.each(function() {
            checkedValues.push($(this).val());
        });
        surveyResponses[mainQuestionId].grid_responses[actualSubquestionId] = checkedValues;
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
    let targetQuestion = allQuestions.find(q => `q_${q.id}` === mainQuestionId) || null;
    // Fallback: dùng currentQuestionIndex
    if (!targetQuestion) {
        targetQuestion = allQuestions[currentQuestionIndex];
        if (targetQuestion && targetQuestion.id) {
            mainQuestionId = `q_${targetQuestion.id}`;
        }
    }
    const gridRow = targetQuestion?.grid?.rows?.[rowIndex];
    return { mainQuestionId, actualSubquestionId: gridRow ? (gridRow.id || rowIndex.toString()) : rowIndex.toString() };
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
            let field = Array.isArray(value) ? 'answer_ids' : 'answer_id';
            if (['short_answer', 'paragraph'].includes(question.type)) field = 'answer_text';
            else if (['date', 'time'].includes(question.type)) field = 'answer_value';
            surveyResponses[key] = {[field]: value};
        }
    });
}
