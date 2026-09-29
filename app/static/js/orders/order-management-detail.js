/* global apiCall, clearSurveyRealtimeContext, currentOrderDetail: writable, currentSurveySession: writable, escapeHtml, formatDateOnly, initializeSurveyRealtimeContext, loadOrders, orderStatusChangeHandler: writable, refreshCurrentOrderStatus, renderOrderSurveyContent, renderResultFiles, renderSurveyResults, renderSurveySelectionUI, renderTimeline, saveCustomOrderNote: writable, showCustomToast, updateOrderNote */
/* exported currentSurveySession, loadOrderDetail */

// Load order detail
let detailRequestVersion = 0;
let surveyLoadVersion = 0;

async function loadOrderDetail(orderId) {
    const version = ++detailRequestVersion;
    ++surveyLoadVersion;
    clearSurveyRealtimeContext();
    currentOrderDetail = null;
    saveCustomOrderNote = null;
    renderOrderSurveyContent('<p>Đang tải thông tin khảo sát…</p>');
    document.getElementById('orderSurveyActions').replaceChildren();
    try {
        const response = await apiCall(`/api/chi-dinh/${orderId}`);
        if (!response.ok) throw new Error('Không tải được chỉ định');
        const order = await response.json();
        if (version !== detailRequestVersion) return;
        currentOrderDetail = order;
        renderOrderDetailModal(order);
        const modalEl = document.getElementById('orderDetailModal');
        if (!modalEl._detailCloseHandler) {
            modalEl.addEventListener('hide.bs.modal', () => {
                modalEl._detailClosing = true;
                modalEl._closingDetailVersion = detailRequestVersion;
            });
            modalEl._detailCloseHandler = () => {
                modalEl._detailClosing = false;
                // A newer order may already be loading while the close animation ends.
                if (modalEl._closingDetailVersion === detailRequestVersion) {
                    ++detailRequestVersion;
                    ++surveyLoadVersion;
                    clearSurveyRealtimeContext();
                    currentOrderDetail = null;
                    saveCustomOrderNote = null;
                    renderOrderSurveyContent('');
                    document.getElementById('orderSurveyActions').replaceChildren();
                }
                loadOrders();
            };
            modalEl.addEventListener('hidden.bs.modal', modalEl._detailCloseHandler);
        }
        if (modalEl._detailClosing) {
            await new Promise(resolve => { modalEl.addEventListener('hidden.bs.modal', resolve, {once: true}); });
            if (version !== detailRequestVersion) return;
        }
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        await loadOrderSurvey();
        if (version === detailRequestVersion) await initializeSurveyRealtimeContext();
    } catch (error) {
        if (version === detailRequestVersion) showCustomToast('error', 'Không thể tải chi tiết chỉ định. Vui lòng thử lại.');
    }
}

// Render order detail modal
function renderOrderDetailModal(order) {
    document.getElementById('orderDetailName').textContent = order.order_name || 'Chỉ định';
    document.getElementById('orderSurveySection').setAttribute('aria-label', order.survey_template_id ? 'Khảo sát của chỉ định' : 'Kết quả chỉ định');
	const patient = order.patient || {};

	const birthYear = patient.date_of_birth ? new Date(patient.date_of_birth).getFullYear() : null;
	const age = birthYear ? new Date().getFullYear() - birthYear : null;

	// Update patient info
    const patientInfoHtml = `
        <div class="om-patient-summary">
            <div class="om-patient-identity"><span class="om-patient-name">${escapeHtml(patient.full_name || '—')}</span>
            ${age !== null ? `<span class="badge om-patient-age-badge">${age} tuổi</span>` : ''}</div>
            <dl class="om-patient-fields">
                <dt>Điện thoại</dt><dd>${escapeHtml(patient.phone || 'Chưa có')}</dd>
                <dt>Ngày sinh</dt><dd>${formatDateOnly(patient.date_of_birth)}</dd>
                <dt>Ngày ra chỉ định</dt><dd>${formatDateOnly(order.created_at)}</dd>
            </dl>
        </div>`;

	const patientInfoEl = document.getElementById('orderPatientInfo');
	if (patientInfoEl) {
		patientInfoEl.innerHTML = patientInfoHtml;
	}

	// Update order status và setup autosave listener
    document.getElementById('customOrderStatusControls').hidden = Boolean(order.survey_template_id);
	const orderStatusSelect = document.getElementById('orderStatusSelect');
	if (orderStatusSelect) {
		// Remove listener cũ nếu có (tránh duplicate)
		if (orderStatusChangeHandler) {
			orderStatusSelect.removeEventListener('change', orderStatusChangeHandler);
			orderStatusChangeHandler = null;
		}

		// Set value
		orderStatusSelect.value = order.status || 'sent';
        orderStatusSelect.disabled = Boolean(order.survey_template_id) || order.status === 'completed';
        [...orderStatusSelect.options].forEach(option => { option.hidden = ['survey_sent', 'has_result'].includes(option.value) && !order.survey_template_id; });

		// Tạo handler mới và lưu reference
		orderStatusChangeHandler = async function () {
			if (currentOrderDetail) {
				const order = currentOrderDetail;
				const version = detailRequestVersion;
				const newValue = this.value;
				const oldValue = order.status || 'sent';

				// Chỉ lưu nếu giá trị thay đổi
				if (newValue !== oldValue) {
					try {
						this.disabled = true;
						if (saveCustomOrderNote) await saveCustomOrderNote();
						if (version !== detailRequestVersion || currentOrderDetail !== order) return;
						await updateOrderNote(order.id, 'status', newValue);
						if (version !== detailRequestVersion || currentOrderDetail !== order) return;
						order.status = newValue;
						// Reload timeline để hiển thị status mới
						renderTimeline(currentOrderDetail);
					} catch (error) {
						console.error('Error auto-saving status:', error);
						// Revert về giá trị cũ nếu lỗi
						if (version === detailRequestVersion && currentOrderDetail === order) this.value = oldValue;
					} finally {
						if (version === detailRequestVersion && currentOrderDetail === order) this.disabled = order.status === 'completed';
					}
				}
			}
		};

		// Gắn listener mới
		orderStatusSelect.addEventListener('change', orderStatusChangeHandler);
	}

	// Render result files
	renderResultFiles(order.result_files || []);

	// Render timeline from the order lifecycle.
	renderTimeline(order);

	// Survey content is loaded by the detail lifecycle.
}

