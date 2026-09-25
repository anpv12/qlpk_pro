(function (window) {
	'use strict';

	const PRESCRIPTION_STOCK_SHORTAGE_MESSAGE = 'Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.';

	function create(options = {}) {
		const state = options.state;
		const getDocument = options.getDocument;
		const textOf = options.textOf;
		const valueOf = options.valueOf;
		const apiCall = options.apiCall;
		const isLoading = options.isLoading;
		const collect = options.collect;
		const saveClinicalDetails = options.saveClinicalDetails;
		const hasUnsavedChanges = options.hasUnsavedChanges;
		const syncDirtyState = options.syncDirtyState;
		const getSupportModules = options.getSupportModules;
		const getMedicalHistory = options.getMedicalHistory;
		const getClinicalForm = options.getClinicalForm;
		const setWorkspaceSavePhase = options.setWorkspaceSavePhase;
		const setBusy = options.setBusy;
		const showToast = options.showToast;
		const afterSave = options.afterSave;
		const afterComplete = options.afterComplete;
		const getContext = options.getContext || (() => null);
		const registry = options.registry || window.QLPKDoctorModuleRegistry;
		const readResponseError = options.readResponseError || registry?.get?.('supportRuntime')?.readResponseError;
		const getDraftRecovery = options.getDraftRecovery || (() => registry?.get?.('draftRecovery'));

		function getAppointmentId() {
			return textOf(valueOf(state.appointment && state.appointment.id, state.getAppointmentId && state.getAppointmentId()));
		}

		async function captureLocalDraft() {
			const draftRecovery = getDraftRecovery();
			if (!draftRecovery || typeof draftRecovery.captureNow !== 'function') return false;
			try {
				return Boolean(await draftRecovery.captureNow({ silent: true, recoveryMode: 'failed-save' }));
			} catch (error) {
				return false;
			}
		}

		function normalizeFailureReason(value, fallback = 'Không xác định được nguyên nhân') {
			const message = value instanceof Error ? value.message : value;
			const raw = String(message || '').trim();
			const knownReasons = {
				'missing-appointment': 'Chưa chọn ca khám.',
				loading: 'Ca khám đang tải dữ liệu.',
				saving: 'Dữ liệu khám đang được lưu.',
				'workspace-saving': 'Dữ liệu khám đang được lưu.',
				'stale-context': 'Ca khám đã thay đổi trong lúc lưu.',
				stale: 'Ca khám đã thay đổi trong lúc lưu.'
			};
			return (knownReasons[raw] || raw || fallback).replace(/\s+/g, ' ').trim();
		}

		function getFailureGuidance(moduleKey, reason) {
			const normalizedReason = String(reason || '').toLowerCase();
			if (normalizedReason.includes('thay đổi trong lúc')) {
				return 'Vui lòng kiểm tra thay đổi mới và lưu lại.';
			}
			if (normalizedReason.includes('đang tải')) {
				return 'Vui lòng đợi tải xong rồi thử lại.';
			}
			if (normalizedReason.includes('đang được lưu')) {
				return 'Vui lòng đợi thao tác hiện tại hoàn tất.';
			}
			if (normalizedReason.includes('chưa chọn ca khám')) {
				return 'Vui lòng chọn ca khám rồi thử lại.';
			}
			if (normalizedReason.includes('chưa tải đủ') || normalizedReason.includes('chưa tải xong')) {
				return 'Vui lòng tải lại trang trước khi tiếp tục.';
			}
			if (moduleKey === 'prescription'
				&& (normalizedReason.includes('chọn thuốc từ kho')
					|| normalizedReason.includes('danh sách thuốc trong kho')
					|| normalizedReason.includes('medicine_id'))) {
				return 'Vui lòng chọn thuốc từ danh sách trong kho hoặc bật Nhập ngoài cơ sở.';
			}
			if (moduleKey === 'prescription' && normalizedReason.includes('tái khám')) {
				return 'Vui lòng kiểm tra thông tin tái khám rồi lưu lại.';
			}
			if (moduleKey === 'services') {
				return 'Vui lòng kiểm tra dịch vụ, số lượng và các trường bắt buộc.';
			}
			if (moduleKey === 'indications') {
				return 'Vui lòng kiểm tra chỉ định, người thực hiện và ngày thực hiện.';
			}
			if (moduleKey === 'clinical') {
				return 'Vui lòng kiểm tra các trường bắt buộc trong vùng Khám.';
			}
			return 'Vui lòng kiểm tra dữ liệu và thử lại.';
		}

		function buildFailure(module = {}) {
			const key = module.key || module.module || 'clinical';
			const label = module.label || (key === 'clinical' ? 'Khám' : key);
			const reason = normalizeFailureReason(module.reason || module.error || module.result?.reason);
			const code = module.code || module.error?.code || module.result?.code || module.result?.error?.code || '';
			return {
				...module,
				code,
				key,
				label,
				reason,
				guidance: ['inventory.batch_missing', 'inventory.batch_expired'].includes(code)
					? reason : module.guidance || getFailureGuidance(key, reason)
			};
		}

		function getSupportFailures(supportResult) {
			return (supportResult && Array.isArray(supportResult.failedModules) ? supportResult.failedModules : [])
				.map(buildFailure);
		}

		function isPrescriptionStockShortage(failure = {}) {
			const normalizedFailure = buildFailure(failure);
			if (normalizedFailure.key !== 'prescription') return false;
			if (normalizedFailure.code === 'inventory.insufficient') return true;
			const reason = normalizedFailure.reason.toLowerCase();
			return reason.includes('không đủ thuốc trong kho')
				|| reason.includes('không đủ tồn kho')
				|| (reason.includes('tồn khả dụng') && reason.includes('thiếu'));
		}

		function formatFailureMessage(failures) {
			const normalizedFailures = (Array.isArray(failures) ? failures : [failures])
				.filter(Boolean)
				.map(buildFailure);
			const hasStockShortage = normalizedFailures.some(isPrescriptionStockShortage);
			const otherFailures = normalizedFailures.filter(failure => !isPrescriptionStockShortage(failure));
			const shortageFailure = normalizedFailures.find(failure =>
				isPrescriptionStockShortage(failure) && failure.error?.payload?.shortage);
			if (shortageFailure) {
				const shortage = shortageFailure.error.payload.shortage;
				const quantityKeys = ['requested_quantity', 'stock_quantity', 'additional_quantity', 'available_quantity', 'previous_quantity'];
				if (quantityKeys.every(key => shortage[key] != null && String(shortage[key]).trim() !== '' && Number.isFinite(Number(shortage[key])) && Number(shortage[key]) >= 0)) {
					const quantity = value => Number(value).toLocaleString('vi-VN', { maximumFractionDigits: 2 });
					const unit = shortage.unit || 'đơn vị';
					const details = [];
					if (Number(shortage.previous_quantity) > 0) {
						details.push(`Đơn đã cấp ${quantity(shortage.previous_quantity)} ${unit}; lần này cần cấp thêm ${quantity(shortage.additional_quantity)} ${unit}.`);
					}
					if (Number(shortage.available_quantity) < Number(shortage.stock_quantity)) {
						details.push(`Các lô hợp lệ chỉ có thể cấp ${quantity(shortage.available_quantity)} ${unit}.`);
					}
					if (otherFailures.length) details.push(`${[...new Set(otherFailures.map(failure => failure.label))].join(', ')} cũng chưa được lưu.`);
					return {
						title: 'Chưa lưu được đơn thuốc',
						label: `${shortage.medicine_name}:`,
						emphasis: `Đang bốc ${quantity(shortage.requested_quantity)} ${unit}, tồn kho ${quantity(shortage.stock_quantity)} ${unit}.`,
						detail: details.join(' '),
						guidance: 'Vui lòng kiểm tra kho và bổ sung thuốc trước khi lưu lại.'
					};
				}
			}
			const inventoryFailure = normalizedFailures.find(failure => failure.key === 'prescription'
				&& String(failure.code).startsWith('inventory.') && Array.isArray(failure.error?.payload?.errors));
			if (inventoryFailure) {
				const details = inventoryFailure.error.payload.errors.filter(detail => typeof detail === 'string' && detail.trim());
				if (details.length) return `Chưa lưu được đơn thuốc. ${details.join(' ')}${otherFailures.filter(failure => failure !== inventoryFailure).length ? ' Các phần khác cũng chưa được lưu; vui lòng kiểm tra.' : ''}`;
			}
			if (hasStockShortage && !otherFailures.length) return PRESCRIPTION_STOCK_SHORTAGE_MESSAGE;
			if (hasStockShortage) {
				const labels = [...new Set(otherFailures.map(failure => failure.label))].join(', ');
				return `${PRESCRIPTION_STOCK_SHORTAGE_MESSAGE} ${labels} cũng chưa được lưu. Vui lòng kiểm tra vùng này.`;
			}
			if (otherFailures.length === 1) {
				const failure = otherFailures[0];
				return `${failure.label} chưa được lưu. ${failure.guidance}`;
			}
			if (otherFailures.length > 1) {
				const labels = [...new Set(otherFailures.map(failure => failure.label))].join(', ');
				return `${labels} chưa được lưu. Vui lòng kiểm tra các vùng này và thử lại.`;
			}
			return 'Chưa lưu được dữ liệu. Vui lòng thử lại.';
		}

		function getSkippedSaveMessage(reason) {
			const messages = {
				'missing-appointment': 'Chưa chọn ca khám để lưu.',
				loading: 'Ca khám đang tải dữ liệu, chưa thể lưu.',
				saving: 'Dữ liệu khám đang được lưu.',
				'workspace-saving': 'Dữ liệu khám đang được lưu.',
				stale: 'Ca khám đã thay đổi, vui lòng kiểm tra lại trước khi lưu.'
			};
			return messages[reason] || 'Chưa thể lưu dữ liệu khám lúc này.';
		}

		async function saveNow(options = {}) {
			const doc = getDocument(options);
			const appointmentId = getAppointmentId();
			if (!appointmentId) return { skipped: true, reason: 'missing-appointment' };
			if (typeof isLoading === 'function' && isLoading()) return { skipped: true, reason: 'loading' };
			if (state.saving) return { skipped: true, reason: 'saving' };
			if (typeof apiCall !== 'function') throw new Error('missing-api-call');
			if (state.loadFailed) {
				const error = new Error(state.loadFailure || 'Chưa tải đủ dữ liệu ca khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
				error.module = 'clinical';
				error.moduleLabel = 'Khám';
				throw error;
			}

			const token = state.contextToken;
			const clinicalForm = typeof getClinicalForm === 'function' ? getClinicalForm() : null;
			if (options.applyDetailDefaults === true) clinicalForm?.prepareEmptyDetailDefaults?.({ document: doc });
			const clinicalState = clinicalForm?.getSaveState?.() || {
				mainDirty: false,
				mainRevision: 0,
				detailDirtySections: new Set(),
				detailsLoading: false,
				detailsLoaded: false,
				detailsLoadPromise: null
			};
			const medicalHistory = typeof getMedicalHistory === 'function' ? getMedicalHistory() : null;
			const historyPending = Boolean(medicalHistory
				&& typeof medicalHistory.hasPendingChanges === 'function'
				&& medicalHistory.hasPendingChanges());
			const shouldSaveMain = state.mainDirty || clinicalState.mainDirty || historyPending;
			const detailSections = new Set(clinicalState.detailDirtySections);
			if (detailSections.size && clinicalState.detailsLoaded === false) {
				const error = new Error('Chưa tải xong chi tiết khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.');
				error.module = 'clinical';
				error.moduleLabel = 'Khám chi tiết';
				throw error;
			}
			if (!shouldSaveMain && !detailSections.size) return { skipped: true, reason: 'clean' };

			state.saving = true;
			try {
			if (clinicalState.detailsLoading && clinicalState.detailsLoadPromise) {
				await clinicalState.detailsLoadPromise;
					if (token !== state.contextToken) return { skipped: true, reason: 'stale' };
				}

				let mainResult = { skipped: true, reason: 'clean' };
				let detailsResult = { skipped: true, reason: 'clean' };
			if (shouldSaveMain) {
				setWorkspaceSavePhase(doc, 'main');
				const mainRevision = state.mainRevision;
				const clinicalMainRevision = clinicalState.mainRevision;
					const historyRevision = medicalHistory && typeof medicalHistory.getSaveRevision === 'function'
						? medicalHistory.getSaveRevision()
						: null;
					const payload = collect({ document: doc, context: getContext() });
					if (medicalHistory && typeof medicalHistory.getSavePayload === 'function') {
						Object.assign(payload, medicalHistory.getSavePayload());
					}
					const response = await apiCall(`/api/appointments/${appointmentId}`, {
						method: 'PUT',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(payload)
					});
					if (token !== state.contextToken) return { skipped: true, reason: 'stale' };
					if (!response || !response.ok) {
					throw new Error(await readResponseError(response, 'Không lưu được dữ liệu khám'));
					}
				if (medicalHistory && typeof medicalHistory.markSaved === 'function') medicalHistory.markSaved(historyRevision);
				if (mainRevision === state.mainRevision) state.mainDirty = false;
				if (clinicalForm?.markMainSaved) clinicalForm.markMainSaved(clinicalMainRevision);
					mainResult = { status: 'success', appointmentId };
				}

				if (detailSections.size) {
					setWorkspaceSavePhase(doc, 'details');
					detailsResult = await saveClinicalDetails(doc, appointmentId, token, detailSections, getContext());
					if (token !== state.contextToken) return { skipped: true, reason: 'stale' };
				}
				if (typeof syncDirtyState === 'function') syncDirtyState();
					if (!options.silent && typeof showToast === 'function') showToast('success', 'Đã lưu dữ liệu khám');
				return { status: 'success', appointmentId, mainResult, detailsResult };
			} catch (error) {
				if (token === state.contextToken && !options.silent && typeof showToast === 'function') {
					showToast('error', 'Không thể lưu dữ liệu khám. Vui lòng kiểm tra lại.');
				}
				throw error;
			} finally {
				if (token === state.contextToken) state.saving = false;
			}
		}

		async function saveWorkspace(options = {}) {
			const doc = getDocument(options);
			if (state.workspaceSaving) {
				const failure = buildFailure({ key: 'clinical', label: 'Khám', reason: getSkippedSaveMessage('workspace-saving') });
				if (!options.silent && typeof showToast === 'function') showToast('error', formatFailureMessage(failure));
				return { status: 'error', failedModules: [failure], reason: 'workspace-saving' };
			}
			const token = state.contextToken;
			state.workspaceSaving = true;
			setWorkspaceSavePhase(doc, 'main');
			try {
				const supportModules = typeof getSupportModules === 'function' ? getSupportModules() : null;
				const supportReadiness = supportModules && typeof supportModules.getSaveReadiness === 'function'
					? supportModules.getSaveReadiness()
					: null;
				if (supportReadiness && Array.isArray(supportReadiness.failures) && supportReadiness.failures.length) {
					await captureLocalDraft();
					if (!options.silent && typeof showToast === 'function') {
						showToast('error', formatFailureMessage(supportReadiness.failures));
					}
					return { status: 'error', failedModules: supportReadiness.failures };
				}
				const mainResult = await saveNow({ document: doc, silent: true, applyDetailDefaults: options.applyDetailDefaults === true });
				if (mainResult && mainResult.skipped && mainResult.reason !== 'clean') {
					const failure = buildFailure({
						key: 'clinical',
						label: 'Khám',
						reason: getSkippedSaveMessage(mainResult.reason)
					});
					await captureLocalDraft();
					if (!options.silent && typeof showToast === 'function') showToast('error', formatFailureMessage(failure));
					return { status: 'error', mainResult, failedModules: [failure] };
				}

				let supportResult = {
					status: 'error',
					reason: 'missing-support-modules',
					failedModules: [{ key: 'support', label: 'Các module hỗ trợ', reason: 'Không tải được các module Đơn thuốc, Dịch vụ và Chỉ định.' }]
				};
				if (supportModules && typeof supportModules.saveAll === 'function') {
					setWorkspaceSavePhase(doc, 'support');
					supportResult = await supportModules.saveAll({ document: doc, context: getContext(), silent: true, onlyDirty: true });
				}

				const historyResult = { status: 'included-with-main-save' };
				const failedModules = getSupportFailures(supportResult);
				if (failedModules.length || supportResult.status === 'error') {
					await captureLocalDraft();
					if (!options.silent && typeof showToast === 'function') showToast('error', formatFailureMessage(failedModules));
					return { status: 'error', mainResult, supportResult, historyResult, failedModules };
				}

				if (hasUnsavedChanges()) {
					const failure = buildFailure({
						key: 'clinical',
						label: 'Khám',
						reason: 'Dữ liệu đã thay đổi trong lúc đang lưu.'
					});
					await captureLocalDraft();
					if (!options.silent && typeof showToast === 'function') showToast('error', formatFailureMessage(failure));
					return { status: 'error', mainResult, supportResult, historyResult, failedModules: [failure] };
				}

				const noChanges = mainResult && mainResult.skipped && mainResult.reason === 'clean'
					&& supportResult && supportResult.status === 'skipped' && supportResult.reason === 'clean';
				if (noChanges) {
					if (!options.silent && typeof showToast === 'function') showToast('success', 'Không có thay đổi cần lưu.');
					if (typeof afterSave === 'function') await afterSave();
					return { status: 'success', noChanges: true, mainResult, supportResult, historyResult };
				}

				const supportSuccessMessage = Array.isArray(supportResult?.successMessages)
					? supportResult.successMessages[0]
					: '';
				if (!options.silent && typeof showToast === 'function') {
					showToast('success', supportSuccessMessage || 'Đã lưu dữ liệu khám');
				}
				if (typeof afterSave === 'function') await afterSave();
				return { status: 'success', mainResult, supportResult, historyResult };
			} catch (error) {
				const failure = buildFailure({
					key: error?.module || 'clinical',
					label: error?.moduleLabel || (error?.module === 'prescription' ? 'Đơn thuốc' : 'Khám'),
					error,
					reason: error?.message || 'Không lưu được dữ liệu khám'
				});
				await captureLocalDraft();
				if (!options.silent && typeof showToast === 'function') showToast('error', formatFailureMessage(failure));
				return { status: 'error', failedModules: [failure], error };
			} finally {
				if (token === state.contextToken) {
					state.workspaceSaving = false;
					state.workspacePhase = 'idle';
					setBusy(doc, state.completing, state.completing ? 'complete' : 'idle');
				}
			}
		}

		async function resolveUnsavedChanges(options = {}) {
			const doc = getDocument(options);
			if (!hasUnsavedChanges()) return true;
			const dialog = {
				title: options.title || 'Có thay đổi chưa lưu',
				message: options.message || 'Hãy lưu dữ liệu trước khi rời ca khám để tránh mất thông tin.',
				confirmButtonText: options.confirmButtonText || 'Lưu và tiếp tục',
				denyButtonText: options.denyButtonText || 'Bỏ thay đổi',
				cancelButtonText: options.cancelButtonText || 'Ở lại'
			};
			const saveAndContinue = async () => {
				try {
					await saveWorkspace({ document: doc });
					if (hasUnsavedChanges()) {
						if (typeof showToast === 'function') showToast('info', 'Có thay đổi mới phát sinh. Vui lòng lưu lại trước khi rời màn hình.');
						return false;
					}
					return true;
				} catch (error) {
					return false;
				}
			};
			const denyAndContinue = async () => {
				const onDeny = options.onDeny || options.onDiscard;
				return typeof onDeny === 'function' && (await onDeny()) !== false;
			};

			if (!window.Swal || typeof window.Swal.fire !== 'function') {
				if (typeof showToast === 'function') showToast('error', 'Không thể mở hộp thoại xác nhận. Vui lòng ở lại ca khám.');
				return false;
			}
			let result;
			try {
				result = await window.Swal.fire({
					icon: 'warning',
					title: dialog.title,
					text: dialog.message,
					showCancelButton: options.showCancelButton !== false,
					showDenyButton: true,
					confirmButtonText: dialog.confirmButtonText,
					denyButtonText: dialog.denyButtonText,
					cancelButtonText: dialog.cancelButtonText,
					buttonsStyling: false,
					reverseButtons: true,
					focusCancel: true,
					allowOutsideClick: false,
					allowEscapeKey: options.allowEscapeKey !== false,
					customClass: {
						container: 'qlpk-confirm-container',
						popup: 'qlpk-confirm-dialog qlpk-confirm-dialog--warning',
						icon: 'qlpk-confirm-dialog__icon',
						title: 'qlpk-confirm-dialog__title',
						htmlContainer: 'qlpk-confirm-dialog__text',
						actions: 'qlpk-confirm-dialog__actions',
						confirmButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--warning',
						denyButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost',
						cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
					}
				});
			} catch (error) {
				if (typeof showToast === 'function') showToast('error', 'Không thể mở hộp thoại xác nhận. Vui lòng ở lại ca khám.');
				return false;
			}
			if (result.isConfirmed) return saveAndContinue();
			if (result.isDenied) return denyAndContinue();
			return false;
		}

		async function completeNow(options = {}) {
			const doc = getDocument(options);
			const clinicalForm = typeof getClinicalForm === 'function' ? getClinicalForm() : null;
			const examinationId = clinicalForm?.getExaminationId?.();
			if (!examinationId) {
				if (typeof showToast === 'function') showToast('error', 'Chưa có lượt khám để hoàn thành');
				return { skipped: true, reason: 'missing-examination' };
			}
			if (state.completing || state.workspaceSaving) return { skipped: true, reason: state.completing ? 'completing' : 'workspace-saving' };
			if (typeof apiCall !== 'function') throw new Error('missing-api-call');

			const token = state.contextToken;
			state.completing = true;
			setWorkspaceSavePhase(doc, 'complete');
			try {
				const saveResult = await saveWorkspace({ document: doc, silent: true });
				if (!saveResult || saveResult.status !== 'success') {
					if (typeof showToast === 'function') {
						const failedModules = saveResult?.failedModules || [{
							key: 'clinical',
							label: 'Khám',
							reason: 'Vẫn còn dữ liệu chưa lưu.'
						}];
						const failureMessage = formatFailureMessage(failedModules);
						showToast(
							'error',
							failedModules.some(isPrescriptionStockShortage)
								? failureMessage
								: `Chưa thể hoàn thành ca khám. ${failureMessage}`
						);
					}
					return { skipped: true, reason: 'unsaved-changes', saveResult };
				}
				if (token !== state.contextToken) return { skipped: true, reason: 'stale' };
				setWorkspaceSavePhase(doc, 'complete');
				const response = await apiCall(`/examinations/${examinationId}/transfer-to-payment`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' }
				});
				if (!response || !response.ok) throw new Error(await readResponseError(response, 'Không hoàn thành được lượt khám'));
				if (typeof showToast === 'function') showToast('success', 'Đã hoàn thành khám');
				if (typeof afterComplete === 'function') afterComplete();
				return { status: 'success', examinationId };
			} catch (error) {
				if (token === state.contextToken && typeof showToast === 'function') showToast('error', 'Không thể hoàn thành lượt khám. Vui lòng thử lại.');
				throw error;
			} finally {
				if (token === state.contextToken) {
					state.completing = false;
					setBusy(doc, false);
				}
			}
		}

		return { saveNow, saveWorkspace, resolveUnsavedChanges, completeNow };
	}

	window.QLPKDoctorModuleRegistry.register('workspaceSaveController', { create }, {
		owner: 'doctor/workspace',
		version: 2
	});
})(window);
