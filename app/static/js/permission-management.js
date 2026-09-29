// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

(function () {
function installPermissionPageFns1(ctx) {
	// Load danh sách user
	function fetchUsers(callback) {
	  $.get('/users/', function (data) {
	    ctx.users = data.items || data; // tuỳ API trả về
	    ctx.renderUserList();
	    if (callback) callback();
	  });
	}

	// Load danh sách nhóm quyền
	function fetchGroups(callback) {
	  $.get('/groups/', function (data) {
	    ctx.groups = data;
	    ctx.renderGroupList();
	    if (callback) callback();
	  });
	}

	// The GET contract is an array of user-group assignments, not group_ids.
	function fetchUserGroups(userId) {
	  const revision = ++ctx.permissionRevision;
	  ctx.permissionsReady = false;
	  ctx.selectedGroupIds = [];
	  $('#savePermissionBtn').prop('disabled', true);
	  ctx.renderGroupList();
	  $.get(`/user-groups/${userId}`, function (data) {
	    if (revision !== ctx.permissionRevision || String(ctx.selectedUserId) !== String(userId)) return;
	    if (!Array.isArray(data)) {
	      showCustomToast('error', 'Dữ liệu nhóm quyền không hợp lệ');
	      return;
	    }
	    ctx.selectedGroupIds = data.map(g => String(g.group_id));
	    ctx.permissionsReady = true;
	    $('#savePermissionBtn').prop('disabled', false);
	    ctx.renderGroupList();
	  }).fail(function () {
	    if (revision !== ctx.permissionRevision) return;
	    showCustomToast('error', 'Không tải được quyền của người dùng. Vui lòng chọn lại.');
	  });
	}

	function bindUserClick() {
	  $('#userTree .user-item').off('click').on('click', function () {
	    ctx.selectedUserId = $(this).attr('data-user-id');
	    $('#userTree .user-item').removeClass('active');
	    $(this).addClass('active');
	    fetchUserGroups(ctx.selectedUserId);
	  });
	}

	Object.assign(ctx, { fetchUsers, fetchGroups, fetchUserGroups, bindUserClick });
}

function installPermissionPageFns2(ctx) {
	// Sửa lại renderUserList để thêm class user-item cho từng user
	function renderUserList() {
	  const userTree = $('#userTree');
	  userTree.empty();
	  const keyword = normalizeSearchText(ctx.userFilter);
	  const filteredUsers = ctx.users.filter(u => [u.full_name, u.username].some(value => normalizeSearchText(value).includes(keyword)));
	  if (filteredUsers.length === 0) {
	    userTree.append('<div class="text-muted">Không có người dùng</div>');
	    return;
	  }
	  
	  // Map tất cả role có trong hệ thống
	  const roleMap = {
	    'admin': 'Quản trị viên',
	    'doctor': 'Bác sĩ', 
	    'PSYCHOLOGIST': 'Tâm lý gia',
	    'staff': 'Nhân viên',
	    'cashier': 'Thu ngân'
	  };
	  
	  const grouped = {};
	  filteredUsers.forEach(u => {
	    const role = u.role || 'other';
	    if (!grouped[role]) grouped[role] = [];
	    grouped[role].push(u);
	  });
	  
	  // Hiển thị tất cả role có user
	  Object.keys(grouped).forEach(role => {
	    const roleDisplay = roleMap[role] || role;
	    userTree.append(`<div class="fw-bold mt-2 mb-1 permission-tree-heading">${roleDisplay}</div>`);
	    grouped[role].forEach(u => {
	      userTree.append($('<div class="user-item mb-1 px-2 py-1 rounded"></div>')
	        .attr('data-user-id', u.id)
	        .toggleClass('active', String(u.id) === String(ctx.selectedUserId))
	        .text(u.full_name || u.username));
	    });
	  });
	  ctx.bindUserClick();
	}

	// Render danh sách nhóm quyền vào #groupTree
	function renderGroupList() {
	  const groupTree = $('#groupTree');
	  groupTree.empty();
	  let filteredGroups = ctx.groups;
	  if (ctx.groupFilter.trim() !== '') {
	    const kw = normalizeSearchText(ctx.groupFilter);
	    filteredGroups = ctx.groups.filter(g => normalizeSearchText(g.name || g.desc).includes(kw) || normalizeSearchText(g.code).includes(kw));
	  }
	  if (filteredGroups.length === 0) {
	    groupTree.append('<div class="text-muted">Không có nhóm quyền</div>');
	    return;
	  }
	  groupTree.append('<div class="fw-bold mt-2 mb-1 permission-tree-heading">Quyền</div>');
	  filteredGroups.forEach(g => {
	    const checked = ctx.selectedGroupIds.includes(g.id + '') ? 'checked' : '';
	    groupTree.append(`<div class="form-check group-checkbox mb-2">
	      <input class="form-check-input group-checkbox-input" type="checkbox" value="${g.id}" id="group_${g.id}" ${checked} ${ctx.permissionsReady ? '' : 'disabled'}>
	      <label class="form-check-label" for="group_${g.id}">${g.name || g.desc || g.code} (${g.code})</label>
	    </div>`);
	  });
	}

	Object.assign(ctx, { renderUserList, renderGroupList });
}

function installPermissionPageFns3(ctx) {
	function reloadPermissionData() {
	  ctx.fetchUsers(function () {
	    if (ctx.selectedUserId && !ctx.users.some(u => String(u.id) === String(ctx.selectedUserId))) {
	      ctx.selectedUserId = null;
	      ctx.selectedGroupIds = [];
	      ctx.permissionsReady = false;
	      ++ctx.permissionRevision;
	      $('#savePermissionBtn').prop('disabled', true);
	    }
	    ctx.fetchGroups(function () {
	      if (!ctx.selectedUserId) {
	        ctx.renderGroupList();
	        return;
	      }
	      ctx.fetchUserGroups(ctx.selectedUserId);
	    });
	  });
	}

	function registerRealtimeHooks() {
	  if (!window.QLPKRealtimePageHooks) return;
	  window.QLPKRealtimePageHooks.register({
	    types: ['catalog.changed'],
	    filter: function(event) {
	      const entity = event && event.payload ? event.payload.entity : '';
	      return ['user', 'group', 'user_group'].includes(entity);
	    },
	    handler: reloadPermissionData,
	    debounceMs: 350,
	  });
	}

	Object.assign(ctx, { registerRealtimeHooks });
}

$(function () {
  const ctx = {};
  installPermissionPageFns1(ctx);
  installPermissionPageFns2(ctx);
  installPermissionPageFns3(ctx);

  ctx.users = [];
  ctx.groups = [];
  ctx.selectedUserId = null;
  ctx.selectedGroupIds = [];
  ctx.userFilter = '';
  ctx.permissionRevision = 0;
  ctx.permissionsReady = false;
  ctx.groupFilter = '';

  // Khi tick checkbox, cập nhật selectedGroupIds
  $(document).on('change', '.group-checkbox-input', function() {
    if (!ctx.permissionsReady) return;
    const gid = $(this).val();
    if ($(this).is(':checked')) {
      if (!ctx.selectedGroupIds.includes(gid)) ctx.selectedGroupIds.push(gid);
    } else {
      ctx.selectedGroupIds = ctx.selectedGroupIds.filter(x => x !== gid);
    }
  });

  // Khi nhấn Lưu, gửi API gán nhóm quyền cho user
  $('#savePermissionBtn').off('click').on('click', function() {
    if (!ctx.selectedUserId || !ctx.permissionsReady) {
      showCustomToast('warning', 'Vui lòng chọn người dùng!');
      return;
    }
    $.ajax({
      url: `/user-groups/${ctx.selectedUserId}`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ group_ids: ctx.selectedGroupIds }),
      success: function() {
        showCustomToast('success', 'Lưu phân quyền thành công!');
      },
      error: function() {
        showCustomToast('error', 'Lưu phân quyền thất bại!');
      }
    });
  });

  // Đăng xuất
  $('#logoutBtn').on('click', function () {
    window.QLPKAppHeader?.logout();
  });

  $('#userSearchInput').on('input', function () {
    ctx.userFilter = $(this).val();
    ctx.renderUserList();
  });

  // Bắt sự kiện tìm kiếm nhóm quyền
  $('#groupSearchInput').on('input', function() {
    ctx.groupFilter = $(this).val();
    ctx.renderGroupList();
  });

  // Khởi tạo
  $('#savePermissionBtn').prop('disabled', true);
  ctx.registerRealtimeHooks();
  ctx.fetchUsers(function () {
    ctx.fetchGroups();
  });
});
})();
