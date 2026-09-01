// Permission Check Utility
$(function() {
  // Kiểm tra quyền và ẩn/hiện menu
  function checkPermissions() {
    let permissions = [];
    try {
      permissions = JSON.parse(localStorage.getItem('qlpk_permissions') || '[]');
    } catch (e) {
      permissions = [];
    }
    
    // Lấy thông tin user để kiểm tra role
    let userRole = null;
    try {
      const user = JSON.parse(localStorage.getItem('qlpk_user') || '{}');
      userRole = user.role ? user.role.toLowerCase() : null;
    } catch (e) {
      // Ignore
    }
    
    // Nếu là admin, hiển thị tất cả menu và return sớm (admin có tất cả permissions trong ALL_PERMISSIONS)
    if (userRole === 'admin') {
      // Đảm bảo tất cả menu hiển thị
      $('a.nav-link[data-permission]').each(function() {
        const $item = $(this);
        const $parentLi = $item.closest('li.nav-item');
        if ($parentLi.length > 0) {
          $parentLi.show();
        } else {
          $item.show();
        }
      });
      // Đảm bảo tất cả parent menu hiển thị
      $('a.nav-link[data-bs-toggle="collapse"]').each(function() {
        $(this).closest('li.nav-item').show();
      });
      return;
    }
    
    // Nếu không phải admin và không có permissions, ẩn tất cả menu có data-permission
    if (!permissions || permissions.length === 0) {
      // Ẩn tất cả menu items có data-permission
      $('a.nav-link[data-permission]').each(function() {
        const $item = $(this);
        const $parentLi = $item.closest('li.nav-item');
        if ($parentLi.length > 0) {
          $parentLi.hide();
        } else {
          $item.hide();
        }
      });
      // Ẩn tất cả parent menu có submenu (vì không có submenu items nào hiển thị)
      $('a.nav-link[data-bs-toggle="collapse"]').each(function() {
        $(this).closest('li.nav-item').hide();
      });
      return;
    }
    
    // Bước 1: Ẩn các menu items không có permission
    $('a.nav-link[data-permission]').each(function() {
      const $item = $(this);
      const permission = $item.attr('data-permission');
      const permissionAlt = $item.attr('data-permission-alt');
      
      // Kiểm tra permission chính hoặc permission alt
      const hasPermission = permissions.includes(permission) || 
                           (permissionAlt && permissions.includes(permissionAlt));
      
      // Kiểm tra xem item này có nằm trong submenu (collapse) không
      const $submenu = $item.closest('.submenu, .collapse');
      const isSubmenuItem = $submenu.length > 0;
      
      if (!hasPermission) {
        // Nếu là submenu item, chỉ ẩn item đó (không ẩn parent li.nav-item)
        if (isSubmenuItem) {
          $item.hide();
        } else {
          // Nếu là menu item chính (không có submenu), ẩn cả li.nav-item
          const $parentLi = $item.closest('li.nav-item');
          if ($parentLi.length > 0) {
            $parentLi.hide();
          } else {
            $item.hide();
          }
        }
      } else {
        // Đảm bảo menu item hiển thị nếu có permission
        if (isSubmenuItem) {
          $item.show();
        } else {
          const $parentLi = $item.closest('li.nav-item');
          if ($parentLi.length > 0) {
            $parentLi.show();
          } else {
            $item.show();
          }
        }
      }
    });
    
    // Bước 2: Xử lý parent menu dựa trên permissions, KHÔNG dựa vào :visible
    // Vì submenu có class "collapse" sẽ có display:none khi chưa mở, làm :visible không chính xác
    
    // Helper function: Kiểm tra xem có items nào trong submenu có permission không
    function hasAnySubmenuPermission(submenuId, permissionList) {
      const $submenu = $('#' + submenuId);
      if ($submenu.length === 0) return false;
      
      let hasPermission = false;
      $submenu.find('a.nav-link[data-permission]').each(function() {
        const $item = $(this);
        const permission = $item.attr('data-permission');
        const permissionAlt = $item.attr('data-permission-alt');
        
        // Kiểm tra xem permission này có trong danh sách không
        const inList = permissionList.includes(permission) || 
                      (permissionAlt && permissionList.includes(permissionAlt));
        
        // Kiểm tra xem user có permission này không
        const hasUserPermission = permissions.includes(permission) || 
                                  (permissionAlt && permissions.includes(permissionAlt));
        
        if (inList && hasUserPermission) {
          hasPermission = true;
          return false; // break loop
        }
      });
      
      return hasPermission;
    }
    
    // Xử lý menu "Quản lý khám"
    const qlkhamPermissions = ['qlkham-letan', 'qlkham-bs', 'qlkham-tamly', 'qlkham-cls'];
    const hasAnyQlkhamPermission = hasAnySubmenuPermission('submenu-quanly-kham', qlkhamPermissions);
    const $qlkhamParent = $('a.nav-link[href="#submenu-quanly-kham"]').closest('li.nav-item');
    if (hasAnyQlkhamPermission) {
      $qlkhamParent.show();
    } else {
      $qlkhamParent.hide();
      $('#submenu-quanly-kham').hide();
    }
    
    // Xử lý menu "Kho thuốc"
    const khoThuocPermissions = ['ql-kho-thuoc', 'ql-thuoc', 'ql-hoat-chat', 'ql-di-nguyen', 'ql-tuong-tac-thuoc'];
    const hasKhoThuocPermission = hasAnySubmenuPermission('submenu-kho-thuoc', khoThuocPermissions);
    const $khoThuocParent = $('a.nav-link[href="#submenu-kho-thuoc"]').closest('li.nav-item');
    if (hasKhoThuocPermission) {
      $khoThuocParent.show();
    } else {
      $khoThuocParent.hide();
      $('#submenu-kho-thuoc').hide();
    }
    
    // Xử lý menu "Quản lý"
    const qlPermissions = [
      'ql-taikhoan', 'ql-phanquyen', 'ql-nhomquyen', 'ql-tu-viettat',
      'ql-danhmuc-dichvu', 'ql-danhmuc-thuoc', 'ql-dichvu', 'ql-goi-dichvu',
      'ql-mau-khaosat', 'ql-danhmuc-icd', 'ql-ngayle'
    ];
    const hasAnyQlPermission = hasAnySubmenuPermission('submenu-quanly', qlPermissions);
    const $qlParent = $('a.nav-link[href="#submenu-quanly"]').closest('li.nav-item');
    if (hasAnyQlPermission) {
      $qlParent.show();
    } else {
      $qlParent.hide();
      $('#submenu-quanly').hide();
    }
    
    // Xử lý menu "Cá nhân"
    const caNhanPermissions = ['ca-nhan', 'ca-nhan-phimtat'];
    const hasCaNhanPermission = hasAnySubmenuPermission('submenu-ca-nhan', caNhanPermissions);
    const $caNhanParent = $('a.nav-link[href="#submenu-ca-nhan"]').closest('li.nav-item');
    if (hasCaNhanPermission) {
      $caNhanParent.show();
    } else {
      $caNhanParent.hide();
      $('#submenu-ca-nhan').hide();
    }
    
    // Cập nhật thông tin user
    try {
      const user = JSON.parse(localStorage.getItem('qlpk_user') || '{}');
      if (user && user.full_name) {
        $('.sidebar-user .name').html(user.full_name.toUpperCase() + (user.username ? '<br>' + user.username : ''));
      }
      if (user && user.role) {
        $('.sidebar-user .role').text(user.role.charAt(0).toUpperCase() + user.role.slice(1));
      }
      if (user && user.avatar_url) {
        $('.sidebar-user .avatar').attr('src', user.avatar_url);
      }
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Gọi kiểm tra quyền khi DOM ready
  checkPermissions();
  
  // Gọi lại khi sidebar được load động (nếu dùng sidebar-dry-loader)
  $(document).on('sidebarLoaded', function() {
    setTimeout(checkPermissions, 100);
  });
  
  // Logout handler
  $(document).on('click', '#logoutBtn', function() {
    try {
      localStorage.removeItem('qlpk_token');
      localStorage.removeItem('qlpk_user');
      localStorage.removeItem('qlpk_permissions');
	  localStorage.removeItem('qlpk_workspace_tabs');
	  localStorage.removeItem('qlpk_workspace_active_tab');
    } catch (e) {
      // Ignore errors
    }
    window.location.href = '/login.html';
  });
  
  // Expose function globally để có thể gọi từ nơi khác
  window.checkPermissions = checkPermissions;
});
