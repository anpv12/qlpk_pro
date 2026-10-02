import { state } from './state.js';
import { byId, el, icon } from '../shared/dom.js';
import { requestJson } from '../shared/http-json.js';
import { getSafeApiErrorMessage, showCustomToast } from '../payment-waiting.js';
import { handleSmartMoneyInput } from './output.js';
import { loadPaymentData } from './list.js';
import { CustomModal } from '../custom-modal.js';
import { QLPKConfirmationDialog } from '../shared/confirmation-dialog.js';

const moneyValue = id => handleSmartMoneyInput(byId(id)?.value) || 0;
const moneyText = id => handleSmartMoneyInput(byId(id)?.textContent) || 0;

function setExportButton(disabled, label) {
	const button = byId('exportInvoiceBtn');
	if (!button) return;
	if (label) button.textContent = label;
	button.disabled = disabled;
}

// Confirm invoice
async function confirmInvoice(examinationId) {
	if (state.isConfirmInvoiceSubmitting) return;
	if (!window.QLPKApiTransport.hasSession()) {
		showCustomToast('error', 'Vui lòng đăng nhập lại');
		return;
	}

	const advancePayment = moneyValue('advancePayment');
	const amountPaid = moneyValue('amountPaid');
	const actualPrice = moneyText('total'); // Tổng tiền sau thuế
	const finalAmount = moneyText('finalAmount');
	const changeAmount = moneyText('changeAmount');

	if (advancePayment < 0 || amountPaid < 0 || actualPrice < 0) return showCustomToast('error', 'Số tiền không được âm');
	if (advancePayment > actualPrice) return showCustomToast('error', 'Đã nhận trước không được lớn hơn tổng tiền');
	if (amountPaid < finalAmount) return showCustomToast('error', 'Số tiền trả chưa đủ để xác nhận hóa đơn');
	if (changeAmount < 0) return showCustomToast('error', 'Tiền thối không hợp lệ');

	const confirmed = await QLPKConfirmationDialog.confirm({
		title: 'Xác nhận hóa đơn?',
		text: 'Bạn có chắc chắn muốn xác nhận hóa đơn này? Sau khi xác nhận, không thể chỉnh sửa nữa.',
		icon: 'question',
		variant: 'success',
		showToast: (type, message) => showCustomToast(type, message)
	});
	if (!confirmed) return;

	state.isConfirmInvoiceSubmitting = true;
	setExportButton(true);
	try {
		await requestJson(`/api/payment-waiting/${examinationId}/confirm`, { method: 'PUT', json: {
			advance_payment: advancePayment,
			amount_paid: amountPaid,
			actual_price: actualPrice
		} });
		showCustomToast('success', 'Xác nhận hóa đơn thành công');
		disableInvoiceForm();
		setExportButton(true, 'Đã xác nhận');
		loadPaymentData();
	} catch {
		setExportButton(false);
		showCustomToast('error', 'Có lỗi xảy ra khi xác nhận hóa đơn');
	} finally {
		state.isConfirmInvoiceSubmitting = false;
	}
}

// Khóa toàn bộ form hóa đơn sau khi xác nhận
function disableInvoiceForm() {
	const content = byId('examinationDetailContent');
	if (!content) return;
	const fieldIds = ['examinationDate', 'examinationTime', 'examinationType', 'patientName', 'patientPhone', 'patientBirthDate', 'advancePayment', 'amountPaid'];
	const fields = fieldIds.map(id => content.querySelector(`#${id}`));
	const controls = content.querySelectorAll('button, input[type="checkbox"], select');
	[...fields, ...controls, byId('addServiceBtn')].forEach(node => { if (node) node.disabled = true; });
	content.classList.add('invoice-confirmed');
}

function toggleAllPrescriptions() {
	const isChecked = Boolean(byId('selectAllPrescriptions')?.checked);
	document.querySelectorAll('.prescription-checkbox').forEach(box => { box.checked = isChecked; });
}

