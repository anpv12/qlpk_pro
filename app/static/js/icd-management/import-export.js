// ICD Excel template, client-side import (read, validate, post) with progress and result dialogs,
// and export of the import error list. Page callbacks (toast, reload) are passed in by icd-management.js.
import { byId, delegate, el, icon, replace } from '../shared/dom.js';

const TEMPLATE_ROWS = [
	['Mã ICD', 'Tên bệnh', 'Mô tả', 'Nhóm bệnh'],
	['A00', 'Tả', 'Bệnh tả', 'Bệnh truyền nhiễm'],
	['A01', 'Thương hàn', 'Bệnh thương hàn', 'Bệnh truyền nhiễm'],
	['A02', 'Nhiễm khuẩn Salmonella khác', 'Nhiễm khuẩn Salmonella', 'Bệnh truyền nhiễm'],
	['B00', 'Nhiễm virus herpes simplex', 'Nhiễm virus herpes', 'Bệnh do virus'],
	['B01', 'Thủy đậu', 'Bệnh thủy đậu', 'Bệnh do virus'],
];
let page = null;
const modal = id => window.bootstrap.Modal.getOrCreateInstance(byId(id));

function exportTemplate() {
	const workbook = window.XLSX.utils.book_new();
	const sheet = window.XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS);
	sheet['!cols'] = [{ width: 15 }, { width: 30 }, { width: 40 }, { width: 25 }];
	window.XLSX.utils.book_append_sheet(workbook, sheet, 'Mẫu ICD');
	window.XLSX.writeFile(workbook, 'mau_icd.xlsx');
}

function setProgressBar(percent) {
	const bar = byId('importProgressBar');
	if (!bar) return;
	bar.style.width = `${percent}%`;
	bar.setAttribute('aria-valuenow', percent);
}

function updateImportProgress(text, percent, details = '') {
	byId('importProgressText').textContent = text;
	setProgressBar(percent);
	byId('importProgressPercent').textContent = `${Math.round(percent)}%`;
	if (details) byId('importProgressDetails').textContent = details;
}

function progressModal() {
	return el('div', { class: 'modal fade qlpk-import-progress-modal', id: 'importProgressModal', tabindex: '-1', 'data-bs-backdrop': 'static', 'data-bs-keyboard': 'false' },
		el('div', { class: 'modal-dialog modal-dialog-centered' }, el('div', { class: 'modal-content' },
			el('div', { class: 'modal-header' }, el('h5', { class: 'modal-title' }, icon('bi-upload', 'me-2'), 'Đang import dữ liệu ICD')),
			el('div', { class: 'modal-body text-center' },
				el('div', { class: 'mb-3' }, el('div', { class: 'spinner-border text-primary', role: 'status' }, el('span', { class: 'visually-hidden' }, 'Loading...'))),
				el('div', { id: 'importProgressText', class: 'mb-3' }, 'Đang bắt đầu...'),
				el('div', { class: 'progress mb-3 icd-import-progress' }, el('div', { id: 'importProgressBar', class: 'progress-bar progress-bar-striped progress-bar-animated',
					role: 'progressbar', 'aria-valuenow': '0', 'aria-valuemin': '0', 'aria-valuemax': '100' }, el('span', { id: 'importProgressPercent' }, '0%'))),
				el('div', { id: 'importProgressDetails', class: 'text-muted small' })))));
}

function showImportProgressModal() {
	if (!byId('importProgressModal')) document.body.appendChild(progressModal());
	setProgressBar(0);
	byId('importProgressPercent').textContent = '0%';
	byId('importProgressText').textContent = 'Đang bắt đầu...';
	byId('importProgressDetails').textContent = '';
	modal('importProgressModal').show();
}
const hideImportProgressModal = () => modal('importProgressModal').hide();

const errorLines = errors => errors.map(error => el('div', { class: 'mb-1' }, el('small', {}, `• ${error}`)));
const summary = (successCount, totalErrors) => [icon('bi-info-circle', 'me-2'), ' ', el('strong', {}, 'Tổng kết:'), ' Import thành công ', el('strong', {}, successCount), ' dòng, có ', el('strong', {}, totalErrors), ' dòng lỗi.'];

