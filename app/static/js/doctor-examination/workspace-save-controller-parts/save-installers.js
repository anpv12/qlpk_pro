// workspace-save-controller.js: PRESCRIPTION_STOCK_SHORTAGE_MESSAGE, installWorkspaceSaveFns1, installWorkspaceSaveFns2, installWorkspaceSaveFns3, installWorkspaceSaveFns4, installWorkspaceSaveFns5, installWorkspaceSaveFns6, installWorkspaceSaveFns7 (nạp trước workspace-save-controller.js; dùng chung qua QLPKModuleParts).
(function (window) {
	'use strict';
	const moduleParts = (window.QLPKModuleParts = window.QLPKModuleParts || {})["doctor-examination/workspace-save-controller"] || (window.QLPKModuleParts["doctor-examination/workspace-save-controller"] = { state: {} });

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

	Object.assign(moduleParts, { PRESCRIPTION_STOCK_SHORTAGE_MESSAGE, installWorkspaceSaveFns1, installWorkspaceSaveFns2, installWorkspaceSaveFns3, installWorkspaceSaveFns4, installWorkspaceSaveFns5, installWorkspaceSaveFns6, installWorkspaceSaveFns7 });
})(window);
