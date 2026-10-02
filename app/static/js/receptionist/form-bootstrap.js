function getWindow(options = {}) {
	return options.window || window;
}

function getSetTimeout(options = {}) {
	return options.setTimeout || getWindow(options).setTimeout;
}

function callIfFunction(callback) {
	if (typeof callback === 'function') {
		return callback();
	}
	return undefined;
}

function initializeForm(options = {}) {
	callIfFunction(options.loadServicesForForm);
	callIfFunction(options.setupAgeCalculation);
	callIfFunction(options.setupBMICalculation);

	getSetTimeout(options)(() => {
		setupFormEventHandlers(options);
	}, 100);
}

function registerRelativeLinkResolver(options = {}) {
	const win = getWindow(options);
	const relativeLinkHandler = options.relativeLinkHandler || win.RelativeLinkHandler;
	const openRelativePatient = options.openRelativePatient;
	if (!relativeLinkHandler || typeof openRelativePatient !== 'function') return;

	relativeLinkHandler.registerResolver(async (patientId) => {
		if (!patientId) return;
		await openRelativePatient(patientId);
	});
}

function setupFormEventHandlers(options = {}) {
	registerRelativeLinkResolver(options);

}

export const ReceptionistFormBootstrap = {
	initializeForm,
	setupFormEventHandlers
};
