/* global currentAppointmentId */
(function () {
	function formatDateDisplay(value) {
		const pageRuntime = window.QLPKDoctorPageRuntime;
		if (pageRuntime && typeof pageRuntime.formatDateDisplay === 'function') {
			return pageRuntime.formatDateDisplay(value);
		}
		if (!value) return '';
		if (value.includes('/')) return value;
		try {
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return '';
			return date.toLocaleDateString('vi-VN');
		} catch {
			return '';
		}
	}

	function showToast(type, message) {
		const pageRuntime = window.QLPKDoctorPageRuntime;
		if (pageRuntime && typeof pageRuntime.showCustomToast === 'function') {
			pageRuntime.showCustomToast(type, message);
			return;
		}
		if (window.showCustomToast) {
			window.showCustomToast(type, message);
			return;
		}
		window.QLPKUserFeedback?.show(type, message);
	}

	function getCurrentAppointmentId() {
		if (window.QLPKCurrentAppointment && typeof window.QLPKCurrentAppointment.getId === 'function') {
			return window.QLPKCurrentAppointment.getId();
		}
		if (typeof currentAppointmentId !== 'undefined') {
			return currentAppointmentId;
		}
		return null;
	}

	function getApiCall() {
		const pageRuntime = window.QLPKDoctorPageRuntime;
		if (pageRuntime && typeof pageRuntime.apiCall === 'function') {
			return pageRuntime.apiCall;
		}
		if (window.QLPKCurrentAppointment && typeof window.QLPKCurrentAppointment.apiCall === 'function') {
			return window.QLPKCurrentAppointment.apiCall;
		}
		return fetch;
	}

	function reloadFamilyMembers() {
		if (window.relativeTableInstance) {
			window.relativeTableInstance.reload();
		}
	}

	document.addEventListener('DOMContentLoaded', function () {
		if (typeof window.JointExamManager === 'undefined') return;

		const manager = new window.JointExamManager({
			getAppointmentId: getCurrentAppointmentId,
			getContextToken: () => window.QLPKDoctorPage?.getState().loadToken
				?? window.QLPKPsychologistPageState?.contextToken,
			onReloadFamilyMembers: reloadFamilyMembers,
			showToast,
			apiCall: getApiCall(),
			formatDateDisplay,
		});

		manager.init();

		const jointExamBtn = document.getElementById('jointExamEditBtn');
		if (jointExamBtn) {
			jointExamBtn.addEventListener('click', function () {
				const modal = new bootstrap.Modal(document.getElementById('jointExamModal'));
				modal.show();
				manager.load();
			});
		}
	});
})();