// Manual orders use the existing result note, independently of survey content.
function renderCustomOrderNote(order) {
    renderOrderSurveyContent(`
        <label class="view-field-label" for="customOrderResultNote">Ghi chú kết quả</label>
        <textarea id="customOrderResultNote" class="form-control" rows="8"
            aria-describedby="customOrderNoteStatus" placeholder="Nhập nội dung xử lý hoặc kết quả chỉ định..."></textarea>
        <div class="om-order-controls mt-2">
            <button data-qlpk-button="execute" data-qlpk-button-variant="solid" type="button" class="qlpk-icon-text-button om-button" id="saveCustomOrderNoteBtn">Lưu ghi chú</button>
            <span id="customOrderNoteStatus" role="status" aria-live="polite">Tự lưu khi rời ô.</span>
        </div>`);
    const input = document.getElementById('customOrderResultNote');
    const feedback = document.getElementById('customOrderNoteStatus');
    const button = document.getElementById('saveCustomOrderNoteBtn');
    const version = detailRequestVersion;
    const isCurrent = () => version === detailRequestVersion && currentOrderDetail === order && input.isConnected;
    let savedValue = order.note_nurse || '';
    let pending = Promise.resolve();
    input.value = savedValue;
    const save = () => {
        const value = input.value;
        pending = pending.catch(() => {}).then(async () => {
            if (value === savedValue) {
                if (isCurrent() && input.value === savedValue) feedback.textContent = 'Đã lưu';
                return;
            }
            if (isCurrent()) feedback.textContent = 'Đang lưu…';
            try {
                await updateOrderNote(order.id, 'note_nurse', value);
                savedValue = value;
                if (isCurrent()) {
                    order.note_nurse = value;
                    feedback.textContent = input.value === value ? 'Đã lưu' : 'Chưa lưu thay đổi mới.';
                }
            } catch (error) {
                if (isCurrent()) feedback.textContent = 'Chưa lưu được. Bấm Lưu ghi chú để thử lại.';
                throw error;
            }
        });
        return pending;
    };
    saveCustomOrderNote = save;
    input.addEventListener('input', () => { feedback.textContent = 'Chưa lưu — tự lưu khi rời ô.'; });
    input.addEventListener('change', () => { save().catch(() => {}); });
    button.addEventListener('click', () => { save().catch(() => {}); });
}

// Load survey content directly as part of the order detail.
const SURVEY_NO_INFO_HTML = '<div class="text-center text-navy py-5"><p>Không có thông tin khảo sát</p></div>';
const SURVEY_NO_EXAMINATION_HTML = '<div class="text-center text-navy py-5"><p>Chưa có lịch khám nào cho chỉ định này</p></div>';

async function loadOrderSurvey() {
    const version = ++surveyLoadVersion;
    const loadingOrderId = currentOrderDetail?.id;
    const isCurrent = () => version === surveyLoadVersion && currentOrderDetail?.id === loadingOrderId;
	if (!currentOrderDetail || !currentOrderDetail.appointment || !currentOrderDetail.appointment.id) {
		renderOrderSurveyContent(SURVEY_NO_INFO_HTML);
		return;
	}
	const appointment = currentOrderDetail.appointment;

	const indicationTemplateId = Number(currentOrderDetail.survey_template_id) || null;
	if (!indicationTemplateId) {
		renderCustomOrderNote(currentOrderDetail);
		return;
	}
	saveCustomOrderNote = null;

	// Show loading
	renderOrderSurveyContent(`
        <div class="text-center text-navy py-5">
            <i class="bi bi-hourglass-split display-4 mb-3 d-block"></i>
            <p>Đang tải thông tin khảo sát...</p>
        </div>
    `);

	try {
		await loadOrderSurveyForTemplate(appointment, indicationTemplateId, isCurrent);
	} catch (error) {
        if (!isCurrent()) return;
		console.error('Error loading survey data:', error);
		renderOrderSurveyContent(`
            <div class="text-center text-danger py-5">
                <i class="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
                <p>Không thể tải thông tin khảo sát. Vui lòng thử lại.</p>
            </div>
        `);
	}
}

