// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

(function () {
function installUserPage1(ctx) {
	function fetchUsers(params = {
		search: $('#searchInput').val(),
		role: $('#roleFilter').val(),
		status: $('#statusFilter').val()
	}) {
		const revision = ++ctx.usersRequestRevision;
		$.get('/users/', params, function (data) {
			if (revision !== ctx.usersRequestRevision) return;
			ctx.users = data.items || data;
			const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value)
				|| String(value || '').toLowerCase().trim();
			const keyword = normalize(params.search);
			renderTable(ctx.users.filter(user =>
				[user.full_name, user.username, user.phone].some(value => normalize(value).includes(keyword))
				&& (!params.status || user.is_active === (params.status === 'active'))));
		});
	}

	function renderTable(users) { ctx.listPagination.setItems(users); }

	function renderPage(users, offset) {
		const tbody = $('#userTable tbody');
		tbody.empty();
		if (!users.length) {
			tbody.append('<tr><td colspan="8" class="text-center text-muted">Không có dữ liệu</td></tr>');
			return;
		}
		users.forEach((u, i) => {
			tbody.append(`
      <tr>
          <td>${offset + i + 1}</td>
        <td>${window.QLPKHtml.escape(u.full_name || '')}</td>
        <td>${window.QLPKHtml.escape(u.username || '')}</td>
        <td>${roleLabel(u.role)}</td>
        <td>${window.QLPKHtml.escape(u.address || '')}</td>
        <td>${window.QLPKHtml.escape(u.phone || '')}</td>
          <td>${u.is_active ? '<span class="badge bg-success">Hoạt động</span>' : '<span class="badge bg-secondary">Không hoạt động</span>'}</td>
        <td>
            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="action-btn edit-btn" data-id="${u.id}" title="Sửa"><i class="bi bi-pencil-square"></i></button>
            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="action-btn delete-btn" data-id="${u.id}" title="Xoá"><i class="bi bi-trash"></i></button>
        </td>
      </tr>
      `);
		});
	}

	function roleLabel(role) {
		if (!role || role === '') {
			return 'Chưa phân quyền';
		}

		switch (role) {
			case 'admin': return 'Admin';
			case 'doctor': return 'Bác sĩ';
			case 'staff': return 'Nhân viên';
			case 'cashier': return 'Thu ngân';
			case 'PSYCHOLOGIST': return 'Tâm lý gia';
			default:
				return role; // Hiển thị role gốc nếu không match
		}
	}

	Object.assign(ctx, { fetchUsers, renderPage });
}

function installUserPage2(ctx) {
	// Function map role từ frontend sang backend enum
	function mapRoleToBackend(frontendRole) {
		const roleMap = {
			'admin': 'admin',
			'doctor': 'doctor',
			'staff': 'staff',
			'cashier': 'cashier',
			'PSYCHOLOGIST': 'PSYCHOLOGIST'  // Đã sửa HTML để dùng PSYCHOLOGIST
		};

		const mappedRole = roleMap[frontendRole];
		if (!mappedRole) {
			return frontendRole; // Fallback
		}

		return mappedRole;
	}

	// Function load thông tin user đã đăng nhập
	function loadCurrentUserInfo() {
		if (!window.QLPKApiTransport.hasSession()) {
			return;
		}

		$.ajax({
			url: '/users/me',
			method: 'GET',
			success: function (response) {

				// Cập nhật sidebar
				const userName = response.full_name || 'Không xác định';
				const userRole = response.role || 'Không xác định';

				// Map role để hiển thị tiếng Việt
				const roleDisplay = mapRoleToDisplay(userRole);

				$('#sidebarUserName').html(`${userRole.toUpperCase()}<br>${window.QLPKHtml.escape(userName)}`);
				$('#sidebarUserRole').text(roleDisplay);

			},
			error: function () {
				// Fallback nếu API không hoạt động
				$('#sidebarUserName').html('ADMIN<br>QLPK');
				$('#sidebarUserRole').text('Quản trị viên');
			}
		});
	}

	// Function map role sang tiếng Việt để hiển thị
	function mapRoleToDisplay(role) {
		const roleMap = {
			'admin': 'Quản trị viên',
			'doctor': 'Bác sĩ',
			'staff': 'Nhân viên',
			'cashier': 'Thu ngân',
			'PSYCHOLOGIST': 'Tâm lý gia'
		};

		return roleMap[role] || role;
	}

	function registerRealtimeHooks() {
		if (!window.QLPKRealtimePageHooks) return;
		window.QLPKRealtimePageHooks.register({
			types: ['catalog.changed'],
			filter: function (event) {
				const entity = event && event.payload ? event.payload.entity : '';
				return ['user', 'group', 'user_group'].includes(entity);
			},
			handler: function () {
				ctx.fetchUsers();
			},
			debounceMs: 350,
		});
	}

	Object.assign(ctx, { mapRoleToBackend, loadCurrentUserInfo, registerRealtimeHooks });
}

function runUserPage1(ctx) {
	$('#logoutBtn').on('click', function () {
		window.QLPKAppHeader?.logout();
	});
	$('#addUserBtn').on('click', function () {
		$('#userModal').modal('show');
	});
	ctx.users = [];
	ctx.editingUserId = null;
	ctx.userIdToDelete = null;
	ctx.currentAvatarUrl = '';
	ctx.currentLicenseCertificateUrl = '';
	ctx.currentLicenseCertificateFileName = '';
	ctx.usersRequestRevision = 0;
	ctx.listPagination = window.QLPKPagination.createClient({ render: ctx.renderPage });
	// Filter form
	$('#filterForm').on('submit', function (e) {
		e.preventDefault();
		const params = {
			search: $('#searchInput').val(),
			role: $('#roleFilter').val(),
			status: $('#statusFilter').val()
		};
		ctx.fetchUsers(params);
	});
	$('#resetBtn').on('click', function () {
		$('#filterForm')[0].reset();
		ctx.fetchUsers();
	});
	// Open modal for add
	$('[data-bs-target="#userModal"]').on('click', function () {
		ctx.editingUserId = null;
		$('#userModalLabel').text('THÊM TÀI KHOẢN');
		$('#userForm')[0].reset();
		$('#isActiveSwitch').prop('checked', true);
		$('#canViewAllPatientsSwitch').prop('checked', false);
		$('#userFormError').addClass('d-none').text('');
		ctx.currentAvatarUrl = '';
		ctx.currentLicenseCertificateUrl = '';
		ctx.currentLicenseCertificateFileName = '';
		$('#licenseCertificateFileName').hide();
		$('#avatarPreview').attr('src', '/static/assets/images_doctor.jpg');
		$("input[name='username']").prop('readonly', false);
		$("input[name='password']").val('').prop('required', true).attr('placeholder', 'Nhập mật khẩu');
		$('#passwordRequired').show();
		$('#calendarColorPicker').val('');
		$('#calendarColorPicker').data('cleared', false);
		$('.color-swatch').removeClass('selected');
		$('.color-swatch[data-color="#2196f3"]').addClass('selected');
		$('#calendarColorPicker').val('#2196f3');
	});
}

function runUserPage2(ctx) {
	// Edit user
	$('#userTable').on('click', '.edit-btn', function () {
		const id = $(this).data('id');
		ctx.editingUserId = id;
		$('#userModalLabel').text('CẬP NHẬT TÀI KHOẢN');
		$('#userForm')[0].reset();
		$('#userFormError').addClass('d-none').text('');
		// Tải chi tiết user để có license_number
		$.ajax({
			url: `/users/${id}`,
			method: 'GET',
			success: function (user) {
				$("input[name='full_name']").val(user.full_name);
				$("select[name='role']").val(user.role);
				const normalizeGender = (g) => {
					if (!g) return '';
					const v = String(g).toLowerCase();
					if (v === 'nam' || v === 'male' || v === 'm') return 'male';
					if (v === 'nữ' || v === 'nu' || v === 'female' || v === 'f') return 'female';
					return 'other';
				};
				$("select[name='gender']").val(normalizeGender(user.gender));
				$("input[name='address']").val(user.address);
				$("input[name='phone']").val(user.phone);
				$("input[name='username']").val(user.username).prop('readonly', true);
				$("input[name='email']").val(user.email);
				$("input[name='license_number']").val(user.license_number || '');
				ctx.currentLicenseCertificateUrl = user.license_certificate_file || '';
				ctx.currentLicenseCertificateFileName = user.license_certificate_original_filename || '';
				if (ctx.currentLicenseCertificateUrl) {
					// Sử dụng tên file gốc nếu có, nếu không thì lấy từ URL
					const fileName = ctx.currentLicenseCertificateFileName || ctx.currentLicenseCertificateUrl.split('/').pop() || 'File chứng nhận';
					$('#licenseCertificateFileName').text(fileName).attr('href', ctx.currentLicenseCertificateUrl).show();
				} else {
					$('#licenseCertificateFileName').hide();
				}
				if (user.license_issue_date) {
					$("input[name='license_issue_date']").val(user.license_issue_date.split('T')[0]);
				} else {
					$("input[name='license_issue_date']").val('');
				}
				ctx.currentAvatarUrl = user.avatar || '';
				if ($('#avatarPreview').length) {
					$('#avatarPreview').attr('src', ctx.currentAvatarUrl || '/static/assets/images_doctor.jpg');
				}
				$("input[name='password']").val('********').prop('required', false).attr('placeholder', 'Nhập mật khẩu mới nếu muốn đổi');
				$('#passwordRequired').hide();
				$('#isActiveSwitch').prop('checked', user.is_active);
				$('#canViewAllPatientsSwitch').prop('checked', user.can_view_all_patients || false);
				if (user.calendar_color) {
					$('#calendarColorPicker').val(user.calendar_color);
					$('#calendarColorPicker').data('cleared', false);
					$('.color-swatch').removeClass('selected');
					$('.color-swatch[data-color="' + user.calendar_color + '"]').addClass('selected');
				} else {
					$('#calendarColorPicker').val('');
					$('#calendarColorPicker').data('cleared', true);
					$('.color-swatch').removeClass('selected');
				}
				const modal = new bootstrap.Modal(document.getElementById('userModal'));
				modal.show();
			},
			error: function () {
				showCustomToast('error', 'Không thể tải dữ liệu tài khoản. Vui lòng thử lại.');
			}
		});
	});
}

function runUserPage3(ctx) {
	// Delete user (custom modal)
	$('#userTable').on('click', '.delete-btn', function () {
		ctx.userIdToDelete = $(this).data('id');
		const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
		modal.show();
	});
	$('#confirmDeleteBtn').on('click', function () {
		if (!ctx.userIdToDelete) return;
		$.ajax({
			url: `/users/${ctx.userIdToDelete}`,
			type: 'DELETE',
			success: function () {
				bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
				ctx.fetchUsers();
			},
			error: function () {
				bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
				showCustomToast('error', 'Không thể xóa tài khoản. Vui lòng thử lại.');
			}
		});
		ctx.userIdToDelete = null;
	});
}

function runUserPage4(ctx) {
	// Add/Edit user submit
	$('#userForm').on('submit', function (e) {
		e.preventDefault();
		const form = $(this);
		// Map role để đảm bảo đúng format backend enum
		const roleValue = form.find("[name='role']").val();
		const mappedRole = ctx.mapRoleToBackend(roleValue);

		const data = {
			full_name: form.find("[name='full_name']").val(),
			role: mappedRole,
			gender: form.find("[name='gender']").val(),
			address: form.find("[name='address']").val(),
			phone: form.find("[name='phone']").val(),
			username: form.find("[name='username']").val(),
			email: form.find("[name='email']").val(),
			is_active: form.find("[name='is_active']").is(':checked'),
			can_view_all_patients: form.find("[name='can_view_all_patients']").is(':checked')
		};
		// Calendar color
		if ($('#calendarColorPicker').data('cleared')) {
			data.calendar_color = null;
		} else {
			data.calendar_color = $('#calendarColorPicker').val();
		}
		const licenseNumber = form.find("[name='license_number']").val();
		if (licenseNumber) data.license_number = licenseNumber;
		const licenseIssueDate = form.find("[name='license_issue_date']").val();
		if (licenseIssueDate) data.license_issue_date = licenseIssueDate;
		if (ctx.currentAvatarUrl) data.avatar = ctx.currentAvatarUrl;
		const password = form.find("[name='password']").val();
		// Chỉ gửi password nếu có giá trị và không phải là các dấu sao (mật khẩu giả)
		if (password && password.trim() !== '' && !/^\*+$/.test(password)) {
			data.password = password;
		}
		$('#userFormError').addClass('d-none').text('');
		if (ctx.editingUserId) {
			$.ajax({
				url: `/users/${ctx.editingUserId}`,
				type: 'PUT',
				contentType: 'application/json',
				data: JSON.stringify(data),
				success: function () {
					bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
					ctx.fetchUsers();
				},
				error: function () {
					$('#userFormError').removeClass('d-none').text('Không thể cập nhật tài khoản. Vui lòng kiểm tra lại.');
				}
			});
		} else {
			$.ajax({
				url: '/users/',
				type: 'POST',
				contentType: 'application/json',
				data: JSON.stringify(data),
				success: function () {
					bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
					ctx.fetchUsers();
				},
				error: function () {
					$('#userFormError').removeClass('d-none').text('Không thể tạo tài khoản. Vui lòng kiểm tra lại.');
				}
			});
		}
	});
}

function runUserPage5(ctx) {
	// Avatar upload handler
	$(document).on('change', '#avatarFile', function () {
		const file = this.files && this.files[0];
		if (!file) return;
		// Preview
		const reader = new FileReader();
		reader.onload = function (e) { $('#avatarPreview').attr('src', e.target.result); };
		reader.readAsDataURL(file);

		// Upload
		if (!ctx.editingUserId) {
			showCustomToast('warning', 'Hãy lưu tài khoản trước khi upload avatar');
			return;
		}
		const formData = new FormData();
		formData.append('file', file);
		$.ajax({
			url: `/users/${ctx.editingUserId}/avatar`,
			method: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function (res) {
				ctx.currentAvatarUrl = res.avatar;
				showCustomToast('success', 'Tải avatar thành công');
			},
			error: function () {
				showCustomToast('error', 'Không thể tải ảnh đại diện lên. Vui lòng thử lại.');
			}
		});
	});
	// License certificate upload handler
	$(document).on('change', '#licenseCertificateFile', function () {
		const file = this.files && this.files[0];
		if (!file) return;

		// Validate file type
		const allowedTypes = ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'];
		const ext = file.name.split('.').pop().toLowerCase();
		if (!allowedTypes.includes(ext)) {
			showCustomToast('error', 'Định dạng không hỗ trợ. Chỉ chấp nhận: PDF, JPG, PNG, DOC, DOCX');
			$(this).val('');
			return;
		}

		// Upload
		if (!ctx.editingUserId) {
			showCustomToast('warning', 'Hãy lưu tài khoản trước khi upload file chứng nhận');
			$(this).val('');
			return;
		}
		const formData = new FormData();
		formData.append('file', file);
		$.ajax({
			url: `/users/${ctx.editingUserId}/license-certificate`,
			method: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function (res) {
				ctx.currentLicenseCertificateUrl = res.license_certificate_file;
				// Sử dụng tên file gốc từ response
				ctx.currentLicenseCertificateFileName = res.license_certificate_original_filename || file.name;
				$('#licenseCertificateFileName').text(ctx.currentLicenseCertificateFileName).attr('href', ctx.currentLicenseCertificateUrl).show();
				showCustomToast('success', 'Tải file chứng nhận thành công');
			},
			error: function () {
				showCustomToast('error', 'Không thể tải chứng nhận lên. Vui lòng thử lại.');
				$('#licenseCertificateFile').val('');
			}
		});
	});
	// Password field focus handler - xóa các dấu sao khi focus để người dùng nhập mật khẩu mới
	$(document).on('focus', '#passwordInput', function () {
		if ($(this).val() === '********') {
			$(this).val('');
		}
	});
}

function runUserPage6(ctx) {
	// Calendar color swatch handlers
	$('#clearCalendarColor').on('click', function () {
		$('#calendarColorPicker').val('');
		$('#calendarColorPicker').data('cleared', true);
		$('.color-swatch').removeClass('selected');
	});
	$(document).on('click', '.color-swatch', function () {
		const color = $(this).data('color');
		$('.color-swatch').removeClass('selected');
		$(this).addClass('selected');
		$('#calendarColorPicker').val(color);
		$('#calendarColorPicker').data('cleared', false);
	});
	// Initial load
	ctx.registerRealtimeHooks();
	ctx.loadCurrentUserInfo();
	// Load thông tin user trước
	ctx.fetchUsers();
}

$(document).ready(function () {
	const ctx = {};
	installUserPage1(ctx);
	installUserPage2(ctx);
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = '/login.html';
		return;
	}
	runUserPage1(ctx);
	runUserPage2(ctx);
	runUserPage3(ctx);
	runUserPage4(ctx);
	runUserPage5(ctx);
	runUserPage6(ctx);
});
})(); 
