/**
 * Transfer Modal DRY Module
 * Module chung để xử lý modal chuyển khám, tái sử dụng cho lễ tân, bác sĩ và tâm lý gia
 * Tuân thủ nguyên tắc DRY - Don't Repeat Yourself
 */

(function () {
	'use strict';

	// State quản lý dữ liệu chuyển khám
	let currentTransferData = {
		appointmentIds: [],
		fromRole: null, // 'receptionist', 'doctor', 'psychologist'
		toRole: null,
		toPersonId: null,
		toPersonName: null
	};

	// Callback để reload danh sách sau khi chuyển thành công
	let reloadCallback = null;

	// Flag để kiểm tra modal đã được load chưa
	let modalLoaded = false;
	let modalLoading = false;

	/**
	 * Load modal HTML từ template nếu chưa có trong DOM
	 */
	function ensureModalLoaded(callback) {
		// Nếu modal đã có trong DOM, gọi callback ngay
		if ($('#transferModal').length > 0) {
			modalLoaded = true;
			if (callback) callback();
			return;
		}

		// Nếu đang load, đợi
		if (modalLoading) {
			setTimeout(() => ensureModalLoaded(callback), 100);
			return;
		}

		// Bắt đầu load
		modalLoading = true;
		// Thêm version để bypass cache khi deploy version mới
		const appVersion = window.APP_VERSION || localStorage.getItem('APP_VERSION') || Date.now();
		const templateUrl = `/static/templates/transfer-modal.html?v=${appVersion}`;
		$.get(templateUrl)
			.done(function (html) {
				// Thêm modal vào body
				$('body').append(html);
				modalLoaded = true;
				modalLoading = false;
				// Bind event handlers sau khi modal được load vào DOM
				bindTransferModalEvents();
				if (callback) callback();
			})
			.fail(function () {
				console.error('Không thể load template modal chuyển khám');
				modalLoading = false;
				if (typeof showCustomToast === 'function') {
					showCustomToast('error', 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
				}
			});
	}

	/**
	 * Mở modal chuyển khám
	 * @param {Array|Number} appointmentIds - Mảng ID hoặc một ID đơn
	 * @param {String} fromRole - Role hiện tại: 'receptionist', 'doctor', 'psychologist'
	 * @param {Function} onSuccess - Callback khi chuyển thành công (để reload danh sách)
	 */
	function openTransferModal(appointmentIds, fromRole, onSuccess) {
		// Đảm bảo modal đã được load trước
		ensureModalLoaded(function () {
			openTransferModalInternal(appointmentIds, fromRole, onSuccess);
		});
	}

	/**
	 * Internal function để mở modal (sau khi đã load HTML)
	 */
	function openTransferModalInternal(appointmentIds, fromRole, onSuccess) {
		// Chuyển đổi appointmentIds thành mảng nếu là số
		if (!Array.isArray(appointmentIds)) {
			appointmentIds = [appointmentIds];
		}

		// Lưu callback
		reloadCallback = onSuccess || null;

		// Khởi tạo data
		currentTransferData.appointmentIds = appointmentIds;
		currentTransferData.fromRole = fromRole || 'receptionist';
		currentTransferData.toRole = null;
		currentTransferData.toPersonId = null;
		currentTransferData.toPersonName = null;

		// Reset modal UI
		$('.transfer-role-btn').removeClass('active').attr('aria-pressed', 'false').show();
		$('#personSelector').html('<div class="transfer-empty-state"><i class="bi bi-arrow-up-circle" aria-hidden="true"></i><span>Chọn nhóm tiếp nhận trước</span></div>');
		$('#confirmTransferBtn').prop('disabled', true);

		// Hiển thị tất cả các role (cho phép chuyển về chính role hiện tại)
		$('.transfer-role-btn').closest('.transfer-role-option, .col-4, .col-6').show();

		// Đảm bảo event handlers được bind trước khi show modal
		// Nếu modal đã có trong DOM nhưng chưa bind events, bind lại
		if ($('#transferModal').length > 0) {
			bindTransferModalEvents();
		}

		// Hiển thị modal
		$('#transferModal').modal('show');

		// Sau khi modal được show, fetch appointment data và tự động active tab + chọn người nhận
		$('#transferModal').one('shown.bs.modal', function () {
			// Lấy appointment ID đầu tiên để fetch thông tin
			const firstAppointmentId = appointmentIds[0];

			if (firstAppointmentId) {
				// Fetch appointment data để lấy doctor_id hoặc psychologist_id
				$.ajax({
					url: `/api/appointments/${firstAppointmentId}`,
					method: 'GET',
					headers: {
						'Authorization': 'Bearer ' + localStorage.getItem('qlpk_token')
					},
					success: function (appointment) {

						// Xác định role và person_id dựa trên appointment data
						let targetRole = null;
						let targetPersonId = null;

						// Ưu tiên psychologist_id nếu có
						if (appointment.psychologist_id && appointment.psychologist_id !== null && appointment.psychologist_id !== undefined) {
							targetRole = 'psychologist';
							targetPersonId = appointment.psychologist_id;
						}
						// Nếu không có psychologist_id, kiểm tra role của user trong doctor_id
						else if (appointment.doctor_id && appointment.doctor_id !== null && appointment.doctor_id !== undefined) {
							// Kiểm tra role của doctor để xác định đây là bác sĩ hay tâm lý gia
							const doctorRole = appointment.doctor && appointment.doctor.role ? appointment.doctor.role : null;

							if (doctorRole === 'PSYCHOLOGIST') {
								// Đây là tâm lý gia được lưu trong doctor_id
								targetRole = 'psychologist';
								targetPersonId = appointment.doctor_id;
							} else {
								// Đây là bác sĩ
								targetRole = 'doctor';
								targetPersonId = appointment.doctor_id;
							}
						}

						// Nếu có target role và person_id, tự động active và chọn
						if (targetRole && targetPersonId) {
							// Active tab tương ứng
							const roleButton = $(`.transfer-role-btn[data-role="${targetRole}"]`);

							if (roleButton.length > 0) {
								$('.transfer-role-btn').removeClass('active').attr('aria-pressed', 'false');
								roleButton.addClass('active').attr('aria-pressed', 'true');
								currentTransferData.toRole = targetRole;

								// Load danh sách người nhận
								loadPersonList(targetRole, function () {
									// Sau khi load xong, tự động chọn người nhận
									const personBadge = $(`.person-badge[data-person-id="${targetPersonId}"]`);
									if (personBadge.length > 0) {
										personBadge.trigger('click');
									} else {
										console.warn('Không tìm thấy person badge với ID:', targetPersonId);
									}
								});
							} else {
								console.error('Không tìm thấy role button cho role:', targetRole);
								selectFirstVisibleRole();
							}
						} else {
							selectFirstVisibleRole();
						}
					},
					error: function (xhr, status, error) {
						console.error('Lỗi khi fetch appointment data:', error);
						selectFirstVisibleRole();
					}
				});
			} else {
				selectFirstVisibleRole();
			}
		});
	}

	/**
	 * Chọn nhóm tiếp nhận đầu tiên khi chưa xác định được người nhận từ lịch khám.
	 */
	function selectFirstVisibleRole() {
		const firstVisibleRoleBtn = $('.transfer-role-btn').filter(function () {
			const roleWrapper = $(this).closest('.transfer-role-option, .col-4, .col-6');
			return roleWrapper.length > 0 ? roleWrapper.is(':visible') : $(this).is(':visible');
		}).first();

		if (firstVisibleRoleBtn.length > 0) {
			const role = firstVisibleRoleBtn.data('role');
			$('.transfer-role-btn').removeClass('active').attr('aria-pressed', 'false');
			firstVisibleRoleBtn.addClass('active').attr('aria-pressed', 'true');
			currentTransferData.toRole = role;
			currentTransferData.toPersonId = null;
			currentTransferData.toPersonName = null;
			loadPersonList(role);
			$('#confirmTransferBtn').prop('disabled', true);
		}
	}

	/**
 * Map role từ frontend sang database enum
 * Frontend: doctor, psychologist, receptionist (lowercase)
 * Database: doctor, PSYCHOLOGIST, staff (mixed case, không có receptionist)
 */
	function mapRoleToDatabase(role) {
		const roleMap = {
			'doctor': 'doctor',
			'psychologist': 'PSYCHOLOGIST',
			'receptionist': 'staff'  // Lễ tân = staff trong database
		};
		return roleMap[role.toLowerCase()] || role;
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	/**
	 * Load danh sách người theo role
	 * @param {String} role - 'doctor', 'psychologist', hoặc 'receptionist'
	 * @param {Function} callback - Callback được gọi sau khi load xong
	 */
	function loadPersonList(role, callback) {
		$('#personSelector').html(`
            <div class="transfer-loading-state">
                <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                <span>Đang tải danh sách người nhận...</span>
            </div>
        `);

		// Map role to database enum
		const dbRole = mapRoleToDatabase(role);

		$.ajax({
			url: '/users',
			method: 'GET',
			data: { role: dbRole },
			headers: {
				'Authorization': 'Bearer ' + localStorage.getItem('qlpk_token')
			},
			success: function (response) {
				if (response && response.length > 0) {
					let html = '';
					response.forEach(user => {
						const safeName = escapeHtml(user.full_name || 'Chưa có tên');
						html += `
                            <button type="button" class="person-badge" aria-pressed="false"
                                    data-person-id="${user.id}" data-person-name="${safeName}" title="${safeName}">
                                <i class="bi bi-person-fill" aria-hidden="true"></i>
                                <span class="person-badge__name">${safeName}</span>
                            </button>
                        `;
					});
					$('#personSelector').html(html);

					// Gọi callback sau khi render xong
					if (callback && typeof callback === 'function') {
						// Đợi một chút để đảm bảo DOM đã được render
						setTimeout(callback, 100);
					}
				} else {
					$('#personSelector').html(`
                        <div class="transfer-empty-state">
                            <i class="bi bi-person-x" aria-hidden="true"></i>
                            <span>Không có người nhận trong nhóm này</span>
                        </div>
                    `);
					if (callback && typeof callback === 'function') {
						callback();
					}
				}
			},
			error: function (xhr, status, error) {
				console.error('API error for role', role, ':', xhr.responseText);
				$('#personSelector').html(`
                    <div class="transfer-error-state">
                        <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                        <span>Lỗi khi tải danh sách, vui lòng thử lại</span>
                    </div>
                `);
				if (callback && typeof callback === 'function') {
					callback();
				}
			}
		});
	}

	/**
	 * Xử lý chuyển appointments
	 * @param {Array} appointmentIds - Mảng ID appointments
	 * @param {String} toRole - Role đích: 'doctor', 'psychologist', 'receptionist'
	 * @param {Number} toPersonId - ID người nhận
	 */
	function transferAppointments(appointmentIds, toRole, toPersonId) {
		// Map role to database enum
		const dbRole = mapRoleToDatabase(toRole);

		const data = {
			appointment_ids: appointmentIds,
			to_role: dbRole,
			to_person_id: toPersonId
		};

		$.ajax({
			url: '/api/appointments/transfer',
			method: 'POST',
			headers: {
				'Authorization': 'Bearer ' + localStorage.getItem('qlpk_token'),
				'Content-Type': 'application/json'
			},
			data: JSON.stringify(data),
			success: function (response) {
				$('#transferModal').modal('hide');

				// Hiển thị thông báo thành công
				if (typeof showCustomToast === 'function') {
					showCustomToast('success', 'Đã chuyển khám.');
				} else {
					alert('Đã chuyển khám.');
				}

				// Đóng modal chi tiết nếu có
				$('#addExaminationModal').modal('hide');

				// Gọi callback để reload danh sách
				if (reloadCallback && typeof reloadCallback === 'function') {
					reloadCallback();
				}
			},
			error: function (xhr, status, error) {
				console.error('Transfer API error:', xhr.responseText);
				const errorMessage = 'Không thể chuyển khám. Vui lòng kiểm tra lại.';

				if (typeof showCustomToast === 'function') {
					showCustomToast('error', errorMessage);
				} else {
					alert(errorMessage);
				}
			}
		});
	}

	// ===== EVENT HANDLERS =====

	/**
	 * Bind tất cả event handlers cho transfer modal
	 * Được gọi sau khi modal HTML được load vào DOM
	 */
	function bindTransferModalEvents() {
		// Chỉ bind nếu modal đã có trong DOM
		if ($('#transferModal').length === 0) {
			return;
		}

		// Xử lý chọn role - bind trực tiếp trên modal element để đảm bảo hoạt động
		$('#transferModal').off('click', '.transfer-role-btn').on('click', '.transfer-role-btn', function (e) {
			e.preventDefault();
			e.stopPropagation();

			const role = $(this).data('role');

			$('.transfer-role-btn').removeClass('active').attr('aria-pressed', 'false');
			$(this).addClass('active').attr('aria-pressed', 'true');
			currentTransferData.toRole = role;
			currentTransferData.toPersonId = null;
			currentTransferData.toPersonName = null;

			loadPersonList(role, null);
			// Disable confirm button cho đến khi chọn người nhận
			$('#confirmTransferBtn').prop('disabled', true);
		});

		// Xử lý chọn người nhận
		$('#transferModal').off('click', '.person-badge').on('click', '.person-badge', function () {
			const personId = $(this).data('person-id');
			const personName = $(this).data('person-name');

			// Cập nhật UI
			$('.person-badge').removeClass('selected').attr('aria-pressed', 'false');
			$(this).addClass('selected').attr('aria-pressed', 'true');

			// Cập nhật data
			currentTransferData.toPersonId = personId;
			currentTransferData.toPersonName = personName;

			// Enable confirm button
			$('#confirmTransferBtn').prop('disabled', false);
		});

		// Xử lý nút xác nhận chuyển
		$('#transferModal').off('click', '#confirmTransferBtn').on('click', '#confirmTransferBtn', function (e) {
			e.preventDefault();
			e.stopPropagation();

			if (!currentTransferData.toRole) {
				if (typeof showCustomToast === 'function') {
					showCustomToast('error', 'Vui lòng chọn role chuyển đến');
				} else {
					alert('Vui lòng chọn role chuyển đến');
				}
				return;
			}

			// Yêu cầu chọn người nhận cho tất cả các role (kể cả lễ tân)
			if (!currentTransferData.toPersonId || currentTransferData.toPersonId === null || currentTransferData.toPersonId === undefined) {
				if (typeof showCustomToast === 'function') {
					showCustomToast('error', 'Vui lòng chọn người nhận');
				} else {
					alert('Vui lòng chọn người nhận');
				}
				return;
			}

			transferAppointments(
				currentTransferData.appointmentIds,
				currentTransferData.toRole,
				currentTransferData.toPersonId
			);
		});

		// Reset modal khi đóng - sử dụng namespace để tránh duplicate
		$('#transferModal').off('hidden.bs.modal.transfer').on('hidden.bs.modal.transfer', function () {
			currentTransferData = {
				appointmentIds: [],
				fromRole: null,
				toRole: null,
				toPersonId: null,
				toPersonName: null
			};
			reloadCallback = null;

			// Hiển thị lại tất cả các nút role
			$('.transfer-role-btn').closest('.transfer-role-option, .col-4, .col-6').show();
			$('.transfer-role-btn').show().attr('aria-pressed', 'false');
		});
	}

	// Bind events lần đầu khi module load (nếu modal đã có sẵn trong DOM)
	$(document).ready(function () {
		if ($('#transferModal').length > 0) {
			bindTransferModalEvents();
		}
	});

	/**
	 * Helper function để mở modal với error handling thống nhất
	 * @param {Array|Number} appointmentIds - Mảng ID hoặc một ID đơn
	 * @param {String} fromRole - Role hiện tại
	 * @param {Function} onSuccess - Callback khi thành công
	 * @returns {Boolean} - true nếu thành công, false nếu có lỗi
	 */
	function openWithErrorHandling(appointmentIds, fromRole, onSuccess) {
		if (!window.TransferModal || !window.TransferModal.open) {
			console.error('TransferModal module chưa được load. Vui lòng đảm bảo transfer-modal-dry.js được load trước.');
			if (typeof showCustomToast === 'function') {
				showCustomToast('error', 'Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
			} else {
				alert('Không thể mở chức năng chuyển khám. Vui lòng tải lại trang.');
			}
			return false;
		}
		window.TransferModal.open(appointmentIds, fromRole, onSuccess);
		return true;
	}

	// Export functions để sử dụng từ bên ngoài
	window.TransferModal = {
		open: openTransferModal,
		loadPersonList: loadPersonList,
		transfer: transferAppointments,
		openWithErrorHandling: openWithErrorHandling
	};

})();
