/* global isSurveyClosed */
/* exported renderCheckboxOption, renderDateQuestion, renderGridQuestion, renderLinearScaleQuestion, renderRadioOption, renderTimeQuestion */
// questions.js: renderDateQuestion, renderTimeQuestion, surveyOptionId, renderRadioOption, renderCheckboxOption, renderGridQuestion, renderLinearScaleQuestion (nạp trước questions.js, cùng scope trang).

// Render Linear Scale Question
function renderLinearScaleQuestion(question, questionId) {
    const scale = question.linear_scale || { min: 1, max: 5 };
    const lowLabel = scale.low_label || '';
    const highLabel = scale.high_label || '';
    const disabledAttr = isSurveyClosed ? 'disabled' : '';

    let html = `
        <div class="linear-scale-container">
            <div class="scale-labels">
                <span class="scale-label-text">${window.QLPKHtml.escape(lowLabel)}</span>
                <span class="scale-label-text">${window.QLPKHtml.escape(highLabel)}</span>
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
                                ${window.QLPKHtml.escape(col.text || col.label || col)}
                            </th>
                        `).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${grid.rows.map((row, rowIndex) => `
                        <tr>
                            <td class="grid-row-label">
                                ${window.QLPKHtml.escape(row.text || row)}
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
                   placeholder="${window.QLPKHtml.escape(placeholder)}"
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
            <input type="radio" name="${questionId}" id="${optionId}" value="${answerId}" data-score="${window.QLPKHtml.escape(answerScore)}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${window.QLPKHtml.escape(answerText)}
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
            <input type="checkbox" name="${questionId}[]" id="${optionId}" value="${answerId}" data-score="${window.QLPKHtml.escape(answerScore)}" ${disabledAttr} />
            <label for="${optionId}">
                <span class="bullet"><i></i></span>
                ${window.QLPKHtml.escape(answerText)}
            </label>
        </div>
    `;
}
