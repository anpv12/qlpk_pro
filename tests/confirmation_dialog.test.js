const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SOURCE = fs.readFileSync('app/static/js/shared/confirmation-dialog.js', 'utf8');

function loadDialog(result) {
    const calls = [];
    const window = {
        Swal: result === 'missing' ? undefined : {
            fire: async options => {
                calls.push(options);
                return result;
            }
        }
    };
    vm.runInNewContext(SOURCE, { window });
    return { dialog: window.QLPKConfirmationDialog, calls };
}

const baseClasses = variant => ({
    container: 'qlpk-confirm-container',
    popup: `qlpk-confirm-dialog qlpk-confirm-dialog--${variant}`,
    icon: 'qlpk-confirm-dialog__icon',
    title: 'qlpk-confirm-dialog__title',
    htmlContainer: 'qlpk-confirm-dialog__text',
    actions: 'qlpk-confirm-dialog__actions',
    confirmButton: `qlpk-confirm-dialog__button qlpk-confirm-dialog__button--${variant}`,
    cancelButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost'
});

test('confirm keeps the two-button shared dialog contract', async () => {
    const { dialog, calls } = loadDialog({ isConfirmed: true });
    assert.equal(await dialog.confirm({ title: 'Xóa chỉ định', text: 'Xóa dòng này?', variant: 'danger' }), true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
        title: 'Xóa chỉ định', text: 'Xóa dòng này?', icon: 'warning', showCancelButton: true,
        confirmButtonText: 'Xác nhận', cancelButtonText: 'Hủy', buttonsStyling: false, reverseButtons: true,
        focusCancel: true, allowOutsideClick: false, allowEscapeKey: true, customClass: baseClasses('danger')
    });
});

test('choose renders the unsaved-changes dialog with the same options the Doctor used before', async () => {
    const { dialog, calls } = loadDialog({ isDenied: true });
    const choice = await dialog.choose({
        variant: 'warning', icon: 'warning', title: 'Có thay đổi chưa lưu', text: 'Hãy lưu dữ liệu trước khi rời ca khám.',
        confirmText: 'Lưu và tiếp tục', denyText: 'Bỏ thay đổi', cancelText: 'Ở lại'
    });
    assert.equal(choice, 'deny');
    assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), {
        title: 'Có thay đổi chưa lưu', text: 'Hãy lưu dữ liệu trước khi rời ca khám.', icon: 'warning',
        showCancelButton: true, showDenyButton: true, confirmButtonText: 'Lưu và tiếp tục', denyButtonText: 'Bỏ thay đổi',
        cancelButtonText: 'Ở lại', buttonsStyling: false, reverseButtons: true, focusCancel: true,
        allowOutsideClick: false, allowEscapeKey: true,
        customClass: { ...baseClasses('warning'), denyButton: 'qlpk-confirm-dialog__button qlpk-confirm-dialog__button--ghost' }
    });
});

test('choose maps results and reports an unavailable dialog as staying', async () => {
    assert.equal(await loadDialog({ isConfirmed: true }).dialog.choose(), 'confirm');
    assert.equal(await loadDialog({ isDismissed: true }).dialog.choose(), 'cancel');
    const toasts = [];
    const missing = loadDialog('missing');
    const choice = await missing.dialog.choose({ showToast: (type, message) => toasts.push([type, message]), failureMessage: 'Vui lòng ở lại ca khám.' });
    assert.equal(choice, 'cancel');
    assert.deepEqual(toasts, [['error', 'Vui lòng ở lại ca khám.']]);
});

test('Doctor workspace uses the shared dialog owner instead of SweetAlert directly', () => {
    const controller = fs.readFileSync('app/static/js/doctor-examination/workspace-save-controller.js', 'utf8');
    assert.doesNotMatch(controller, /Swal/);
    assert.match(controller, /registry\.require\('confirmationDialog'\)\.choose\(/);
});
