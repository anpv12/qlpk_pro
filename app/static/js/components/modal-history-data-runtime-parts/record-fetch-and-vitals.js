import { buildClinicHeader, buildMedicalRecordAdminHtml, buildMedicalRecordExaminationHtml, buildMedicalRecordInquiryHtml, buildMedicalRecordModel, buildMedicineRows, buildServiceInvoiceHTML, escapeHtml, formatDate, formatMultiline, formatPrescriptionType, formatSignatureDate, getClinicInfo, resolvePrescriptionDays, toNumber } from './formatters-and-record.js';

function buildMedicalRecordTreatmentHtml(model) {
	if (!model.isDoctor) return '';
	const { prescriptionData, history } = model;
	const prescriptionType = prescriptionData.prescriptions?.[0]?.type
		|| prescriptionData.prescription_type || prescriptionData.type || '';
	return `<div class="medical-record-section">
				<h6 class="medical-record-section-title">IV. ĐIỀU TRỊ</h6>
				<div class="medical-record-block"><strong>Loại đơn thuốc:</strong> ${escapeHtml(formatPrescriptionType(prescriptionType))}</div>
				<div class="medical-record-block"><strong>Số ngày thuốc:</strong> ${escapeHtml(resolvePrescriptionDays(prescriptionData))}</div>
				<div class="medical-record-block"><strong>Hẹn ngày tái khám:</strong> ${formatDate(prescriptionData.re_examination_date)}</div>
				<div class="medical-record-treatment-list"><strong>Danh sách thuốc:</strong>${buildMedicineRows(prescriptionData)}</div>
				<div class="medical-record-loi-dan"><strong>Lời dặn:</strong><div class="medical-record-loi-dan-text">${formatMultiline(history.loi_dan || '')}</div></div>
			</div>`;
}
function buildMedicalRecordHTML(options = {}) {
	const model = buildMedicalRecordModel(options);
	const { labels, history, patient } = model;
	const doctorName = history.doctor?.full_name || labels.fallbackName;
	return `
		<div class="prescription-preview prescription-preview--document">
			${buildClinicHeader(model.clinicInfo, patient.patient_code)}
			<div class="prescription-gradient-separator"></div>
			<h3 class="prescription-preview__title prescription-preview__title--document">${labels.title}</h3>${buildMedicalRecordAdminHtml(model)}${buildMedicalRecordInquiryHtml(model)}${buildMedicalRecordExaminationHtml(model)}
			${buildMedicalRecordTreatmentHtml(model)}
			<div class="prescription-preview__signature prescription-preview__signature--avoid-break">
				<div>${formatSignatureDate(history.examination_date)}</div>
				<div class="prescription-preview__signature-role">${labels.signer}</div>
				<div class="prescription-preview__signature-name">${escapeHtml(doctorName)}</div>
			</div>
		</div>`;
}
async function parseJsonResponse(response, errorMessage) {
	if (!response || !response.ok) {
		let detail = '';
		try { detail = await response.text(); } catch (error) { detail = ''; }
		throw new Error(detail || errorMessage);
	}
	return response.json();
}
function createDataFetchers(apiCall) {
	if (typeof apiCall !== 'function') throw new Error('apiCall is required');
	const getJson = async (url, errorMessage) => parseJsonResponse(await apiCall(url, { cache: 'no-store' }), errorMessage);
	return {
		async fetchPatientDetail(patientId) {
			const data = await getJson(`/api/patients/${patientId}`, 'Không thể tải thông tin bệnh nhân');
			return data.data || data;
		},
		fetchExaminationDetail(examinationId) {
			return getJson(`/api/examination-detail/${examinationId}`, 'Không thể tải thông tin lượt khám');
		},
		fetchSectionDetails(examinationId) {
			return getJson(`/api/examination-details/${examinationId}`, 'Không thể tải chi tiết bệnh án');
		},
		fetchPrescription(appointmentId) {
			return getJson(`/api/prescription/appointment/${appointmentId}`, 'Không thể tải toa thuốc');
		},
		fetchServicesForAppointment(appointmentId) {
			return getJson(`/services/appointment/${appointmentId}`, 'Không thể tải dịch vụ');
		},
		fetchAppointment(appointmentId) {
			return getJson(`/api/appointments/${appointmentId}`, 'Không thể tải lịch hẹn');
		},
		async fetchRelatives(appointmentId) {
			try {
				return await getJson(`/api/appointment-relatives/appointment/${appointmentId}`, 'Không thể tải người đi cùng');
			} catch (error) {
				console.warn('Không tải được người đi cùng cho bệnh án:', error);
				return { data: [] };
			}
		},
		fetchVitalSigns(patientId) {
			return getJson(`/api/patients/${patientId}/examinations`, 'Không thể tải sinh hiệu');
		}
	};
}
function createBarcodesInElement(container) {
	if (!container) return;
	const render = () => {
		if (typeof window.JsBarcode !== 'function') return;
		container.querySelectorAll('.barcode-svg').forEach(svg => {
			const code = svg.dataset.barcode || (svg.id && svg.id.startsWith('barcode-') ? svg.id.slice(8) : '');
			if (!code) return;
			try {
				window.JsBarcode(svg, code, { format: 'CODE128', width: 1.5, height: 35, displayValue: false, margin: 0 });
			} catch (error) {
				console.error('Không tạo được barcode:', error);
			}
		});
	};
	if (typeof window.JsBarcode === 'function') {
		render();
		return;
	}
	if (document.querySelector('script[data-modal-history-barcode]')) return;
	const script = document.createElement('script');
	script.src = '/static/vendor/jsbarcode@3.11.5/JsBarcode.all.min.js';
	script.dataset.modalHistoryBarcode = '1';
	script.addEventListener('load', render, { once: true });
	script.addEventListener('error', () => console.error('Không tải được thư viện barcode'), { once: true });
	document.head.appendChild(script);
}
function installVitalSignsFns1(ctx) {
	function setDisplay(element, visible, display = 'block') {
		if (element) element.style.display = visible ? display : 'none';
	}

	function destroyChart() {
		if (ctx.chart && typeof ctx.chart.destroy === 'function') ctx.chart.destroy();
		ctx.chart = null;
		ctx.lastLayoutSignature = '';
	}

	function parseBloodPressure(value) {
		const parts = String(value || '').split('/').map(item => Number.parseInt(item, 10));
		if (parts.length === 2 && parts.every(Number.isFinite)) return { sys: parts[0], dia: parts[1] };
		const match = String(value || '').match(/(\d+)/);
		const number = match ? Number.parseInt(match[1], 10) : NaN;
		return Number.isFinite(number) ? { sys: number, dia: number } : null;
	}

	function processData(examinations) {
		return (Array.isArray(examinations) ? examinations : [])
			.filter(item => item && item.examination_date)
			.sort((a, b) => new Date(a.examination_date) - new Date(b.examination_date))
			.map(item => {
				const date = new Date(item.examination_date);
				const bp = parseBloodPressure(item.blood_pressure);
				const validDate = !Number.isNaN(date.getTime());
				const dateLabel = validDate ? `${date.getDate()}/${date.getMonth() + 1}` : '';
				const timeLabel = validDate ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
				return {
					date: item.examination_date,
					dateLabel,
					timeLabel,
					fullDateLabel: validDate ? `${timeLabel} ${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}` : '',
					breathing: toNumber(item.breathing, null),
					pulse: toNumber(item.pulse, null),
					bloodPressureRaw: item.blood_pressure || '',
					bloodPressureMin: bp?.dia ?? null,
					bloodPressureMax: bp?.sys ?? null,
					temperature: toNumber(item.temperature, null),
					weight: toNumber(item.weight, null),
					height: toNumber(item.height, null),
					bmi: toNumber(item.bmi, null)
				};
			});
	}

	function renderEmpty(message) {
		destroyChart();
		const empty = document.getElementById('vitalSignsChartEmpty');
		if (empty) {
			setDisplay(empty, true, 'flex');
			const text = empty.querySelector('p');
			if (text) text.textContent = message;
		}
		setDisplay(document.getElementById('vitalSignsChartLayout'), false);
		setDisplay(document.getElementById('vitalSignsTableWrapper'), false);
	}

	function clear(message = 'Chọn bệnh nhân để xem lưu đồ sinh hiệu') {
		ctx.requestToken += 1;
		ctx.patientId = null;
		ctx.data = [];
		ctx.filteredData = [];
		renderEmpty(message);
	}

	Object.assign(ctx, { setDisplay, destroyChart, processData, renderEmpty, clear });
}

