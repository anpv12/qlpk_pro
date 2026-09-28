from app.utils.account_access import account_permissions, is_account_admin


ALL_PERMISSIONS = [
    "dashboard", "lichhen", "qlkham-letan", "qlkham-bs", "qlkham-tamly", "qlkham-cls",
    "hoadon", "chi-tieu", "thongke-thuoc", "ql-kho-thuoc", "ql-taikhoan", "ql-thuoc", "ql-phanquyen", "ql-nhomquyen",
    "ql-danhmuc-dichvu", "ql-danhmuc-thuoc", "ql-dichvu", "ql-goi-dichvu",
    "ql-mau-khaosat", "ql-danhmuc-icd", "ql-tu-viettat", "ql-ngayle",
    "ql-tuong-tac-thuoc", "ql-hoat-chat", "ql-di-nguyen", "ql-tailieu",
    "ca-nhan", "ca-nhan-phimtat"
]


def session_user_payload(user):
    permissions = list(ALL_PERMISSIONS) if is_account_admin(user) else sorted(account_permissions(user))
    return {
        'id': user.id, 'username': user.username,
        'full_name': getattr(user, 'full_name', None), 'email': getattr(user, 'email', None),
        'role': getattr(user.role, 'value', user.role), 'permissions': permissions,
    }
