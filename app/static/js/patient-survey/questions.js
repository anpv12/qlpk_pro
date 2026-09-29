/* global allQuestions: writable, bindQuestionEvents, currentQuestionIndex: writable, isSurveyClosed, isSurveyCompleted, isSurveyExpired, loadExistingResponses, loadSessionSurveyDraft, restoreAnswer, reviewOrderId, showAlert, showClosedSurveyMessage, showExpiredSurveyMessage, surveyTemplates: writable, totalQuestions: writable, updateNavigationButtons, updateProgress */
/* exported loadSurveyTemplates, totalQuestions */

// Load survey templates
function loadSurveyTemplates() {
    const token = new URLSearchParams(window.location.search).get('session_token');
    if (token) { loadSessionSurveyDraft(token); return; }

    const surveyContent = $('#survey-content');
    const surveyLoading = $('#loading-spinner');
    const noSurveyMessage = $('#no-survey-message');

    // Show loading
    surveyContent.hide();
    noSurveyMessage.hide();
    surveyLoading.show();

    // Lấy examination_id và template_id từ URL
    const urlParams = new URLSearchParams(window.location.search);
    const examinationId = urlParams.get('examination_id');
    const templateIdFromUrl = urlParams.get('template_id');


    // If template_id is provided in URL, load only that template
    if (templateIdFromUrl) {
        // Load specific template
        $.ajax({
            url: `/api/survey-templates/${templateIdFromUrl}/public`,
            method: 'GET',
            success: function(response) {
                surveyLoading.hide();


                if (response.success && response.data) {
                    surveyTemplates = [response.data];  // Single template array
                    if (prepareQuestions() === false) return;

                    // Update header with template info
                    $('#survey-name').text(`🛡️ ${response.data.name}`);

                    // Load existing responses first, then show first question
                    loadExistingResponses().then(() => {
                        currentQuestionIndex = 0;
                        showQuestion(0);

                        if (isSurveyClosed || isSurveyCompleted) {
                            showClosedSurveyMessage();
                        } else if (isSurveyExpired) {
                            showExpiredSurveyMessage();
                        }
                    });
                } else {
                    noSurveyMessage.show();
                }
            },
            error: function() {
                surveyLoading.hide();
                showAlert('error', 'Lỗi khi tải câu hỏi khảo sát.');
            }
        });
        return;  // Exit early, don't load all templates
    }

    // No template_id in URL - load all active templates for examination (legacy behavior)
    const apiUrl = examinationId ?
        `/api/survey-templates/examination/${examinationId}/public` :
        '/api/survey-templates/active/public';

    $.ajax({
        url: apiUrl,
        method: 'GET',
        success: function(response) {
            surveyLoading.hide();


            if (response.success && response.data && response.data.length > 0) {
                surveyTemplates = response.data;
                if (prepareQuestions() === false) return;

                // Update header with first template info
                if (surveyTemplates.length > 0) {
                    const firstTemplate = surveyTemplates[0];
                    $('#survey-name').text(`🛡️ ${firstTemplate.name}`);
                }

                // Load existing responses first, then show first question
                loadExistingResponses().then(() => {
                    // Show first question after loading responses
                    currentQuestionIndex = 0;
                    showQuestion(0);

                    // Nếu khảo sát đã đóng, hoàn thành hoặc hết hạn, hiển thị trạng thái
                    if (isSurveyClosed || isSurveyCompleted) {
                        showClosedSurveyMessage();
                    } else if (isSurveyExpired) {
                        showExpiredSurveyMessage();
                    }
                });
            } else {
                noSurveyMessage.show();
            }
        },
        error: function() {
            surveyLoading.hide();
            showAlert('error', 'Lỗi khi tải câu hỏi khảo sát.');
        }
    });
}

