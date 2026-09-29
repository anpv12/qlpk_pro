(function (window) {
	'use strict';

	// Data adapters for the shared patient-search modal: URLs, fetches and payload
	// shapes. No DOM, no modal state; the UI owner composes these.
	const resolveUi = (name, fallback) => window.QLPKDoctorModuleRegistry?.get?.(name) || fallback;
	const getHistoryListUi = options => options?.historyListUi || resolveUi('modalMedicalHistoryListUi', window.ModalMedicalHistoryListUi);

	function buildSearchErrorState() {
		return {
			searchResults: []
		};
	}

	function buildSearchParams(query = '', options = {}) {
		const params = new URLSearchParams();
		const normalizedQuery = String(query || '').trim();
		if (normalizedQuery) params.append('query', normalizedQuery);
		params.append('limit', String(options.limit || 50000));
		return params;
	}

	function buildSearchUrl(params) {
		const searchParams = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
		return `/api/patients/modal-search?${searchParams.toString()}`;
	}

	function extractSearchPatients(payload) {
		return payload && Array.isArray(payload.patients) ? payload.patients : [];
	}

	function buildSearchSuccessState(payload) {
		return {
			searchResults: extractSearchPatients(payload)
		};
	}

	async function fetchSearchResults(options = {}) {
		try {
			const params = buildSearchParams(options.query, { limit: options.limit });
			const response = await options.apiCall(buildSearchUrl(params));
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const data = await response.json();
			const searchSuccessState = buildSearchSuccessState(data);
			if (typeof options.onSuccess === 'function') {
				options.onSuccess(searchSuccessState, data);
			}
			return { status: 'success', data, searchSuccessState };
		} catch (error) {
			console.error(options.logMessage || 'Error fetching modal search results:', error);
			const searchErrorState = buildSearchErrorState();
			if (typeof options.onError === 'function') {
				options.onError(searchErrorState, error);
			}
			return { status: 'error', error, searchErrorState };
		}
	}

	async function fetchSearchResultsForFlow(options = {}) {
		return fetchSearchResults({
			query: options.query,
			limit: options.limit,
			apiCall: options.apiCall,
			onSuccess(searchSuccessState, data) {
				if (typeof options.isCurrent === 'function' && !options.isCurrent()) return;
				if (typeof options.setSearchResults === 'function') {
					options.setSearchResults(searchSuccessState.searchResults);
				}
				if (typeof options.renderResults === 'function') options.renderResults();
				if (typeof options.autoSelect === 'function') options.autoSelect(searchSuccessState, data);
			},
			onError(searchErrorState, error) {
				if (typeof options.isCurrent === 'function' && !options.isCurrent()) return;
				if (typeof options.setSearchResults === 'function') {
					options.setSearchResults(searchErrorState.searchResults);
				}
				if (typeof options.renderResults === 'function') options.renderResults(true);
				if (typeof options.showToast === 'function') {
					options.showToast('error', options.errorMessage || 'Không tải được danh sách bệnh nhân');
				}
				if (typeof options.onError === 'function') options.onError(searchErrorState, error);
			}
		});
	}

	function extractPatientPayload(payload) {
		return payload && payload.data ? payload.data : payload;
	}

	function buildPatientDetailUrl(patientId) {
		return `/api/patients/${patientId}`;
	}

	function buildLatestAppointmentUrl(patientId) {
		return `/api/appointments/?patient_id=${patientId}&per_page=1`;
	}

	function buildAppointmentDetailUrl(appointmentId) {
		return `/api/appointments/${appointmentId}`;
	}

	function buildAppointmentRelativesUrl(appointmentId) {
		return `/api/appointment-relatives/appointment/${appointmentId}`;
	}

	async function fetchExaminationForAppointment(appointmentId, options = {}) {
		try {
			const historyUi = getHistoryListUi(options);
			const examResponse = await options.apiCall(historyUi.buildExaminationIdUrl(appointmentId));
			if (!examResponse || !examResponse.ok) return null;
			const examinationId = historyUi.extractExaminationId(await examResponse.json());
			if (!examinationId) return null;
			const examDetailResponse = await options.apiCall(historyUi.buildExaminationDetailUrl(examinationId));
			return examDetailResponse && examDetailResponse.ok ? await examDetailResponse.json() : null;
		} catch (examError) {
			console.warn(options.examinationErrorMessage || 'Không thể lấy examination data:', examError);
			return null;
		}
	}

	async function loadLatestAppointmentContextForPatient(patientId, options = {}) {
		let appointment = null;
		let appointmentId = null;
		let examination = null;

		try {
			const appointmentResponse = await options.apiCall(buildLatestAppointmentUrl(patientId));
			if (appointmentResponse && appointmentResponse.ok) {
				const appointmentData = await appointmentResponse.json();
				const appointmentState = buildLatestAppointmentState(
					extractLatestAppointment(appointmentData)
				);
				appointment = appointmentState.appointment;
				appointmentId = appointmentState.appointmentId;
				examination = appointmentState.examination;

				if (appointment && !examination) {
					examination = await fetchExaminationForAppointment(appointment.id, options);
				}
			}
		} catch (appointmentError) {
			console.warn(options.appointmentErrorMessage || 'Không thể tìm appointment cho patient:', appointmentError);
		}

		return { appointment, appointmentId, examination };
	}

	function fetchAppointmentDetail(appointmentId, options = {}) {
		if (typeof options.apiCall !== 'function') return Promise.resolve(null);
		return options.apiCall(buildAppointmentDetailUrl(appointmentId))
			.then(response => response.ok ? response.json() : null);
	}

	function fetchAppointmentRelatives(appointmentId, options = {}) {
		const fetchImpl = options.fetch || (typeof fetch !== 'undefined' ? fetch : window.fetch);
		if (typeof fetchImpl !== 'function') return Promise.resolve({ data: [] });
		return fetchImpl(buildAppointmentRelativesUrl(appointmentId))
			.then(response => response.ok ? response.json() : { data: [] });
	}

	function buildAppointmentHistoryFetchers(options = {}) {
		return {
			fetchAppointment(appointmentId) {
				return fetchAppointmentDetail(appointmentId, options);
			},
			fetchRelatives(appointmentId) {
				return fetchAppointmentRelatives(appointmentId, options);
			}
		};
	}

	function extractLatestAppointment(payload) {
		return payload && payload.appointments && payload.appointments.length > 0
			? payload.appointments[0]
			: null;
	}

	function buildLatestAppointmentState(appointment) {
		return {
			appointment: appointment || null,
			appointmentId: appointment ? appointment.id : null,
			examination: appointment && appointment.examination ? appointment.examination : null
		};
	}

	function buildAppointmentPatientFallback(appointment) {
		if (!appointment) return null;
		return {
			id: appointment.patient_id,
			full_name: appointment.patient_full_name,
			date_of_birth: appointment.patient_date_of_birth,
			phone: appointment.patient_phone,
			gender: appointment.patient_gender || ''
		};
	}

	async function loadPatientForAppointment(appointment, options = {}) {
		if (!appointment) return null;
		let patient = null;

		if (typeof options.apiCall === 'function' && appointment.patient_id) {
			try {
				const response = await options.apiCall(buildPatientDetailUrl(appointment.patient_id));
				if (response && response.ok) {
					const data = await response.json();
					patient = extractPatientPayload(data);
				} else {
					patient = buildAppointmentPatientFallback(appointment);
				}
			} catch (error) {
				if (String(error?.code || '').startsWith('session.')) throw error;
				console.error(options.errorMessage || 'Error loading patient data:', error);
				patient = buildAppointmentPatientFallback(appointment);
			}
		} else {
			patient = buildAppointmentPatientFallback(appointment);
		}

		return patient;
	}

	window.ModalPatientSearchData = Object.freeze({
		buildSearchParams,
		buildSearchUrl,
		extractSearchPatients,
		buildSearchSuccessState,
		buildSearchErrorState,
		fetchSearchResults,
		fetchSearchResultsForFlow,
		extractPatientPayload,
		buildPatientDetailUrl,
		buildLatestAppointmentUrl,
		buildAppointmentDetailUrl,
		buildAppointmentRelativesUrl,
		loadLatestAppointmentContextForPatient,
		fetchAppointmentDetail,
		fetchAppointmentRelatives,
		buildAppointmentHistoryFetchers,
		extractLatestAppointment,
		buildLatestAppointmentState,
		buildAppointmentPatientFallback,
		loadPatientForAppointment
	});
	window.QLPKDoctorModuleRegistry?.register?.('modalPatientSearchData', window.ModalPatientSearchData, { owner: 'shared/patient-modal' });
})(window);
