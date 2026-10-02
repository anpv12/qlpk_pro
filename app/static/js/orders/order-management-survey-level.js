import { state } from './order-management-state.js';
import { apiCall, showCustomToast } from '../order-management.js';
import { refreshCurrentOrderStatus, renderTimeline } from './order-management-actions.js';
import { loadOrderSurvey } from './order-management-detail.js';
import { QLPKInlineActions } from '../shared/inline-actions.js';

// Function để cập nhật alignment của input dựa trên giá trị (số thì căn phải, text thì căn trái)
function updateLevelInputAlignment(inputElement) {
	if (!inputElement) return;

	const value = inputElement.value.trim();

	// Kiểm tra nếu là số (có thể parse thành số và không chứa chữ cái)
	// Cho phép số nguyên, số thập phân, có thể có dấu + hoặc - ở đầu
	const isNumber = /^[+-]?\d+(\.\d+)?$/.test(value);

	if (isNumber && value !== '') {
		inputElement.classList.add('number-aligned');
	} else {
		inputElement.classList.remove('number-aligned');
	}
}

// Function để lưu mức độ ghi nhận cho từng tiêu chí (dynamic criteria support)
async function saveSurveyLevelForOrder(criteriaName, examinationId, inputElement) {
	if (!examinationId) {
		showCustomToast('error', 'Không tìm thấy thông tin lượt khám');
		return;
	}

	if (!inputElement) {
		return;
	}

	// Tránh gọi API liên tục khi đang lưu
	if (inputElement.dataset.saving === '1') {
		return;
	}

	const levelValue = inputElement.value.trim();
	// Nếu bỏ trống thì không lưu, tránh spam toast
	if (!levelValue) {
		return;
	}

	try {
		inputElement.dataset.saving = '1';

		// Use criteria name (from data-criteria attribute) to create field name
		// Normalize criteria name for field_name: lowercase, replace spaces with underscores
		const normalizedCriteriaName = criteriaName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
		const fieldName = `survey_level_${normalizedCriteriaName}`;

		const data = {
			[fieldName]: levelValue,
			criteria_name: criteriaName // Store original criteria name for reference
		};

		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(data)
		});

		if (response.ok) {
			showCustomToast('success', `Đã lưu mức độ ghi nhận: ${levelValue}`);
		} else {
			showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
		}
	} catch (error) {
		console.error('Error saving survey level:', error);
		showCustomToast('error', 'Không thể lưu mức độ ghi nhận. Vui lòng thử lại.');
	} finally {
		delete inputElement.dataset.saving;
	}
}

// Function để lưu mức độ ghi nhận (old format - keep for backward compatibility)

// Function để load mức độ ghi nhận đã lưu (dynamic criteria support)
async function loadSavedSurveyLevels(examinationId) {
    const orderId = state.currentOrderDetail?.id;
	if (!examinationId) {
		return;
	}

	try {
		const response = await apiCall(`/api/examination-details/${examinationId}/section/survey_levels`);

		if (response.ok) {
			const data = await response.json();
            if (state.currentOrderDetail?.id !== orderId) return;
			if (data && data.data && Array.isArray(data.data)) {
				// Load old format (survey_level) for backward compatibility
				const surveyLevelItem = data.data.find(item => item.field_name === 'survey_level');
				const inputElement = surveyLevelItem ? document.getElementById('level-input-survey') : null;
				if (inputElement) {
					inputElement.value = surveyLevelItem.field_value;
					// Update alignment sau khi set value
					updateLevelInputAlignment(inputElement);
				}

				// Load all survey_level_* fields dynamically
				// Find all fields that start with "survey_level_"
				const surveyLevelFields = data.data.filter(item =>
					item.field_name && item.field_name.startsWith('survey_level_')
				);

				surveyLevelFields.forEach(fieldItem => {
					// Extract criteria key from field_name (e.g., "survey_level_depression" -> "depression")
					const criteriaKey = fieldItem.field_name.replace(/^survey_level_/, '');

					// Find all input elements for this criteria
					// Match by data-criteria-key attribute or id pattern
					const inputElements = document.querySelectorAll(
						`input[data-criteria-key="${criteriaKey}"], input[id^="level-input-${criteriaKey}-"]`
					);

					inputElements.forEach(input => {
						input.value = fieldItem.field_value;
						// Update alignment sau khi set value
						updateLevelInputAlignment(input);
					});
				});
			}
		}
	} catch (error) {
		console.error('Error loading saved survey levels:', error);
		// Không hiển thị lỗi vì có thể chưa có dữ liệu
	}
}

