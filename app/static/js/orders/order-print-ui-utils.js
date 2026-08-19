(function () {
	'use strict';

	function renderPerformerOptions(groups, deps = {}) {
		const doc = deps.document || document;
		const escapeHtml = deps.escapeHtml || ((value) => String(value ?? ''));
		const container = doc.getElementById('performerOptionsContainer');
		if (!container) return;

		if (!groups || groups.length === 0) {
			container.innerHTML = '<div class="alert alert-warning">Không có chỉ định nào để in.</div>';
			return;
		}

		container.innerHTML = groups.map((group, index) => {
			const performerId = `performer_${index}`;
			const orderList = group.orders.map(order =>
				`<div class="order-preview-item">${escapeHtml(order.order_name || '')}</div>`
			).join('');

			return `
			<div class="performer-option" onclick="selectPerformerOption('${performerId}')">
				<label class="performer-option__label">
					<input class="performer-option__radio" type="radio" name="selectedPerformer" id="${performerId}" value="${escapeHtml(group.performerName)}" onchange="updatePrintButtonState()">
					<span class="performer-name performer-option__name">
						${escapeHtml(group.performerName)}
					</span>
					<span class="performer-count performer-option__count">
						<span class="badge performer-option__badge">
							${group.count} chỉ định
						</span>
					</span>
				</label>
				<div class="order-preview performer-option__preview">
					${orderList}
				</div>
			</div>
		`;
		}).join('');
	}

	function selectPerformerOption(performerId, deps = {}) {
		const doc = deps.document || document;
		const radio = doc.getElementById(performerId);
		if (radio) {
			radio.checked = true;
			if (typeof deps.updatePrintButtonState === 'function') deps.updatePrintButtonState();
			if (typeof deps.updateSelectedState === 'function') deps.updateSelectedState();
		}
	}

	function updateSelectedState(deps = {}) {
		const doc = deps.document || document;
		const options = doc.querySelectorAll('.performer-option');
		options.forEach(option => {
			const radio = option.querySelector('input[type="radio"]');
			option.classList.toggle('is-selected', Boolean(radio && radio.checked));
		});
	}

	function updatePrintButtonState(deps = {}) {
		const doc = deps.document || document;
		const selectedRadio = doc.querySelector('input[name="selectedPerformer"]:checked');
		const btnPrint = doc.getElementById('btnPrintSelectedPerformer');

		if (btnPrint) {
			btnPrint.disabled = !selectedRadio;
		}

		if (typeof deps.updateSelectedState === 'function') deps.updateSelectedState();
	}

	function renderOrderPrintPreview(selectedOrders, deps = {}) {
		const doc = deps.document || document;
		const escapeHtml = deps.escapeHtml || ((value) => String(value ?? ''));
		const formatDisplayDate = deps.formatDisplayDate || ((value) => value || '');
		const getOrderFacilityLabel = deps.getOrderFacilityLabel || (() => 'Trong cơ sở');
		const container = doc.getElementById('orderPrintPreview');
		const emptyEl = doc.getElementById('orderPrintEmptyState');
		if (!container || !emptyEl) return;

		if (!selectedOrders || !selectedOrders.length) {
			container.innerHTML = '';
			emptyEl.classList.remove('d-none');
			return;
		}

		emptyEl.classList.add('d-none');
		const groupedByDate = new Map();
		selectedOrders.forEach((order) => {
			const dateKey = order.scheduled_for || '';
			if (!groupedByDate.has(dateKey)) {
				groupedByDate.set(dateKey, new Map());
			}
			const facilityLabel = getOrderFacilityLabel(order);
			const facilityGroup = groupedByDate.get(dateKey);
			if (!facilityGroup.has(facilityLabel)) {
				facilityGroup.set(facilityLabel, []);
			}
			facilityGroup.get(facilityLabel).push(order);
		});

		container.innerHTML = Array.from(groupedByDate.entries())
			.sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
			.map(([dateKey, facilityMap]) => {
				const formattedDate = formatDisplayDate(dateKey) || 'Chưa xác định';
				const facilities = Array.from(facilityMap.entries())
					.map(([facility, orders]) => {
						const names = orders.map(item => escapeHtml(item.order_name || '')).join(', ');
						return `<li><strong>${escapeHtml(facility)}</strong>: ${names}</li>`;
					})
					.join('');
				return `
                <div class="order-print-day">
                    <h6>${formattedDate}</h6>
                    <ul>${facilities}</ul>
                </div>
            `;
			})
			.join('');
	}

	function getClinicalPrintConfig(context = 'doctor') {
		if (context === 'psychologist') {
			return {
				fallbackProviderName: 'Tâm lý gia',
				providerName: appointment => appointment?.psychologist?.name || appointment?.psychologist_name || appointment?.psychologist?.full_name || 'Tâm lý gia',
				clinicalLabel: 'TRIỆU CHỨNG VÀ HÀNH VI HIỆN TẠI',
				clinicalText: appointment => appointment?.examination?.trieu_chung_va_hanh_vi_hien_tai || '',
				fallbackExamination: (appointment, examination, weight) => ({
					trieu_chung_va_hanh_vi_hien_tai: examination?.trieu_chung_va_hanh_vi_hien_tai || appointment?.examination?.trieu_chung_va_hanh_vi_hien_tai || '',
					weight
				}),
				printProfile: 'psychologist'
			};
		}

		return {
			fallbackProviderName: 'Bác sĩ',
			providerName: appointment => appointment?.doctor?.name || appointment?.doctor_name || appointment?.doctor?.full_name || 'Bác sĩ',
			clinicalLabel: 'Chẩn đoán',
			clinicalText: appointment => appointment?.examination?.diagnosis ||
				appointment?.diagnosis?.diagnosis ||
				appointment?.diagnosis?.main_disease ||
				appointment?.diagnosis_text || '',
			fallbackExamination: (appointment, examination, weight) => ({
				diagnosis: examination?.diagnosis || appointment?.examination?.diagnosis || appointment?.diagnosis?.diagnosis || appointment?.diagnosis?.main_disease || appointment?.diagnosis_text || '',
				weight
			}),
			printProfile: 'doctor'
		};
	}

	function buildOrderRowsHtml(ordersData, deps = {}) {
		const escapeHtml = deps.escapeHtml || ((value) => String(value ?? ''));
		const rows = [];
		if (ordersData && ordersData.length > 0) {
			ordersData.forEach((order, index) => {
				rows.push(`
                    <tr>
                        <td>${index + 1}</td>
                        <td>${escapeHtml(order.order_name || '')}</td>
                    </tr>
                `);
			});
		}
		return rows;
	}

	function buildOrdersTableHtml(ordersData, deps = {}) {
		const orderRows = buildOrderRowsHtml(ordersData, deps);
		return orderRows.length > 0 ? `
		<table class="prescription-preview-table">
			<colgroup>
				<col class="order-print-col-index">
				<col class="order-print-col-name">
			</colgroup>
			<thead>
				<tr>
					<th class="order-print-table-heading">STT</th>
					<th class="order-print-table-heading">Chỉ định</th>
				</tr>
			</thead>
            <tbody>${orderRows.join('')}</tbody>
        </table>
    ` : `
        <div class="text-muted fst-italic">Chưa có chỉ định nào.</div>
    `;
	}

	function buildOrderFormHTML(data = {}, deps = {}) {
		const appointment = data.appointment || {};
		const patient = data.patient || {};
		const clinicalConfig = getClinicalPrintConfig(deps.clinicalContext);
		const formatVietnamDate = deps.formatVietnamDate || (value => value ? String(value) : '');
		const calculateDetailedAge = deps.calculateDetailedAge || (() => ({ text: '' }));
		const buildFullAddressFromParts = deps.buildFullAddressFromParts || (() => '');
		const formatGenderDisplay = deps.formatGenderDisplay || (value => value || '');
		const escapeHtml = deps.escapeHtml || ((value) => String(value ?? ''));
		const getClinicInfoConfig = deps.getClinicInfoConfig || (() => ({}));

		const examinationDate = appointment?.appointment_date ? new Date(appointment.appointment_date) : new Date();
		const examinationDateText = formatVietnamDate(examinationDate);
		const providerName = clinicalConfig.providerName(appointment) || clinicalConfig.fallbackProviderName;
		const clinicalText = clinicalConfig.clinicalText(appointment);
		const patientAddress = buildFullAddressFromParts(
			patient?.address_detail,
			patient?.ward,
			patient?.district,
			patient?.province
		) || patient?.address || '';
		const patientPhone = patient?.phone || patient?.phone_number || appointment?.patient_phone || '';
		const ageDetail = calculateDetailedAge(patient?.date_of_birth || appointment?.patient_date_of_birth, appointment?.appointment_date || examinationDate);
		const ageText = patient?.date_of_birth || appointment?.patient_date_of_birth
			? `${formatVietnamDate(patient.date_of_birth || appointment.patient_date_of_birth)} — ${ageDetail.text}`
			: '';
		const genderValue = patient?.gender || appointment?.patient_info?.gender || appointment?.patient_gender || '';
		const genderDisplay = formatGenderDisplay(genderValue);
		const patientName = patient?.full_name || appointment?.patient_full_name || appointment?.patient_info?.full_name || '';

		let weightDisplay = appointment?.examination?.weight || patient?.weight || appointment?.patient_info?.weight || appointment?.patient_weight || '';
		if (weightDisplay && typeof weightDisplay === 'number') {
			weightDisplay = weightDisplay.toString();
		}

		const clinic = data.clinicInfo || getClinicInfoConfig();
		const today = new Date();
		const todayText = `Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;
		const openingHours = clinic.opening_hours || clinic.openingHours || clinic.hours || '';
		const ordersTable = buildOrdersTableHtml(data.ordersData, { escapeHtml });

		return `
        <div class="prescription-preview">
			<div class="prescription-preview__header">
				<div>
					<div class="clinic-name">${clinic.name || 'Phòng khám'}</div>
					<div>${providerName}</div>
					<div class="order-print-clinic-line">
						<i class="bi bi-telephone-fill order-print-clinic-icon"></i>
						<span>Điện thoại: ${clinic.phone || ''}</span>
					</div>
				</div>
				<div class="text-end">
					<div class="clinic-name order-print-clinic-line order-print-clinic-line--end">
						<i class="bi bi-geo-alt-fill order-print-clinic-icon"></i>
						<span>Địa chỉ: ${clinic.address || ''}</span>
					</div>
                    <div>${openingHours ? `Giờ làm việc: ${openingHours}` : ''}</div>
                    <div>Ngày khám: ${examinationDateText || ''}</div>
                </div>
			</div>
			<h3 class="prescription-preview__title">PHIẾU CHỈ ĐỊNH</h3>
			${data.performerName ? `<div class="order-print-performer-block">
				<strong>Thực hiện:</strong> ${escapeHtml(data.performerName)}
			</div>` : ''}
            <div class="prescription-preview__patient-info">
                <div class="prescription-preview__patient-info-left">
                    <div><strong>Họ tên:</strong> ${patientName}</div>
                    <div><strong>Ngày sinh:</strong> ${ageText}</div>
                    <div><strong>Địa chỉ:</strong> ${patientAddress}</div>
                </div>
                <div class="prescription-preview__patient-info-right">
                    <div><strong>Giới tính:</strong> ${genderDisplay || ''}</div>
                    <div><strong>Số điện thoại:</strong> ${patientPhone || ''}</div>
                    <div><strong>Cân nặng:</strong> ${weightDisplay ? (weightDisplay + ' kg') : ''}</div>
                </div>
            </div>
            <div class="prescription-preview__diagnosis">
                <strong>${clinicalConfig.clinicalLabel}:</strong> ${clinicalText}
            </div>
            <div class="prescription-preview__body">
                ${ordersTable}
            </div>
			<div class="prescription-preview__footer">
				<div class="order-print-footer-date">
					${todayText}
				</div>
            </div>
        </div>
    `;
	}

	function getPrintProfile(profileName = 'doctor') {
		if (profileName === 'psychologist') {
			return {
				fontSize: '12px',
				titleMargin: '10px 0 15px',
				clinicNameSize: '12px',
				headerBaseCss: `
        .printable-content .prescription-preview__header { flex-wrap: nowrap !important; }
        .printable-content .prescription-preview__header > div:first-child,
        .printable-content .prescription-preview__header > div:last-child {
            flex: 1 1 auto !important;
            max-width: none !important;
        }
        .printable-content .prescription-preview__header > div:last-child {
            text-align: right !important;
            padding-right: 8px;
            line-height: 1.5;
        }`,
				headerPrintCss: `
            .prescription-preview__header > div:last-child {
                padding-right: 24px !important;
            }`
			};
		}

		return {
			fontSize: '16px',
			titleMargin: '40px 0 15px',
			clinicNameSize: '20px',
			headerBaseCss: `
        .printable-content .prescription-preview__header { 
            flex-wrap: nowrap !important; 
            justify-content: flex-start !important;
        }
        .printable-content .prescription-preview__header > div:first-child {
            flex: 1 1 auto !important;
            max-width: none !important;
            text-align: left !important;
        }`,
			headerPrintCss: `
            .prescription-preview__header {
                justify-content: flex-start !important;
            }
            .prescription-preview__header > div:first-child {
                text-align: left !important;
            }`
		};
	}

	function buildOrderPrintDocument(printableHtml, styles, options = {}) {
		const profile = getPrintProfile(options.printProfile);
		return `<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="utf-8">
    <title>In phiếu chỉ định</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css">
    ${styles}
    <style>
        html, body { 
            background: #fff !important; 
            background-color: #fff !important;
            padding: 0 !important; 
            margin: 0 !important;
            font-family: var(--qlpk-font-family, Roboto, Arial, sans-serif) !important;
        }
        body { 
            width: 210mm;
            min-height: 297mm;
        }
        .printable-content { 
            width: 210mm;
            min-height: 297mm;
            padding: 10mm;
            box-sizing: border-box;
        }
        .printable-content .card { box-shadow: none !important; border: none !important; }
        .printable-content .card-body { max-height: none !important; overflow: visible !important; }
        ${profile.headerBaseCss}
        .printable-content .prescription-preview__footer {
            text-align: right !important;
            width: 100% !important;
        }
        .printable-content .prescription-preview__footer > div {
            text-align: right !important;
            width: 100% !important;
        }
        @page { 
            size: 210mm 297mm;
            margin: 0;
        }
        @media print {
            html, body {
                background: #fff !important; 
                background-color: #fff !important;
            }
            body {
                width: 210mm !important;
                height: 297mm !important;
                margin: 0 !important;
                padding: 0 !important;
            }
            .printable-content {
                width: 210mm !important;
                height: 297mm !important;
                min-height: 297mm !important;
                max-height: 297mm !important;
                padding: 10mm !important;
                margin: 0 !important;
                box-sizing: border-box !important;
            }
            .prescription-preview {
                width: 100% !important;
                height: 100% !important;
                min-height: 100% !important;
                max-height: 100% !important;
                display: flex !important;
                flex-direction: column !important;
                font-size: ${profile.fontSize} !important;
                box-sizing: border-box !important;
            }
            .prescription-preview__header {
                flex-shrink: 0 !important;
            }
            .prescription-preview__title {
                flex-shrink: 0 !important;
                margin: ${profile.titleMargin} !important;
            }
            .prescription-preview__patient-info {
                flex-shrink: 0 !important;
                margin-bottom: 0px !important;
            }
            .prescription-preview__diagnosis {
                flex-shrink: 0 !important;
                margin-bottom: 10px !important;
                margin-top: 0 !important;
                padding: 0 !important;
            }
            .prescription-preview__body {
                flex: 1 !important;
                overflow: visible !important;
                min-height: 0 !important;
            }
            .prescription-preview__footer {
                flex-shrink: 0 !important;
                margin-top: auto !important;
                text-align: right !important;
                width: 100% !important;
            }
            .prescription-preview__footer > div {
                text-align: right !important;
                width: 100% !important;
            }
            .prescription-preview-table {
                width: 100% !important;
                font-size: ${profile.fontSize} !important;
                border-collapse: collapse !important;
            }
            .prescription-preview-table th {
                background: #f1f5f9 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-size: ${profile.fontSize} !important;
                padding: 8px !important;
                border: 1px solid #dee2e6 !important;
            }
            .prescription-preview-table td {
                font-size: ${profile.fontSize} !important;
                padding: 8px !important;
                border: 1px solid #dee2e6 !important;
            }
            .clinic-name {
                font-weight: var(--qlpk-font-weight-bold, 700) !important;
                font-size: ${profile.clinicNameSize} !important;
                text-transform: uppercase !important;
                color: #1d4ed8 !important;
            }
            .prescription-preview__patient-info { 
                flex-direction: row !important; 
            }
            .prescription-preview__patient-info-left {
                flex: 0 0 70% !important;
                max-width: 70% !important;
            }
            .prescription-preview__patient-info-right {
                flex: 0 0 30% !important;
                max-width: 30% !important;
            }
            ${profile.headerPrintCss}
            .no-print {
                display: none !important;
            }
        }
    </style>
</head>
<body>${printableHtml}</body>
</html>`;
	}

	function performPrintOrderForm(targetId, deps = {}) {
		const doc = deps.document || document;
		const win = deps.window || window;
		const targetEl = doc.getElementById(targetId);
		const showError = message => {
			if (typeof deps.showError === 'function') deps.showError(message);
		};
		if (!targetEl) {
			showError('Không tìm thấy nội dung để in');
			return false;
		}

		const printable = targetEl.cloneNode(true);
		printable.classList.add('printable-content');
		const printWindow = win.open('', '_blank', 'width=900,height=700');
		if (!printWindow) {
			showError('Trình duyệt chặn cửa sổ in');
			return false;
		}

		const styles = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style'))
			.map(node => node.outerHTML)
			.join('\n');

		printWindow.document.open();
		printWindow.document.write(buildOrderPrintDocument(printable.outerHTML, styles, {
			printProfile: deps.printProfile
		}));
		printWindow.document.close();
		printWindow.onload = () => {
			printWindow.focus();
			printWindow.print();
			printWindow.close();
		};
		return true;
	}

	function normalizePatientResponse(payload) {
		return payload && payload.data ? payload.data : payload;
	}

	function getAppointmentExaminationId(appointment) {
		return appointment?.examination_id ||
			(appointment?.examinations && appointment.examinations.length > 0 ? appointment.examinations[0].id : null);
	}

	function buildPrintPatientFallback(appointment, gender, weight) {
		return {
			full_name: appointment.patient_full_name || appointment.patient_info?.full_name || '',
			date_of_birth: appointment.patient_date_of_birth || appointment.patient_info?.date_of_birth || '',
			gender,
			address: appointment.patient_address || appointment.patient_info?.address || '',
			phone: appointment.patient_phone || appointment.patient_info?.phone || '',
			weight
		};
	}

	async function printOrderFormForPerformer(performerName, ordersToPrint, deps = {}) {
		const currentAppointmentId = typeof deps.getCurrentAppointmentId === 'function'
			? deps.getCurrentAppointmentId()
			: deps.currentAppointmentId;
		const showToast = (type, message) => {
			if (typeof deps.showToast === 'function') deps.showToast(type, message);
		};
		if (!currentAppointmentId) {
			showToast('warning', 'Không tìm thấy lịch hẹn');
			return { status: 'missingAppointmentId' };
		}

		if (!ordersToPrint || ordersToPrint.length === 0) {
			showToast('warning', 'Chưa có chỉ định nào để in');
			return { status: 'emptyOrders' };
		}

		try {
			const appointmentResponse = await deps.apiCall(`/api/appointments/${currentAppointmentId}`);
			if (!appointmentResponse.ok) {
				throw new Error('Không tải được thông tin lịch hẹn');
			}
			const appointment = await appointmentResponse.json();

			const patientId = appointment.patient_id || appointment.patient?.id || appointment.patient_info?.id;
			let patient = appointment.patient || appointment.patient_info || null;
			if (patientId) {
				try {
					const patientResponse = await deps.apiCall(`/api/patients/${patientId}`);
					if (patientResponse.ok) {
						const patientData = normalizePatientResponse(await patientResponse.json());
						patient = {
							...(patient || {}),
							...patientData,
							gender: patientData.gender || patient?.gender || ''
						};
					}
				} catch (error) {
					(deps.console || console).warn('Không tải được thông tin bệnh nhân chi tiết:', error);
				}
			}

			let examination = null;
			const examinationId = getAppointmentExaminationId(appointment);
			if (examinationId) {
				try {
					const examinationResponse = await deps.apiCall(`/api/examination-detail/${examinationId}`);
					if (examinationResponse.ok) {
						examination = await examinationResponse.json();
					}
				} catch (error) {
					(deps.console || console).warn('Không tải được thông tin examination:', error);
				}
			}

			if (!examination && appointment.examination) {
				examination = appointment.examination;
			}

			const clinicalConfig = getClinicalPrintConfig(deps.clinicalContext);
			const clinicInfo = typeof deps.getClinicInfoConfig === 'function' ? deps.getClinicInfoConfig() : {};
			const gender = patient?.gender || appointment?.patient_info?.gender || appointment?.patient_gender || '';
			const weight = examination?.weight || appointment?.examination?.weight || patient?.weight || appointment?.patient_info?.weight || appointment?.patient_weight || '';
			const appointmentWithExamination = {
				...appointment,
				examination: examination || appointment.examination || clinicalConfig.fallbackExamination(appointment, examination, weight)
			};

			const patientForPrint = patient ? {
				...patient,
				gender: gender || patient.gender || '',
				weight: weight || patient.weight || ''
			} : buildPrintPatientFallback(appointment, gender, weight);

			const orderFormHTML = buildOrderFormHTML({
				clinicInfo,
				patient: patientForPrint,
				appointment: appointmentWithExamination,
				ordersData: ordersToPrint,
				performerName
			}, deps);

			const doc = deps.document || document;
			const tempDiv = doc.createElement('div');
			tempDiv.id = 'order-form-print-temp';
			tempDiv.innerHTML = orderFormHTML;
			doc.body.appendChild(tempDiv);

			performPrintOrderForm('order-form-print-temp', deps);

			const delay = typeof deps.cleanupDelayMs === 'number' ? deps.cleanupDelayMs : 1000;
			const schedule = deps.setTimeout || setTimeout;
			schedule(() => {
				const tempElement = doc.getElementById('order-form-print-temp');
				if (tempElement) tempElement.remove();
			}, delay);

			return { status: 'success' };
		} catch (error) {
			(deps.console || console).error('Error printing order form:', error);
			showToast('error', 'Không thể in phiếu chỉ định. Vui lòng thử lại.');
			return { status: 'error', error };
		}
	}

	async function handlePrintSelectedPerformer(deps = {}) {
		const doc = deps.document || document;
		const selectedRadio = doc.querySelector('input[name="selectedPerformer"]:checked');
		if (!selectedRadio) {
			if (typeof deps.showWarning === 'function') deps.showWarning('Vui lòng chọn thực hiện để in!');
			return false;
		}

		const selectedPerformerName = selectedRadio.value;
		const groups = typeof deps.groupOrdersByPerformer === 'function'
			? deps.groupOrdersByPerformer(deps.getSelectedOrders ? deps.getSelectedOrders() : [])
			: [];
		const selectedGroup = groups.find(g => g.performerName === selectedPerformerName);

		if (!selectedGroup || !selectedGroup.orders || selectedGroup.orders.length === 0) {
			if (typeof deps.showError === 'function') deps.showError('Không tìm thấy chỉ định cho thực hiện đã chọn');
			return false;
		}

		const modalEl = doc.getElementById('selectPerformerModal');
		if (modalEl && deps.bootstrap?.Modal) {
			const modal = deps.bootstrap.Modal.getInstance(modalEl);
			if (modal) {
				modal.hide();
			}
		}

		if (typeof deps.printOrderFormForPerformer === 'function') {
			await deps.printOrderFormForPerformer(selectedPerformerName, selectedGroup.orders);
		}
		return true;
	}

	function showSelectPerformerModal(deps = {}) {
		const doc = deps.document || document;
		if (!deps.currentAppointmentId) {
			if (typeof deps.showWarning === 'function') deps.showWarning('Không tìm thấy lịch hẹn');
			return false;
		}

		const selectedOrders = deps.getSelectedOrders ? deps.getSelectedOrders() : [];
		if (!selectedOrders || selectedOrders.length === 0) {
			if (typeof deps.showWarning === 'function') deps.showWarning('Chưa có chỉ định nào để in');
			return false;
		}

		const groups = typeof deps.groupOrdersByPerformer === 'function'
			? deps.groupOrdersByPerformer(selectedOrders)
			: [];
		if (groups.length === 0) {
			if (typeof deps.showWarning === 'function') deps.showWarning('Không có chỉ định nào để in');
			return false;
		}

		if (groups.length === 1) {
			if (typeof deps.printOrderFormForPerformer === 'function') {
				deps.printOrderFormForPerformer(groups[0].performerName, groups[0].orders);
			}
			return true;
		}

		if (typeof deps.renderPerformerOptions === 'function') {
			deps.renderPerformerOptions(groups);
		}

		doc.querySelectorAll('input[name="selectedPerformer"]').forEach(radio => {
			radio.checked = false;
		});
		if (typeof deps.updatePrintButtonState === 'function') {
			deps.updatePrintButtonState();
		}

		const modalEl = doc.getElementById('selectPerformerModal');
		if (modalEl && deps.bootstrap?.Modal) {
			const modal = deps.bootstrap.Modal.getOrCreateInstance(modalEl);
			modal.show();
		}
		return true;
	}

	function createOrderPrintAdapter(options = {}) {
		const adapter = {};
		const getSelectedOrders = () => typeof options.getSelectedOrders === 'function' ? options.getSelectedOrders() : [];
		const getOrderFacilityLabel = options.getOrderFacilityLabel
			|| (order => options.orderPageBridge?.getOrderFacilityLabel?.(order));
		const groupOrdersByPerformer = options.groupOrdersByPerformer
			|| (orders => options.orderPageBridge?.groupOrdersByPerformer?.(orders) || []);
		const showToast = (type, message) => {
			if (typeof options.showToast === 'function') options.showToast(type, message);
		};

		adapter.renderPerformerOptions = function (groups) {
			return renderPerformerOptions(groups, {
				document: options.document,
				escapeHtml: options.escapeHtml
			});
		};

		adapter.selectPerformerOption = function (performerId) {
			return selectPerformerOption(performerId, {
				document: options.document,
				updatePrintButtonState: adapter.updatePrintButtonState,
				updateSelectedState: adapter.updateSelectedState
			});
		};

		adapter.updateSelectedState = function () {
			return updateSelectedState({ document: options.document });
		};

		adapter.updatePrintButtonState = function () {
			return updatePrintButtonState({
				document: options.document,
				updateSelectedState: adapter.updateSelectedState
			});
		};

		adapter.handlePrintSelectedPerformer = function () {
			return handlePrintSelectedPerformer({
				document: options.document,
				bootstrap: options.bootstrap,
				getSelectedOrders,
				groupOrdersByPerformer,
				printOrderFormForPerformer: options.printOrderFormForPerformer || adapter.printOrderFormForPerformer,
				showWarning: message => showToast('warning', message),
				showError: message => showToast('error', message)
			});
		};

		adapter.renderOrderPrintPreview = function () {
			return renderOrderPrintPreview(getSelectedOrders(), {
				document: options.document,
				escapeHtml: options.escapeHtml,
				formatDisplayDate: options.formatDisplayDate,
				getOrderFacilityLabel
			});
		};

		adapter.buildOrderFormHTML = function (data = {}) {
			return buildOrderFormHTML(data, {
				clinicalContext: options.clinicalContext,
				formatVietnamDate: options.formatVietnamDate,
				calculateDetailedAge: options.calculateDetailedAge,
				buildFullAddressFromParts: options.buildFullAddressFromParts,
				formatGenderDisplay: options.formatGenderDisplay,
				escapeHtml: options.escapeHtml,
				getClinicInfoConfig: options.getClinicInfoConfig
			});
		};

		adapter.performPrintOrderForm = function (targetId) {
			return performPrintOrderForm(targetId, {
				document: options.document,
				window: options.window,
				printProfile: options.printProfile || options.clinicalContext,
				showError: message => showToast('error', message)
			});
		};

		adapter.printOrderFormForPerformer = function (performerName, ordersToPrint) {
			return printOrderFormForPerformer(performerName, ordersToPrint, {
				document: options.document,
				window: options.window,
				apiCall: options.apiCall,
				console: options.console,
				setTimeout: options.setTimeout,
				getCurrentAppointmentId: options.getCurrentAppointmentId,
				clinicalContext: options.clinicalContext,
				printProfile: options.printProfile || options.clinicalContext,
				getClinicInfoConfig: options.getClinicInfoConfig,
				formatVietnamDate: options.formatVietnamDate,
				calculateDetailedAge: options.calculateDetailedAge,
				buildFullAddressFromParts: options.buildFullAddressFromParts,
				formatGenderDisplay: options.formatGenderDisplay,
				escapeHtml: options.escapeHtml,
				showToast
			});
		};

		adapter.showSelectPerformerModal = function () {
			return showSelectPerformerModal({
				document: options.document,
				bootstrap: options.bootstrap,
				currentAppointmentId: typeof options.getCurrentAppointmentId === 'function' ? options.getCurrentAppointmentId() : options.currentAppointmentId,
				getSelectedOrders,
				groupOrdersByPerformer,
				printOrderFormForPerformer: options.printOrderFormForPerformer || adapter.printOrderFormForPerformer,
				renderPerformerOptions: adapter.renderPerformerOptions,
				updatePrintButtonState: adapter.updatePrintButtonState,
				showWarning: message => showToast('warning', message)
			});
		};

		return adapter;
	}

	const api = {
		renderPerformerOptions,
		selectPerformerOption,
		updateSelectedState,
		updatePrintButtonState,
		renderOrderPrintPreview,
		getClinicalPrintConfig,
		buildOrderRowsHtml,
		buildOrdersTableHtml,
		buildOrderFormHTML,
		getPrintProfile,
		buildOrderPrintDocument,
		performPrintOrderForm,
		printOrderFormForPerformer,
		handlePrintSelectedPerformer,
		showSelectPerformerModal,
		createOrderPrintAdapter
	};

	window.ClinicalOrderPrintUiUtils = api;
	window.DoctorExaminationOrderPrintUiUtils = api;
	window.PsychologistExaminationOrderPrintUiUtils = api;
})();
