/* exported exportImportErrors, exportTemplate, importICD */
/* global currentPage, loadICDList, showToast */

// Export template
function exportTemplate() {
	// Tạo template Excel
	const template = [
		['Mã ICD', 'Tên bệnh', 'Mô tả', 'Nhóm bệnh'],
		['A00', 'Tả', 'Bệnh tả', 'Bệnh truyền nhiễm'],
		['A01', 'Thương hàn', 'Bệnh thương hàn', 'Bệnh truyền nhiễm'],
		['A02', 'Nhiễm khuẩn Salmonella khác', 'Nhiễm khuẩn Salmonella', 'Bệnh truyền nhiễm'],
		['B00', 'Nhiễm virus herpes simplex', 'Nhiễm virus herpes', 'Bệnh do virus'],
		['B01', 'Thủy đậu', 'Bệnh thủy đậu', 'Bệnh do virus']
	];

	// Tạo workbook
	const wb = XLSX.utils.book_new();
	const ws = XLSX.utils.aoa_to_sheet(template);

	// Set column widths
	ws['!cols'] = [
		{ width: 15 }, // Mã ICD
		{ width: 30 }, // Tên bệnh
		{ width: 40 }, // Mô tả
		{ width: 25 }  // Nhóm bệnh
	];

	XLSX.utils.book_append_sheet(wb, ws, 'Mẫu ICD');

	// Xuất file
	XLSX.writeFile(wb, 'mau_icd.xlsx');
}

// Import ICD data
function importICD() {
	const fileInput = document.getElementById('importFile');
	const file = fileInput.files[0];

	if (!file) {
		showToast('Vui lòng chọn file để import', 'error');
		return;
	}

	if (!file.name.match(/\.(xlsx|xls)$/)) {
		showToast('Vui lòng chọn file Excel (.xlsx hoặc .xls)', 'error');
		return;
	}

	// Hiển thị modal import progress
	showImportProgressModal();

	const reader = new FileReader();
	reader.onload = function (e) {
		try {
			updateImportProgress('Đang đọc file Excel...', 10);

			const data = new Uint8Array(e.target.result);
			const workbook = XLSX.read(data, { type: 'array' });
			const sheetName = workbook.SheetNames[0];
			const worksheet = workbook.Sheets[sheetName];
			const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

			updateImportProgress('Đang xử lý dữ liệu...', 30);

			// Bỏ qua header row
			const rows = jsonData.slice(1);

			if (rows.length === 0) {
				hideImportProgressModal();
				showToast('File không có dữ liệu', 'error');
				return;
			}

			updateImportProgress(`Đã đọc ${rows.length} dòng dữ liệu. Đang validate...`, 50);

			// Validate và import data
			importICDData(rows);

		} catch (error) {
			hideImportProgressModal();
			showToast('Lỗi khi đọc file Excel', 'error');
		}
	};

	reader.readAsArrayBuffer(file);
}

// Import ICD data to server
async function importICDData(rows) {
	try {
		updateImportProgress('Đang validate dữ liệu...', 60);
		const { icdData, validRows, invalidRows, errors } = validateICDImportRows(rows);

		updateImportProgress(`Validation hoàn tất: ${validRows} hợp lệ, ${invalidRows} lỗi`, 70);

		if (icdData.length === 0) {
			hideImportProgressModal();
			showImportResult(0, invalidRows, errors);
			return;
		}

		updateImportProgress(`Đang gửi ${icdData.length} dòng dữ liệu lên server...`, 80);

		// Gửi dữ liệu lên server
		const response = await fetch('/api/icd/import', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ icd_list: icdData })
		});

		if (!response.ok) throw new Error('ICD import failed');
		const result = await response.json();
		hideImportProgressModal();
		showImportResult(result.success_count ?? icdData.length, invalidRows, errors, result.errors || []);

		// Đóng modal import và reload data
		$('#importModal').modal('hide');
		$('#importFile').val('');
		loadICDList(currentPage);

	} catch (error) {
		hideImportProgressModal();
		showToast('Không thể nhập dữ liệu ICD. Vui lòng kiểm tra tệp và thử lại.', 'error');
	}
}

