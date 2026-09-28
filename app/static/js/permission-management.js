// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

function normalizeSearchText(value) {
	return window.QLPKSearchNormalization?.normalizeSearchText(value)
		|| String(value || '').toLowerCase().trim();
}

$(function () {
  let users = [];
  let groups = [];
  let selectedUserId = null;
  let selectedGroupIds = [];
  let userFilter = '';
  let permissionRevision = 0;
  let permissionsReady = false;
  let groupFilter = '';

  // Load danh sách user
  function fetchUsers(callback) {
    $.get('/users/', function (data) {
      users = data.items || data; // tuỳ API trả về
      renderUserList();
      if (callback) callback();
    });
  }

  // Load danh sách nhóm quyền
  function fetchGroups(callback) {
    $.get('/groups/', function (data) {
      groups = data;
      renderGroupList();
      if (callback) callback();
    });
  }

  // The GET contract is an array of user-group assignments, not group_ids.
  function fetchUserGroups(userId) {
    const revision = ++permissionRevision;
    permissionsReady = false;
    selectedGroupIds = [];
    $('#savePermissionBtn').prop('disabled', true);
    renderGroupList();
    $.get(`/user-groups/${userId}`, function (data) {
      if (revision !== permissionRevision || String(selectedUserId) !== String(userId)) return;
      if (!Array.isArray(data)) {
        showCustomToast('error', 'Dữ liệu nhóm quyền không hợp lệ');
        return;
      }
      selectedGroupIds = data.map(g => String(g.group_id));
      permissionsReady = true;
      $('#savePermissionBtn').prop('disabled', false);
      renderGroupList();
    }).fail(function () {
      if (revision !== permissionRevision) return;
      showCustomToast('error', 'Không tải được quyền của người dùng. Vui lòng chọn lại.');
    });
  }

  function bindUserClick() {
    $('#userTree .user-item').off('click').on('click', function () {
      selectedUserId = $(this).attr('data-user-id');
      $('#userTree .user-item').removeClass('active');
      $(this).addClass('active');
      fetchUserGroups(selectedUserId);
    });
  }

  // Sửa lại renderUserList để thêm class user-item cho từng user
  function renderUserList() {
    const userTree = $('#userTree');
    userTree.empty();
    const keyword = normalizeSearchText(userFilter);
    const filteredUsers = users.filter(u => [u.full_name, u.username].some(value => normalizeSearchText(value).includes(keyword)));
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
    
    let grouped = {};
    filteredUsers.forEach(u => {
      let role = u.role || 'other';
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
          .toggleClass('active', String(u.id) === String(selectedUserId))
          .text(u.full_name || u.username));
      });
    });
    bindUserClick();
  }

  // Render danh sách nhóm quyền vào #groupTree
  function renderGroupList() {
    const groupTree = $('#groupTree');
    groupTree.empty();
    let filteredGroups = groups;
    if (groupFilter.trim() !== '') {
      const kw = normalizeSearchText(groupFilter);
      filteredGroups = groups.filter(g => normalizeSearchText(g.name || g.desc).includes(kw) || normalizeSearchText(g.code).includes(kw));
    }
    if (filteredGroups.length === 0) {
      groupTree.append('<div class="text-muted">Không có nhóm quyền</div>');
      return;
    }
    groupTree.append('<div class="fw-bold mt-2 mb-1 permission-tree-heading">Quyền</div>');
    filteredGroups.forEach(g => {
      const checked = selectedGroupIds.includes(g.id + '') ? 'checked' : '';
      groupTree.append(`<div class="form-check group-checkbox mb-2">
        <input class="form-check-input group-checkbox-input" type="checkbox" value="${g.id}" id="group_${g.id}" ${checked} ${permissionsReady ? '' : 'disabled'}>
        <label class="form-check-label" for="group_${g.id}">${g.name || g.desc || g.code} (${g.code})</label>
      </div>`);
    });
  }

  // Khi tick checkbox, cập nhật selectedGroupIds
  $(document).on('change', '.group-checkbox-input', function() {
    if (!permissionsReady) return;
    const gid = $(this).val();
    if ($(this).is(':checked')) {
      if (!selectedGroupIds.includes(gid)) selectedGroupIds.push(gid);
    } else {
      selectedGroupIds = selectedGroupIds.filter(x => x !== gid);
    }
  });

  // Khi nhấn Lưu, gửi API gán nhóm quyền cho user
  $('#savePermissionBtn').off('click').on('click', function() {
    if (!selectedUserId || !permissionsReady) {
      showCustomToast('warning', 'Vui lòng chọn người dùng!');
      return;
    }
    $.ajax({
      url: `/user-groups/${selectedUserId}`,
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ group_ids: selectedGroupIds }),
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
    userFilter = $(this).val();
    renderUserList();
  });

  // Bắt sự kiện tìm kiếm nhóm quyền
  $('#groupSearchInput').on('input', function() {
    groupFilter = $(this).val();
    renderGroupList();
  });

  function reloadPermissionData() {
    fetchUsers(function () {
      if (selectedUserId && !users.some(u => String(u.id) === String(selectedUserId))) {
        selectedUserId = null;
        selectedGroupIds = [];
        permissionsReady = false;
        ++permissionRevision;
        $('#savePermissionBtn').prop('disabled', true);
      }
      fetchGroups(function () {
        if (!selectedUserId) {
          renderGroupList();
          return;
        }
        fetchUserGroups(selectedUserId);
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

  // Khởi tạo
  $('#savePermissionBtn').prop('disabled', true);
  registerRealtimeHooks();
  fetchUsers(function () {
    fetchGroups();
  });
});