function installVitalSignsFns2(ctx) {
	function filterData() {
		if (ctx.timeRange === 'all') return ctx.data;
		const days = { '1w': 7, '1m': 30, '3m': 90 }[ctx.timeRange];
		if (!days) return ctx.data;
		const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
		return ctx.data.filter(item => new Date(item.date).getTime() >= cutoff);
	}

	function renderTable(items) {
		const wrapper = document.getElementById('vitalSignsTableWrapper');
		if (!wrapper) return;
		const containerWidth = wrapper.clientWidth || 600;
		const numCols = Math.max(items.length, 10, Math.floor(Math.max(containerWidth - 165, 0) / 80));
		const totalMinWidth = 165 + numCols * 80;
		const cols = `<col class="vital-grid-col-label">${Array.from({ length: numCols }, () => '<col class="vital-grid-col-data">').join('')}`;
		const headerCells = (key, emptyClass) => Array.from({ length: numCols }, (_, index) => {
			const item = items[index];
			return item ? `<th>${escapeHtml(item[key])}</th>` : `<th class="${emptyClass}">-</th>`;
		}).join('');
		const rows = [
			['Huyết áp (mmHg)', 'bloodPressureRaw'], ['Nhịp thở (lần/phút)', 'breathing'], ['Mạch (bpm)', 'pulse'],
			['Nhiệt độ (°C)', 'temperature'], ['Cân nặng (kg)', 'weight'], ['Chiều cao (cm)', 'height'], ['BMI', 'bmi']
		].map(([label, key]) => `<tr><td class="vital-label-col">${label}</td>${Array.from({ length: numCols }, (_, index) => {
			const value = items[index]?.[key];
			return `<td>${value === null || value === undefined || value === '' ? '-' : escapeHtml(value)}</td>`;
		}).join('')}</tr>`).join('');
		wrapper.innerHTML = `<table class="vital-signs-grid-table" style="width:${totalMinWidth}px"><colgroup>${cols}</colgroup><thead><tr><th class="vital-label-col" rowspan="2">Chỉ số \\ Thời gian</th>${headerCells('dateLabel', 'vital-grid-empty-date')}</tr><tr>${headerCells('timeLabel', 'vital-grid-empty-time')}</tr></thead><tbody>${rows}</tbody></table>`;
		ctx.setDisplay(wrapper, true);
	}

	Object.assign(ctx, { filterData, renderTable });
}