async function loadOrderSurveyForTemplate(appointment, indicationTemplateId, isCurrent) {
	const examinationId = await resolveSurveyExaminationId(appointment, isCurrent);
	if (!examinationId || !isCurrent()) return;

	await refreshCurrentOrderStatus();
	if (!isCurrent()) return;
	const templates = await loadIndicationSurveyTemplates(indicationTemplateId, isCurrent);
	if (!templates || !isCurrent()) return;

	const surveySession = await loadSurveySessionStatus(examinationId, isCurrent);
	if (!isCurrent()) return;
	currentSurveySession = surveySession;
	renderTimeline(currentOrderDetail, surveySession);

	// Only fetch and display results if the indication has a survey template
	if (currentOrderDetail.survey_template_id) {
		const allSurveyResponses = await loadExaminationSurveyResponses(examinationId, isCurrent);
		if (!isCurrent()) return;
		// If we have responses, render results
		if (allSurveyResponses.length > 0) {
			await renderSurveyResults(allSurveyResponses, templates, surveySession, appointment, isCurrent);
			return;
		}
	}

	// If no responses OR session not closed yet, show selection UI (with close button if session exists)
	renderSurveySelectionUI(examinationId, templates, surveySession, appointment);
}

// Returns the examination id, or null after rendering "no examination" / when the load is stale.
async function resolveSurveyExaminationId(appointment, isCurrent) {
	const embeddedId = appointment.examinations && appointment.examinations.length > 0 ? appointment.examinations[0].id : null;
	if (embeddedId) return embeddedId;

	// Call endpoint (blueprint has no url_prefix, so route is /examinations/...)
	const examIdResponse = await apiCall(`/examinations/appointment/${appointment.id}/id`);
	if (!isCurrent()) return null;
	if (!examIdResponse.ok) {
		if (examIdResponse.status === 404) {
			renderOrderSurveyContent(SURVEY_NO_EXAMINATION_HTML);
			return null;
		}
		const errorData = await examIdResponse.json().catch(() => ({ detail: 'Lỗi không xác định' }));
		if (!isCurrent()) return null;
		throw new Error(errorData.detail || errorData.error || 'Lỗi khi tải thông tin khám');
	}

	const examIdData = await examIdResponse.json();
	if (!isCurrent()) return null;
	if (!examIdData.examination_id) {
		renderOrderSurveyContent(SURVEY_NO_EXAMINATION_HTML);
		return null;
	}
	return examIdData.examination_id;
}

// The indication is the canonical source for the survey template.
async function loadIndicationSurveyTemplates(indicationTemplateId, isCurrent) {
	const templateResponse = await apiCall(`/api/survey-templates/${indicationTemplateId}/public`);
	if (!isCurrent()) return null;
	if (!templateResponse.ok) {
		throw new Error('Lỗi khi tải mẫu khảo sát');
	}
	const templateData = await templateResponse.json();
	if (!isCurrent()) return null;
	const templates = templateData.data ? [templateData.data] : [];
	if (!templates.length) {
		throw new Error('Không tìm thấy mẫu khảo sát của chỉ định');
	}
	return templates;
}

// No session ('not_started', 404 or a failed request) is a valid state and yields null.
async function loadSurveySessionStatus(examinationId, isCurrent) {
	try {
		const sessionResponse = await apiCall(`/api/survey-sessions/${examinationId}/status?order_id=${currentOrderDetail.id}`);
		if (!isCurrent()) return null;
		if (sessionResponse && sessionResponse.ok) {
			const sessionData = await sessionResponse.json();
			if (!isCurrent()) return null;
			const surveySession = sessionData.data || sessionData;
			return surveySession && surveySession.status === 'not_started' ? null : surveySession;
		}
		if (!sessionResponse || sessionResponse.status !== 404) {
			const status = sessionResponse ? sessionResponse.status : 'unknown';
			console.warn('Error getting survey session status (status:', status, ') - continuing without session');
		}
	} catch (e) {
		// Survey session check failed - this is ok if no session exists
	}
	return null;
}

async function loadExaminationSurveyResponses(examinationId, isCurrent) {
	const surveyResponse = await apiCall(`/api/survey-responses/examination/${examinationId}?order_id=${currentOrderDetail.id}`);
	if (!isCurrent() || !surveyResponse.ok) return [];
	const surveyData = await surveyResponse.json();
	return surveyData.data || surveyData.responses || [];
}
