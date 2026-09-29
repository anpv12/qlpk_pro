// Custom Toast function
function showCustomToast(type, message) {
	return window.QLPKUserFeedback?.show(type, message);
}

(function () {
function installGroupPageFns1(ctx) {
	// Fetch group list from API
	function fetchGroups(callback) {
		$.get('/groups/', function (data) {
			ctx.groupList = data;
			if (callback) callback();
			renderTable();
		});
	}

	function renderTable() {
        const normalize = value => window.QLPKSearchNormalization?.normalizeSearchText(value)
            || String(value || '').toLowerCase().trim();
        const keyword = normalize($('#searchInput').val());
        ctx.listPagination.setItems(ctx.groupList.filter(group =>
            [group.code, group.name, group.desc].some(value => normalize(value).includes(keyword))));
    }

	function renderPage(pageData) {
		const tbody = $('#groupTable tbody');
		tbody.empty();
		pageData.forEach((g) => {
			tbody.append(`
        <tr>
          <td><input type="checkbox" class="row-check"></td>
          <td>${g.code}</td>
          <td>${g.name}</td>
          <td>${renderPermBadges(g.permissions)}</td>
          <td>
            <button data-qlpk-button="view" data-qlpk-button-variant="soft" class="action-btn view-btn" data-id="${g.id}" title="Xem"><i class="bi bi-eye"></i></button>
            <button data-qlpk-button="edit" data-qlpk-button-variant="soft" class="action-btn edit-btn" data-id="${g.id}" title="Sửa"><i class="bi bi-pencil-square"></i></button>
            <button data-qlpk-button="danger" data-qlpk-button-variant="soft" class="action-btn delete-btn" data-id="${g.id}" title="Xoá"><i class="bi bi-trash"></i></button>
          </td>
        </tr>
      `);
		});

	}

	function renderPermBadges(perms) {
		let html = '';
		ctx.PERMISSIONS.forEach(p => {
			const hasParent = perms.includes(p.id);
			const selectedChildren = (p.children || []).filter(c => perms.includes(c.id));
			if (hasParent || selectedChildren.length) {
				html += `<div class="gm-perm-badge-wrap">`;
				// Badge cha
				html += `<span class="badge badge-role ${p.color}"><i class="${p.icon}"></i> ${p.label}</span>`;
				// Badge con
				selectedChildren.forEach(c => {
					html += `<span class="badge badge-child">${c.label}</span>`;
				});
				html += `</div> `;
			}
		});
		return html;
	}

	Object.assign(ctx, { fetchGroups, renderTable, renderPage });
}

function installGroupPageFns2(ctx) {
	// Tree quyền (checkbox cha/con, expand/collapse)
	function renderPermTree(container, checked = [], readonly = false) {
		container.empty();
		ctx.PERMISSIONS.forEach(p => {
			const hasChildren = p.children && p.children.length;
			const checkedParent = checked.includes(p.id) ? 'checked' : '';
			const disabled = readonly ? 'disabled' : '';
			const collapseId = 'collapse_' + p.id;
			container.append(`
        <div class="form-check tree-group mb-1">
          <input class="form-check-input perm-parent" type="checkbox" value="${p.id}" id="perm_${p.id}" ${checkedParent} ${disabled}>
          <label class="form-check-label" for="perm_${p.id}">${p.label}</label>
          ${hasChildren ? `<span class="collapse-toggle" data-bs-toggle="collapse" data-bs-target="#${collapseId}"><i class="bi bi-chevron-down"></i></span>` : ''}
        </div>
      `);
			if (hasChildren) {
				container.append(`<div class="collapse show tree-children mb-2" id="${collapseId}"></div>`);
				const childDiv = container.find(`#${collapseId}`);
				p.children.forEach(c => {
					const checkedChild = checked.includes(c.id) ? 'checked' : '';
					childDiv.append(`
            <div class="form-check ms-2">
              <input class="form-check-input perm-child" type="checkbox" value="${c.id}" id="perm_${c.id}" ${checkedChild} ${disabled}>
              <label class="form-check-label" for="perm_${c.id}">${c.label}</label>
            </div>
          `);
				});
			}
		});
	}

	function registerRealtimeHooks() {
		if (!window.QLPKRealtimePageHooks) return;
		window.QLPKRealtimePageHooks.register({
			types: ['catalog.changed'],
			filter: function (event) {
				const entity = event && event.payload ? event.payload.entity : '';
				return ['group', 'user_group'].includes(entity);
			},
			handler: function () {
				ctx.fetchGroups();
			},
			debounceMs: 350,
		});
	}

	Object.assign(ctx, { renderPermTree, registerRealtimeHooks });
}

function runGroupPageSetup1(closureCtx) {
	closureCtx.ctx = {};
	installGroupPageFns1(closureCtx.ctx);
	installGroupPageFns2(closureCtx.ctx);
	// Danh sách màn hình thực tế từ hệ thống
	closureCtx.ctx.PERMISSIONS = [
		{
			id: 'dashboard', label: 'Trang chủ', icon: 'bi bi-house-door', color: 'badge-dashboard', children: []
		},
		{
			id: 'lichhen', label: 'Lịch hẹn', icon: 'bi bi-calendar-event', color: 'badge-lichhen', children: []
		},
		{
			id: 'qlkham', label: 'Quản lý khám', icon: 'bi bi-clipboard2-pulse', color: 'badge-qlkham', children: [
				{ id: 'qlkham-letan', label: 'Lễ tân', icon: 'bi bi-person-check', color: '' },
				{ id: 'qlkham-bs', label: 'Bác sĩ', icon: 'bi bi-heart-pulse-fill', color: '' },
				{ id: 'qlkham-tamly', label: 'Tâm lý gia', icon: 'bi bi-people', color: '' },
				{ id: 'qlkham-cls', label: 'Chỉ định CLS', icon: 'bi bi-journal-medical', color: '' },
			]
		},
		{
			id: 'hoadon', label: 'Hóa đơn', icon: 'bi bi-credit-card', color: 'badge-hoadon', children: []
		},
		{
			id: 'chi-tieu', label: 'Thu chi', icon: 'bi bi-wallet2', color: 'badge-chi-tieu', children: []
		},
		{
			id: 'thongke-thuoc', label: 'Thống kê thuốc', icon: 'bi bi-bar-chart-line', color: 'badge-thongke-thuoc', children: []
		},
		{
			id: 'ql-tailieu', label: 'Quản lý tài liệu', icon: 'bi bi-folder-symlink', color: 'badge-quanly', children: []
		},
		{
			id: 'ql-kho-thuoc', label: 'Kho thuốc', icon: 'bi bi-box-seam', color: 'badge-kho-thuoc', children: [
				{ id: 'ql-thuoc', label: 'Tủ thuốc', icon: 'bi bi-capsule', color: '' },
				{ id: 'ql-hoat-chat', label: 'Hoạt chất', icon: 'bi bi-tags', color: '' },
				{ id: 'ql-di-nguyen', label: 'Dị nguyên', icon: 'bi bi-shield-exclamation', color: '' },
				{ id: 'ql-tuong-tac-thuoc', label: 'Tương tác thuốc', icon: 'bi bi-exclamation-triangle', color: '' }
			]
		},
		{
			id: 'quanly', label: 'Quản lý', icon: 'bi bi-gear', color: 'badge-quanly', children: [
				{ id: 'ql-taikhoan', label: 'Tài khoản', icon: 'bi bi-person-badge', color: '' },
				{ id: 'ql-phanquyen', label: 'Phân quyền', icon: 'bi bi-shield-lock', color: '' },
				{ id: 'ql-nhomquyen', label: 'Nhóm phân quyền', icon: 'bi bi-people', color: '' },
				{ id: 'ql-tu-viettat', label: 'Từ viết tắt', icon: 'bi bi-type', color: '' },
				{ id: 'ql-danhmuc-dichvu', label: 'Danh mục dịch vụ', icon: 'bi bi-list-check', color: '' },
				{ id: 'ql-dichvu', label: 'Dịch vụ', icon: 'bi bi-briefcase', color: '' },
				{ id: 'ql-goi-dichvu', label: 'Gói dịch vụ', icon: 'bi bi-gift', color: '' },
				{ id: 'ql-mau-khaosat', label: 'Mẫu khảo sát', icon: 'bi bi-clipboard2-check', color: '' },
				{ id: 'ql-danhmuc-icd', label: 'Danh mục ICD', icon: 'bi bi-hospital', color: '' },
				{ id: 'ql-ngayle', label: 'Quản lý ngày lễ', icon: 'bi bi-calendar-x', color: '' },
			]
		},
		{
			id: 'ca-nhan', label: 'Cá nhân', icon: 'bi bi-person-circle', color: 'badge-ca-nhan', children: [
				{ id: 'ca-nhan-phimtat', label: 'Phím tắt menu', icon: 'bi bi-keyboard', color: '' }
			]
		}
	];
	closureCtx.ctx.groupList = [];
	closureCtx.editingGroupId = null;
	closureCtx.deletingGroupId = null;
	// Render table nhóm quyền
	closureCtx.ctx.listPagination = window.QLPKPagination.createClient({ render: closureCtx.ctx.renderPage });
	$('#groupFilterForm').on('submit', function (event) {
        event.preventDefault();
        closureCtx.ctx.renderTable();
    });
}

function runGroupPageSetup2(closureCtx) {
	$('#resetBtn').on('click', function () {
        $('#searchInput').val('');
        closureCtx.ctx.renderTable();
    });
	// Checkbox cha/con logic
	$(document).on('change', '.perm-parent', function () {
		const checked = $(this).is(':checked');
		$(this).closest('.tree-group').next('.tree-children').find('.perm-child').prop('checked', checked);
	});
	$(document).on('change', '.perm-child', function () {
		const group = $(this).closest('.tree-children');
		const all = group.find('.perm-child').length;
		const checked = group.find('.perm-child:checked').length;
		const parent = group.prevAll('.tree-group').first().find('.perm-parent');
		if (checked === all) parent.prop('checked', true);
		else parent.prop('checked', false);
	});
	// Thêm mới nhóm quyền
	$('#addGroupBtn').on('click', function () {
		closureCtx.editingGroupId = null;
		$('#groupModalLabel').text('Thêm mới nhóm quyền');
		$('#groupForm')[0].reset();
		closureCtx.ctx.renderPermTree($('#permTreeEdit'), [], false);
		$('#groupFormError').addClass('d-none').text('');
		$('#groupModal').modal('show');
	});
	// Sửa nhóm quyền
	$('#groupTable').on('click', '.edit-btn', function () {
		const id = $(this).data('id');
		const group = closureCtx.ctx.groupList.find(g => g.id === id);
		if (!group) return;
		closureCtx.editingGroupId = id;
		$('#groupModalLabel').text('Cập nhật nhóm quyền');
		$('#groupForm')[0].reset();
		$('#groupForm [name="code"]').val(group.code);
		$('#groupForm [name="name"]').val(group.name);
		$('#groupForm [name="desc"]').val(group.desc);
		closureCtx.ctx.renderPermTree($('#permTreeEdit'), group.permissions, false);
		$('#groupFormError').addClass('d-none').text('');
		$('#groupModal').modal('show');
	});
	// Xem chi tiết nhóm quyền
	$('#groupTable').on('click', '.view-btn', function () {
		const id = $(this).data('id');
		const group = closureCtx.ctx.groupList.find(g => g.id === id);
		if (!group) return;
		$('#viewGroupModal [name="code"]').val(group.code);
		$('#viewGroupModal [name="name"]').val(group.name);
		$('#viewGroupModal [name="desc"]').val(group.desc);
		closureCtx.ctx.renderPermTree($('#permTreeView'), group.permissions, true);
		$('#viewGroupModal').modal('show');
	});
	// Xoá nhóm quyền
	$('#groupTable').on('click', '.delete-btn', function () {
		closureCtx.deletingGroupId = $(this).data('id');
		$('#confirmDeleteGroupModal').modal('show');
	});
	$('#confirmDeleteGroupBtn').on('click', function () {
		if (!closureCtx.deletingGroupId) return;
		$.ajax({
			url: `/groups/${closureCtx.deletingGroupId}`,
			type: 'DELETE',
			success: function () {
				$('#confirmDeleteGroupModal').modal('hide');
				closureCtx.ctx.fetchGroups();
				closureCtx.deletingGroupId = null;
			},
			error: function () {
				showCustomToast('error', 'Không thể xóa nhóm quyền. Vui lòng thử lại.');
			}
		});
	});
}

function runGroupPageSetup3(closureCtx) {
	// Lưu nhóm quyền (thêm/sửa)
	$('#groupForm').on('submit', function (e) {
		e.preventDefault();
		const code = $(this).find('[name="code"]').val().trim();
		const name = $(this).find('[name="name"]').val().trim();
		const desc = $(this).find('[name="desc"]').val().trim();
		const perms = $('#permTreeEdit input[type=checkbox]:checked').map(function () { return $(this).val(); }).get();
		if (!code || !name || perms.length === 0) {
			$('#groupFormError').removeClass('d-none').text('Vui lòng nhập đầy đủ thông tin bắt buộc và chọn ít nhất 1 quyền.');
			return;
		}
		if (closureCtx.editingGroupId) {
			// Update
			$.ajax({
				url: `/groups/${closureCtx.editingGroupId}`,
				type: 'PUT',
				contentType: 'application/json',
				data: JSON.stringify({ code, name, desc, permissions: perms }),
				success: function () {
					$('#groupModal').modal('hide');
					closureCtx.ctx.fetchGroups();
				},
				error: function () {
					$('#groupFormError').removeClass('d-none').text('Không thể cập nhật nhóm quyền. Vui lòng kiểm tra lại.');
				}
			});
		} else {
			// Add
			$.ajax({
				url: '/groups/',
				type: 'POST',
				contentType: 'application/json',
				data: JSON.stringify({ code, name, desc, permissions: perms }),
				success: function () {
					$('#groupModal').modal('hide');
					closureCtx.ctx.fetchGroups();
				},
				error: function () {
					$('#groupFormError').removeClass('d-none').text('Không thể tạo nhóm quyền. Vui lòng kiểm tra lại.');
				}
			});
		}
	});
	// Đăng xuất
	$('#logoutBtn').on('click', function () {
		window.QLPKAppHeader?.logout();
	});
	// Khởi tạo
	closureCtx.ctx.registerRealtimeHooks();
	closureCtx.ctx.fetchGroups();
}

$(function () {
	const closureCtx = {};
	runGroupPageSetup1(closureCtx);
	runGroupPageSetup2(closureCtx);
	runGroupPageSetup3(closureCtx);
});
})(); 