// Validate từng dòng Excel (dòng 1 là header); trả về dữ liệu hợp lệ và lỗi theo số dòng.
function validateICDImportRows(rows) {
	const icdData = [];
	const errors = [];
	for (let i = 0; i < rows.length; i++) {
		const rowNumber = i + 2; // +2 vì bỏ qua header và index bắt đầu từ 0
		const result = parseICDImportRow(rows[i], rowNumber);
		if (result.error) errors.push(result.error);
		else icdData.push(result.item);
		if (result.skipProgress) continue;

		// Update progress mỗi 100 dòng
		if (i % 100 === 0) {
			updateImportProgress(`Đang validate... ${i + 1}/${rows.length} dòng`, 60 + (i / rows.length) * 10);
		}
	}
	return { icdData, validRows: icdData.length, invalidRows: errors.length, errors };
}

function parseICDImportRow(row, rowNumber) {
	if (!(row.length >= 2 && row[0] && row[1])) { // Ít nhất có mã ICD và tên bệnh
		return { error: `Dòng ${rowNumber}: Thiếu mã ICD hoặc tên bệnh` };
	}
	const icdCode = row[0]?.toString().trim() || '';
	const diseaseName = row[1]?.toString().trim() || '';
	// Validate mã ICD (cho phép chữ, số, dấu chấm, dấu gạch ngang, ký tự đặc biệt ICD)
	if (!/^[A-Z0-9.†*+-]+$/i.test(icdCode)) return { error: `Dòng ${rowNumber}: Mã ICD không hợp lệ "${icdCode}"`, skipProgress: true };
	// Validate tên bệnh không được rỗng
	if (diseaseName.length < 2) return { error: `Dòng ${rowNumber}: Tên bệnh quá ngắn "${diseaseName}"`, skipProgress: true };
	return { item: {
		icd_code: icdCode,
		disease_name: diseaseName,
		description: row[2]?.toString().trim() || '',
		disease_group: row[3]?.toString().trim() || ''
	} };
}

// Hiển thị modal import progress
function showImportProgressModal() {
	// Tạo modal nếu chưa có
	if (!$('#importProgressModal').length) {
		$('body').append(`
            <div class="modal fade qlpk-import-progress-modal" id="importProgressModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-upload me-2"></i>Đang import dữ liệu ICD
                            </h5>
                        </div>
                        <div class="modal-body text-center">
                            <div class="mb-3">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="visually-hidden">Loading...</span>
                                </div>
                            </div>
                            <div id="importProgressText" class="mb-3">Đang bắt đầu...</div>
                            <div class="progress mb-3 icd-import-progress">
                                <div id="importProgressBar" class="progress-bar progress-bar-striped progress-bar-animated"
                                     role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
                                    <span id="importProgressPercent">0%</span>
                                </div>
                            </div>
                            <div id="importProgressDetails" class="text-muted small"></div>
                        </div>
                    </div>
                </div>
            </div>
        `);
	}

	// Reset progress
	setImportProgressBar(0);
	$('#importProgressPercent').text('0%');
	$('#importProgressText').text('Đang bắt đầu...');
	$('#importProgressDetails').text('');

	// Hiển thị modal
	$('#importProgressModal').modal('show');
}

function setImportProgressBar(percent) {
	const progressBar = document.getElementById('importProgressBar');
	if (!progressBar) {
		return;
	}
	progressBar.style.width = `${percent}%`;
	progressBar.setAttribute('aria-valuenow', percent);
}

// Cập nhật progress
function updateImportProgress(text, percent, details = '') {
	$('#importProgressText').text(text);
	setImportProgressBar(percent);
	$('#importProgressPercent').text(`${Math.round(percent)}%`);
	if (details) {
		$('#importProgressDetails').text(details);
	}
}

// Ẩn modal progress
function hideImportProgressModal() {
	$('#importProgressModal').modal('hide');
}