function installVitalSignsFns3(ctx) {
	function alignAxesAndHeader() {
		if (!ctx.chart?.chartArea || !ctx.chart.scales?.yHA || !ctx.chart.scales?.x) return;
		const yScale = ctx.chart.scales.yHA;
		const xScale = ctx.chart.scales.x;
		const yValues = [200, 180, 160, 140, 120, 100, 80, 60, 40];
		const signature = `${yValues.map(value => Math.round(yScale.getPixelForValue(value))).join(',')}|${ctx.filteredData.map((_, index) => Math.round(xScale.getPixelForValue(index))).join(',')}`;
		if (signature === ctx.lastLayoutSignature) return;
		ctx.lastLayoutSignature = signature;
		const axis = document.getElementById('vitalSignsYAxisFixed');
		if (axis) {
			axis.replaceChildren();
			const dateHeader = document.createElement('div');
			dateHeader.className = 'vital-axis-date-header';
			dateHeader.textContent = 'Ngày/tháng';
			const metricHeader = document.createElement('div');
			metricHeader.className = 'vital-axis-metric-header';
			['Huyết áp', 'Mạch', 'Nhiệt độ'].forEach((label, index) => {
				const cell = document.createElement('div');
				cell.className = index < 2 ? 'vital-axis-metric-cell vital-axis-metric-cell--border' : 'vital-axis-metric-cell';
				cell.textContent = label;
				metricHeader.appendChild(cell);
			});
			const ticks = document.createElement('div');
			ticks.className = 'vital-y-ticks';
			yValues.forEach((value, index) => {
				const tick = document.createElement('div');
				tick.className = 'vital-y-tick';
				tick.style.top = `${yScale.getPixelForValue(value)}px`;
				[value, value, 43 - index].forEach((cellValue, cellIndex) => {
					const cell = document.createElement('div');
					cell.className = cellIndex < 2 ? 'vital-y-tick-cell vital-y-tick-cell--border' : 'vital-y-tick-cell';
					cell.textContent = cellValue;
					tick.appendChild(cell);
				});
				ticks.appendChild(tick);
			});
			axis.append(dateHeader, metricHeader, ticks);
		}
		const header = document.getElementById('vitalSignsHeaderTable');
		if (header) {
			header.replaceChildren();
			const dateRow = document.createElement('div');
			dateRow.className = 'vital-x-date-row';
			const timeRow = document.createElement('div');
			timeRow.className = 'vital-x-time-row';
			ctx.filteredData.forEach((item, index) => {
				const x = xScale.getPixelForValue(index);
				const dateLabel = document.createElement('div');
				dateLabel.className = 'vital-x-date-label';
				dateLabel.style.left = `${x}px`;
				dateLabel.textContent = item.dateLabel;
				dateRow.appendChild(dateLabel);
				const timeLabel = document.createElement('div');
				timeLabel.className = 'vital-x-time-label';
				timeLabel.style.left = `${x}px`;
				timeLabel.textContent = item.timeLabel;
				timeRow.appendChild(timeLabel);
			});
			header.append(dateRow, timeRow);
		}
	}

	Object.assign(ctx, { alignAxesAndHeader });
}

