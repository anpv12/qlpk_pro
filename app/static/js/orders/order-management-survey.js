import { el, replace } from '../shared/dom.js';
import { state } from './order-management-state.js';
import { apiCall, formatDisplayDate, getStatusBadge, loadOrders, showConfirmDialog, showCustomToast } from '../order-management.js';
import { copySurveyLink, loadSavedSurveyLevels } from './order-management-survey-level.js';
import { loadOrderSurvey } from './order-management-detail.js';
import { refreshCurrentOrderStatus } from './order-management-actions.js';
import { renderSingleSurveyResultCard } from './order-management-survey-results.js';

// Render the survey section
function renderOrderSurveyContent(content, qrCode = '') {
    const qr = document.getElementById('orderProgressQR');
    qr.hidden = !qrCode;
    replace(qr, qrCode ? el('img', { src: qrCode, alt: 'Mã QR mở link khảo sát', class: 'om-survey-qr' }) : null);
	try {
		const surveyContent = document.getElementById('surveyContent');
		if (!surveyContent) {
			console.warn('Survey content element not found when rendering');
			return;
		}
		replace(surveyContent, content);
	} catch (error) {
		console.error('Error rendering survey content:', error);
	}
}

function renderSurveyActions(examinationId, patientId, hasResult = false, hasLink = false) {
    const order = state.currentOrderDetail;
    const target = document.getElementById('orderSurveyActions');
    if (!order?.survey_template_id) { target.replaceChildren(); return; }
    const buttonIcon = name => el('i', { class: `bi ${name} qlpk-button-icon`, 'aria-hidden': 'true' });
    replace(target,
        !hasResult && order.status !== 'completed'
            ? el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'qlpk-icon-text-button om-button', id: 'sendSurveyLinkBtn' },
                buttonIcon('bi-link-45deg'), hasLink ? 'Tạo lại link khảo sát' : 'Tạo link khảo sát')
            : null,
        ' ',
        el('a', { class: 'qlpk-icon-text-button om-button', id: 'viewSurveyResultBtn', href: `/patient-survey.html?review_order_id=${order.id}`, target: '_blank', rel: 'noopener' },
            buttonIcon('bi-eye'), 'Xem kết quả'),
        ' ',
        order.status !== 'completed'
            ? el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: 'qlpk-icon-text-button om-button om-button--danger', id: 'closeSurveySessionBtn' },
                buttonIcon('bi-lock'), 'Kết thúc khảo sát')
            : null);
    document.getElementById('sendSurveyLinkBtn')?.addEventListener('click', () => sendSurveyLink(examinationId, patientId, order.survey_template_id));
    document.getElementById('closeSurveySessionBtn')?.addEventListener('click', () => closeSurveySession());
}