// Hiển thị kết quả import
function buildImportResultModalHtml(successCount, validationErrors, serverErrors, allErrors) {
	const totalErrors = validationErrors + serverErrors.length;
	return `
            <div class="modal fade" id="importResultModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="bi bi-check-circle-fill text-success me-2"></i>Kết quả import
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="row mb-3">
                                <div class="col-md-4">
                                    <div class="card text-center border-success">
                                        <div class="card-body">
                                            <h3 class="text-success">${successCount}</h3>
                                            <p class="mb-0">Thành công</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-warning">
                                        <div class="card-body">
                                            <h3 class="text-warning">${validationErrors}</h3>
                                            <p class="mb-0">Lỗi validation</p>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="card text-center border-danger">
                                        <div class="card-body">
                                            <h3 class="text-danger">${serverErrors.length}</h3>
                                            <p class="mb-0">Lỗi server</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            ${allErrors.length > 0 ? `
                                <div class="alert alert-warning">
                                    <h6><i class="bi bi-exclamation-triangle me-2"></i>Chi tiết lỗi:</h6>
                                    <div id="importErrorList" class="qlpk-import-error-list">
                                        ${allErrors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join('')}
                                    </div>
                                </div>
                            ` : ''}

                            <div class="alert alert-info">
                                <i class="bi bi-info-circle me-2"></i>
                                <strong>Tổng kết:</strong>
                                Import thành công <strong>${successCount}</strong> dòng,
                                có <strong>${totalErrors}</strong> dòng lỗi.
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                            ${allErrors.length > 0 ? `
                                <button data-qlpk-button="neutral" data-qlpk-button-variant="soft" type="button" class="btn btn-warning" data-qlpk-call="exportImportErrors">
                                    <i class="bi bi-download me-2"></i>Xuất danh sách lỗi
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
}

function updateImportResultModal(successCount, validationErrors, serverErrors, allErrors) {
	const totalErrors = validationErrors + serverErrors.length;
	// Cập nhật nội dung modal
	$('#importResultModal .text-success').text(successCount);
	$('#importResultModal .text-warning').text(validationErrors);
	$('#importResultModal .text-danger').text(serverErrors.length);

	if (allErrors.length > 0) {
		$('#importErrorList').html(allErrors.map(error => `<div class="mb-1"><small>• ${error}</small></div>`).join(''));
		$('#importResultModal .alert-warning').show();
	} else {
		$('#importResultModal .alert-warning').hide();
	}

	$('#importResultModal .alert-info').html(`
            <i class="bi bi-info-circle me-2"></i>
            <strong>Tổng kết:</strong>
            Import thành công <strong>${successCount}</strong> dòng,
            có <strong>${totalErrors}</strong> dòng lỗi.
        `);
}

function showImportResult(successCount, validationErrors, validationErrorList = [], serverErrors = []) {
	const totalErrors = validationErrors + serverErrors.length;
	const allErrors = [...validationErrorList, ...serverErrors];

	// Tạo modal kết quả nếu chưa có
	if (!$('#importResultModal').length) {
		$('body').append(buildImportResultModalHtml(successCount, validationErrors, serverErrors, allErrors));
	} else {
		updateImportResultModal(successCount, validationErrors, serverErrors, allErrors);
	}

	// Hiển thị modal
	$('#importResultModal').modal('show');

	// Hiển thị toast thông báo
	if (successCount > 0) {
		showToast(`Import thành công ${successCount} mã ICD`, 'success');
	}
	if (totalErrors > 0) {
		showToast(`Có ${totalErrors} dòng lỗi trong quá trình import`, 'warning');
	}
}

// Xuất danh sách lỗi
function exportImportErrors() {
	try {
		// Lấy danh sách lỗi từ modal
		const errorList = $('#importErrorList').find('small').map(function () {
			return $(this).text().replace('• ', '');
		}).get();

		if (errorList.length === 0) {
			showToast('Không có lỗi để xuất', 'warning');
			return;
		}

		// Tạo workbook
		const wb = XLSX.utils.book_new();

		// Tạo worksheet với dữ liệu lỗi
		const wsData = [
			['STT', 'Chi tiết lỗi'],
			...errorList.map((error, index) => [index + 1, error])
		];

		const ws = XLSX.utils.aoa_to_sheet(wsData);

		// Định dạng header
		ws['!cols'] = [
			{ width: 10 }, // STT
			{ width: 80 }  // Chi tiết lỗi
		];

		// Thêm worksheet vào workbook
		XLSX.utils.book_append_sheet(wb, ws, 'Danh sách lỗi import');

		// Xuất file
		const fileName = `icd_import_errors_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
		XLSX.writeFile(wb, fileName);

		showToast('Đã xuất danh sách lỗi thành công', 'success');

	} catch (error) {
		showToast('Lỗi khi xuất danh sách lỗi', 'error');
	}
}
