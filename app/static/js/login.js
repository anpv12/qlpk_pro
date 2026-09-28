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

  function showLoginError(error, submitBtn) {
    let message = error.status === 401
      ? 'Tên đăng nhập hoặc mật khẩu không đúng.'
      : 'Không thể đăng nhập. Vui lòng thử lại.';
    if (error.status === 429) {
      const seconds = Number(error.retryAfter ?? error.getResponseHeader?.('Retry-After'));
      message = Number.isSafeInteger(seconds) && seconds > 0 && seconds <= 3600
        ? `Đăng nhập quá nhiều lần. Vui lòng thử lại sau ${seconds} giây.`
        : 'Đăng nhập quá nhiều lần. Vui lòng chờ một chút rồi thử lại.';
    }
    if (error.code === 'session.lock_unavailable') message = 'Trình duyệt chưa hỗ trợ đăng nhập an toàn. Vui lòng dùng trình duyệt mới qua HTTPS hoặc localhost.';
    if (error.code === 'session.changed') message = 'Phiên đã thay đổi ở cửa sổ khác. Vui lòng đăng nhập lại.';
    $('#loginError').prop('hidden', false).text(message);
    setLoginPending(submitBtn, false);
  }

  async function loginWithCookie(session, username, password, button) {
    try {
      const result = await session.actions.login(username, password);
      const current = session.owner.snapshot();
      if (current.status !== 'authenticated' || current.revision !== result.revision) {
        throw Object.assign(new Error('Session changed'), { code: 'session.changed' });
      }
      for (const key of ['qlpk_token', 'token', 'qlpk_user', 'qlpk_permissions']) localStorage.removeItem(key);
      for (const key of ['qlpk_token', 'token']) window.sessionStorage?.removeItem(key);
      window.location.href = loginLandingPath(current.session.user);
    } catch (error) {
      showLoginError(error, button);
    }
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
    const submitBtn = $(this).find('button[type="submit"]');
    if (submitBtn.prop('disabled')) return;
    
    const username = $(this).find('[name="username"]').val();
    const password = $(this).find('[name="password"]').val();
    
    $('#loginError').prop('hidden', true).text('');
    
    setLoginPending(submitBtn, true);

    const session = window.QLPKApiTransport?.session;
    if (session) return loginWithCookie(session, username, password, submitBtn);
    
    $.ajax({
      url: '/auth/login',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ username, password }),
      success: function(res) {
        for (const key of ['qlpk_token', 'token']) window.sessionStorage?.removeItem(key);
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
        showLoginError(xhr, submitBtn);
      }
    });
  });
}); 