// Render survey selection UI (when no survey results yet)
function renderSurveySelectionUI(examinationId, templates, surveySession) {
	const patient = state.currentOrderDetail.patient || {};
	const patientId = patient.id;

	// Get survey session details (URL and QR code)
	let surveyUrl = '';
	let qrCode = '';
	let expiresAt = '';

	if (surveySession) {
		// Get URL and QR from survey session
		surveyUrl = surveySession.survey_url || surveySession.url || '';
		qrCode = surveySession.qr_code || '';


		if (surveySession.expires_at) {
			const expDate = new Date(surveySession.expires_at);
			expiresAt = expDate.toLocaleString('vi-VN');
		}
	}

	// The template linked to this indication is the source of the displayed name.
	const linkedTemplate = templates[0];

	// QR and link section
	const accessSection = surveyUrl ? el('div', { class: 'om-survey-access' },
		el('div', { class: 'om-survey-access-link' },
			el('h6', { class: 'fw-semibold mb-3' }, el('i', { class: 'bi bi-link-45deg me-2' }), 'Link khảo sát'),
			el('div', { class: 'input-group mb-2' },
				el('input', { type: 'text', class: 'form-control form-control-sm om-survey-link-input', id: 'surveyLinkInput', defaultValue: surveyUrl, readonly: true }),
				el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', class: 'qlpk-icon-action qlpk-icon-action--view', type: 'button', id: 'copySurveyLinkBtn', title: 'Sao chép link khảo sát', 'aria-label': 'Sao chép link khảo sát' },
					el('i', { class: 'bi bi-clipboard', 'aria-hidden': 'true' }))
			),
			expiresAt ? el('small', { class: 'text-navy' }, `Hết hạn: ${expiresAt}`) : null
		)
	) : null;

    renderSurveyActions(examinationId, patientId, false, Boolean(surveyUrl));
    const content = [
        el('div', { class: 'om-survey-heading' }, el('div', null,
            el('h3', null, 'Khảo sát ', el('span', { id: 'orderSurveyStatus' }, getStatusBadge(state.currentOrderDetail.status))),
            el('p', { class: 'om-survey-helper-text' }, `Mẫu: ${linkedTemplate.name || '—'}`))),
        state.currentOrderDetail.status === 'completed'
            ? el('p', { class: 'om-survey-empty' }, 'Chưa có bài nộp. Bấm “Xem kết quả” để xem phần trả lời đã lưu.')
            : accessSection || el('p', { class: 'om-survey-empty' }, 'Chưa tạo link khảo sát. Bấm “Tạo link khảo sát” để bệnh nhân bắt đầu làm bài.')
    ];

	renderOrderSurveyContent(content, state.currentOrderDetail.status !== 'completed' && surveyUrl ? qrCode : '');

    document.getElementById('copySurveyLinkBtn')?.addEventListener('click', copySurveyLink);
}

// Send survey link
function surveyTemplateError(templateId) {
	if (!templateId) return 'Vui lòng chọn mẫu khảo sát';
	const linkedTemplateId = Number(state.currentOrderDetail?.survey_template_id) || null;
	if (linkedTemplateId && Number(templateId) !== linkedTemplateId) return 'Mẫu khảo sát không khớp với chỉ định.';
	return '';
}

async function sendSurveyLink(examinationId, patientId, templateId) {
    const orderId = state.currentOrderDetail?.id;
    if (!orderId) return;
	try {
		const templateError = surveyTemplateError(templateId);
		if (templateError) {
			showCustomToast('error', templateError);
			return;
		}

		showCustomToast('info', 'Đang tạo link khảo sát...');

		// Send template_id to API so it can be included in the survey URL
		const response = await apiCall('/api/survey-sessions/generate', {
			method: 'POST',
			body: JSON.stringify({
				patient_id: patientId,
				examination_id: examinationId,
				template_id: templateId,
                order_id: orderId
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ message: 'Lỗi không xác định' }));
			if (errorData.code === 'SURVEY_TEMPLATE_INVALID') {
				showCustomToast('error', 'Mẫu khảo sát chưa đủ cấu hình điểm. Vui lòng kiểm tra lại.');
				return;
			}
			throw new Error(errorData.message || 'Lỗi khi tạo link khảo sát');
		}

		const data = await response.json();
		showCustomToast('success', data.success && data.data ? 'Link khảo sát đã sẵn sàng.' : 'Đã tạo link khảo sát thành công');

		// Clear any previous response data and reload survey content
		// This ensures the section shows the selection UI instead of results
		if (state.currentOrderDetail?.id === orderId) await loadOrderSurvey();

	} catch (error) {
		console.error('Error sending survey link:', error);
		showCustomToast('error', 'Không thể tạo link khảo sát. Vui lòng thử lại.');
	}
}

