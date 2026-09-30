/* exported exportTemplate, importCategories, openImportModal */
		let categories = [];

		function normalizeSearchText(value) {
			return window.QLPKSearchNormalization?.normalizeSearchText(value)
				|| String(value || '').toLowerCase().trim();
		}

		// Toast function
		function showToast(type, message) {
			return window.QLPKUserFeedback?.show(type, message);
		}

		// Load danh mục
		function loadCategories() {
			$.ajax({
				url: '/service-categories/',
				method: 'GET',
				success: function (data) {
					categories = data;
					renderCategories(categories);
				},
				error: function (xhr) {
					console.error('Error loading categories:', xhr);
					showToast('error', 'Không thể tải danh mục dịch vụ. Vui lòng thử lại.');
				}
			});
		}

		// Render danh mục
		const listPagination = window.QLPKPagination.createClient({ render: renderPage });
    function renderCategories(categoriesToRender) { listPagination.setItems(categoriesToRender); }
    function renderPage(categoriesToRender) {
			const tbody = $('#categoryTableBody');
			tbody.empty();

			if (categoriesToRender.length === 0) {
				tbody.append(`
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Chưa có danh mục nào
          </td>
        </tr>
      `);
				return;
			}

			categoriesToRender.forEach(category => {
				const row = `
        <tr>
          <td>${category.id}</td>
          <td><strong>${window.QLPKHtml.escape(category.name)}</strong></td>
          <td>${category.description ? window.QLPKHtml.escape(category.description) : '<span class="text-muted">Không có mô tả</span>'}</td>
          <td>
            <span class="badge ${category.is_active ? 'qlpk-status--success' : 'qlpk-status--neutral'}">
              ${category.is_active ? 'Kích hoạt' : 'Không kích hoạt'}
            </span>
          </td>
          <td>${new Date(category.created_at).toLocaleDateString('vi-VN')}</td>
          <td>
            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-primary me-1" data-qlpk-call="editCategory" data-qlpk-args='[${category.id}]' aria-label="Sửa danh mục" title="Sửa danh mục">
              <i class="bi bi-pencil"></i>
            </button>
            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm btn-outline-danger" data-qlpk-call="deleteCategory" data-qlpk-args='[${category.id}]' aria-label="Xóa danh mục" title="Xóa danh mục">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
				tbody.append(row);
			});
		}

		// Thêm danh mục
		$('#addCategoryForm').submit(function (e) {
			e.preventDefault();

			const name = $('#categoryName').val().trim();
			const description = $('#categoryDescription').val().trim();
			const isActive = $('#categoryActive').is(':checked');

			if (!name) {
				$('#categoryName').addClass('is-invalid');
				$('#nameError').text('Tên danh mục không được để trống');
				return;
			}

			$('#categoryName').removeClass('is-invalid');

			const data = {
				name: name,
				description: description,
				is_active: isActive
			};


			$.ajax({
				url: '/service-categories/',
				method: 'POST',
				contentType: 'application/json',
				data: JSON.stringify(data),
				success: function () {
					showToast('success', 'Thêm danh mục thành công!');
					$('#addCategoryModal').modal('hide');
					loadCategories();
				},
				error: function (xhr) {
					console.error('Error adding category:', xhr);
					const error = 'Không thể thêm nhóm dịch vụ. Vui lòng kiểm tra lại.';
					showToast('error', error);
				}
			});
		});

		// Sửa danh mục
		window.editCategory = function (categoryId) {
			const category = categories.find(c => c.id === categoryId);
			if (!category) return;

			$('#editCategoryId').val(category.id);
			$('#editCategoryName').val(category.name);
			$('#editCategoryDescription').val(category.description);
			$('#editCategoryActive').prop('checked', category.is_active);

			$('#editCategoryModal').modal('show');
		};

		// Cập nhật danh mục
		$('#updateCategoryBtn').click(function () {
			const id = $('#editCategoryId').val();
			const name = $('#editCategoryName').val().trim();
			const description = $('#editCategoryDescription').val().trim();
			const isActive = $('#editCategoryActive').is(':checked');

			if (!name) {
				$('#editCategoryName').addClass('is-invalid');
				$('#editNameError').text('Tên danh mục không được để trống');
				return;
			}

			$('#editCategoryName').removeClass('is-invalid');

			const data = {
				name: name,
				description: description,
				is_active: isActive
			};


			$.ajax({
				url: `/service-categories/${id}`,
				method: 'PUT',
				contentType: 'application/json',
				data: JSON.stringify(data),
				success: function () {
					showToast('success', 'Cập nhật danh mục thành công!');
					$('#editCategoryModal').modal('hide');
					loadCategories();
				},
				error: function (xhr) {
					console.error('Error updating category:', xhr);
					const error = 'Không thể cập nhật nhóm dịch vụ. Vui lòng kiểm tra lại.';
					showToast('error', error);
				}
			});
		});

		// Xóa danh mục
		window.deleteCategory = async function (categoryId) {
			if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa danh mục này?')) return;


			$.ajax({
				url: `/service-categories/${categoryId}`,
				method: 'DELETE',
				success: function () {
					showToast('success', 'Xóa danh mục thành công!');
					loadCategories();
				},
				error: function (xhr) {
					console.error('Error deleting category:', xhr);
					const errorMessage = 'Không thể xóa nhóm dịch vụ. Vui lòng thử lại.';
					showToast('error', errorMessage);
				}
			});
		};

		// Tìm kiếm
		$('#searchInput').on('input', function () {
			const searchTerm = normalizeSearchText($(this).val());
			const filtered = categories.filter(category =>
				normalizeSearchText(category.name).includes(searchTerm) ||
				(category.description && normalizeSearchText(category.description).includes(searchTerm))
			);
			renderCategories(filtered);
		});

		// Reset form khi đóng modal
		$('#addCategoryModal').on('hidden.bs.modal', function () {
			$('#addCategoryForm')[0].reset();
			$('.is-invalid').removeClass('is-invalid');
		});

		function registerRealtimeHooks() {
			if (!window.QLPKRealtimePageHooks) return;
			window.QLPKRealtimePageHooks.register({
				types: ['catalog.changed'],
				filter: function (event) {
					return event && event.payload && event.payload.entity === 'service_category';
				},
				handler: function () {
					loadCategories();
				},
				debounceMs: 350,
			});
		}

		// Load data ban đầu
		$(document).ready(function () {
			registerRealtimeHooks();
			loadCategories();
		});

		// Import functions
		function openImportModal() {
			$('#importModal').modal('show');
		}

		function exportTemplate() {
			// Tạo template Excel
			const template = [
				['Tên nhóm dịch vụ', 'Mô tả', 'Trạng thái'],
				['Khám tổng quát', 'Khám sức khỏe tổng quát', 'Kích hoạt'],
				['Khám chuyên khoa', 'Khám các chuyên khoa', 'Kích hoạt'],
				['Xét nghiệm', 'Các loại xét nghiệm', 'Kích hoạt']
			];

			// Tạo workbook và worksheet
			const wb = XLSX.utils.book_new();
			const ws = XLSX.utils.aoa_to_sheet(template);

			// Thêm worksheet vào workbook
			XLSX.utils.book_append_sheet(wb, ws, 'Template');

			// Xuất file
			XLSX.writeFile(wb, 'mau_import_nhom_dich_vu.xlsx');
		}

		function importCategories() {
			const fileInput = document.getElementById('importFile');
			const file = fileInput.files[0];

			if (!file) {
				showToast('error', 'Vui lòng chọn file để import');
				return;
			}

			const formData = new FormData();
			formData.append('file', file);

			$.ajax({
				url: '/service-categories/import',
				method: 'POST',
				data: formData,
				processData: false,
				contentType: false,
				success: function () {
					showToast('success', 'Import nhóm dịch vụ thành công!');
					$('#importModal').modal('hide');
					loadCategories();
					$('#importFile').val('');
				},
				error: function (xhr) {
					console.error('Import error:', xhr);
					const error = 'Không thể nhập nhóm dịch vụ. Vui lòng kiểm tra tệp và thử lại.';
					showToast('error', error);
				}
			});
		}
