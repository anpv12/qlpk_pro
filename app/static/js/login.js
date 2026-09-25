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

  function setLoginPending(button, pending) {
    button.prop('disabled', pending).attr('aria-busy', String(pending));
    button.find('.login-submit-label').text(pending ? 'Đang đăng nhập...' : 'Đăng nhập');
    button.find('.login-icon').toggleClass('bi-arrow-repeat', pending).toggleClass('bi-arrow-right', !pending);
  }

  $('#togglePassword').on('click', function() {
    const input = $('#passwordInput');
    const icon = $(this).find('i');
    if (input.attr('type') === 'password') {
      input.attr('type', 'text');
      icon.removeClass('bi-eye-slash').addClass('bi-eye');
      $(this).attr('aria-pressed', 'true');
    } else {
      input.attr('type', 'password');
      icon.removeClass('bi-eye').addClass('bi-eye-slash');
      $(this).attr('aria-pressed', 'false');
    }
  });

  $('#loginForm').on('submit', function(e) {
    e.preventDefault();
    
    const username = $(this).find('[name="username"]').val();
    const password = $(this).find('[name="password"]').val();
    
    $('#loginError').prop('hidden', true).text('');
    
    const submitBtn = $(this).find('button[type="submit"]');
    setLoginPending(submitBtn, true);
    
    $.ajax({
      url: '/auth/login',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username, password }),
      success: function(res) {
        localStorage.setItem('qlpk_token', res.access_token);
        localStorage.setItem('qlpk_permissions', JSON.stringify(res.user.permissions || []));
		localStorage.setItem('qlpk_user', JSON.stringify(res.user || {}));
        
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
        const errorMessage = xhr.status === 401
          ? 'Tên đăng nhập hoặc mật khẩu không đúng.'
          : 'Không thể đăng nhập. Vui lòng thử lại.';
        $('#loginError').prop('hidden', false).text(errorMessage);
        
        setLoginPending(submitBtn, false);
      }
    });
  });
}); 