// Close survey session
async function closeSurveySession() {
	const orderId = state.currentOrderDetail?.id;
	if (!orderId) return;
	try {
		const confirmed = await showConfirmDialog({title: 'Kết thúc khảo sát', text: 'Chỉ định sẽ chuyển sang Hoàn thành và ngừng nhận bài nộp. Kết quả đã có vẫn được giữ nguyên.', confirmText: 'Kết thúc khảo sát', variant: 'warning'});
		if (!confirmed) {
			return;
		}

		showCustomToast('info', 'Đang kết thúc khảo sát...');

		// Call close API
		const closeResponse = await apiCall(`/api/chi-dinh/${orderId}/finish-survey`, {
			method: 'POST'
		});

		if (!closeResponse.ok) {
			const errorData = await closeResponse.json().catch(() => ({ message: 'Lỗi không xác định' }));
			throw new Error(errorData.message || 'Lỗi khi kết thúc khảo sát');
		}

		const closeData = await closeResponse.json();

		if (closeData.success) {
			showCustomToast('success', 'Khảo sát đã được kết thúc thành công');



			// Reload survey content - will now show results if available
			await loadOrders();
			if (state.currentOrderDetail?.id === orderId) {
				await refreshCurrentOrderStatus();
				await loadOrderSurvey();
			}
		} else {
			showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
		}

	} catch (error) {
		console.error('Error closing survey session:', error);
		showCustomToast('error', 'Không thể kết thúc khảo sát. Vui lòng thử lại.');
	}
}

// Render survey results with full UI (header + dropdown + results)
// Drop duplicate responses (by id, else template/timestamps) and sort ALL by creation date, latest first.
function uniqueResponsesLatestFirst(surveyResponses) {
	const seenResponseIds = new Set();
	const uniqueResponses = surveyResponses.filter(response => {
		const responseId = response.id || `${response.survey_template_id}_${response.created_at}_${response.updated_at}`;
		if (seenResponseIds.has(responseId)) return false;
		seenResponseIds.add(responseId);
		return true;
	});
	uniqueResponses.sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
	return uniqueResponses;
}

function buildSurveyResultHeading(latestTemplate) {
	const expires = state.currentOrderDetail.status !== 'completed' && state.currentOrderDetail.survey_expires_at
		? el('p', { class: 'om-survey-helper-text' }, `Hết hạn: ${formatDisplayDate(state.currentOrderDetail.survey_expires_at)}`) : null;
	return el('div', { class: 'om-survey-heading' },
		el('div', null,
			el('h3', null, 'Kết quả khảo sát ', el('span', { id: 'orderSurveyStatus' }, getStatusBadge(state.currentOrderDetail.status))),
			el('p', { class: 'om-survey-helper-text' }, `Mẫu: ${latestTemplate.name || '—'}`)),
		expires);
}

async function renderSurveyResults(surveyResponses, templates, surveySession, appointment, isCurrent = () => true) {
	if (!surveyResponses || surveyResponses.length === 0) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	// Debug log


	const uniqueResponses = uniqueResponsesLatestFirst(surveyResponses);
	const indicationTemplateId = Number(state.currentOrderDetail?.survey_template_id) || null;
	const linkedResponses = indicationTemplateId
		? uniqueResponses.filter(response => Number(response.survey_template_id) === indicationTemplateId)
		: [];

	// Debug: Log all responses with their template_id and total_scores


	const latestResponse = linkedResponses[0] || null;

	if (!latestResponse) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	const latestTemplate = templates.find(template => Number(template.id) === indicationTemplateId);

	if (!latestTemplate) {
		renderSurveySelectionUI(null, templates, surveySession, appointment);
		return;
	}

	// Debug: Log template match

    renderSurveyActions(latestResponse.examination_id, state.currentOrderDetail.patient?.id, true);
	// Render chỉ 1 card cho response mới nhất
	const card = await renderSingleSurveyResultCard(latestTemplate, latestResponse);
    if (!isCurrent()) return;
	renderOrderSurveyContent(el('div', null, buildSurveyResultHeading(latestTemplate), card));

	// Load saved survey levels after content is in DOM
	setTimeout(() => {
		if (isCurrent()) loadSavedSurveyLevels(latestResponse.examination_id);
	}, 150);


}

export { renderOrderSurveyContent, renderSurveyResults, renderSurveySelectionUI };
