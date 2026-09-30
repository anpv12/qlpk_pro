		let holidays = [];

		function normalizeSearchText(value) {
			return window.QLPKSearchNormalization?.normalizeSearchText(value)
				|| String(value || '').toLowerCase().trim();
		}

		// Toast function
		function showToast(type, message) {
			return window.QLPKUserFeedback?.show(type, message);
		}

		// Load ngày lễ
		function loadHolidays() {
			$.ajax({
				url: '/holidays/',
				method: 'GET',
				success: function (data) {
					holidays = data;
					renderHolidays(holidays);
				},
				error: function (xhr) {
					console.error('Error loading holidays:', xhr);
					showToast('error', 'Không thể tải danh sách ngày lễ. Vui lòng thử lại.');
				}
			});
		}

		// Render ngày lễ
		const listPagination = window.QLPKPagination.createClient({ render: renderPage });
    function renderHolidays(holidaysToRender) { listPagination.setItems(holidaysToRender); }
    function renderPage(holidaysToRender) {
			const tbody = $('#holidayTableBody');
			tbody.empty();

			if (holidaysToRender.length === 0) {
				tbody.append(`
        <tr>
          <td colspan="6" class="text-center text-muted py-4">
            <i class="bi bi-inbox fs-1 d-block mb-2"></i>
            Chưa có ngày lễ nào
          </td>
        </tr>
      `);
				return;
			}

			holidaysToRender.forEach(holiday => {
				const row = `
        <tr>
          <td>${holiday.id}</td>
          <td><strong>${window.QLPKHtml.escape(holiday.name)}</strong></td>
          <td>${new Date(holiday.date).toLocaleDateString('vi-VN')}</td>
          <td>${holiday.description ? window.QLPKHtml.escape(holiday.description) : '<span class="text-muted">Không có mô tả</span>'}</td>
          <td>
            <span class="badge ${holiday.is_recurring ? 'qlpk-status--success' : 'qlpk-status--neutral'}">
              ${holiday.is_recurring ? 'Có' : 'Không'}
            </span>
          </td>
          <td>
            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="btn btn-sm me-1" data-qlpk-call="editHoliday" data-qlpk-args='[${holiday.id}]' aria-label="Sửa ngày nghỉ" title="Sửa ngày nghỉ">
              <i class="bi bi-pencil"></i>
            </button>
            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="btn btn-sm" data-qlpk-call="deleteHoliday" data-qlpk-args='[${holiday.id}]' aria-label="Xóa ngày nghỉ" title="Xóa ngày nghỉ">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
				tbody.append(row);
			});
		}

		// Thêm ngày lễ
		$('#addHolidayForm').submit(function (e) {
			e.preventDefault();

			const name = $('#holidayName').val().trim();
			const date = $('#holidayDate').val();
			const description = $('#holidayDescription').val().trim();
			const isRecurring = $('#holidayRecurring').is(':checked');

			if (!name) {
				$('#holidayName').addClass('is-invalid');
				$('#nameError').text('Tên ngày lễ không được để trống');
				return;
			}

			if (!date) {
				$('#holidayDate').addClass('is-invalid');
				$('#dateError').text('Ngày không được để trống');
				return;
			}

			$('#holidayName, #holidayDate').removeClass('is-invalid');

			const data = {
				name: name,
				date: date,
				description: description,
				is_recurring: isRecurring
			};


			$.ajax({
				url: '/holidays/',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				data: JSON.stringify(data),
				success: function () {
					showToast('success', 'Thêm ngày lễ thành công!');
					$('#addHolidayModal').modal('hide');
					loadHolidays();
				},
				error: function (xhr) {
					console.error('Error adding holiday:', xhr);
					const error = 'Không thể thêm ngày nghỉ. Vui lòng kiểm tra lại.';
					showToast('error', error);
				}
			});
		});

		// Sửa ngày lễ
		window.editHoliday = function (holidayId) {
			const holiday = holidays.find(h => h.id === holidayId);
			if (!holiday) return;

			$('#editHolidayId').val(holiday.id);
			$('#editHolidayName').val(holiday.name);
			$('#editHolidayDate').val(holiday.date);
			$('#editHolidayDescription').val(holiday.description);
			$('#editHolidayRecurring').prop('checked', holiday.is_recurring);

			$('#editHolidayModal').modal('show');
		};

		// Cập nhật ngày lễ
		$('#updateHolidayBtn').click(function () {
			const id = $('#editHolidayId').val();
			const name = $('#editHolidayName').val().trim();
			const date = $('#editHolidayDate').val();
			const description = $('#editHolidayDescription').val().trim();
			const isRecurring = $('#editHolidayRecurring').is(':checked');

			if (!name) {
				$('#editHolidayName').addClass('is-invalid');
				$('#editNameError').text('Tên ngày lễ không được để trống');
				return;
			}

			if (!date) {
				$('#editHolidayDate').addClass('is-invalid');
				$('#editDateError').text('Ngày không được để trống');
				return;
			}

			$('#editHolidayName, #editHolidayDate').removeClass('is-invalid');

			const data = {
				name: name,
				date: date,
				description: description,
				is_recurring: isRecurring
			};


			$.ajax({
				url: `/holidays/${id}`,
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				data: JSON.stringify(data),
				success: function () {
					showToast('success', 'Cập nhật ngày lễ thành công!');
					$('#editHolidayModal').modal('hide');
					loadHolidays();
				},
				error: function (xhr) {
					console.error('Error updating holiday:', xhr);
					const error = 'Không thể cập nhật ngày nghỉ. Vui lòng kiểm tra lại.';
					showToast('error', error);
				}
			});
		});

		// Xóa ngày lễ
		window.deleteHoliday = async function (holidayId) {
			if (!await window.QLPKConfirmationDialog.confirmDelete('Bạn có chắc chắn muốn xóa ngày lễ này?')) return;


			$.ajax({
				url: `/holidays/${holidayId}`,
				method: 'DELETE',
				success: function () {
					showToast('success', 'Xóa ngày lễ thành công!');
					loadHolidays();
				},
				error: function (xhr) {
					console.error('Error deleting holiday:', xhr);
					const errorMessage = 'Không thể xóa ngày nghỉ. Vui lòng thử lại.';
					showToast('error', errorMessage);
				}
			});
		};

		// Tìm kiếm
		$('#searchInput').on('input', function () {
			const searchTerm = normalizeSearchText($(this).val());
			const filtered = holidays.filter(holiday =>
				normalizeSearchText(holiday.name).includes(searchTerm) ||
				(holiday.description && normalizeSearchText(holiday.description).includes(searchTerm))
			);
			renderHolidays(filtered);
		});

		// Reset form khi đóng modal
		$('#addHolidayModal').on('hidden.bs.modal', function () {
			$('#addHolidayForm')[0].reset();
			$('.is-invalid').removeClass('is-invalid');
		});

		function registerRealtimeHooks() {
			if (!window.QLPKRealtimePageHooks) return;
			window.QLPKRealtimePageHooks.register({
				types: ['catalog.changed'],
				filter: function (event) {
					return event && event.payload && event.payload.entity === 'holiday';
				},
				handler: function () {
					loadHolidays();
				},
				debounceMs: 350,
			});
		}

		// Load data ban đầu
		$(document).ready(function () {
			registerRealtimeHooks();
			loadHolidays();
		});
