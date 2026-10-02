import { JointExamManager } from '../joint-exam-manager.js';
import { QLPKDoctorPageRuntime } from '../doctor-examination/page-runtime.js';

// Joint-exam modal of the doctor and psychologist pages. Each page entry mounts it with its accessors:
// getAppointmentId(), getContextToken() and, where the page owns a relatives table, getRelativeTable().
export function mountJointExamPage(page = {}) {
	function start() {
		const manager = new JointExamManager({
			getAppointmentId: () => page.getAppointmentId?.() ?? null,
			getContextToken: () => page.getContextToken?.(),
			onReloadFamilyMembers: () => page.getRelativeTable?.()?.reload(),
			showToast: (type, message) => QLPKDoctorPageRuntime.showCustomToast(type, message),
			apiCall: QLPKDoctorPageRuntime.apiCall,
			formatDateDisplay: value => QLPKDoctorPageRuntime.formatDateDisplay(value),
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
	}

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
	else start();
}
