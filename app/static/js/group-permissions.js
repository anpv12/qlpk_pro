// Screen permissions a group can grant, in menu order. Parents with children grant the whole section;
// ids are the backend permission codes stored on groups.
export const PERMISSIONS = [
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
