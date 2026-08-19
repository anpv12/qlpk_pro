/**
 * Drug Interaction Management — JS Logic
 * Quản lý tương tác thuốc: CRUD, autocomplete, thống kê theo hoạt chất
 */
(function () {
	'use strict';

	const API_BASE = '/api/drug-interactions';
	const ACTIVE_INGREDIENT_API = '/api/active-ingredient?limit=10000';
	const TOKEN = () => localStorage.getItem('qlpk_token');
	const HEADERS = () => ({
		'Authorization': 'Bearer ' + TOKEN(),
		'Content-Type': 'application/json'
	});
	const FILE_HEADERS = () => ({
		'Authorization': 'Bearer ' + TOKEN()
	});

	let allInteractions = [];
	let allActiveIngredients = [];
	let editingId = null;

	// ─── Toast ────────────────────────────────────────────
	function showToast(type, msg) {
		return window.QLPKUserFeedback?.show(type, msg);
	}

	async function downloadProtectedFile(url, filename) {
		try {
			const response = await fetch(url, { headers: FILE_HEADERS() });
			if (!response.ok) throw new Error(response.status);
			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = blobUrl;
			link.download = filename;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(blobUrl);
		} catch (error) {
			showToast('error', 'Có lỗi xảy ra khi tải file mẫu');
		}
	}

	// ─── Load danh sách tương tác ──────────────────────────
	async function loadInteractions() {
		try {
			const res = await fetch(API_BASE, { headers: HEADERS() });
			allInteractions = await res.json();
			renderTable(allInteractions);
		} catch (e) {
			console.error('Load interactions error:', e);
		}
	}

	// ─── Load danh sách Hoạt chất (cho autocomplete) ───────
	async function loadActiveIngredients() {
		try {
			const res = await fetch(ACTIVE_INGREDIENT_API, { headers: HEADERS() });
			const response = await res.json();
			if (response.success && response.data) {
				// Map data từ danh mục hoạt chất (độc lập) -> lấy array string
				allActiveIngredients = response.data.map(item => item.ten_hoat_chat);
			}
		} catch (e) {
			console.error('Load active ingredients error:', e);
		}
	}

	// ─── Render bảng ──────────────────────────────────────
	function renderTable(data) {
		const tbody = document.getElementById('di-table-body');
		if (!data.length) {
			tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">
				<i class="bi bi-inbox di-empty-icon"></i><br>Chưa có tương tác nào</td></tr>`;
			return;
		}

		tbody.innerHTML = data.map((item, idx) => {
			const hc1 = item.hoat_chat_1;
			const hc2 = item.hoat_chat_2;
			const isContra = item.interaction_type === 'contraindicated';
			const typeBadge = isContra
				? '<span class="badge-type badge-contra"><i class="bi bi-x-octagon-fill"></i> Chống chỉ định</span>'
				: '<span class="badge-type badge-approved"><i class="bi bi-check-circle-fill"></i> Được đồng thuận</span>';

			return `<tr>
				<td>${idx + 1}</td>
				<td>
					<div class="fw-semibold">${hc1 || '—'}</div>
				</td>
				<td class="text-center text-muted"><i class="bi bi-arrow-left-right"></i></td>
				<td>
					<div class="fw-semibold">${hc2 || '—'}</div>
				</td>
				<td class="text-center">${typeBadge}</td>
				<td><div class="di-preline">${item.consequence || '—'}</div></td>
				<td>
					<div class="d-flex gap-1">
						<button class="btn btn-sm btn-outline-secondary" title="Xem" onclick="DrugInteraction.view(${item.id})"><i class="bi bi-eye"></i></button>
						<button class="btn btn-sm btn-outline-primary" title="Sửa" onclick="DrugInteraction.edit(${item.id})"><i class="bi bi-pencil"></i></button>
						<button class="btn btn-sm btn-outline-danger" title="Xóa" onclick="DrugInteraction.remove(${item.id})"><i class="bi bi-trash"></i></button>
					</div>
				</td>
			</tr>`;
		}).join('');
	}



	// ─── Autocomplete Hoạt chất (Creatable) ───────────────
	function setupAutocomplete(inputId, hiddenId) {
		const input = document.getElementById(inputId);
		const hidden = document.getElementById(hiddenId);

		let dropdown = null;

		function showDropdown(query) {
			if (dropdown) dropdown.remove();
			
			// Cập nhật giá trị ẩn luôn bằng text vừa gõ
			hidden.value = input.value.trim();

			let matches = [];
			const queryLower = query.toLowerCase();

			if (!query) {
				// Focus mà chưa gõ → hiện 15 hoạt chất đầu tiên
				matches = allActiveIngredients.slice(0, 15).map(m => ({ label: m, isNew: false }));
			} else {
				const filtered = allActiveIngredients.filter(m => m.toLowerCase().includes(queryLower));
				matches = filtered.slice(0, 15).map(m => ({ label: m, isNew: false }));
				
				// Kiểm tra xem đã khớp chính xác 100% chưa, nếu chưa thì chèn mục Thêm mới
				const exactMatch = allActiveIngredients.find(m => m.toLowerCase() === queryLower);
				if (!exactMatch) {
					matches.unshift({ label: query, displayLabel: `+ Thêm hoạt chất mới: "${query}"`, isNew: true });
				}
			}

			if (!matches.length) return;

			dropdown = document.createElement('div');
			dropdown.className = 'ac-dropdown';
			matches.forEach(m => {
				const opt = document.createElement('div');
				opt.className = 'ac-item';
				if (m.isNew) {
					opt.classList.add('ac-item-new');
					opt.innerHTML = `<span class="ac-new-label"><i class="bi bi-plus-circle me-1"></i> ${m.displayLabel}</span>`;
				} else {
					opt.innerHTML = `<strong>${m.label}</strong>`;
				}

				opt.addEventListener('click', () => {
					input.value = m.label;
					hidden.value = m.label;
					dropdown.remove();
					dropdown = null;
				});
				dropdown.appendChild(opt);
			});
			input.parentElement.classList.add('di-autocomplete-wrap');
			input.parentElement.appendChild(dropdown);
		}

		input.addEventListener('focus', function () {
			showDropdown(this.value.trim());
		});

		input.addEventListener('input', function () {
			showDropdown(this.value.trim());
		});

		document.addEventListener('click', (e) => {
			if (dropdown && !input.contains(e.target) && !dropdown.contains(e.target)) {
				dropdown.remove();
				dropdown = null;
			}
		});
	}

	// ─── Mở modal thêm mới ────────────────────────────────
	function openAddModal() {
		editingId = null;
		document.getElementById('di-modal-title').innerHTML = '<i class="bi bi-exclamation-triangle"></i> Thêm tương tác thuốc';
		document.getElementById('di-form').reset();
		document.getElementById('di-med1-id').value = '';
		document.getElementById('di-med2-id').value = '';
		document.getElementById('di-type-contra').checked = true;
		new bootstrap.Modal(document.getElementById('diModal')).show();
	}

	// ─── Xem chi tiết ─────────────────────────────────────
	function viewInteraction(id) {
		const item = allInteractions.find(i => i.id === id);
		if (!item) return;

		const isContra = item.interaction_type === 'contraindicated';

		document.getElementById('view-med1').textContent = item.hoat_chat_1 || '—';
		document.getElementById('view-med2').textContent = item.hoat_chat_2 || '—';
		document.getElementById('view-type').innerHTML = isContra
			? '<span class="di-view-type-contra"><i class="bi bi-x-octagon-fill"></i> Chống chỉ định</span>'
			: '<span class="di-view-type-approved"><i class="bi bi-check-circle-fill"></i> Được đồng thuận</span>';
		document.getElementById('view-consequence').textContent = item.consequence || '—';
		document.getElementById('view-mechanism').textContent = item.mechanism || '—';
		document.getElementById('view-management').textContent = item.management || '—';
		document.getElementById('view-notes').textContent = item.notes || '—';

		new bootstrap.Modal(document.getElementById('diViewModal')).show();
	}

	// ─── Mở modal sửa ─────────────────────────────────────
	function editInteraction(id) {
		const item = allInteractions.find(i => i.id === id);
		if (!item) return;

		editingId = id;
		document.getElementById('di-modal-title').innerHTML = '<i class="bi bi-exclamation-triangle"></i> Sửa tương tác thuốc';

		document.getElementById('di-med1').value = item.hoat_chat_1 || '';
		document.getElementById('di-med1-id').value = item.hoat_chat_1 || '';
		document.getElementById('di-med2').value = item.hoat_chat_2 || '';
		document.getElementById('di-med2-id').value = item.hoat_chat_2 || '';

		if (item.interaction_type === 'contraindicated') {
			document.getElementById('di-type-contra').checked = true;
		} else {
			document.getElementById('di-type-approved').checked = true;
		}

		document.getElementById('di-consequence').value = item.consequence || '';
		document.getElementById('di-mechanism').value = item.mechanism || '';
		document.getElementById('di-management').value = item.management || '';
		document.getElementById('di-notes').value = item.notes || '';

		new bootstrap.Modal(document.getElementById('diModal')).show();
	}

	// ─── Lưu (thêm / sửa) ────────────────────────────────
	async function saveInteraction(e) {
		e.preventDefault();

		const hc1 = document.getElementById('di-med1-id').value;
		const hc2 = document.getElementById('di-med2-id').value;

		if (!hc1 || !hc2) {
			showToast('error', 'Vui lòng nhập/chọn đủ 2 hoạt chất');
			return;
		}

		const payload = {
			hoat_chat_1: hc1,
			hoat_chat_2: hc2,
			interaction_type: document.querySelector('input[name="interaction_type"]:checked').value,
			consequence: document.getElementById('di-consequence').value.trim(),
			mechanism: document.getElementById('di-mechanism').value.trim(),
			management: document.getElementById('di-management').value.trim(),
			notes: document.getElementById('di-notes').value.trim()
		};

		async function saveNewIngredientIfNeeded(name) {
			const exists = allActiveIngredients.find(m => m.toLowerCase() === name.toLowerCase());
			if (!exists) {
				try {
					await fetch('/api/active-ingredient', {
						method: 'POST',
						headers: HEADERS(),
						body: JSON.stringify({ ten_hoat_chat: name })
					});
				} catch (e) {
					console.error('Auto-save ingredient error:', e);
				}
			}
		}

		try {
			// Tự động thêm vào danh mục hoạt chất nếu chưa có
			await saveNewIngredientIfNeeded(hc1);
			await saveNewIngredientIfNeeded(hc2);

			const url = editingId ? `${API_BASE}/${editingId}` : API_BASE;
			const method = editingId ? 'PUT' : 'POST';

			const res = await fetch(url, {
				method,
				headers: HEADERS(),
				body: JSON.stringify(payload)
			});

			const result = await res.json();

			if (!res.ok) {
				showToast('error', 'Không thể lưu tương tác thuốc. Vui lòng kiểm tra lại.');
				return;
			}

			showToast('success', editingId ? 'Cập nhật thành công' : 'Thêm thành công');
			bootstrap.Modal.getInstance(document.getElementById('diModal')).hide();
			
			// Refresh lại cả tương tác và danh mục hoạt chất (để cập nhật autocomplete)
			loadInteractions();
			loadActiveIngredients();
		} catch (e) {
			showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		}
	}

	// ─── Xóa ──────────────────────────────────────────────
	async function removeInteraction(id) {
		if (!confirm('Bạn có chắc muốn xóa tương tác này?')) return;

		try {
			const res = await fetch(`${API_BASE}/${id}`, {
				method: 'DELETE',
				headers: HEADERS()
			});

			if (res.ok) {
				showToast('success', 'Đã xóa');
				loadInteractions();
			} else {
				const err = await res.json();
				showToast('error', 'Không thể xóa tương tác thuốc. Vui lòng thử lại.');
			}
		} catch (e) {
			showToast('error', 'Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.');
		}
	}

	// ─── Tìm kiếm ────────────────────────────────────────
	function setupSearch() {
		const input = document.getElementById('di-search');
		input.addEventListener('input', function () {
			const q = this.value.toLowerCase().trim();
			if (!q) {
				renderTable(allInteractions);
				return;
			}
			const filtered = allInteractions.filter(item => {
				return (item.hoat_chat_1 || '').toLowerCase().includes(q) ||
					(item.hoat_chat_2 || '').toLowerCase().includes(q) ||
					(item.consequence || '').toLowerCase().includes(q);
			});
			renderTable(filtered);
		});
	}

	// ─── Init ─────────────────────────────────────────────
	async function init() {
		await loadActiveIngredients();
		await loadInteractions();
		setupAutocomplete('di-med1', 'di-med1-id');
		setupAutocomplete('di-med2', 'di-med2-id');
		setupSearch();

		document.getElementById('di-form').addEventListener('submit', saveInteraction);
		document.getElementById('btn-add-interaction').addEventListener('click', openAddModal);

		// Download template (xuất toàn bộ dữ liệu hiện có)
		document.getElementById('btn-di-download-template').addEventListener('click', function () {
			downloadProtectedFile('/api/drug-interactions/template', 'mau_import_tuong_tac_thuoc.xlsx');
		});

		// Import Excel
		document.getElementById('btn-di-import-excel').addEventListener('click', function () {
			document.getElementById('di-import-file').click();
		});

		document.getElementById('di-import-file').addEventListener('change', async function (e) {
			if (!e.target.files || e.target.files.length === 0) return;

			const file = e.target.files[0];
			const formData = new FormData();
			formData.append('file', file);

			showToast('success', 'Đang xử lý file...');

			try {
				const res = await fetch('/api/drug-interactions/import', {
					method: 'POST',
					body: formData
				});
				const result = await res.json();
				if (result.success) {
					showToast('success', 'Đã nhập dữ liệu tương tác thuốc.');
					loadInteractions();
				} else {
					showToast('error', 'Không thể nhập tương tác thuốc. Vui lòng kiểm tra tệp và thử lại.');
				}
			} catch (err) {
				showToast('error', 'Không thể nhập tương tác thuốc. Vui lòng kiểm tra tệp và thử lại.');
			}

			// Reset file input
			e.target.value = '';
		});

		if (window.QLPKRealtimePageHooks) {
			window.QLPKRealtimePageHooks.register({
				types: ['inventory.changed'],
				debounceMs: 500,
				handler: async function (event) {
					const entity = event && event.payload ? event.payload.entity : null;
					if (!entity || entity === 'drug_interaction' || entity === 'active_ingredient') {
						await loadActiveIngredients();
						await loadInteractions();
					}
				}
			});
		}
	}

	// Export
	window.DrugInteraction = {
		init,
		view: viewInteraction,
		edit: editInteraction,
		remove: removeInteraction
	};

	document.addEventListener('DOMContentLoaded', init);
})();
