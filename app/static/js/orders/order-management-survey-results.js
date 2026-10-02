import { el } from '../shared/dom.js';
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
		return el('div', { class: 'text-navy p-3' }, 'Không có tiêu chí nào trong mẫu khảo sát');
	}

	// Render each criteria dynamically
	return allCriteria.map(criteriaName => {
		const answers = summary.criteria[criteriaName] || [];
		const score = summary.scores[criteriaName] ?? 'Chưa tính được';

		// Normalize criteria name for use as key (for saving levels)
		const criteriaKey = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
		const inputId = `level-input-${criteriaKey}-${response.id}`;

		return el('div', { class: 'survey-criteria-section' },
			el('div', { class: 'criteria-header' }, criteriaName.toUpperCase()),
			el('div', { class: 'criteria-left' },
				answers.length > 0
					? answers.map(answer => el('div', { class: 'symptom-item' }, `• ${answer.summarized ?? ''}`))
					: el('div', { class: 'text-navy' }, 'Chưa có câu trả lời ghép được với nhóm này')),
			el('div', { class: 'score-display', title: 'Tổng số điểm ghi nhận' },
				el('span', { class: 'score-label' }, 'Tổng số điểm ghi nhận:'), el('span', { class: 'score-value' }, score)),
			el('div', { class: 'level-display' },
				el('label', { class: 'level-label', for: inputId }, 'Mức độ ghi nhận:'),
				' ',
				// Saved through the inline-action registry on change (one handler per element, as the markup had).
				el('input', { type: 'text', class: 'form-control form-control-sm level-input', placeholder: 'Nhập mức độ',
					'data-criteria': criteriaName, 'data-criteria-key': criteriaKey, id: inputId,
					'data-qlpk-call': 'saveSurveyLevelForOrder', 'data-qlpk-args': JSON.stringify([criteriaName, String(response.examination_id), '$this']), 'data-qlpk-on': 'change' }))
		);
	});
}

// Render single survey result card (ONLY the "Kết quả khảo sát" card, no header)
async function renderSingleSurveyResultCard(template, response) {
	if (response.questions_by_criteria) template = {...template, questions_by_criteria: response.questions_by_criteria};
	const completionTimestamp = response.updated_at || response.created_at;
	const completedAt = completionTimestamp ? new Date(completionTimestamp) : null;

	// Only render if we have completed survey
	if (!completedAt || !template.questions_by_criteria) {
		return null;
	}

	return el('div', { class: 'survey-result-card' },
		surveyResultSummary(response.result_summary),
		renderSurveyResultsByCriteria(template, response));
}

export { renderSingleSurveyResultCard };
