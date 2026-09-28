from app.utils.account_access import account_permissions, is_account_admin


PAGE_PERMISSIONS = {
    'dashboard': {'dashboard'},
    'appointment-management': {'lichhen'},
    'receptionist-new': {'qlkham-letan'},
    'doctor-examination': {'qlkham-bs'},
    'psychologist-examination': {'qlkham-tamly'},
    'order-management': {'qlkham-cls'},
    'payment-waiting': {'hoadon'},
    'medicine-management': {'ql-kho-thuoc', 'ql-thuoc'},
    'medicine-reference-catalog': {'ql-kho-thuoc', 'ql-thuoc'},
    'medicine-statistics': {'thongke-thuoc'},
    'document-management': {'ql-tailieu'},
    'active-ingredient': {'ql-hoat-chat'},
    'allergen': {'ql-di-nguyen'},
    'drug-interaction': {'ql-tuong-tac-thuoc'},
    'user-management': {'ql-taikhoan'},
    'group-management': {'ql-nhomquyen'},
    'permission-management': {'ql-phanquyen'},
    'service-management': {'ql-dichvu'},
    'service-category': {'ql-danhmuc-dichvu'},
    'package-management': {'ql-goi-dichvu'},
    'icd-management': {'ql-danhmuc-icd'},
    'survey-template-management': {'ql-mau-khaosat'},
    'survey-template-create': {'ql-mau-khaosat'},
    'text-expansion-management': {'ql-tu-viettat'},
    'holiday-management': {'ql-ngayle'},
    'shortcut-settings': {'ca-nhan-phimtat'},
    'doctor-busy-schedule': {'ca-nhan'},
    'chi-tieu': {'chi-tieu'},
}

WORKFLOW_PAGES = {
    'operations': {'dashboard', 'appointment-management', 'receptionist-new',
                   'doctor-examination', 'psychologist-examination', 'order-management',
                   'payment-waiting', 'doctor-busy-schedule'},
    'inventory': {'medicine-management', 'medicine-reference-catalog', 'medicine-statistics',
                  'document-management', 'active-ingredient', 'allergen', 'drug-interaction'},
    'admin': {'user-management', 'group-management', 'permission-management',
              'service-management', 'service-category', 'package-management', 'icd-management',
              'survey-template-management', 'survey-template-create', 'text-expansion-management',
              'holiday-management'},
    'personal': {'shortcut-settings'},
    'finance': {'chi-tieu'},
}


def allowed_subscription_rooms(user):
    permissions = set() if is_account_admin(user) else account_permissions(user)
    pages = {page for page, required in PAGE_PERMISSIONS.items()
             if is_account_admin(user) or permissions.intersection(required)}
    rooms = {f'page:{page}' for page in pages}
    rooms.update(f'workflow:{workflow}' for workflow, members in WORKFLOW_PAGES.items()
                 if pages.intersection(members))
    return rooms
