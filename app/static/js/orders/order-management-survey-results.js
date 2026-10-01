import { attrJson, escapeHtml } from '../order-management.js';
import { surveyResultSummary } from '../shared/survey-result-summary.js';

function resolveSurveyAnswerText(question, answerValue) {
	const answers = question.answers || question.options || [];
	if (Array.isArray(answerValue)) return answerValue.map(value => resolveSurveyAnswerText(question, value)).join('; ');
	const normalizedValue = normalizeSurveyAnswerValue(answerValue);
	const matchedAnswer = answers.find(answer => hasSurveyAnswerId(answer) && String(answer.id) === String(normalizedValue));
	if (matchedAnswer) return surveyAnswerLabel(matchedAnswer, normalizedValue);

	// Legacy answers without ids are stored by index.
	const numericValue = Number(normalizedValue);
	const indexedAnswer = Number.isInteger(numericValue) && numericValue >= 0 ? answers[numericValue] : null;
	if (indexedAnswer && !hasSurveyAnswerId(indexedAnswer)) return surveyAnswerLabel(indexedAnswer, normalizedValue);
	return 'Không ghép được đáp án';
}

function hasSurveyAnswerId(answer) {
	return answer.id !== undefined && answer.id !== null && answer.id !== '';
}

function normalizeSurveyAnswerValue(answerValue) {
	if (answerValue && typeof answerValue === 'object') return answerValue.answer_id ?? answerValue.value ?? answerValue.id;
	return answerValue;
}

function surveyAnswerLabel(answer, normalizedValue) {
	return answer.text || answer.label || String(normalizedValue);
}

// Summarize patient answers for order management (dynamic criteria support)
function summarizePatientAnswersForOrderManagement(template, response) {
	const summary = {
		criteria: {}, // Dynamic criteria storage
		scores: {}
	};

	if (!template.questions_by_criteria) {
		return summary;
	}

	const totalScores = response.total_scores || {};


	// Process all criteria dynamically from template
	Object.keys(template.questions_by_criteria).forEach(criteria => {
		const questions = template.questions_by_criteria[criteria];

		// Initialize criteria if not exists
		if (!summary.criteria[criteria]) {
			summary.criteria[criteria] = [];
		}

		// Missing score is not a zero score.
		const criteriaScore = Object.prototype.hasOwnProperty.call(totalScores, criteria)
			&& typeof totalScores[criteria] === 'number' && Number.isFinite(totalScores[criteria])
			? totalScores[criteria] : null;
		summary.scores[criteria] = criteriaScore;

		// Process questions for this criteria
		questions.forEach(question => {
			// Fix: Hỗ trợ cả grid questions (dùng question_id hoặc id)
			const rowId = question.question_id ?? question.id;
			const questionIdStr = rowId !== undefined && rowId !== null && rowId !== '' ? String(rowId) : null;

			// Match the exact question identity; never reuse another answer by group prefix.
			let answerValue = null;
			if (response.responses) {
				// Thử tìm trực tiếp bằng question_id hoặc id
				if (questionIdStr && response.responses[questionIdStr] !== undefined) {
					answerValue = response.responses[questionIdStr];
				}
			}

			if (answerValue !== undefined && answerValue !== null) {
				// Resolve both stored answer IDs and numeric answer values.
				const answerText = resolveSurveyAnswerText(question, answerValue);
				const questionText = question.text || question.question || '';
				const remainingText = questionText.replace(/^Tôi\s+/, ''); // Bỏ "Tôi " ở đầu
				const summarizedAnswer = `Bệnh nhân ${answerText} ${remainingText}`;

				summary.criteria[criteria].push({
					question: questionText,
					answer: answerText,
					// Fix: Không dùng answerValue làm score, score đã có trong total_scores
					score: null, // Score per question không cần thiết, đã có criteriaScore ở trên
					summarized: summarizedAnswer
				});
			}
		});
	});

	return summary;
}

// Render survey results by criteria (dynamic criteria support)
function renderSurveyResultsByCriteria(template, response) {
	const summary = summarizePatientAnswersForOrderManagement(template, response);

	// Get all criteria dynamically from template
	const allCriteria = Object.keys(template.questions_by_criteria || {});

	if (allCriteria.length === 0) {
		return '<div class="text-navy p-3">Không có tiêu chí nào trong mẫu khảo sát</div>';
	}

	let html = '';

	// Render each criteria dynamically
	allCriteria.forEach(criteriaName => {
		const answers = summary.criteria[criteriaName] || [];
		const score = summary.scores[criteriaName] ?? 'Chưa tính được';

		// Normalize criteria name for use as key (for saving levels)
		// Use criteria name as-is, but sanitize for HTML id
		const criteriaKey = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');

		// Format title: uppercase and add prefix if needed
		const title = criteriaName.toUpperCase();

        html += `
            <div class="survey-criteria-section">
                <div class="criteria-header">${escapeHtml(title)}</div>
                <div class="criteria-left">
                    ${answers.length > 0 ? answers.map(answer => `<div class="symptom-item">• ${escapeHtml(answer.summarized)}</div>`).join('') : '<div class="text-navy">Chưa có câu trả lời ghép được với nhóm này</div>'}
                </div>
                <div class="score-display" title="Tổng số điểm ghi nhận">
                    <span class="score-label">Tổng số điểm ghi nhận:</span><span class="score-value">${score}</span>
                </div>
                <div class="level-display">
                    <label class="level-label" for="level-input-${criteriaKey}-${response.id}">Mức độ ghi nhận:</label>
                    <input type="text" class="form-control form-control-sm level-input" placeholder="Nhập mức độ"
                        data-criteria="${escapeHtml(criteriaName)}" data-criteria-key="${criteriaKey}"
                        id="level-input-${criteriaKey}-${response.id}"
                        data-qlpk-call="saveSurveyLevelForOrder" data-qlpk-args="${attrJson([criteriaName, String(response.examination_id), '$this'])}" data-qlpk-on="change"
                        data-qlpk-call="updateLevelInputAlignment" data-qlpk-args='["$this"]' data-qlpk-on="input">
                </div>
            </div>`;
	});

	return html;
}

// Render single survey result card (ONLY the "Kết quả khảo sát" card, no header)
async function renderSingleSurveyResultCard(template, response) {
	if (response.questions_by_criteria) template = {...template, questions_by_criteria: response.questions_by_criteria};
	const completionTimestamp = response.updated_at || response.created_at;
	const completedAt = completionTimestamp ? new Date(completionTimestamp) : null;

	// Only render if we have completed survey
	if (!completedAt || !template.questions_by_criteria) {
		return '';
	}

	// Render survey results by criteria (new format matching mockup)
	const criteriaResultsHtml = renderSurveyResultsByCriteria(template, response);

    return `
        <div class="survey-result-card">
            ${surveyResultSummary(response.result_summary)?.outerHTML || ''}
            ${criteriaResultsHtml}
        </div>
    `;
}

export { renderSingleSurveyResultCard };