// Prepare all questions from templates
function prepareQuestions() {
    allQuestions = [];
    const invalidTemplate = surveyTemplates.some(template => {
        const content = template.content;
        const questions = Array.isArray(content) ? content : content?.questions
            || Object.values(template.questions_by_criteria || {}).flat();
        return questions.some(question => question.id === undefined || question.id === null || question.id === '');
    });
    if (invalidTemplate) {
        $('#loading-spinner, .actions, #survey-content').hide();
        $('#no-survey-message').text('Mẫu khảo sát chưa sẵn sàng. Vui lòng liên hệ phòng khám để cập nhật mẫu và liên kết khảo sát.').show();
        $('#next').prop('disabled', true);
        showAlert('error', 'Mẫu khảo sát cần được cập nhật. Vui lòng liên hệ phòng khám.');
        return false;
    }

    surveyTemplates.forEach(template => {
        // Handle new structure (content.questions array)
        if (template.content && template.content.questions) {
            template.content.questions.forEach((question) => {
                allQuestions.push({
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
                    allQuestions.push({
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

                allQuestions.push({
                    ...question,
                    template_id: template.id
                });
            });
        }
    });

    // Calculate total questions including subquestions in grid questions
    let totalCount = 0;
    allQuestions.forEach(question => {
        if (question.type === 'multiple_choice_grid' || question.type === 'checkbox_grid') {
            // For grid questions, count each subquestion (row) as a separate question
            const gridRows = question.grid ? question.grid.rows : [];
            totalCount += gridRows.length > 0 ? gridRows.length : 1; // Fallback to 1 if no rows
        } else {
            // For regular questions, count as 1
            totalCount += 1;
        }
    });

    totalQuestions = totalCount;

    // Validate currentQuestionIndex after questions are prepared
    if (currentQuestionIndex >= allQuestions.length) {
        currentQuestionIndex = 0;
        // Clear the corrupted saved index
        const examinationId = localStorage.getItem('current_examination_id');
        if (examinationId) {
            localStorage.removeItem(`survey_current_index_${examinationId}`);
        }
    }
}

// Show specific question
function showQuestion(index) {

    if (index < 0 || index >= allQuestions.length) {
        return;
    }

    // currentQuestionIndex is now managed by button handlers
    const question = allQuestions[index];

    // Update progress
    updateProgress();

    // Render question
    const surveyContent = $('#survey-content');
    const questionHtml = renderSingleQuestion(question, index);

    surveyContent.html(questionHtml);
    surveyContent.show(); // Make sure content is visible

    // Restore previous answer if exists
    restoreAnswer(question.id);
    if (isSurveyClosed || isSurveyCompleted || isSurveyExpired) {
        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
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
    const returnBtn = $('.btn-return-to-view');
    const nextBtn = $('.btn-next-to-view');

    returnBtn.toggleClass('survey-action-hidden', currentQuestionIndex === 0);
    nextBtn.toggleClass('survey-action-hidden', currentQuestionIndex === allQuestions.length - 1);
}

// Render single question
function renderSingleQuestion(question, index, questionNumber = null) {
    const questionId = `q_${question.id}`;
    const questionText = question.text || question.question || '';
    const questionType = question.type || 'multiple_choice';
    const required = question.required || false;

    // Use provided questionNumber or calculate from index
    const qNumber = questionNumber || (index + 1);

    let questionHtml = `
        <section class="card survey-question-card" aria-labelledby="${questionId}">
            <h2 id="${questionId}" class="survey-question-title">
                <span class="survey-question-number">Câu ${qNumber}</span><br>
                <span class="survey-question-text">${questionText}</span>
                ${required ? '<span class="survey-required-mark">*</span>' : ''}
            </h2>
    `;

    // Render based on question type
    switch (questionType) {
        case 'short_answer':
            questionHtml += renderShortAnswerQuestion(question, questionId);
            break;
        case 'paragraph':
            questionHtml += renderParagraphQuestion(question, questionId);
            break;
        case 'multiple_choice':
            questionHtml += renderMultipleChoiceQuestion(question, questionId);
            break;
        case 'checkboxes':
            questionHtml += renderCheckboxesQuestion(question, questionId);
            break;
        case 'dropdown':
            questionHtml += renderDropdownQuestion(question, questionId);
            break;
        case 'linear_scale':
            questionHtml += renderLinearScaleQuestion(question, questionId);
            break;
        case 'multiple_choice_grid':
        case 'checkbox_grid':
            questionHtml += renderGridQuestion(question, questionId);
            break;
        case 'date':
            questionHtml += renderDateQuestion(question, questionId);
            break;
        case 'time':
            questionHtml += renderTimeQuestion(question, questionId);
            break;
        default:
            // Fallback to multiple choice for unknown types
            questionHtml += renderMultipleChoiceQuestion(question, questionId);
    }

    questionHtml += '</section>';
    return questionHtml;
}

// Render Short Answer Question
function renderShortAnswerQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    const maxLengthAttr = characterLimit ? `maxlength="${characterLimit}"` : '';

    let html = `
        <div class="form-group">
            <input type="text"
                   name="${questionId}"
                   id="${questionId}_input"
                   class="form-control"
                   placeholder="Nhập câu trả lời ngắn..."
                   ${disabledAttr}
                   ${maxLengthAttr}>
    `;

    if (characterLimit) {
        html += `
            <div class="character-counter">
                <span class="current-count">0</span>/${characterLimit} ký tự
            </div>
        `;
    }

    html += '</div>';
    return html;
}

// Render Paragraph Question
function renderParagraphQuestion(question, questionId) {
    const characterLimit = question.character_limit;
    const disabledAttr = isSurveyClosed ? 'disabled' : '';
    const maxLengthAttr = characterLimit ? `maxlength="${characterLimit}"` : '';

    let html = `
        <div class="form-group">
            <textarea name="${questionId}"
                      id="${questionId}_textarea"
                      class="form-control"
                      placeholder="Nhập câu trả lời dài..."
                      rows="4"
                      ${disabledAttr}
                      ${maxLengthAttr}></textarea>
    `;

    if (characterLimit) {
        html += `
            <div class="character-counter">
                <span class="current-count">0</span>/${characterLimit} ký tự
            </div>
        `;
    }

    html += '</div>';
    return html;
}

// Render Multiple Choice Question
function renderMultipleChoiceQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
            <div class="group" role="radiogroup" aria-labelledby="${questionId}">
            ${answers.map((answer, answerIndex) => renderRadioOption(answer, questionId, answerIndex, disabledAttr)).join('')}
                ${reviewOrderId === null ? `<div class="note">Mẹo: bấm phím <b>1–${answers.length}</b> để chọn nhanh</div>` : ''}
            </div>
    `;
    return html;
}

// Render Checkboxes Question
function renderCheckboxesQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
        <div class="group" role="group" aria-labelledby="${questionId}">
            ${answers.map((answer, answerIndex) => renderCheckboxOption(answer, questionId, answerIndex, disabledAttr)).join('')}
        </div>
    `;
    return html;
}

// Render Dropdown Question
function renderDropdownQuestion(question, questionId) {
    const answers = question.answers || question.options || [];
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
        <div class="form-group">
            <select name="${questionId}"
                    id="${questionId}_select"
                    class="form-control"
                    ${disabledAttr}>
                <option value="">Chọn một đáp án...</option>
                ${answers.map((answer, answerIndex) => {
                    const answerId = surveyOptionId(answer, answerIndex);
                    const answerText = answer.text || '';
                    return `<option value="${answerId}">${answerText}</option>`;
                }).join('')}
            </select>
        </div>
    `;
    return html;
}

// Render Linear Scale Question
function renderLinearScaleQuestion(question, questionId) {
    const scale = question.linear_scale || { min: 1, max: 5 };
    const lowLabel = scale.low_label || '';
    const highLabel = scale.high_label || '';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    let html = `
        <div class="linear-scale-container">
            <div class="scale-labels">
                <span class="scale-label-text">${lowLabel}</span>
                <span class="scale-label-text">${highLabel}</span>
            </div>
            <div class="scale-options">
    `;

    for (let i = scale.min; i <= scale.max; i++) {
        html += `
            <div class="scale-option">
                <input type="radio"
                       name="${questionId}"
                       id="${questionId}_scale_${i}"
                       value="${i}"
                       ${disabledAttr}>
                <label for="${questionId}_scale_${i}">${i}</label>
            </div>
        `;
    }

    html += `
            </div>
        </div>
    `;
    return html;
}

// Render Grid Question
function renderGridQuestion(question, questionId) {
    const grid = question.grid || { rows: [], columns: [] };
    const isCheckbox = question.type === 'checkbox_grid';
    const inputType = isCheckbox ? 'checkbox' : 'radio';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
        <div class="grid-container">
            <table class="grid-table">
                <thead>
                    <tr>
                        <th class="grid-row-header"></th>
                        ${grid.columns.map(col => `
                            <th class="grid-column-header">
                                ${col.text || col.label || col}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${grid.rows.map((row, rowIndex) => `
                        <tr>
                            <td class="grid-row-label">
                                ${row.text || row}
                            </td>
                            ${grid.columns.map((col, colIndex) => {
                                const cellId = `${questionId}_row_${rowIndex}_col_${colIndex}`;
                                const rowId = row.id || rowIndex.toString();
                                return `
                                    <td class="grid-answer-cell">
                                        <input type="${inputType}"
                                               name="${questionId}_row_${rowIndex}"
                                               id="${cellId}"
                                               value="${surveyOptionId(col, colIndex)}"
                                               data-question-id="${question.id}"
                                               data-row-id="${rowId}"
                                               data-row-index="${rowIndex}"
                                               ${disabledAttr}>
                                    </td>
                                `;
                            }).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    return html;
}

// Render Date Question
function renderDateQuestion(question, questionId) {
    const includeTime = question.include_time || false;
    const inputType = includeTime ? 'datetime-local' : 'date';
    const placeholder = includeTime ? 'Chọn ngày và giờ' : 'Chọn ngày';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
        <div class="form-group">
            <input type="${inputType}"
                   name="${questionId}"
                   id="${questionId}_date"
                   class="form-control"
                   placeholder="${placeholder}"
                   ${disabledAttr}>
        </div>
    `;
    return html;
}

// Render Time Question
function renderTimeQuestion(question, questionId) {
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    const html = `
        <div class="form-group">
            <input type="time"
                   name="${questionId}"
                   id="${questionId}_time"
                   class="form-control"
                   placeholder="Chọn giờ"
                   ${disabledAttr}>
        </div>
    `;
    return html;
}

// Render Radio Option (for Multiple Choice)
function surveyOptionId(answer, index) {
    return answer.id === undefined || answer.id === null || answer.id === '' ? index : answer.id;
}

function renderRadioOption(answer, questionId, index, disabledAttr) {
    const answerId = surveyOptionId(answer, index);
    const answerText = answer.text || '';
    const answerScore = answer.score || answer.value || 0;
    const optionId = `${questionId}_${answerId}`;

    return `
        <div class="opt">
            <input type="radio" name="${questionId}" id="${optionId}" value="${answerId}" data-score="${answerScore}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${answerText}
            </label>
        </div>
    `;
}

// Render Checkbox Option (for Checkboxes)
function renderCheckboxOption(answer, questionId, index, disabledAttr) {
    const answerId = surveyOptionId(answer, index);
    const answerText = answer.text || '';
    const answerScore = answer.score || answer.value || 0;
    const optionId = `${questionId}_${answerId}`;

    return `
        <div class="opt">
            <input type="checkbox" name="${questionId}[]" id="${optionId}" value="${answerId}" data-score="${answerScore}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${answerText}
            </label>
        </div>
    `;
}
