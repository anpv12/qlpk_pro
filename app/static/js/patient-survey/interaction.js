/* global allQuestions, clearSurveyResponsesFromStorage, currentQuestionIndex: writable, isSurveyClosed, isSurveyCompleted, isSurveyExpired, reviewOrderId, saveSurveyResponsesToStorage, setSurveyProgressBar, showQuestion, submitSurvey, surveyResponses: writable, totalQuestions, updateProgressForAllQuestions */
/* exported bindNavigationEvents, bindQuestionEvents, restoreAnswer, restoreSavedSurveyResponses, updateProgress */

// Bind question events
function bindQuestionEvents() {
    if (reviewOrderId !== null || isSurveyClosed || isSurveyCompleted || isSurveyExpired) return;

    // Radio button change event
    $('#survey-content').off('change', 'input[type="radio"]').on('change', 'input[type="radio"]', function() {
        const questionId = $(this).attr('name');
        const answerId = $(this).val();
        const score = $(this).data('score');

        // Check if this is a grid question - dùng data attributes thay vì parse string
        const $this = $(this);
        const questionIdAttr = $this.data('question-id');
        const rowIdAttr = $this.data('row-id');

        if (questionIdAttr && rowIdAttr) {
            // Handle grid question response với data attributes
            handleGridQuestionResponse(questionIdAttr, rowIdAttr, answerId, 'radio');
        } else if (questionId.includes('_row_')) {
            // Fallback: parse string nếu không có data attributes (backward compatibility)
            handleGridQuestionResponse(null, null, answerId, 'radio', questionId);
        } else {
            // Regular question response
            surveyResponses[questionId] = {
                answer_id: answerId,
                score: score
            };
        }

        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();

        // Update navigation buttons
        updateNavigationButtons();

        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });

    // Checkbox change event
    $('#survey-content').off('change', 'input[type="checkbox"]').on('change', 'input[type="checkbox"]', function() {
        const questionId = $(this).attr('name').replace('[]', '');

        // Check if this is a grid question - dùng data attributes
        const $this = $(this);
        const questionIdAttr = $this.data('question-id');
        const rowIdAttr = $this.data('row-id');

        if (questionIdAttr && rowIdAttr) {
            // Handle grid question response với data attributes
            handleGridQuestionResponse(questionIdAttr, rowIdAttr, $this.val(), 'checkbox');
        } else if (questionId.includes('_row_')) {
            // Fallback: parse string nếu không có data attributes
            handleGridQuestionResponse(null, null, $this.val(), 'checkbox', questionId);
        } else {
            // Regular checkbox question
            const checkedBoxes = $(`input[name="${questionId}[]"]:checked`);
            const selectedValues = checkedBoxes.map(function() { return $(this).val(); }).get();
            const selectedScores = checkedBoxes.map(function() { return $(this).data('score'); }).get();

            // Store response
            surveyResponses[questionId] = {
                answer_ids: selectedValues,
                scores: selectedScores
            };
        }

        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();

        // Update navigation buttons
        updateNavigationButtons();

        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });

    // Dropdown change event
    $('#survey-content').off('change', 'select').on('change', 'select', function() {
        const questionId = $(this).attr('name');
        const answerId = $(this).val();

        // Store response
        surveyResponses[questionId] = {
            answer_id: answerId,
            score: 0
        };

        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();

        // Update navigation buttons
        updateNavigationButtons();

        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });

    // Text input change event (Short Answer, Paragraph)
    $('#survey-content').off('input', 'input[type="text"], textarea').on('input', 'input[type="text"], textarea', function() {
        const questionId = $(this).attr('name');
        const answerText = $(this).val();

        // Store response
        surveyResponses[questionId] = {
            answer_text: answerText,
            score: 0
        };

        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();

        // Update navigation buttons
        updateNavigationButtons();

        // Update character counter
        updateCharacterCounter($(this));

        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });

    // Date/Time input change event
    $('#survey-content').off('change', 'input[type="date"], input[type="time"], input[type="datetime-local"]').on('change', 'input[type="date"], input[type="time"], input[type="datetime-local"]', function() {
        const questionId = $(this).attr('name');
        const answerValue = $(this).val();

        // Store response
        surveyResponses[questionId] = {
            answer_value: answerValue,
            score: 0
        };

        // Save to localStorage for persistence
        saveSurveyResponsesToStorage();

        // Update navigation buttons
        updateNavigationButtons();

        // Update progress for all questions view if in preview mode
        updateProgressIfPreview();
    });

    // Keyboard shortcuts for multiple choice
    $(document).off('keydown.survey').on('keydown.survey', function(e) {
        const key = e.key;
        const currentCard = $('.card:visible').first();
        const radioInputs = currentCard.find('input[type="radio"]');

        if (['1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(key)) {
            const index = parseInt(key) - 1;

            if (radioInputs[index]) {
                radioInputs[index].checked = true;
                // Use vanilla JavaScript event dispatch
                radioInputs[index].dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    });

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

// Update character counter
function updateCharacterCounter(input) {
    const counter = input.siblings('.character-counter');
    if (counter.length) {
        const currentCount = input.val().length;
        const maxLength = input.attr('maxlength');

        counter.find('.current-count').text(currentCount);

        // Change color based on usage
        if (maxLength) {
            const percentage = (currentCount / parseInt(maxLength)) * 100;
            if (percentage >= 90) {
                counter.removeClass('character-counter--warning').addClass('character-counter--danger');
            } else if (percentage >= 75) {
                counter.removeClass('character-counter--danger').addClass('character-counter--warning');
            } else {
                counter.removeClass('character-counter--danger character-counter--warning');
            }
        }
    }
}

// Bind navigation events
function bindNavigationEvents() {

    // Next button - navigation dùng allQuestions.length
    $('#next').off('click').on('click', function() {
        if (currentQuestionIndex < allQuestions.length - 1) {
            currentQuestionIndex++;
            saveSurveyResponsesToStorage();
            showQuestion(currentQuestionIndex);
        } else {
            // Last question - submit survey
            submitSurvey();
        }
    });

    // Previous button
    $('#previous').off('click').on('click', function() {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            saveSurveyResponsesToStorage();
            showQuestion(currentQuestionIndex);
        }
    });

    // Start over button
    $('#start-over').off('click').on('click', async function() {
        const confirmed = await window.QLPKConfirmationDialog.confirm({
            text: 'Bạn có chắc muốn bắt đầu lại? Tất cả câu trả lời sẽ bị mất.',
            confirmText: 'Bắt đầu lại',
            variant: 'warning',
            showToast: (type, message) => window.QLPKUserFeedback?.show(type, message)
        });
        if (confirmed) {
            surveyResponses = {};
            currentQuestionIndex = 0;
            clearSurveyResponsesFromStorage();
            saveSurveyResponsesToStorage();
            showQuestion(0);
        }
    });

}

// Update progress
function updateProgress() {
    // Safety check: if totalQuestions is not set yet, don't update progress
    if (!totalQuestions || totalQuestions === 0) {
        // Set default values - show 0% progress when questions not loaded yet
        $('#cur').text(1);
        $('#total').text('?');
        $('#kpi').text('0%');
        setSurveyProgressBar(0);
        return; // Exit early
    }

    // Count actual responses (including grid_responses)
    // Only count responses that have valid answers
    let actualResponseCount = 0;
    Object.keys(surveyResponses).forEach(key => {
        const response = surveyResponses[key];
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
    actualResponseCount = Math.min(actualResponseCount, totalQuestions);

    // Calculate percentage with safety checks
    let percentage = 0;
    if (totalQuestions > 0) {
        const rawPercentage = (actualResponseCount / totalQuestions) * 100;
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
    $('#cur').text(actualResponseCount);
    $('#total').text(totalQuestions);
    $('#kpi').text(percentage + '%');

    // Update progress bar
    // insetInlineEnd: 100% = empty bar (0% filled), 0% = full bar (100% filled)
    setSurveyProgressBar(percentage);
}

// Update navigation buttons
function updateNavigationButtons() {
    // Safety check: ensure currentQuestionIndex is within bounds
    if (currentQuestionIndex >= allQuestions.length) {

        currentQuestionIndex = allQuestions.length - 1; // Set to last valid index
    }

    const currentQuestion = allQuestions[currentQuestionIndex];
    if (!currentQuestion) {
        return;
    }

    // Navigation dùng allQuestions.length, không dùng totalQuestions
    const mainQuestionId = `q_${currentQuestion.id}`;
    const response = surveyResponses[mainQuestionId];
    const isFirstQuestion = currentQuestionIndex === 0;
    const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;

    // Check if question has a valid answer
    const hasAnswer = canProceedSurveyQuestion(currentQuestion, response);

    // Previous button
    $('#previous').prop('disabled', isFirstQuestion);

    // Next button - isLastQuestion đã được tính ở trên
    if (isLastQuestion) {
        $('#next').text('Hoàn thành').prop('disabled', !hasAnswer);
    } else {
        $('#next').text('Tiếp theo').prop('disabled', !hasAnswer);
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
            const field = ['short_answer', 'paragraph'].includes(question.type) ? 'answer_text'
                : ['date', 'time'].includes(question.type) ? 'answer_value'
                : Array.isArray(value) ? 'answer_ids' : 'answer_id';
            surveyResponses[key] = {[field]: value};
        }
    });
}
