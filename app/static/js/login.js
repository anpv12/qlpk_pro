$(function() {
	function normalizeRole(role) {
		return String(role || '').replace(/^UserRole\./, '').trim().toLowerCase();
	}

	function loginLandingPath(user) {
		const role = normalizeRole(user && user.role);
		const permissions = user && Array.isArray(user.permissions) ? user.permissions : [];
		const landingByRole = {
			doctor: { permission: 'qlkham-bs', href: '/doctor-examination.html' },
			psychologist: { permission: 'qlkham-tamly', href: '/psychologist-examination.html' },
			staff: { permission: 'qlkham-letan', href: '/receptionist-new.html' },
		};
		const landing = landingByRole[role];
		return landing && (permissions.includes('*') || permissions.includes(landing.permission))
			? landing.href
			: '/';
	}

	function completeLogin(user) {
		const nextUser = user || {};
		localStorage.setItem('qlpk_user', JSON.stringify(nextUser));
		if (Array.isArray(nextUser.permissions)) {
			localStorage.setItem('qlpk_permissions', JSON.stringify(nextUser.permissions));
		}
		window.location.href = loginLandingPath(nextUser);
	}

  // Ẩn/hiện mật khẩu
  $('#togglePassword').on('click', function() {
    const input = $('#passwordInput');
    const icon = $(this).find('i');
    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      icon.removeClass('bi-eye-slash').addClass('bi-eye');
    } else {
      input.attr('type', 'password');
      icon.removeClass('bi-eye').addClass('bi-eye-slash');
    }
  });

  // Đăng nhập
  $('#loginForm').on('submit', function(e) {
    e.preventDefault();
    
    const username = $(this).find('[name="username"]').val();
    const password = $(this).find('[name="password"]').val();
    
    // Ẩn thông báo lỗi cũ
    $('#loginError').addClass('d-none').text('');
    
    // Hiển thị loading state
    const submitBtn = $(this).find('button[type="submit"]');
    const originalHtml = submitBtn.html();
    submitBtn.prop('disabled', true).html('<i class="bi bi-arrow-repeat spin"></i> Đang đăng nhập...');
    
    $.ajax({
      url: '/auth/login',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username, password }),
      success: function(res) {
        // Lưu token và permissions vào localStorage
        localStorage.setItem('qlpk_token', res.access_token);
        localStorage.setItem('qlpk_permissions', JSON.stringify(res.user.permissions || []));
		localStorage.setItem('qlpk_user', JSON.stringify(res.user || {}));
        
        // Debug: Log để kiểm tra
        
        // Lấy thông tin user
        $.ajax({
          url: '/check/me',
          type: 'GET',
          headers: { 'Authorization': 'Bearer ' + res.access_token },
          success: function(user) {
			completeLogin(user);
          },
          error: function() {
			completeLogin(res.user);
          }
        });
      },
      error: function(xhr) {
        // Hiển thị lỗi đăng nhập
        const errorMessage = xhr.status === 401
          ? 'Tên đăng nhập hoặc mật khẩu không đúng.'
          : 'Không thể đăng nhập. Vui lòng thử lại.';
        $('#loginError').removeClass('d-none').text(errorMessage);
        
        // Reset button state
        submitBtn.prop('disabled', false).html(originalHtml);
      }
    });
  });
}); 
