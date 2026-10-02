// ECharts options for the dashboard. ECharts renders tooltips from HTML strings, so every
// data-derived value in a formatter is escaped with QLPKHtml.escape.
import { QLPKHtml } from '../shared/html-escape.js';

const EXAM_STATS_DOCTOR_COLOR = '#0F766E';
const EXAM_STATS_PSYCH_COLOR = '#E91E90';

function formatExamStatsTooltip(params) {
	let html = `<strong>${QLPKHtml.escape(params[0].name)}</strong><br/>`;
	let dayTotal = 0;
	params.forEach(p => {
		html += `${p.marker} ${p.seriesName}: <b>${p.value}</b><br/>`;
		dayTotal += p.value;
	});
	html += `<b>Tổng: ${dayTotal}</b>`;
	return html;
}

function buildExamStatsLineSeries(name, data, color, areaRgb, areaTopAlpha) {
	return {
		name,
		type: 'line',
		data,
		smooth: 0.4,
		symbol: 'circle',
		symbolSize: d => { if (d <= 0) return 0; return d === Math.max(...data) ? 8 : 5; },
		lineStyle: { color, width: 2.5 },
		itemStyle: { color, borderColor: '#fff', borderWidth: 2 },
		areaStyle: {
			color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
				colorStops: [
					{ offset: 0, color: `rgba(${areaRgb},${areaTopAlpha})` },
					{ offset: 1, color: `rgba(${areaRgb},0.02)` }
				]
			}
		},
		label: {
			show: true,
			position: 'top',
			formatter: p => p.value > 0 ? p.value : '',
			fontSize: 10, color
		},
		animationDuration: 800,
		animationEasing: 'cubicOut'
	};
}

export function buildExamStatsChartOption({ labels, doctorCounts, psychCounts, total }) {
	return {
		tooltip: { trigger: 'axis', confine: true, formatter: formatExamStatsTooltip },
		legend: {
			show: true,
			top: 4,
			left: 'center',
			textStyle: { fontSize: 11 },
			data: ['Bác sĩ', 'Tâm lý gia']
		},
		graphic: [{
			type: 'text', right: 16, top: 8,
			style: {
				text: `Tổng: ${total} lượt`,
				font: 'bold 12px sans-serif',
				fill: '#0F766E'
			}
		}],
		grid: { left: 42, right: 16, top: 42, bottom: 28 },
		xAxis: {
			type: 'category', data: labels,
			axisLabel: { fontSize: 11, color: '#64748B', interval: Math.floor(labels.length / 15) },
			axisTick: { show: false },
			axisLine: { lineStyle: { color: '#E5E7EB' } }
		},
		yAxis: {
			type: 'value', minInterval: 1,
			axisLabel: { fontSize: 11, color: '#94A3B8' },
			splitLine: { lineStyle: { color: '#F1F5F9' } }
		},
		series: [
			buildExamStatsLineSeries('Bác sĩ', doctorCounts, EXAM_STATS_DOCTOR_COLOR, '15,118,110', '0.22'),
			buildExamStatsLineSeries('Tâm lý gia', psychCounts, EXAM_STATS_PSYCH_COLOR, '233,30,144', '0.18')
		]
	};
}

export function bindExamStatsChartInteractions(chart, { items, totalDoctor, totalPsych, onDayClick }) {
	// Cập nhật tổng khi toggle legend
	chart.on('legendselectchanged', (params) => {
		const sel = params.selected;
		let filteredTotal = 0;
		if (sel['Bác sĩ']) filteredTotal += totalDoctor;
		if (sel['Tâm lý gia']) filteredTotal += totalPsych;
		chart.setOption({
			graphic: [{ style: { text: `Tổng: ${filteredTotal} lượt` } }]
		});
	});

	// Click vào vùng grid → show chi tiết ngày
	chart.getZr().on('click', (event) => {
		const pt = [event.offsetX, event.offsetY];
		if (!chart.containPixel('grid', pt)) return;
		const idx = Math.round(chart.convertFromPixel('grid', pt)[0]);
		if (idx >= 0 && idx < items.length) onDayClick(items[idx]);
	});

	// Cursor pointer khi vào vùng grid
	chart.getZr().on('mousemove', (event) => {
		const pt = [event.offsetX, event.offsetY];
		const inGrid = chart.containPixel('grid', pt);
		chart.getZr().setCursorStyle(inGrid ? 'pointer' : 'default');
	});
}

const ICD_COLORS = [
	'#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
	'#06B6D4', '#F97316', '#EC4899', '#14B8A6', '#A855F7',
	'#6366F1', '#84CC16', '#D946EF', '#0EA5E9', '#22C55E',
	'#FB923C', '#F43F5E', '#7C3AED', '#0891B2', '#65A30D'
];
export function buildICDChartOption(items) {
	const total = items.reduce((sum, item) => sum + item.count, 0);
	const treemapData = items.map((item, index) => ({
		name: item.icd_code,
		value: item.count,
		_disease: item.disease_name || '',
		_pct: total > 0 ? (item.count / total * 100).toFixed(1) : 0,
		itemStyle: { color: ICD_COLORS[index % ICD_COLORS.length] }
	}));
	return 			{
				tooltip: {
					trigger: 'item',
					confine: true,
					formatter: (p) => {
						const d = p.data;
						return `<b>${QLPKHtml.escape(d.name)}</b><br/>
							<span class="dashboard-tooltip-muted">${QLPKHtml.escape(d._disease)}</span><br/>
							${p.marker} <b>${d.value}</b> ca &nbsp;•&nbsp; ${d._pct}%`;
					}
				},
				series: [{
					type: 'treemap',
					width: '100%',
					height: '100%',
					roam: false,
					nodeClick: false,
					breadcrumb: { show: false },
					label: {
						show: true,
						formatter: (p) => `{code|${p.name}}\n{cnt|${p.value} ca}`,
						rich: {
							code: { fontSize: 13, fontWeight: 'bold', color: '#fff', lineHeight: 20 },
							cnt: { fontSize: 11, color: 'rgba(255,255,255,0.82)', lineHeight: 16 }
						}
					},
					upperLabel: { show: false },
					itemStyle: { borderWidth: 2, borderColor: '#fff', gapWidth: 2 },
					emphasis: {
						itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' },
						label: { color: '#fff' }
					},
					data: treemapData,
					animationType: 'expansion',
					animationDuration: 600
				}]
};
}