function installVitalSignsFns4(ctx) {
	function renderChart(items) {
		if (typeof window.Chart !== 'function') {
			ctx.viewMode = 'table';
			ctx.renderTable(items);
			return;
		}
		const canvas = document.getElementById('vitalSignsChart');
		const scrollContainer = document.getElementById('vitalSignsChartScrollable');
		const header = document.getElementById('vitalSignsHeaderTable');
		if (!canvas || !scrollContainer || !header) return;
		ctx.destroyChart();
		const containerWidth = scrollContainer.clientWidth || 600;
		const numCols = Math.max(items.length, 10, Math.floor(containerWidth / 80));
		const calculatedWidth = Math.max(containerWidth, numCols * 60);
		const canvasContainer = canvas.parentElement;
		if (canvasContainer) canvasContainer.style.width = `${calculatedWidth}px`;
		header.style.width = `${calculatedWidth}px`;
		const paddedItems = Array.from({ length: numCols }, (_, index) => items[index] || null);
		const triangle = (up = false) => {
			const marker = document.createElement('canvas');
			marker.width = 12; marker.height = 12;
			const context = marker.getContext('2d');
			context.fillStyle = '#ca8a04';
			context.beginPath();
			if (up) { context.moveTo(1, 10); context.lineTo(11, 10); context.lineTo(6, 1); }
			else { context.moveTo(1, 2); context.lineTo(11, 2); context.lineTo(6, 11); }
			context.closePath(); context.fill();
			return marker;
		};
		ctx.chart = new window.Chart(canvas.getContext('2d'), {
			type: 'line',
			data: {
				labels: Array.from({ length: numCols }, (_, index) => index),
				datasets: [
					{ label: 'Huyết áp', data: paddedItems.map(item => item?.bloodPressureMax), borderColor: '#ca8a04', backgroundColor: 'rgba(254, 240, 138, 0.4)', borderWidth: 1.5, tension: 0, fill: '+1', pointStyle: triangle(), spanGaps: true, yAxisID: 'yHA' },
					{ label: 'Huyết áp tâm trương', data: paddedItems.map(item => item?.bloodPressureMin), borderColor: '#ca8a04', backgroundColor: 'transparent', borderWidth: 1.5, tension: 0, fill: false, pointStyle: triangle(true), spanGaps: true, yAxisID: 'yHA' },
					{ label: 'Mạch (lần/phút)', data: paddedItems.map(item => item?.pulse), borderColor: '#ef4444', backgroundColor: '#ef4444', borderWidth: 2, tension: 0, fill: false, pointStyle: 'crossRot', pointRadius: 6, pointHoverRadius: 8, spanGaps: true, yAxisID: 'yMach' },
					{ label: 'Nhiệt độ (°C)', data: paddedItems.map(item => item?.temperature), borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 2, tension: 0, fill: false, pointStyle: 'circle', pointRadius: 5, pointHoverRadius: 7, spanGaps: true, yAxisID: 'yTemp' }
				]
			},
			options: {
				responsive: true, maintainAspectRatio: false,
				layout: { padding: { top: 10, bottom: 10, left: 5, right: 15 } },
				interaction: { mode: 'index', intersect: false },
				plugins: {
					legend: { position: 'top', labels: { usePointStyle: true, padding: 8, font: { family: 'Roboto', size: 11 }, filter: item => item.text !== 'Huyết áp tâm trương' } },
					tooltip: {
						backgroundColor: 'rgba(15, 23, 42, 0.9)', padding: 8, cornerRadius: 6,
						callbacks: {
							title: context => paddedItems[context[0]?.dataIndex]?.fullDateLabel || '',
							label: context => {
								const item = paddedItems[context.dataIndex];
								if (!item || context.dataset.label === 'Huyết áp tâm trương') return null;
								if (context.dataset.label === 'Huyết áp') return `Huyết áp: ${item.bloodPressureMax}/${item.bloodPressureMin} mmHg`;
								return `${context.dataset.label}: ${context.parsed.y}${context.dataset.yAxisID === 'yTemp' ? ' °C' : ' lần/phút'}`;
							}
						}
					}
				},
				scales: {
					x: { display: true, grid: { color: 'rgba(0, 0, 0, 0.05)' }, border: { display: false }, ticks: { display: false } },
					yHA: { type: 'linear', display: true, position: 'left', min: 40, max: 200, ticks: { stepSize: 20, display: false }, grid: { color: 'rgba(0, 0, 0, 0.05)' }, border: { display: false } },
					yMach: { type: 'linear', display: true, position: 'left', min: 40, max: 200, ticks: { stepSize: 20, display: false }, grid: { drawOnChartArea: false }, border: { display: false } },
					yTemp: { type: 'linear', display: true, position: 'left', min: 35, max: 43, ticks: { stepSize: 1, display: false }, grid: { drawOnChartArea: false }, border: { display: false } }
				}
			},
			plugins: [{ id: 'modal-vital-layout', afterLayout: () => ctx.alignAxesAndHeader() }]
		});
		window.requestAnimationFrame(ctx.alignAxesAndHeader);
	}

	Object.assign(ctx, { renderChart });
}

