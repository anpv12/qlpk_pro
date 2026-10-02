// components/vital-calculation-utils.js: phần 1/2 (nạp trước vital-calculation-utils.js). Hàm dùng chung qua moduleParts, state qua moduleState.
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/vital-calculation-utils'] || (window.QLPKModuleParts['components/vital-calculation-utils'] = { state: {} });

	function getDocument(options) {
		return options && options.document ? options.document : window.document;
	}
	function calculateAge(dateOfBirth) {
		if (!dateOfBirth) return '';

		const today = new Date();
		const birthDate = new Date(dateOfBirth);
		if (isNaN(birthDate.getTime())) return '';

		let age = today.getFullYear() - birthDate.getFullYear();
		const monthDiff = today.getMonth() - birthDate.getMonth();
		if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
			age--;
		}

		if (isNaN(age) || age < 0) return '';
		return age;
	}
	function calculateBMI(weight, height) {
		if (!weight || !height || height === 0) return 0;

		const heightInMeters = height / 100;
		const bmi = weight / (heightInMeters * heightInMeters);
		return Math.round(bmi * 10) / 10;
	}
	function classifyBMI(bmi) {
		if (!bmi || bmi <= 0) return '';
		if (bmi < 18.5) return 'Cân nặng thấp (gầy)';
		if (bmi < 23) return 'Bình thường';
		if (bmi < 25) return 'Thừa cân';
		if (bmi < 30) return 'Béo phì độ I';
		if (bmi < 40) return 'Béo phì độ II';
		return 'Béo phì độ III';
	}
	function getLastBMIValue(options = {}) {
		if (typeof options.getLastBMIValue === 'function') {
			return parseFloat(options.getLastBMIValue()) || 0;
		}
		return parseFloat(window._lastBMIValue) || 0;
	}
	function updateBMIClassification(options = {}) {
		const doc = getDocument(options);
		const el = doc.getElementById('bmiClassificationLabel');
		if (!el) return;

		const currentBMI = parseFloat(doc.getElementById('bmi')?.value) || 0;
		if (currentBMI > 0) {
			const label = classifyBMI(currentBMI);
			el.textContent = label || '';
			el.style.display = label ? 'block' : 'none';
			return;
		}

		const lastBMIValue = getLastBMIValue(options);
		if (lastBMIValue > 0) {
			const label = classifyBMI(lastBMIValue);
			el.textContent = label ? `${label} (lần trước)` : '';
			el.style.display = label ? 'block' : 'none';
			return;
		}

		el.style.display = 'none';
		el.textContent = '';
	}
	function setupAgeCalculation(options = {}) {
		const doc = getDocument(options);
		const dateOfBirthEl = doc.getElementById('dateOfBirth');
		if (!dateOfBirthEl) return;
		const updateAge = () => {
			const age = calculateAge(dateOfBirthEl.value);
			const ageEl = doc.getElementById('age');
			if (ageEl) ageEl.value = age ? age : '';
		};
		dateOfBirthEl.addEventListener('change', updateAge);
		dateOfBirthEl.addEventListener('input', updateAge);
	}
	function setupBMICalculation(options = {}) {
		const doc = getDocument(options);
		const fieldValue = id => doc.getElementById(id)?.value;
		const onInput = function () {
			const weight = parseFloat(fieldValue('weight')) || 0;
			const height = parseFloat(fieldValue('height')) || 0;
			const bmi = calculateBMI(weight, height);
			const bmiEl = doc.getElementById('bmi');
			if (bmiEl) bmiEl.value = bmi;
			updateBMIClassification(options);

			if (bmi > 0 && typeof options.autoSaveBMI === 'function') {
				options.autoSaveBMI(bmi);
			}
		};
		['weight', 'height'].forEach(id => doc.getElementById(id)?.addEventListener('input', onInput));
	}
	function updateVitalSignsAxes(chart) {
		if (!chart) return;

		const meta = chart.data.datasets.map((ds, i) => ({
			dataset: ds,
			hidden: chart.getDatasetMeta(i).hidden
		}));

		const labelMap = {
			'Nhịp thở (lần/phút)': 'Nhịp thở',
			'Mạch (bpm)': 'Mạch',
			'Huyết áp (mmHg)': 'Huyết áp',
			'Nhiệt độ (°C)': 'Nhiệt độ',
			'Cân nặng (kg)': 'Cân nặng',
			'Chiều cao (cm)': 'Chiều cao',
			'BMI': 'BMI'
		};

		let yMin = Infinity, yMax = -Infinity;
		let yHasData = false;
		let y1Min = Infinity, y1Max = -Infinity;
		let y1HasData = false;
		const yLabels = [];
		const y1Labels = [];

		meta.forEach(({ dataset, hidden }) => {
			if (hidden) return;

			const validData = dataset.data.filter(v => v !== null && v !== undefined && !isNaN(v));
			if (validData.length === 0) return;

			const min = Math.min(...validData);
			const max = Math.max(...validData);
			const fullName = labelMap[dataset.label] || dataset.label;

			if (dataset.yAxisID === 'y1') {
				y1Min = Math.min(y1Min, min);
				y1Max = Math.max(y1Max, max);
				y1HasData = true;
				y1Labels.push(fullName);
			} else {
				yMin = Math.min(yMin, min);
				yMax = Math.max(yMax, max);
				yHasData = true;
				yLabels.push(fullName);
			}
		});

		if (yHasData) {
			const padding = (yMax - yMin) * 0.15 || 10;
			chart.options.scales.y.min = Math.max(0, Math.floor(yMin - padding));
			chart.options.scales.y.max = Math.ceil(yMax + padding);
			chart.options.scales.y.display = true;
			chart.options.scales.y.title.text = yLabels.join(' / ') || 'Giá trị';
		} else {
			chart.options.scales.y.display = false;
		}

		if (y1HasData) {
			const padding = (y1Max - y1Min) * 0.15 || 2;
			chart.options.scales.y1.min = Math.floor(y1Min - padding);
			chart.options.scales.y1.max = Math.ceil(y1Max + padding);
			chart.options.scales.y1.display = true;
			chart.options.scales.y1.title.text = y1Labels.join(' / ') || 'Giá trị';
		} else {
			chart.options.scales.y1.display = false;
		}

		chart.update();
	}
	function getVitalSignsElements(options = {}) {
		const doc = getDocument(options);
		return {
			canvasEl: doc.getElementById(options.canvasId || 'vitalSignsChart'),
			emptyEl: doc.getElementById(options.emptyId || 'vitalSignsChartEmpty')
		};
	}
	function showVitalSignsEmpty(options = {}) {
		const message = options.message || 'Chọn bệnh nhân để xem lưu đồ sinh hiệu';
		const { canvasEl, emptyEl } = getVitalSignsElements(options);

		if (emptyEl) {
			emptyEl.style.display = 'flex';
			const messageEl = emptyEl.querySelector('p');
			if (messageEl) {
				messageEl.textContent = message;
			}
		}

		if (canvasEl) {
			canvasEl.style.display = 'none';
		}

		if (typeof options.onEmpty === 'function') {
			options.onEmpty();
		}

		const chart = typeof options.getChart === 'function' ? options.getChart() : null;
		if (chart && typeof chart.destroy === 'function') {
			chart.destroy();
		}
		if (typeof options.setChart === 'function') {
			options.setChart(null);
		}

		return null;
	}
	function buildVitalSignsDatasets(data) {
		return [
			{
				label: 'Nhịp thở (lần/phút)',
				data: data.map(d => d.breathing),
				borderColor: '#3b82f6',
				backgroundColor: 'rgba(59, 130, 246, 0.1)',
				tension: 0.4,
				fill: true,
				yAxisID: 'y'
			},
			{
				label: 'Mạch (bpm)',
				data: data.map(d => d.pulse),
				borderColor: '#ef4444',
				backgroundColor: 'rgba(239, 68, 68, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y'
			},
			{
				label: 'Huyết áp (mmHg)',
				data: data.map(d => d.bloodPressure),
				borderColor: '#f97316',
				backgroundColor: 'rgba(249, 115, 22, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y'
			},
			{
				label: 'Nhiệt độ (°C)',
				data: data.map(d => d.temperature),
				borderColor: '#22c55e',
				backgroundColor: 'rgba(34, 197, 94, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y1'
			},
			{
				label: 'Cân nặng (kg)',
				data: data.map(d => d.weight),
				borderColor: '#8b5cf6',
				backgroundColor: 'rgba(139, 92, 246, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y'
			},
			{
				label: 'Chiều cao (cm)',
				data: data.map(d => d.height),
				borderColor: '#06b6d4',
				backgroundColor: 'rgba(6, 182, 212, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y1'
			},
			{
				label: 'BMI',
				data: data.map(d => d.bmi),
				borderColor: '#ec4899',
				backgroundColor: 'rgba(236, 72, 153, 0.1)',
				tension: 0.4,
				fill: false,
				yAxisID: 'y'
			}
		];
	}
	function buildVitalSignsScales() {
		return {
			x: {
				display: true,
				offset: true,
				title: {
					display: true,
					text: 'Ngày khám',
					font: { family: 'Roboto', size: 11, weight: '500' }
				},
				grid: { display: false }
			},
			y: {
				type: 'linear',
				display: true,
				position: 'left',
				title: {
					display: true,
					text: 'Giá trị',
					font: { family: 'Roboto', size: 11, weight: '500' }
				},
				grid: { color: 'rgba(0, 0, 0, 0.05)' },
				beginAtZero: false,
				grace: '10%'
			},
			y1: {
				type: 'linear',
				display: true,
				position: 'right',
				title: {
					display: true,
					text: 'N.độ (°C) / C.cao (cm)',
					font: { family: 'Roboto', size: 11, weight: '500' }
				},
				grid: { drawOnChartArea: false },
				beginAtZero: false,
				grace: '10%'
			}
		};
	}

	function buildVitalSignsElements() {
		return {
			point: {
				radius: 4,
				hoverRadius: 6,
				borderWidth: 2,
				backgroundColor: 'white'
			},
			line: {
				borderWidth: 2
			}
		};
	}

	function buildVitalSignsChartConfig(data, options = {}) {
		const ChartCtor = options.Chart || window.Chart;
		const updateAxes = typeof options.updateAxes === 'function' ? options.updateAxes : updateVitalSignsAxes;

		return {
			type: 'line',
			data: {
				labels: data.map(d => d.dateLabel),
				datasets: buildVitalSignsDatasets(data)
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				interaction: {
					mode: 'index',
					intersect: false,
				},
				plugins: {
					legend: {
						display: true,
						position: 'top',
						labels: {
							usePointStyle: true,
							padding: 15,
							font: { family: 'Roboto', size: 11 }
						},
						onClick: function (e, legendItem, legend) {
							ChartCtor.defaults.plugins.legend.onClick.call(this, e, legendItem, legend);
							updateAxes(legend.chart);
						}
					},
					tooltip: {
						backgroundColor: 'rgba(15, 23, 42, 0.9)',
						titleFont: { family: 'Roboto', size: 12, weight: '600' },
						bodyFont: { family: 'Roboto', size: 11 },
						padding: 10,
						cornerRadius: 8,
						displayColors: true
					}
				},
				scales: buildVitalSignsScales(),
				elements: buildVitalSignsElements()
			}
		};
	}
	function renderVitalSignsChart(options = {}) {
		const { canvasEl, emptyEl } = getVitalSignsElements(options);
		if (!canvasEl) return null;

		const source = Array.isArray(options.data) ? options.data : [];
		const filteredData = filterDataByTimeRange(source, options.timeRange || '1m');
		if (typeof options.onBeforeRender === 'function') {
			options.onBeforeRender(source, filteredData);
		}

		if (filteredData.length === 0) {
			return showVitalSignsEmpty({
				...options,
				message: options.emptyMessage || 'Không có dữ liệu trong khoảng thời gian này'
			});
		}

		canvasEl.style.display = 'block';
		if (emptyEl) emptyEl.style.display = 'none';

		const oldChart = typeof options.getChart === 'function' ? options.getChart() : null;
		if (oldChart && typeof oldChart.destroy === 'function') {
			oldChart.destroy();
		}

		const ChartCtor = options.Chart || window.Chart;
		const ctx = canvasEl.getContext('2d');
		const chart = new ChartCtor(ctx, buildVitalSignsChartConfig(filteredData, {
			Chart: ChartCtor,
			updateAxes: options.updateAxes
		}));

		if (typeof options.setChart === 'function') {
			options.setChart(chart);
		}

		const updateAxes = typeof options.updateAxes === 'function' ? options.updateAxes : updateVitalSignsAxes;
		updateAxes(chart);
		return chart;
	}
	function parseBloodPressure(bp) {
		if (!bp) return null;
		const match = bp.toString().match(/(\d+)/);
		return match ? parseInt(match[1]) : null;
	}
	function formatDateLabel(dateStr) {
		if (!dateStr) return '';
		const date = new Date(dateStr);
		return `${date.getDate()}/${date.getMonth() + 1}`;
	}
	function processVitalSignsData(examinations) {
		const sorted = examinations
			.filter(e => e.examination_date)
			.sort((a, b) => new Date(a.examination_date) - new Date(b.examination_date));

		return sorted.map(exam => ({
			date: exam.examination_date,
			dateLabel: formatDateLabel(exam.examination_date),
			breathing: exam.breathing || null,
			pulse: exam.pulse || null,
			bloodPressure: parseBloodPressure(exam.blood_pressure),
			temperature: exam.temperature || null,
			weight: exam.weight || null,
			height: exam.height || null,
			bmi: exam.bmi || null
		}));
	}
	function filterDataByTimeRange(data, range) {
		if (range === 'all' || !data.length) return data;

		const now = new Date();
		let cutoffDate;

		switch (range) {
			case '1w':
				cutoffDate = new Date(now.setDate(now.getDate() - 7));
				break;
			case '1m':
				cutoffDate = new Date(now.setMonth(now.getMonth() - 1));
				break;
			case '3m':
				cutoffDate = new Date(now.setMonth(now.getMonth() - 3));
				break;
			default:
				return data;
		}

		return data.filter(d => new Date(d.date) >= cutoffDate);
	}

	Object.assign(moduleParts, {
		getDocument,
		calculateAge,
		calculateBMI,
		classifyBMI,
		getLastBMIValue,
		updateBMIClassification,
		setupAgeCalculation,
		setupBMICalculation,
		updateVitalSignsAxes,
		getVitalSignsElements,
		showVitalSignsEmpty,
		buildVitalSignsDatasets,
		buildVitalSignsChartConfig,
		renderVitalSignsChart,
		parseBloodPressure,
		formatDateLabel,
		processVitalSignsData,
		filterDataByTimeRange
	});
})(window);
