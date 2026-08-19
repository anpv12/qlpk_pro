// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

$(function () {
  let users = [];
  let groups = [];
  let selectedUserId = null;
  let selectedGroupIds = [];
  let userGroups = [];
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

  // Load nhóm quyền của user
  function fetchUserGroups(userId, callback) {
    $.get(`/user-groups/${userId}`, function (data) {
      userGroups = data.map(g => g.group_id);
      renderGroupList();
      if (callback) callback();
    });
  }

  // Sau khi render user list, gán sự kiện click để bôi xanh user được chọn
  function bindUserClick() {
    $('#userTree .user-item').off('click').on('click', function() {
      $('#userTree .user-item').removeClass('active');
      $(this).addClass('active');
      const displayText = $(this).text().trim();
      // Tìm user bằng cả full_name và username
      selectedUserId = users.find(u => (u.full_name || u.username) === displayText)?.id;
      if (selectedUserId) {
        // Load nhóm quyền đã gán cho user này
        $.get(`/user-groups/${selectedUserId}`, function(data) {
          selectedGroupIds = data.group_ids || [];
          renderGroupList();
        });
      }
    });
  }

  // Sửa lại renderUserList để thêm class user-item cho từng user
  function renderUserList() {
    const userTree = $('#userTree');
    userTree.empty();
    if (users.length === 0) {
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
    users.forEach(u => {
      let role = u.role || 'other';
      if (!grouped[role]) grouped[role] = [];
      grouped[role].push(u);
    });
    
    // Hiển thị tất cả role có user
    Object.keys(grouped).forEach(role => {
      const roleDisplay = roleMap[role] || role;
      userTree.append(`<div class="fw-bold mt-2 mb-1 permission-tree-heading">${roleDisplay}</div>`);
      grouped[role].forEach(u => {
        userTree.append(`<div class="user-item mb-1 px-2 py-1 rounded">${u.full_name || u.username}</div>`);
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
      const kw = groupFilter.trim().toLowerCase();
      filteredGroups = groups.filter(g => (g.name || g.desc || '').toLowerCase().includes(kw) || (g.code || '').toLowerCase().includes(kw));
    }
    if (filteredGroups.length === 0) {
      groupTree.append('<div class="text-muted">Không có nhóm quyền</div>');
      return;
    }
    groupTree.append('<div class="fw-bold mt-2 mb-1 permission-tree-heading">Quyền</div>');
    filteredGroups.forEach(g => {
      const checked = selectedGroupIds.includes(g.id + '') ? 'checked' : '';
      groupTree.append(`<div class="form-check group-checkbox mb-2">
        <input class="form-check-input group-checkbox-input" type="checkbox" value="${g.id}" id="group_${g.id}" ${checked}>
        <label class="form-check-label" for="group_${g.id}">${g.name || g.desc || g.code} (${g.code})</label>
      </div>`);
    });
  }

  // Khi tick checkbox, cập nhật selectedGroupIds
  $(document).on('change', '.group-checkbox-input', function() {
    const gid = $(this).val();
    if ($(this).is(':checked')) {
      if (!selectedGroupIds.includes(gid)) selectedGroupIds.push(gid);
    } else {
      selectedGroupIds = selectedGroupIds.filter(x => x !== gid);
    }
  });

  // Khi nhấn Lưu, gửi API gán nhóm quyền cho user
  $('#savePermissionBtn').off('click').on('click', function() {
    if (!selectedUserId) {
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
    localStorage.removeItem('qlpk_token');
    window.location.href = '/login.html';
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
      }
      fetchGroups(function () {
        if (!selectedUserId) {
          renderGroupList();
          return;
        }
        $.get(`/user-groups/${selectedUserId}`, function(data) {
          selectedGroupIds = (Array.isArray(data) ? data : []).map(g => String(g.group_id));
          renderGroupList();
        });
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
  registerRealtimeHooks();
  fetchUsers(function () {
    fetchGroups();
  });
});