function installVitalSignsFns5(ctx) {
	function syncButtons() {
		const chartButton = document.getElementById('btnVitalViewChart');
		const tableButton = document.getElementById('btnVitalViewTable');
		if (chartButton) {
			chartButton.disabled = typeof window.Chart !== 'function';
			chartButton.classList.toggle('active', ctx.viewMode === 'chart');
		}
		if (tableButton) tableButton.classList.toggle('active', ctx.viewMode === 'table');
	}

	function render() {
		ctx.filteredData = ctx.filterData();
		if (!ctx.filteredData.length) {
			ctx.renderEmpty('Không có dữ liệu sinh hiệu trong khoảng thời gian này');
			return;
		}
		ctx.setDisplay(document.getElementById('vitalSignsChartEmpty'), false);
		if (ctx.viewMode === 'chart' && typeof window.Chart === 'function') {
			ctx.setDisplay(document.getElementById('vitalSignsTableWrapper'), false);
			ctx.setDisplay(document.getElementById('vitalSignsChartLayout'), true, 'flex');
			ctx.renderChart(ctx.filteredData);
		} else {
			ctx.viewMode = 'table';
			ctx.setDisplay(document.getElementById('vitalSignsChartLayout'), false);
			ctx.renderTable(ctx.filteredData);
		}
		syncButtons();
	}

	async function load(nextPatientId) {
		const numericPatientId = Number(nextPatientId);
		if (!Number.isFinite(numericPatientId) || numericPatientId <= 0) {
			ctx.clear();
			return { status: 'missingPatient' };
		}
		const token = ctx.requestToken + 1;
		ctx.requestToken = token;
		ctx.patientId = numericPatientId;
		ctx.data = [];
		ctx.renderEmpty('Đang tải dữ liệu sinh hiệu...');
		try {
			const payload = await ctx.fetchVitalSigns(numericPatientId);
			if (token !== ctx.requestToken || ctx.patientId !== numericPatientId) return { status: 'stale' };
			ctx.data = ctx.processData(payload?.examinations);
			if (!ctx.data.length) {
				ctx.renderEmpty('Chưa có dữ liệu sinh hiệu');
				return { status: 'empty' };
			}
			render();
			return { status: 'ready', count: ctx.data.length };
		} catch (error) {
			if (token !== ctx.requestToken || ctx.patientId !== numericPatientId) return { status: 'stale' };
			console.error('Không tải được sinh hiệu:', error);
			ctx.renderEmpty('Lỗi khi tải dữ liệu sinh hiệu');
			return { status: 'error', error };
		}
	}

	Object.assign(ctx, { syncButtons, render, load });
}

