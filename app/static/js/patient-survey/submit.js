/* global allQuestions, canProceedSurveyQuestion, checkSessionStatus, clearSurveyResponsesFromStorage, collectTemplateResponses, currentQuestionIndex: writable, displaySurveyTimeInfo, draftStorageKey, draftTimer, flushSurveyDraft, isPreviewMode, isSurveyClosed, isSurveyCompleted: writable, isSurveyExpired, reviewData, reviewOrderId, reviewSummary, showQuestion, surveyResponses, surveySessionData, surveyTemplates, updateProgress */
/* exported submitSurvey */

// Submit survey
function runSurveySubmit1(ctx) {
	ctx.submitBtn = $('#next');
	ctx.originalText = ctx.submitBtn.text();
	// Disable button and show loading
	ctx.submitBtn.prop('disabled', true).text('Đang gửi...');
	const examinationId = localStorage.getItem('current_examination_id');
	const patientId = localStorage.getItem('current_patient_id');
	// Prepare data for each template
	ctx.submissions = [];
	surveyTemplates.forEach(template => {
	    const templateResponses = collectTemplateResponses(template.id);
	    const hasResponses = Object.keys(templateResponses).length > 0;
	    if (hasResponses) {
	        ctx.submissions.push({
	            examination_id: parseInt(examinationId),
	            survey_template_id: parseInt(template.id),
	            patient_id: parseInt(patientId),
	            session_token: new URLSearchParams(window.location.search).get('session_token'),
	            responses: templateResponses
	        });
	    }
	});
	// Submit each template response
	ctx.submittedCount = 0;
	ctx.totalSubmissions = ctx.submissions.length;
}

function runSurveySubmit2(ctx) {
	ctx.submissions.forEach((submission) => {


	    $.ajax({
	        url: '/api/survey-responses/public',
	        method: 'POST',
	        headers: {
	            'Content-Type': 'application/json'
	        },
	        data: JSON.stringify(submission),
	        success: function(response) {
	            ctx.submittedCount++;
	            $('#survey-result-summary').html(window.renderSurveyResultSummary?.(response.data?.result_summary) || '');

	            if (ctx.submittedCount === ctx.totalSubmissions) {
	                // All submissions completed
	                ctx.submitBtn.text('Hoàn thành!');
	                showAlert('success', 'Khảo sát đã được gửi thành công!');

	                // Set flag completed trước
	                isSurveyCompleted = true;
	                clearTimeout(draftTimer);
	                localStorage.removeItem(draftStorageKey());

	                // Update session status to completed và đợi reload session data
	                checkSessionStatus(new URLSearchParams(window.location.search).get('session_token')).then(() => {
	                    // Đảm bảo hiển thị thời gian hoàn thành ngay lập tức
	                    if (surveySessionData) {
	                        displaySurveyTimeInfo();
	                    }
	                });

	                // Clear localStorage since survey is completed
	                clearSurveyResponsesFromStorage();

	                // Update progress TRƯỚC KHI hideActionButtons để đảm bảo progress hiển thị đúng
	                updateProgress();

	                // Hide action buttons and show completion state
	                hideActionButtons();
	            }
	        },
	        error: function() {
	            ctx.submitBtn.prop('disabled', false).text(ctx.originalText);
	            showAlert('error', 'Lỗi khi gửi kết quả khảo sát. Vui lòng thử lại.');
	        }
	    });
	});
}