// Delete payment - hiển thị modal chọn hành động trả lại
async function deletePayment(paymentId) {
	const confirmed = await CustomModal.confirm('Bạn muốn thực hiện hành động gì?', 'Chọn hành động');
	if (confirmed) showActionSelectionModal(paymentId);
}

const RETURN_TARGETS = {
	receptionist: { label: 'Trả về lễ tân', buttonClass: 'btn-warning', iconName: 'bi-arrow-left-circle', status: 'WAITING_TRANSFER', target: 'lễ tân' },
	doctor: { label: 'Trả về bác sĩ', buttonClass: 'btn-info', iconName: 'bi-arrow-left-circle', status: 'DOCTOR_EXAM', target: 'bác sĩ' },
	psychologist: { label: 'Trả về tâm lý gia', buttonClass: 'btn-secondary', iconName: 'bi-arrow-left-circle', status: 'PSYCHOLOGIST_EXAM', target: 'tâm lý gia' },
	// Tạm thời dùng cùng WAITING_TRANSFER như luồng trả lễ tân theo backend hiện tại.
	appointment: { label: 'Trả về lịch hẹn', buttonClass: 'btn-danger', iconName: 'bi-arrow-left', status: 'WAITING_TRANSFER', target: 'lịch hẹn' },
};

function buildActionSelectionModal(paymentId) {
	const actions = Object.entries(RETURN_TARGETS).map(([action, { label, buttonClass, iconName }]) =>
		el('button', { 'data-qlpk-button': 'execute', 'data-qlpk-button-variant': 'solid', class: `btn ${buttonClass} js-return-action`, 'data-return-action': action, 'data-payment-id': paymentId },
			icon(iconName), ` ${label}`));
	return el('div', { class: 'modal fade qlpk-action-selection-modal', id: 'actionSelectionModal', tabindex: '-1', 'aria-labelledby': 'actionSelectionModalLabel', 'aria-hidden': 'true' },
		el('div', { class: 'modal-dialog modal-dialog-centered' }, el('div', { class: 'modal-content' },
			el('div', { class: 'modal-header' }, el('h5', { class: 'modal-title' }, 'Chọn hành động'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })),
			el('div', { class: 'modal-body' }, el('div', { class: 'd-grid gap-2' }, actions)))));
}

// Tạo lại modal mỗi lần để tránh giữ paymentId cũ
function showActionSelectionModal(paymentId) {
	byId('actionSelectionModal')?.remove();
	const modalNode = buildActionSelectionModal(Number(paymentId) || 0);
	document.body.append(modalNode);
	new window.bootstrap.Modal(modalNode).show();
}

async function returnTo(action, paymentId) {
	const { status, target, label } = RETURN_TARGETS[action];
	window.bootstrap.Modal.getInstance(byId('actionSelectionModal'))?.hide();
	const confirmed = await CustomModal.confirm(`Bạn có chắc chắn muốn trả bệnh nhân này về ${target}?`, label);
	if (!confirmed) return;
	try {
		await requestJson(`/examinations/${paymentId}/status`, { method: 'PUT', json: { status } });
		showCustomToast('success', `${label} thành công!`);
		loadPaymentData();
	} catch (error) {
		showCustomToast('error', getSafeApiErrorMessage(error, `Có lỗi xảy ra khi trả về ${target}`));
	}
}

const returnToReceptionist = paymentId => returnTo('receptionist', paymentId);
const returnToDoctor = paymentId => returnTo('doctor', paymentId);
const returnToPsychologist = paymentId => returnTo('psychologist', paymentId);
const returnToAppointment = paymentId => returnTo('appointment', paymentId);

export { confirmInvoice, deletePayment, disableInvoiceForm, returnToAppointment, returnToDoctor, returnToPsychologist, returnToReceptionist, toggleAllPrescriptions };
