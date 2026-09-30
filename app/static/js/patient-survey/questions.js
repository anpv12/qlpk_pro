/* global allQuestions: writable, bindQuestionEvents, currentQuestionIndex: writable, isSurveyClosed, isSurveyCompleted, isSurveyExpired, loadExistingResponses, loadSessionSurveyDraft, renderCheckboxOption, renderDateQuestion, renderGridQuestion, renderLinearScaleQuestion, renderRadioOption, renderTimeQuestion, restoreAnswer, reviewOrderId, showAlert, showClosedSurveyMessage, showExpiredSurveyMessage, surveyOptionId, surveyTemplates: writable, totalQuestions: writable, updateNavigationButtons, updateProgress */
/* exported loadSurveyTemplates, totalQuestions */
// Parts (nạp trước file này): answer-renderers.js

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
                <span class="survey-question-text">${window.QLPKHtml.escape(questionText)}</span>
                ${required ? '<span class="survey-required-mark">*</span>' : ''}
            </h2>
    `;

    // Render based on question type (unknown types fall back to multiple choice)
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
    const render = Object.prototype.hasOwnProperty.call(renderers, questionType) ? renderers[questionType] : renderMultipleChoiceQuestion;
    questionHtml += render(question, questionId);

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
                    return `<option value="${answerId}">${window.QLPKHtml.escape(answerText)}</option>`;
                }).join('')}
            </select>
        </div>
    `;
    return html;
}

