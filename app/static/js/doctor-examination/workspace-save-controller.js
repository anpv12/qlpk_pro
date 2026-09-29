(function (window) {
	'use strict';

	const PASSTHROUGH_OPTION_KEYS = ['state', 'mainChanges', 'getDocument', 'textOf', 'valueOf', 'apiCall', 'isLoading', 'collect', 'saveClinicalDetails', 'hasUnsavedChanges', 'syncDirtyState', 'getSupportModules', 'getMedicalHistory', 'getClinicalForm', 'setWorkspaceSavePhase', 'setBusy', 'showToast', 'afterSave', 'afterComplete'];
	const PRESCRIPTION_STOCK_SHORTAGE_MESSAGE = 'Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.';

	function installWorkspaceSaveFns1(ctx) {
		function getAppointmentId() {
			return ctx.textOf(ctx.valueOf(ctx.state.appointment && ctx.state.appointment.id, ctx.state.getAppointmentId && ctx.state.getAppointmentId()));
		}

		async function captureLocalDraft() {
			const draftRecovery = ctx.getDraftRecovery();
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
			const rule = ctx.FAILURE_GUIDANCE_RULES.find(([key, needles]) => (key === null || key === moduleKey)
				&& needles.some(needle => normalizedReason.includes(needle)));
			if (rule) return rule[2];
			return Object.prototype.hasOwnProperty.call(ctx.MODULE_FAILURE_GUIDANCE, moduleKey)
				? ctx.MODULE_FAILURE_GUIDANCE[moduleKey] : 'Vui lòng kiểm tra dữ liệu và thử lại.';
		}

		function resolveFailureCode(module) {
			return module.code || module.error?.code || module.result?.code || module.result?.error?.code || '';
		}

		function buildFailure(module = {}) {
			const key = module.key || module.module || 'clinical';
			const label = module.label || (key === 'clinical' ? 'Khám' : key);
			const reason = normalizeFailureReason(module.reason || module.error || module.result?.reason);
			const code = resolveFailureCode(module);
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

		Object.assign(ctx, { getAppointmentId, captureLocalDraft, buildFailure, getSupportFailures });
	}

	function installWorkspaceSaveFns2(ctx) {
		function isPrescriptionStockShortage(failure = {}) {
			const normalizedFailure = ctx.buildFailure(failure);
			if (normalizedFailure.key !== 'prescription') return false;
			if (normalizedFailure.code === 'inventory.insufficient') return true;
			const reason = normalizedFailure.reason.toLowerCase();
			return reason.includes('không đủ thuốc trong kho')
				|| reason.includes('không đủ tồn kho')
				|| (reason.includes('tồn khả dụng') && reason.includes('thiếu'));
		}

		function isKnownQuantity(value) {
			return value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
		}

		function formatStockShortageDetail(shortage, otherFailures) {
			const quantityKeys = ['requested_quantity', 'stock_quantity', 'additional_quantity', 'available_quantity', 'previous_quantity'];
			if (!quantityKeys.every(key => isKnownQuantity(shortage[key]))) return null;
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

		function formatInventoryFailureMessage(normalizedFailures, otherFailures) {
			const inventoryFailure = normalizedFailures.find(failure => failure.key === 'prescription'
				&& String(failure.code).startsWith('inventory.') && Array.isArray(failure.error?.payload?.errors));
			if (!inventoryFailure) return null;
			const details = inventoryFailure.error.payload.errors.filter(detail => typeof detail === 'string' && detail.trim());
			if (!details.length) return null;
			const others = otherFailures.filter(failure => failure !== inventoryFailure).length ? ' Các phần khác cũng chưa được lưu; vui lòng kiểm tra.' : '';
			return `Chưa lưu được đơn thuốc. ${details.join(' ')}${others}`;
		}

		Object.assign(ctx, { isPrescriptionStockShortage, formatStockShortageDetail, formatInventoryFailureMessage });
	}

	function installWorkspaceSaveFns3(ctx) {
		function formatFailureMessage(failures) {
			const normalizedFailures = (Array.isArray(failures) ? failures : [failures])
				.filter(Boolean)
				.map(ctx.buildFailure);
			const hasStockShortage = normalizedFailures.some(ctx.isPrescriptionStockShortage);
			const otherFailures = normalizedFailures.filter(failure => !ctx.isPrescriptionStockShortage(failure));
			const shortageFailure = normalizedFailures.find(failure =>
				ctx.isPrescriptionStockShortage(failure) && failure.error?.payload?.shortage);
			const shortageMessage = shortageFailure ? ctx.formatStockShortageDetail(shortageFailure.error.payload.shortage, otherFailures) : null;
			if (shortageMessage) return shortageMessage;
			const inventoryMessage = ctx.formatInventoryFailureMessage(normalizedFailures, otherFailures);
			if (inventoryMessage) return inventoryMessage;
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

		function notify(options, type, message) {
			if (!options.silent && typeof ctx.showToast === 'function') ctx.showToast(type, message);
		}

		function createModuleError(message, module, moduleLabel) {
			const error = new Error(message);
			error.module = module;
			error.moduleLabel = moduleLabel;
			return error;
		}

		function getSaveSkipReason() {
			if (!ctx.getAppointmentId()) return 'missing-appointment';
			if (typeof ctx.isLoading === 'function' && ctx.isLoading()) return 'loading';
			if (ctx.state.saving) return 'saving';
			return null;
		}

		Object.assign(ctx, { formatFailureMessage, getSkippedSaveMessage, notify, createModuleError, getSaveSkipReason });
	}

	function installWorkspaceSaveFns4(ctx) {
		function getClinicalSaveState(clinicalForm) {
			return clinicalForm?.getSaveState?.() || {
				mainDirty: false,
				mainRevision: 0,
				detailDirtySections: new Set(),
				detailsLoading: false,
				detailsLoaded: false,
				detailsLoadPromise: null
			};
		}

		function buildSavePlan(doc, options) {
			const clinicalForm = typeof ctx.getClinicalForm === 'function' ? ctx.getClinicalForm() : null;
			if (options.applyDetailDefaults === true) clinicalForm?.prepareEmptyDetailDefaults?.({ document: doc });
			const clinicalState = getClinicalSaveState(clinicalForm);
			const medicalHistory = typeof ctx.getMedicalHistory === 'function' ? ctx.getMedicalHistory() : null;
			const historyPending = typeof medicalHistory?.hasPendingChanges === 'function' && Boolean(medicalHistory.hasPendingChanges());
			return {
				clinicalForm,
				clinicalState,
				medicalHistory,
				shouldSaveMain: Boolean(ctx.state.mainDirty || clinicalState.mainDirty || historyPending),
				detailSections: new Set(clinicalState.detailDirtySections)
			};
		}

		async function saveMainSection(doc, appointmentId, token, plan) {
			const { clinicalForm, clinicalState, medicalHistory } = plan;
			ctx.setWorkspaceSavePhase(doc, 'main');
			const mainRevision = ctx.mainChanges.capture();
			const clinicalMainRevision = clinicalState.mainRevision;
			const historyRevision = typeof medicalHistory?.getSaveRevision === 'function'
				? medicalHistory.getSaveRevision()
				: null;
			const payload = ctx.collect({ document: doc, context: ctx.getContext() });
			if (typeof medicalHistory?.getSavePayload === 'function') {
				Object.assign(payload, medicalHistory.getSavePayload());
			}
			const response = await ctx.apiCall(`/api/appointments/${appointmentId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (token !== ctx.state.contextToken) return null;
			if (!response || !response.ok) {
				throw new Error(await ctx.readResponseError(response, 'Không lưu được dữ liệu khám'));
			}
			if (typeof medicalHistory?.markSaved === 'function') medicalHistory.markSaved(historyRevision);
			ctx.mainChanges.settle(mainRevision);
			if (clinicalForm?.markMainSaved) clinicalForm.markMainSaved(clinicalMainRevision);
			return { status: 'success', appointmentId };
		}

		function assertSaveReady() {
			if (typeof ctx.apiCall !== 'function') throw new Error('missing-api-call');
			if (ctx.state.loadFailed) {
				throw ctx.createModuleError(ctx.state.loadFailure || 'Chưa tải đủ dữ liệu ca khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.', 'clinical', 'Khám');
			}
		}

		function assertDetailsSaveable(plan) {
			if (plan.detailSections.size && plan.clinicalState.detailsLoaded === false) {
				throw ctx.createModuleError('Chưa tải xong chi tiết khám; chưa thực hiện lưu để tránh xóa nhầm dữ liệu.', 'clinical', 'Khám chi tiết');
			}
		}

		Object.assign(ctx, { buildSavePlan, saveMainSection, assertSaveReady, assertDetailsSaveable });
	}

	function installWorkspaceSaveFns5(ctx) {
		async function waitForDetailsLoad(clinicalState, token) {
			if (!clinicalState.detailsLoading || !clinicalState.detailsLoadPromise) return true;
			await clinicalState.detailsLoadPromise;
			return token === ctx.state.contextToken;
		}

		async function saveSections(doc, appointmentId, token, plan) {
			const { shouldSaveMain, detailSections } = plan;
			let mainResult = { skipped: true, reason: 'clean' };
			let detailsResult = { skipped: true, reason: 'clean' };
			if (shouldSaveMain) {
				mainResult = await ctx.saveMainSection(doc, appointmentId, token, plan);
				if (!mainResult) return null;
			}
			if (detailSections.size) {
				ctx.setWorkspaceSavePhase(doc, 'details');
				detailsResult = await ctx.saveClinicalDetails(doc, appointmentId, token, detailSections, ctx.getContext());
				if (token !== ctx.state.contextToken) return null;
			}
			return { mainResult, detailsResult };
		}

		async function saveNow(options = {}) {
			const doc = ctx.getDocument(options);
			const appointmentId = ctx.getAppointmentId();
			const skipReason = ctx.getSaveSkipReason();
			if (skipReason) return { skipped: true, reason: skipReason };
			ctx.assertSaveReady();

			const token = ctx.state.contextToken;
			const plan = ctx.buildSavePlan(doc, options);
			ctx.assertDetailsSaveable(plan);
			if (!plan.shouldSaveMain && !plan.detailSections.size) return { skipped: true, reason: 'clean' };

			ctx.state.saving = true;
			try {
				if (!(await waitForDetailsLoad(plan.clinicalState, token))) return { skipped: true, reason: 'stale' };
				const sections = await saveSections(doc, appointmentId, token, plan);
				if (!sections) return { skipped: true, reason: 'stale' };
				if (typeof ctx.syncDirtyState === 'function') ctx.syncDirtyState();
				ctx.notify(options, 'success', 'Đã lưu dữ liệu khám');
				return { status: 'success', appointmentId, ...sections };
			} catch (error) {
				if (token === ctx.state.contextToken) ctx.notify(options, 'error', 'Không thể lưu dữ liệu khám. Vui lòng kiểm tra lại.');
				throw error;
			} finally {
				if (token === ctx.state.contextToken) ctx.state.saving = false;
			}
		}

		function clinicalFailure(reason) {
			return ctx.buildFailure({ key: 'clinical', label: 'Khám', reason });
		}

		async function failWorkspaceSave(options, failedModules, extra = {}) {
			await ctx.captureLocalDraft();
			ctx.notify(options, 'error', ctx.formatFailureMessage(failedModules));
			return { status: 'error', failedModules, ...extra };
		}

		Object.assign(ctx, { saveNow, clinicalFailure, failWorkspaceSave });
	}

	function installWorkspaceSaveFns6(ctx) {
		async function saveSupportModules(doc, supportModules) {
			if (!supportModules || typeof supportModules.saveAll !== 'function') {
				return {
					status: 'error',
					reason: 'missing-support-modules',
					failedModules: [{ key: 'support', label: 'Các module hỗ trợ', reason: 'Không tải được các module Đơn thuốc, Dịch vụ và Chỉ định.' }]
				};
			}
			ctx.setWorkspaceSavePhase(doc, 'support');
			return supportModules.saveAll({ document: doc, context: ctx.getContext(), silent: true, onlyDirty: true });
		}

		function getSupportReadinessFailures(supportModules) {
			if (typeof supportModules?.getSaveReadiness !== 'function') return [];
			const failures = supportModules.getSaveReadiness()?.failures;
			return Array.isArray(failures) ? failures : [];
		}

		function isSkippedFor(result, predicate) {
			return Boolean(result && result.skipped) && predicate(result.reason);
		}

		function isCleanSupportResult(result) {
			return Boolean(result && result.status === 'skipped' && result.reason === 'clean');
		}

		function getWorkspaceSuccessMessage(noChanges, supportResult) {
			if (noChanges) return 'Không có thay đổi cần lưu.';
			const supportSuccessMessage = Array.isArray(supportResult?.successMessages) ? supportResult.successMessages[0] : '';
			return supportSuccessMessage || 'Đã lưu dữ liệu khám';
		}

		async function runWorkspaceSave(doc, options) {
			const supportModules = typeof ctx.getSupportModules === 'function' ? ctx.getSupportModules() : null;
			const readinessFailures = getSupportReadinessFailures(supportModules);
			if (readinessFailures.length) return ctx.failWorkspaceSave(options, readinessFailures);
			const mainResult = await ctx.saveNow({ document: doc, silent: true, applyDetailDefaults: options.applyDetailDefaults === true });
			if (isSkippedFor(mainResult, reason => reason !== 'clean')) {
				return ctx.failWorkspaceSave(options, [ctx.clinicalFailure(ctx.getSkippedSaveMessage(mainResult.reason))], { mainResult });
			}

			const supportResult = await saveSupportModules(doc, supportModules);
			const results = { mainResult, supportResult, historyResult: { status: 'included-with-main-save' } };
			const failedModules = ctx.getSupportFailures(supportResult);
			if (failedModules.length || supportResult.status === 'error') return ctx.failWorkspaceSave(options, failedModules, results);
			if (ctx.hasUnsavedChanges()) return ctx.failWorkspaceSave(options, [ctx.clinicalFailure('Dữ liệu đã thay đổi trong lúc đang lưu.')], results);

			const noChanges = isSkippedFor(mainResult, reason => reason === 'clean') && isCleanSupportResult(supportResult);
			ctx.notify(options, 'success', getWorkspaceSuccessMessage(noChanges, supportResult));
			if (typeof ctx.afterSave === 'function') await ctx.afterSave();
			return noChanges ? { status: 'success', noChanges: true, ...results } : { status: 'success', ...results };
		}

		Object.assign(ctx, { runWorkspaceSave });
	}

	function installWorkspaceSaveFns7(ctx) {
		async function saveWorkspace(options = {}) {
			const doc = ctx.getDocument(options);
			if (ctx.state.workspaceSaving) {
				const failure = ctx.clinicalFailure(ctx.getSkippedSaveMessage('workspace-saving'));
				ctx.notify(options, 'error', ctx.formatFailureMessage(failure));
				return { status: 'error', failedModules: [failure], reason: 'workspace-saving' };
			}
			const token = ctx.state.contextToken;
			ctx.state.workspaceSaving = true;
			ctx.setWorkspaceSavePhase(doc, 'main');
			try {
				return await ctx.runWorkspaceSave(doc, options);
			} catch (error) {
				const failure = ctx.buildFailure({
					key: error?.module || 'clinical',
					label: error?.moduleLabel || (error?.module === 'prescription' ? 'Đơn thuốc' : 'Khám'),
					error,
					reason: error?.message || 'Không lưu được dữ liệu khám'
				});
				return ctx.failWorkspaceSave(options, [failure], { error });
			} finally {
				if (token === ctx.state.contextToken) {
					ctx.state.workspaceSaving = false;
					ctx.state.workspacePhase = 'idle';
					ctx.setBusy(doc, ctx.state.completing, ctx.state.completing ? 'complete' : 'idle');
				}
			}
		}

		Object.assign(ctx, { saveWorkspace });
	}

	function installWorkspaceSaveFns8(ctx) {
		async function resolveUnsavedChanges(options = {}) {
			const doc = ctx.getDocument(options);
			if (!ctx.hasUnsavedChanges()) return true;
			const dialog = {
				title: options.title || 'Có thay đổi chưa lưu',
				message: options.message || 'Hãy lưu dữ liệu trước khi rời ca khám để tránh mất thông tin.',
				confirmButtonText: options.confirmButtonText || 'Lưu và tiếp tục',
				denyButtonText: options.denyButtonText || 'Bỏ thay đổi',
				cancelButtonText: options.cancelButtonText || 'Ở lại'
			};
			const saveAndContinue = async () => {
				try {
					await ctx.saveWorkspace({ document: doc });
					if (ctx.hasUnsavedChanges()) {
						if (typeof ctx.showToast === 'function') ctx.showToast('info', 'Có thay đổi mới phát sinh. Vui lòng lưu lại trước khi rời màn hình.');
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

			const choice = await ctx.registry.require('confirmationDialog').choose({
				variant: 'warning',
				icon: 'warning',
				title: dialog.title,
				text: dialog.message,
				confirmText: dialog.confirmButtonText,
				denyText: dialog.denyButtonText,
				cancelText: dialog.cancelButtonText,
				showCancelButton: options.showCancelButton !== false,
				allowEscapeKey: options.allowEscapeKey !== false,
				showToast: ctx.showToast,
				failureMessage: 'Không thể mở hộp thoại xác nhận. Vui lòng ở lại ca khám.'
			});
			if (choice === 'confirm') return saveAndContinue();
			if (choice === 'deny') return denyAndContinue();
			return false;
		}

		function reportIncompleteSave(saveResult) {
			if (typeof ctx.showToast !== 'function') return;
			const failedModules = saveResult?.failedModules || [{
				key: 'clinical',
				label: 'Khám',
				reason: 'Vẫn còn dữ liệu chưa lưu.'
			}];
			const failureMessage = ctx.formatFailureMessage(failedModules);
			ctx.showToast(
				'error',
				failedModules.some(ctx.isPrescriptionStockShortage)
					? failureMessage
					: `Chưa thể hoàn thành ca khám. ${failureMessage}`
			);
		}

		Object.assign(ctx, { resolveUnsavedChanges, reportIncompleteSave });
	}

	function installWorkspaceSaveFns9(ctx) {
		async function transferToPayment(doc, examinationId) {
			ctx.setWorkspaceSavePhase(doc, 'complete');
			const response = await ctx.apiCall(`/examinations/${examinationId}/transfer-to-payment`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' }
			});
			if (!response || !response.ok) throw new Error(await ctx.readResponseError(response, 'Không hoàn thành được lượt khám'));
			if (typeof ctx.showToast === 'function') ctx.showToast('success', 'Đã hoàn thành khám');
			if (typeof ctx.afterComplete === 'function') ctx.afterComplete();
		}

		async function completeNow(options = {}) {
			const doc = ctx.getDocument(options);
			const clinicalForm = typeof ctx.getClinicalForm === 'function' ? ctx.getClinicalForm() : null;
			const examinationId = clinicalForm?.getExaminationId?.();
			const blocked = getCompletionBlocker(examinationId);
			if (blocked) return blocked;
			if (typeof ctx.apiCall !== 'function') throw new Error('missing-api-call');

			const token = ctx.state.contextToken;
			ctx.state.completing = true;
			ctx.setWorkspaceSavePhase(doc, 'complete');
			try {
				const saveResult = await ctx.saveWorkspace({ document: doc, silent: true });
				if (!saveResult || saveResult.status !== 'success') {
					ctx.reportIncompleteSave(saveResult);
					return { skipped: true, reason: 'unsaved-changes', saveResult };
				}
				if (token !== ctx.state.contextToken) return { skipped: true, reason: 'stale' };
				await transferToPayment(doc, examinationId);
				return { status: 'success', examinationId };
			} catch (error) {
				if (token === ctx.state.contextToken && typeof ctx.showToast === 'function') ctx.showToast('error', 'Không thể hoàn thành lượt khám. Vui lòng thử lại.');
				throw error;
			} finally {
				if (token === ctx.state.contextToken) releaseCompletion(doc);
			}
		}

		function getCompletionBlocker(examinationId) {
			if (!examinationId) {
				if (typeof ctx.showToast === 'function') ctx.showToast('error', 'Chưa có lượt khám để hoàn thành');
				return { skipped: true, reason: 'missing-examination' };
			}
			if (ctx.state.completing) return { skipped: true, reason: 'completing' };
			if (ctx.state.workspaceSaving) return { skipped: true, reason: 'workspace-saving' };
			return null;
		}

		function releaseCompletion(doc) {
			ctx.state.completing = false;
			ctx.setBusy(doc, false);
		}

		Object.assign(ctx, { completeNow });
	}

	function create(options = {}) {
		const ctx = {};
		installWorkspaceSaveFns1(ctx);
		installWorkspaceSaveFns2(ctx);
		installWorkspaceSaveFns3(ctx);
		installWorkspaceSaveFns4(ctx);
		installWorkspaceSaveFns5(ctx);
		installWorkspaceSaveFns6(ctx);
		installWorkspaceSaveFns7(ctx);
		installWorkspaceSaveFns8(ctx);
		installWorkspaceSaveFns9(ctx);

		PASSTHROUGH_OPTION_KEYS.forEach(key => { ctx[key] = options[key]; });
		if (!ctx.mainChanges) throw new Error('Thiếu tracker thay đổi của vùng Khám');
		ctx.getContext = options.getContext || (() => null);
		ctx.registry = options.registry || window.QLPKDoctorModuleRegistry;
		ctx.readResponseError = options.readResponseError || ctx.registry?.get?.('supportRuntime')?.readResponseError;
		ctx.getDraftRecovery = options.getDraftRecovery || (() => ctx.registry?.get?.('draftRecovery'));

		// [module key or null for any, reason substrings, guidance], checked in order.
		ctx.FAILURE_GUIDANCE_RULES = [
			[null, ['thay đổi trong lúc'], 'Vui lòng kiểm tra thay đổi mới và lưu lại.'],
			[null, ['đang tải'], 'Vui lòng đợi tải xong rồi thử lại.'],
			[null, ['đang được lưu'], 'Vui lòng đợi thao tác hiện tại hoàn tất.'],
			[null, ['chưa chọn ca khám'], 'Vui lòng chọn ca khám rồi thử lại.'],
			[null, ['chưa tải đủ', 'chưa tải xong'], 'Vui lòng tải lại trang trước khi tiếp tục.'],
			['prescription', ['chọn thuốc từ kho', 'danh sách thuốc trong kho', 'medicine_id'], 'Vui lòng chọn thuốc từ danh sách trong kho hoặc bật Nhập ngoài cơ sở.'],
			['prescription', ['tái khám'], 'Vui lòng kiểm tra thông tin tái khám rồi lưu lại.']
		];
		ctx.MODULE_FAILURE_GUIDANCE = {
			services: 'Vui lòng kiểm tra dịch vụ, số lượng và các trường bắt buộc.',
			indications: 'Vui lòng kiểm tra chỉ định, người thực hiện và ngày thực hiện.',
			clinical: 'Vui lòng kiểm tra các trường bắt buộc trong vùng Khám.'
		};

		return { saveNow: ctx.saveNow, saveWorkspace: ctx.saveWorkspace, resolveUnsavedChanges: ctx.resolveUnsavedChanges, completeNow: ctx.completeNow };
	}

	window.QLPKDoctorModuleRegistry.register('workspaceSaveController', { create }, {
		owner: 'doctor/workspace',
		version: 2
	});
})(window);