function countCard(tone, value, label) {
	return el('div', { class: 'col-md-4' }, el('div', { class: `card text-center border-${tone}` }, el('div', { class: 'card-body' }, el('h3', { class: `text-${tone}` }, value), el('p', { class: 'mb-0' }, label))));
}

function resultModal(successCount, validationErrors, serverErrors, allErrors) {
	const errorsBox = el('div', { class: 'alert alert-warning' }, el('h6', {}, icon('bi-exclamation-triangle', 'me-2'), 'Chi tiết lỗi:'),
		el('div', { id: 'importErrorList', class: 'qlpk-import-error-list' }, errorLines(allErrors)));
	if (!allErrors.length) errorsBox.style.display = 'none';
	return el('div', { class: 'modal fade', id: 'importResultModal', tabindex: '-1' }, el('div', { class: 'modal-dialog modal-lg' }, el('div', { class: 'modal-content' },
		el('div', { class: 'modal-header' }, el('h5', { class: 'modal-title' }, icon('bi-check-circle-fill', 'text-success me-2'), 'Kết quả import'), el('button', { type: 'button', class: 'btn-close', 'data-bs-dismiss': 'modal' })),
		el('div', { class: 'modal-body' },
			el('div', { class: 'row mb-3' }, countCard('success', successCount, 'Thành công'), countCard('warning', validationErrors, 'Lỗi validation'), countCard('danger', serverErrors.length, 'Lỗi server')),
			errorsBox, el('div', { class: 'alert alert-info' }, summary(successCount, validationErrors + serverErrors.length))),
		el('div', { class: 'modal-footer' }, el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-secondary', 'data-bs-dismiss': 'modal' }, 'Đóng'),
			allErrors.length ? el('button', { 'data-qlpk-button': 'neutral', 'data-qlpk-button-variant': 'soft', type: 'button', class: 'btn btn-warning', 'data-icd-import': 'export-errors' }, icon('bi-download', 'me-2'), 'Xuất danh sách lỗi') : null))));
}

function showImportResult(successCount, validationErrors, validationErrorList = [], serverErrors = []) {
	const allErrors = [...validationErrorList, ...serverErrors];
	const totalErrors = validationErrors + serverErrors.length;
	const existing = byId('importResultModal');
	if (!existing) {
		document.body.appendChild(resultModal(successCount, validationErrors, serverErrors, allErrors));
	} else {
		existing.querySelector('.text-success').textContent = successCount;
		existing.querySelector('.text-warning').textContent = validationErrors;
		existing.querySelector('.text-danger').textContent = serverErrors.length;
		if (allErrors.length) replace(byId('importErrorList'), errorLines(allErrors));
		existing.querySelector('.alert-warning').style.display = allErrors.length ? '' : 'none';
		replace(existing.querySelector('.alert-info'), summary(successCount, totalErrors));
	}
	modal('importResultModal').show();
	if (successCount > 0) page.showToast(`Import thành công ${successCount} mã ICD`, 'success');
	if (totalErrors > 0) page.showToast(`Có ${totalErrors} dòng lỗi trong quá trình import`, 'warning');
}

function parseICDImportRow(row, rowNumber) {
	if (!(row.length >= 2 && row[0] && row[1])) return { error: `Dòng ${rowNumber}: Thiếu mã ICD hoặc tên bệnh` };
	const icdCode = row[0]?.toString().trim() || '';
	const diseaseName = row[1]?.toString().trim() || '';
	if (!/^[A-Z0-9.†*+-]+$/i.test(icdCode)) return { error: `Dòng ${rowNumber}: Mã ICD không hợp lệ "${icdCode}"`, skipProgress: true };
	if (diseaseName.length < 2) return { error: `Dòng ${rowNumber}: Tên bệnh quá ngắn "${diseaseName}"`, skipProgress: true };
	return { item: { icd_code: icdCode, disease_name: diseaseName, description: row[2]?.toString().trim() || '', disease_group: row[3]?.toString().trim() || '' } };
}

