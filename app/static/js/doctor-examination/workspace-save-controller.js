// Parts (nạp trước file này): save-installers.js
(function (window) {
	'use strict';
	const { installWorkspaceSaveFns1, installWorkspaceSaveFns2, installWorkspaceSaveFns3, installWorkspaceSaveFns4, installWorkspaceSaveFns5, installWorkspaceSaveFns6, installWorkspaceSaveFns7 } = window.QLPKModuleParts["doctor-examination/workspace-save-controller"];

	const PASSTHROUGH_OPTION_KEYS = ['state', 'mainChanges', 'getDocument', 'textOf', 'valueOf', 'apiCall', 'isLoading', 'collect', 'saveClinicalDetails', 'hasUnsavedChanges', 'syncDirtyState', 'getSupportModules', 'getMedicalHistory', 'getClinicalForm', 'setWorkspaceSavePhase', 'setBusy', 'showToast', 'afterSave', 'afterComplete'];

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