function createVitalSignsController(fetchVitalSigns) {
	const ctx = {};
	ctx.fetchVitalSigns = fetchVitalSigns;
	installVitalSignsFns1(ctx);
	installVitalSignsFns2(ctx);
	installVitalSignsFns3(ctx);
	installVitalSignsFns4(ctx);
	installVitalSignsFns5(ctx);

	ctx.requestToken = 0;
	ctx.patientId = null;
	ctx.data = [];
	ctx.filteredData = [];
	ctx.timeRange = 'all';
	ctx.viewMode = typeof window.Chart === 'function' ? 'chart' : 'table';
	ctx.chart = null;
	ctx.lastLayoutSignature = '';

	document.getElementById('btnVitalViewChart')?.addEventListener('click', () => {
		if (typeof window.Chart !== 'function') return;
		ctx.viewMode = 'chart';
		ctx.render();
	});
	document.getElementById('btnVitalViewTable')?.addEventListener('click', () => {
		ctx.viewMode = 'table';
		ctx.render();
	});
	document.querySelector('.time-range-selector')?.addEventListener('click', event => {
		const button = event.target.closest('[data-vital-time-range]');
		if (!button) return;
		ctx.timeRange = button.dataset.vitalTimeRange || 'all';
		document.querySelectorAll('[data-vital-time-range]').forEach(item => item.classList.toggle('active', item === button));
		ctx.render();
	});
	document.getElementById('vital-signs-tab')?.addEventListener('shown.bs.tab', () => {
		if (ctx.viewMode === 'chart' && ctx.filteredData.length) window.setTimeout(() => ctx.chart?.resize(), 100);
	});
	window.addEventListener('resize', () => {
		if (ctx.viewMode === 'table' && ctx.filteredData.length) ctx.renderTable(ctx.filteredData);
		if (ctx.viewMode === 'chart' && ctx.chart) ctx.chart.resize();
	});
	ctx.syncButtons();

	return { load: ctx.load, clear: ctx.clear, render: ctx.render };
}
function create(options = {}) {
	const fetchers = createDataFetchers(options.apiCall);
	const vitalSigns = createVitalSignsController(fetchers.fetchVitalSigns);
	return {
		fetchers,
		vitalSigns,
		buildServiceInvoiceHTML: buildServiceInvoiceHTML,
		buildMedicalRecordHTML,
		getClinicInfo: getClinicInfo,
		createBarcodesInElement
	};
}

export { buildMedicalRecordHTML, buildMedicalRecordTreatmentHtml, create, createBarcodesInElement, createDataFetchers, createVitalSignsController, parseJsonResponse };