// Validates the data rows (row 1 of the sheet is the header); errors carry the sheet row number.
export function validateICDImportRows(rows) {
	const icdData = [];
	const errors = [];
	rows.forEach((row, index) => {
		const result = parseICDImportRow(row, index + 2);
		if (result.error) errors.push(result.error);
		else icdData.push(result.item);
		if (!result.skipProgress && index % 100 === 0) updateImportProgress(`Đang validate... ${index + 1}/${rows.length} dòng`, 60 + (index / rows.length) * 10);
	});
	return { icdData, validRows: icdData.length, invalidRows: errors.length, errors };
}

async function importICDData(rows) {
	try {
		updateImportProgress('Đang validate dữ liệu...', 60);
		const { icdData, validRows, invalidRows, errors } = validateICDImportRows(rows);
		updateImportProgress(`Validation hoàn tất: ${validRows} hợp lệ, ${invalidRows} lỗi`, 70);
		if (!icdData.length) {
			hideImportProgressModal();
			showImportResult(0, invalidRows, errors);
			return;
		}
		updateImportProgress(`Đang gửi ${icdData.length} dòng dữ liệu lên server...`, 80);
		const response = await fetch('/api/icd/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ icd_list: icdData }) });
		if (!response.ok) throw new Error('ICD import failed');
		const result = await response.json();
		hideImportProgressModal();
		showImportResult(result.success_count ?? icdData.length, invalidRows, errors, result.errors || []);
		modal('importModal').hide();
		byId('importFile').value = '';
		page.reload();
	} catch {
		hideImportProgressModal();
		page.showToast('Không thể nhập dữ liệu ICD. Vui lòng kiểm tra tệp và thử lại.', 'error');
	}
}

function importICD() {
	const file = byId('importFile').files[0];
	if (!file) {
		page.showToast('Vui lòng chọn file để import', 'error');
		return;
	}
	if (!file.name.match(/\.(xlsx|xls)$/)) {
		page.showToast('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
		return;
	}
	showImportProgressModal();
	const reader = new FileReader();
	reader.onload = event => {
		try {
			updateImportProgress('Đang đọc file Excel...', 10);
			const workbook = window.XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
			const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 }).slice(1);
			updateImportProgress('Đang xử lý dữ liệu...', 30);
			if (!rows.length) {
				hideImportProgressModal();
				page.showToast('File không có dữ liệu', 'error');
				return;
			}
			updateImportProgress(`Đã đọc ${rows.length} dòng dữ liệu. Đang validate...`, 50);
			importICDData(rows);
		} catch {
			hideImportProgressModal();
			page.showToast('Lỗi khi đọc file Excel', 'error');
		}
	};
	reader.readAsArrayBuffer(file);
}

function exportImportErrors() {
	try {
		const errors = [...(byId('importErrorList')?.querySelectorAll('small') || [])].map(node => node.textContent.replace('• ', ''));
		if (!errors.length) {
			page.showToast('Không có lỗi để xuất', 'warning');
			return;
		}
		const workbook = window.XLSX.utils.book_new();
		const sheet = window.XLSX.utils.aoa_to_sheet([['STT', 'Chi tiết lỗi'], ...errors.map((error, index) => [index + 1, error])]);
		sheet['!cols'] = [{ width: 10 }, { width: 80 }];
		window.XLSX.utils.book_append_sheet(workbook, sheet, 'Danh sách lỗi import');
		window.XLSX.writeFile(workbook, `icd_import_errors_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
		page.showToast('Đã xuất danh sách lỗi thành công', 'success');
	} catch {
		page.showToast('Lỗi khi xuất danh sách lỗi', 'error');
	}
}

export function bindImportExport(callbacks) {
	page = callbacks;
	const actions = { template: exportTemplate, open: () => modal('importModal').show(), import: importICD, 'export-errors': exportImportErrors };
	delegate(document, 'click', '[data-icd-import]', (event, button) => actions[button.dataset.icdImport]?.());
}
