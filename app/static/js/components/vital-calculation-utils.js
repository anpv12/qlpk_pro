import { moduleState } from './vital-calculation-utils-parts/state.js';
import { buildVitalSignsChartConfig, buildVitalSignsDatasets, calculateAge, calculateBMI, classifyBMI, filterDataByTimeRange, formatDateLabel, parseBloodPressure, processVitalSignsData, renderVitalSignsChart, setupAgeCalculation, setupBMICalculation, showVitalSignsEmpty, updateBMIClassification, updateVitalSignsAxes } from './vital-calculation-utils-parts/bmi-and-age.js';
import { applyPreviousVitals, createPreviousVitalsLoader, initVitalSignsTab, loadPreviousVitals, resetPreviousVitalHints } from './vital-calculation-utils-parts/previous-vitals.js';

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
	calculateAge: calculateAge,
	calculateBMI: calculateBMI,
	classifyBMI: classifyBMI,
	updateBMIClassification: updateBMIClassification,
	setupAgeCalculation: setupAgeCalculation,
	setupBMICalculation: setupBMICalculation,
	updateVitalSignsAxes: updateVitalSignsAxes,
	showVitalSignsEmpty: showVitalSignsEmpty,
	buildVitalSignsDatasets: buildVitalSignsDatasets,
	buildVitalSignsChartConfig: buildVitalSignsChartConfig,
	renderVitalSignsChart: renderVitalSignsChart,
	parseBloodPressure: parseBloodPressure,
	formatDateLabel: formatDateLabel,
	processVitalSignsData: processVitalSignsData,
	filterDataByTimeRange: filterDataByTimeRange,
	resetPreviousVitalHints: resetPreviousVitalHints,
	applyPreviousVitals: applyPreviousVitals,
	loadPreviousVitals: loadPreviousVitals,
	createPreviousVitalsLoader: createPreviousVitalsLoader,
	initVitalSignsTab: initVitalSignsTab
};

export const ClinicalVitalCalculationUtils = moduleState.api;