// Copy survey link to clipboard
function copySurveyLink() {
	const urlInput = document.getElementById('surveyLinkInput');
	if (!urlInput || !urlInput.value) {
		showCustomToast('error', 'Không có link để copy');
		return;
	}

	urlInput.select();
	urlInput.setSelectionRange(0, 99999); // For mobile devices

	try {
		document.execCommand('copy');
		showCustomToast('success', 'Đã copy link khảo sát!');
	} catch (err) {
		// Fallback for modern browsers
		navigator.clipboard.writeText(urlInput.value).then(function () {
			showCustomToast('success', 'Đã copy link khảo sát!');
		}).catch(function () {
			showCustomToast('error', 'Không thể copy link');
		});
	}
}

// Initialize survey context for realtime status updates
async function initializeSurveyRealtimeContext() {
	clearSurveyRealtimeContext();
    const orderId = state.currentOrderDetail?.id;

	// Get examination_id from current order detail
	if (!state.currentOrderDetail || !state.currentOrderDetail.appointment) {
		return;
	}

	const appointment = state.currentOrderDetail.appointment;
	const appointmentId = appointment.id;

	if (!appointmentId) {
		return;
	}

	// Get examination_id
	let examinationId = null;
	if (appointment.examinations && appointment.examinations.length > 0) {
		examinationId = appointment.examinations[0].id;
	} else {
		try {
			const examIdResponse = await apiCall(`/examinations/appointment/${appointmentId}/id`);
			if (examIdResponse.ok) {
				const examIdData = await examIdResponse.json();
				examinationId = examIdData.examination_id || examIdData.id;
			}
		} catch (error) {
			console.error('Error getting examination ID for survey realtime context:', error);
			return;
		}
	}

	if (!examinationId) {
		return;
	}

	if (state.currentOrderDetail?.id !== orderId) return;
	state.currentExaminationId = examinationId;
	state.lastKnownSurveyStatus = null;

	await checkSurveyStatusUpdate(examinationId);
}

function clearSurveyRealtimeContext() {
	state.lastKnownSurveyStatus = null;
	state.currentExaminationId = null;
	state.currentSurveySession = null;
}

// Check survey status and reload if changed
async function applySurveyStatusUpdate(orderId, surveySession) {
	await refreshCurrentOrderStatus();
	if (state.currentOrderDetail?.id !== orderId) return;
	const currentStatus = state.currentOrderDetail.status;
	const previousStatus = state.lastKnownSurveyStatus;
	state.currentSurveySession = surveySession;
	if (state.currentOrderDetail) renderTimeline(state.currentOrderDetail, surveySession);

	// Check if status has changed
	state.lastKnownSurveyStatus = currentStatus;
	if (previousStatus === null) return;

	if (previousStatus !== currentStatus) {
		await loadOrderSurvey();
		if (state.currentOrderDetail?.id === orderId && ['has_result', 'completed'].includes(currentStatus)) {
			showCustomToast('success', currentStatus === 'has_result' ? 'Khảo sát đã có kết quả.' : 'Chỉ định đã hoàn thành.');
		}
	}
}

async function checkSurveyStatusUpdate(examinationId) {
    const orderId = state.currentOrderDetail?.id;
    if (!orderId) return;
	try {
		// Check if modal is still open
		const modalEl = document.getElementById('orderDetailModal');
		if (!modalEl || !modalEl.classList.contains('show')) {
			clearSurveyRealtimeContext();
			return;
		}

		// Get current survey session status
		const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status?order_id=${orderId}`);

		if (!sessionResponse || !sessionResponse.ok) {
			// No session exists yet.
			return;
		}

		const sessionData = await sessionResponse.json();
        if (state.currentOrderDetail?.id !== orderId) return;
		const surveySession = sessionData.data || sessionData;

		if (!surveySession || surveySession.status === 'not_started') {
			// No active session yet.
			state.currentSurveySession = null;
			if (state.currentOrderDetail) renderTimeline(state.currentOrderDetail, null);
			return;
		}

		await applySurveyStatusUpdate(orderId, surveySession);
	} catch (error) {
		// Silently handle errors - don't spam console.
	}
}


QLPKInlineActions.register({ saveSurveyLevelForOrder, updateLevelInputAlignment });

export { checkSurveyStatusUpdate, clearSurveyRealtimeContext, copySurveyLink, initializeSurveyRealtimeContext, loadSavedSurveyLevels };
