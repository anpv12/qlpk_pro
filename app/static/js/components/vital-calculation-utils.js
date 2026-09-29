// Parts (nạp trước file này): part-1.js, part-2.js
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})['components/vital-calculation-utils'] || (window.QLPKModuleParts['components/vital-calculation-utils'] = { state: {} });
	const moduleState = moduleParts.state;

	moduleState.PREVIOUS_VITAL_FIELDS = [
		{ elId: 'prevBreathing', key: 'breathing' },
		{ elId: 'prevPulse', key: 'pulse' },
		{ elId: 'prevBloodPressure', key: 'blood_pressure' },
		{ elId: 'prevTemperature', key: 'temperature' },
		{ elId: 'prevWeight', key: 'weight' },
		{ elId: 'prevHeight', key: 'height' },
		{ elId: 'prevBmi', key: 'bmi' }
	];

	moduleState.api = {
		calculateAge: moduleParts.calculateAge,
		calculateBMI: moduleParts.calculateBMI,
		classifyBMI: moduleParts.classifyBMI,
		updateBMIClassification: moduleParts.updateBMIClassification,
		setupAgeCalculation: moduleParts.setupAgeCalculation,
		setupBMICalculation: moduleParts.setupBMICalculation,
		updateVitalSignsAxes: moduleParts.updateVitalSignsAxes,
		showVitalSignsEmpty: moduleParts.showVitalSignsEmpty,
		buildVitalSignsDatasets: moduleParts.buildVitalSignsDatasets,
		buildVitalSignsChartConfig: moduleParts.buildVitalSignsChartConfig,
		renderVitalSignsChart: moduleParts.renderVitalSignsChart,
		parseBloodPressure: moduleParts.parseBloodPressure,
		formatDateLabel: moduleParts.formatDateLabel,
		processVitalSignsData: moduleParts.processVitalSignsData,
		filterDataByTimeRange: moduleParts.filterDataByTimeRange,
		resetPreviousVitalHints: moduleParts.resetPreviousVitalHints,
		applyPreviousVitals: moduleParts.applyPreviousVitals,
		loadPreviousVitals: moduleParts.loadPreviousVitals,
		createPreviousVitalsLoader: moduleParts.createPreviousVitalsLoader,
		initVitalSignsTab: moduleParts.initVitalSignsTab
	};

	window.ClinicalVitalCalculationUtils = moduleState.api;
	window.DoctorExaminationVitalCalculationUtils = moduleState.api;
})(window);
