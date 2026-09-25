(function (window) {
	'use strict';

	window.QLPKNavigationConfig = {
		items: [
			{
				label: 'Trang chủ',
				icon: 'bi bi-house-door-fill',
				href: 'index.html',
				permission: 'dashboard',
			},
			{
				label: 'Lịch hẹn',
				icon: 'bi bi-calendar2-week',
				href: 'appointment-management.html',
				permission: 'lichhen',
			},
			{
				label: 'Quản lý khám',
				icon: 'bi bi-clipboard2-pulse',
				id: 'submenu-quanly-kham',
				children: [
					{
						label: 'Lễ tân',
						icon: 'bi bi-person-check-fill',
						href: 'receptionist-new.html',
						permission: 'qlkham-letan',
					},
					{
						label: 'Bác sĩ',
						icon: 'bi bi-heart-pulse-fill',
						href: 'doctor-examination.html',
						permission: 'qlkham-bs',
					},
					{
						label: 'Tâm lý gia',
						icon: 'bi bi-chat-heart-fill',
						href: 'psychologist-examination.html',
						permission: 'qlkham-tamly',
					},
					{
						label: 'Chỉ định CLS',
						icon: 'bi bi-clipboard2-pulse',
						href: 'order-management.html',
						permission: 'qlkham-cls',
					},
				],
			},
			{
				label: 'Hóa đơn',
				icon: 'bi bi-receipt-cutoff',
				href: 'payment-waiting.html',
				permission: 'hoadon',
			},
			{
				label: 'Thu chi',
				icon: 'bi bi-wallet2',
				href: '/chi-tieu',
				permission: 'chi-tieu',
				activeMatches: ['/chi-tieu', '/chi-tieu.html'],
			},
			{
				label: 'Thống kê thuốc',
				icon: 'bi bi-graph-up-arrow',
				href: 'medicine-statistics',
				permission: 'thongke-thuoc',
				activeMatches: ['/medicine-statistics', '/medicine-statistics.html'],
			},
			{
				label: 'Quản lý tài liệu',
				icon: 'bi bi-folder2-open',
				href: 'document-management.html',
				permission: 'ql-tailieu',
			},
			{
				label: 'Kho thuốc',
				icon: 'bi bi-box-seam',
				id: 'submenu-kho-thuoc',
				children: [
					{
						label: 'Tủ thuốc',
						icon: 'bi bi-capsule-pill',
						href: 'medicine-management.html',
						permission: 'ql-kho-thuoc',
						permissionAlt: 'ql-thuoc',
					},
					{
						label: 'Danh mục thuốc DAV',
						icon: 'bi bi-database-check',
						href: 'medicine-reference-catalog.html',
						permission: 'ql-kho-thuoc',
						permissionAlt: 'ql-thuoc',
					},
					{
						label: 'Hoạt chất',
						icon: 'bi bi-tags-fill',
						href: 'active-ingredient.html',
						permission: 'ql-hoat-chat',
					},
					{
						label: 'Dị nguyên',
						icon: 'bi bi-shield-exclamation',
						href: 'allergen.html',
						permission: 'ql-di-nguyen',
					},
					{
						label: 'Tương tác thuốc',
						icon: 'bi bi-exclamation-triangle-fill',
						href: 'drug-interaction.html',
						permission: 'ql-tuong-tac-thuoc',
					},
				],
			},
			{
				label: 'Quản lý',
				icon: 'bi bi-gear',
				id: 'submenu-quanly',
				children: [
					{
						label: 'Tài khoản',
						icon: 'bi bi-person-vcard',
						href: 'user-management.html',
						permission: 'ql-taikhoan',
					},
					{
						label: 'Phân quyền',
						icon: 'bi bi-shield-lock-fill',
						href: 'permission-management.html',
						permission: 'ql-phanquyen',
					},
					{
						label: 'Từ viết tắt',
						icon: 'bi bi-type',
						href: 'text-expansion-management.html',
						permission: 'ql-tu-viettat',
					},
					{
						label: 'Nhóm phân quyền',
						icon: 'bi bi-diagram-3',
						href: 'group-management.html',
						permission: 'ql-nhomquyen',
					},
					{
						label: 'Danh mục dịch vụ',
						icon: 'bi bi-ui-checks-grid',
						href: 'service-category.html',
						permission: 'ql-danhmuc-dichvu',
					},
					{
						label: 'Dịch vụ',
						icon: 'bi bi-briefcase-fill',
						href: 'service-management.html',
						permission: 'ql-dichvu',
					},
					{
						label: 'Mẫu khảo sát',
						icon: 'bi bi-clipboard2-check',
						href: 'survey-template-management.html',
						permission: 'ql-mau-khaosat',
					},
					{
						label: 'Danh mục ICD',
						icon: 'bi bi-hospital',
						href: 'icd-management.html',
						permission: 'ql-danhmuc-icd',
					},
					{
						label: 'Quản lý ngày lễ',
						icon: 'bi bi-calendar2-x',
						href: 'holiday-management.html',
						permission: 'ql-ngayle',
					},
				],
			},
			{
				label: 'Cá nhân',
				icon: 'bi bi-person-circle',
				id: 'submenu-ca-nhan',
				children: [
					{
						label: 'Lịch bận của tôi',
						icon: 'bi bi-calendar-x',
						href: 'doctor-busy-schedule.html',
						permission: 'ca-nhan',
					},
					{
						label: 'Phím tắt menu',
						icon: 'bi bi-keyboard',
						href: 'shortcut-settings.html',
						permission: 'ca-nhan-phimtat',
					},
				],
			},
		],
	};
})(window);