async function submitSurvey() {
    const ctx = {};
    if (reviewOrderId !== null) return;
    // Check if this is preview mode
    if (isPreviewMode()) {
        // In preview mode, show success message but don't actually submit
        showAlert('success', '🎉 Trải nghiệm hoàn thành! Đây chỉ là chế độ xem trước, dữ liệu không được lưu.');

        // Hide action buttons and show completion state
        hideActionButtons();
        return;
    }
    if (isSurveyClosed) {
        showAlert('info', 'Khảo sát đã được đóng và không thể gửi thêm kết quả.');
        return; // Ngăn chặn gửi nếu khảo sát đã đóng
    }
    if (isSurveyCompleted) {
        showAlert('info', 'Bài khảo sát đã được nộp. Bạn có thể xem lại nhưng không thể gửi thêm.');
        return; // Ngăn chặn gửi nếu khảo sát đã hoàn thành
    }
    if (isSurveyExpired) {
        showAlert('error', 'Khảo sát đã hết hạn và ngừng nhận bài nộp. Vui lòng liên hệ cơ sở y tế nếu cần làm khảo sát mới.');
        return; // Ngăn chặn gửi nếu khảo sát đã hết hạn
    }
    const missingRequired = allQuestions.find(question =>
        !canProceedSurveyQuestion(question, surveyResponses[`q_${question.id}`]));
    if (missingRequired) {
        currentQuestionIndex = allQuestions.indexOf(missingRequired);
        showQuestion(currentQuestionIndex);
        showAlert('error', 'Vui lòng trả lời đủ các câu hỏi bắt buộc trước khi nộp bài.');
        return;
    }
    if (!await flushSurveyDraft()) {
        showAlert('error', 'Chưa đồng bộ được bài khảo sát. Vui lòng kiểm tra thông báo lưu tiến độ.');
        return;
    }
    runSurveySubmit1(ctx);
    if (ctx.totalSubmissions === 0) {
        ctx.submitBtn.prop('disabled', false).text(ctx.originalText);
        showAlert('error', 'Vui lòng trả lời ít nhất một câu hỏi trước khi nộp bài.');
        return;
    }
    runSurveySubmit2(ctx);
}

// Show alert message
function showAlert(type, message) {
    const alertClass = type === 'error' ? 'error' : '';
    const alertHtml = `
        <div class="custom-alert ${alertClass}" role="alert">
            <div class="alert-message">${message}</div>
            <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="alert-close" data-qlpk-call="closeAlert" data-qlpk-args='["$this"]'>×</button>
        </div>
    `;

    // Remove existing alerts
    $('#alert-container').empty();

    // Add new alert
    $('#alert-container').html(alertHtml);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        closeAlert($('.custom-alert .alert-close')[0]);
    }, 5000);
}

// Close alert function
function closeAlert(button) {
    const alert = $(button).closest('.custom-alert');
    alert.addClass('fade-out');
    setTimeout(() => {
        alert.remove();
    }, 300);
}

// Hide action buttons and show completion state
function completionCopy() {
    if (reviewOrderId !== null) return reviewSummary();
    if (isSurveyCompleted) return { title: 'Nộp bài thành công!', text: 'Cảm ơn bạn đã tham gia khảo sát tâm lý. Kết quả đã được gửi đến bác sĩ.' };
    return { title: 'Khảo sát đã kết thúc', text: 'Các câu trả lời đã lưu được giữ lại. Khảo sát không nhận thêm thay đổi.' };
}

function hideActionButtons() {
    // Hide all action buttons
    $('.btn-start-over, .btn-previous, .btn-next, .btn-submit').hide();

    // Show completion message
    const completion = completionCopy();
    const completionHtml = `
        <div class="completion-message">
            <div class="completion-content">
                <div class="completion-icon ${reviewOrderId !== null && reviewData?.review_state !== 'submitted' ? 'completion-icon--pending' : ''}">${reviewOrderId !== null && reviewData?.review_state !== 'submitted' ? '…' : '✓'}</div>
                <div class="completion-text">
                    <h4>${completion.title}</h4>
                    <p>${completion.text}</p>
                </div>
            </div>
            <div class="completion-buttons">
                <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-outline btn-return-to-view ${currentQuestionIndex === 0 ? 'survey-action-hidden' : ''}">Trở lại</button>
                <button type="button" class="btn btn-primary btn-next-to-view ${currentQuestionIndex === allQuestions.length - 1 ? 'survey-action-hidden' : ''}">Tiếp theo</button>
            </div>
        </div>
    `;

    // Replace action buttons with completion message
    $('.actions .row').html(completionHtml);

    // Only disable inputs if survey is closed (not if just completed - allow review)
    if (isSurveyClosed) {
        $('#survey-content input, #survey-content select, #survey-content textarea').prop('disabled', true);
    }

    // KHÔNG gọi updateProgress() ở đây nữa vì đã được gọi trước đó trong showClosedSurveyMessage()
    // Progress sẽ được update trong showQuestion() mỗi khi chuyển câu hỏi

    // Bind events for navigation buttons
    $('.btn-return-to-view').on('click', function() {
        // Go to previous question
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            showQuestion(currentQuestionIndex);
        }
    });

    $('.btn-next-to-view').on('click', function() {
        // Go to next question
        if (currentQuestionIndex < allQuestions.length - 1) {
            currentQuestionIndex++;
            showQuestion(currentQuestionIndex);
        }
    });
}
