// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

$(document).ready(function () {
	if (!window.QLPKApiTransport.hasSession()) {
		window.location.href = '/login.html';
		return;
	}

	$('#logoutBtn').on('click', function () {
		window.QLPKAppHeader?.logout();
	});

	$('#addUserBtn').on('click', function () {
		$('#userModal').modal('show');
	});

	let users = [];
	let editingUserId = null;
	let userIdToDelete = null;
	let currentAvatarUrl = '';
	let currentLicenseCertificateUrl = '';
	let currentLicenseCertificateFileName = '';

	let usersRequestRevision = 0;
	function fetchUsers(params = {
		search: $('#searchInput').val(),
		role: $('#roleFilter').val(),
		status: $('#statusFilter').val()
	}) {
		const revision = ++usersRequestRevision;
		$.get('/users/', params, function (data) {
			if (revision !== usersRequestRevision) return;
			users = data.items || data;
			const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value)
				|| String(value || '').toLowerCase().trim();
			const keyword = normalize(params.search);
			renderTable(users.filter(user =>
				[user.full_name, user.username, user.phone].some(value => normalize(value).includes(keyword))
				&& (!params.status || user.is_active === (params.status === 'active'))));
		});
	}

	const listPagination = window.QLPKPagination.createClient({ render: renderPage });
    function renderTable(users) { listPagination.setItems(users); }
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
        <td>${u.full_name || ''}</td>
        <td>${u.username || ''}</td>
        <td>${roleLabel(u.role)}</td>
        <td>${u.address || ''}</td>
        <td>${u.phone || ''}</td>
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

	// Filter form
	$('#filterForm').on('submit', function (e) {
		e.preventDefault();
		const params = {
			search: $('#searchInput').val(),
			role: $('#roleFilter').val(),
			status: $('#statusFilter').val()
		};
		fetchUsers(params);
	});
	$('#resetBtn').on('click', function () {
		$('#filterForm')[0].reset();
		fetchUsers();
	});

	// Open modal for add
	$('[data-bs-target="#userModal"]').on('click', function () {
		editingUserId = null;
		$('#userModalLabel').text('THÊM TÀI KHOẢN');
		$('#userForm')[0].reset();
		$('#isActiveSwitch').prop('checked', true);
		$('#canViewAllPatientsSwitch').prop('checked', false);
		$('#userFormError').addClass('d-none').text('');
		currentAvatarUrl = '';
		currentLicenseCertificateUrl = '';
		currentLicenseCertificateFileName = '';
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

	// Edit user
	$('#userTable').on('click', '.edit-btn', function () {
		const id = $(this).data('id');
		editingUserId = id;
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
				currentLicenseCertificateUrl = user.license_certificate_file || '';
				currentLicenseCertificateFileName = user.license_certificate_original_filename || '';
				if (currentLicenseCertificateUrl) {
					// Sử dụng tên file gốc nếu có, nếu không thì lấy từ URL
					const fileName = currentLicenseCertificateFileName || currentLicenseCertificateUrl.split('/').pop() || 'File chứng nhận';
					$('#licenseCertificateFileName').text(fileName).attr('href', currentLicenseCertificateUrl).show();
				} else {
					$('#licenseCertificateFileName').hide();
				}
				if (user.license_issue_date) {
					$("input[name='license_issue_date']").val(user.license_issue_date.split('T')[0]);
				} else {
					$("input[name='license_issue_date']").val('');
				}
				currentAvatarUrl = user.avatar || '';
				if ($('#avatarPreview').length) {
					$('#avatarPreview').attr('src', currentAvatarUrl || '/static/assets/images_doctor.jpg');
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

	// Delete user (custom modal)
	$('#userTable').on('click', '.delete-btn', function () {
		userIdToDelete = $(this).data('id');
		const modal = new bootstrap.Modal(document.getElementById('confirmDeleteModal'));
		modal.show();
	});
	$('#confirmDeleteBtn').on('click', function () {
		if (!userIdToDelete) return;
		$.ajax({
			url: `/users/${userIdToDelete}`,
			type: 'DELETE',
			success: function () {
				bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
				fetchUsers();
			},
			error: function () {
				bootstrap.Modal.getInstance(document.getElementById('confirmDeleteModal')).hide();
				showCustomToast('error', 'Không thể xóa tài khoản. Vui lòng thử lại.');
			}
		});
		userIdToDelete = null;
	});

	// Add/Edit user submit
	$('#userForm').on('submit', function (e) {
		e.preventDefault();
		const form = $(this);
		// Map role để đảm bảo đúng format backend enum
		const roleValue = form.find("[name='role']").val();
		const mappedRole = mapRoleToBackend(roleValue);

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
		if (currentAvatarUrl) data.avatar = currentAvatarUrl;
		const password = form.find("[name='password']").val();
		// Chỉ gửi password nếu có giá trị và không phải là các dấu sao (mật khẩu giả)
		if (password && password.trim() !== '' && !/^\*+$/.test(password)) {
			data.password = password;
		}
		$('#userFormError').addClass('d-none').text('');
		if (editingUserId) {
			$.ajax({
				url: `/users/${editingUserId}`,
				type: 'PUT',
				contentType: 'application/json',
				data: JSON.stringify(data),
				success: function () {
					bootstrap.Modal.getInstance(document.getElementById('userModal')).hide();
					fetchUsers();
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
					fetchUsers();
				},
				error: function () {
					$('#userFormError').removeClass('d-none').text('Không thể tạo tài khoản. Vui lòng kiểm tra lại.');
				}
			});
		}
	});

	// Avatar upload handler
	$(document).on('change', '#avatarFile', function () {
		const file = this.files && this.files[0];
		if (!file) return;
		// Preview
		const reader = new FileReader();
		reader.onload = function (e) { $('#avatarPreview').attr('src', e.target.result); };
		reader.readAsDataURL(file);

		// Upload
		if (!editingUserId) {
			showCustomToast('warning', 'Hãy lưu tài khoản trước khi upload avatar');
			return;
		}
		const formData = new FormData();
		formData.append('file', file);
		$.ajax({
			url: `/users/${editingUserId}/avatar`,
			method: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function (res) {
				currentAvatarUrl = res.avatar;
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
		if (!editingUserId) {
			showCustomToast('warning', 'Hãy lưu tài khoản trước khi upload file chứng nhận');
			$(this).val('');
			return;
		}
		const formData = new FormData();
		formData.append('file', file);
		$.ajax({
			url: `/users/${editingUserId}/license-certificate`,
			method: 'POST',
			data: formData,
			processData: false,
			contentType: false,
			success: function (res) {
				currentLicenseCertificateUrl = res.license_certificate_file;
				// Sử dụng tên file gốc từ response
				currentLicenseCertificateFileName = res.license_certificate_original_filename || file.name;
				$('#licenseCertificateFileName').text(currentLicenseCertificateFileName).attr('href', currentLicenseCertificateUrl).show();
				showCustomToast('success', 'Tải file chứng nhận thành công');
			},
			error: function () {
				showCustomToast('error', 'Không thể tải chứng nhận lên. Vui lòng thử lại.');
				$('#licenseCertificateFile').val('');
			}
		});
	});

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

				$('#sidebarUserName').html(`${userRole.toUpperCase()}<br>${userName}`);
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
				fetchUsers();
			},
			debounceMs: 350,
		});
	}

	// Password field focus handler - xóa các dấu sao khi focus để người dùng nhập mật khẩu mới
	$(document).on('focus', '#passwordInput', function () {
		if ($(this).val() === '********') {
			$(this).val('');
		}
	});

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
	registerRealtimeHooks();
	loadCurrentUserInfo(); // Load thông tin user trước
	fetchUsers();
}); 
