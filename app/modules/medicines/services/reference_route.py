"""DAV route suggestions, separate from the authoritative upstream route."""
import re

from app.utils.search_normalization import normalize_search_text

ROUTE_RULE_VERSION = '2026-09-14.2'


_FORMS_BY_ROUTE = {
    'Uống': ('Dung dịch uống', 'Hỗn dịch uống', 'Nhũ tương uống', 'Siro',
             'Bột pha dung dịch uống', 'Thuốc bột pha dung dịch uống',
             'Bột pha hỗn dịch uống', 'Thuốc bột pha hỗn dịch uống',
             'Cốm pha hỗn dịch uống'),
    'Tiêm': ('Dung dịch tiêm', 'Hỗn dịch tiêm', 'Nhũ tương tiêm',
             'Bột pha tiêm', 'Thuốc bột pha tiêm', 'Bột đông khô pha tiêm',
             'Bột pha dung dịch tiêm', 'Bột đông khô pha dung dịch tiêm'),
    'Tiêm truyền': ('Dung dịch tiêm truyền',),
    'Truyền': ('Dung dịch truyền',),
    'Nhỏ mắt': ('Dung dịch nhỏ mắt', 'Hỗn dịch nhỏ mắt', 'Thuốc nhỏ mắt'),
    'Nhỏ tai': ('Dung dịch nhỏ tai', 'Thuốc nhỏ tai'),
    'Nhỏ mũi': ('Dung dịch nhỏ mũi', 'Thuốc nhỏ mũi'),
    'Xịt mũi': ('Dung dịch xịt mũi', 'Hỗn dịch xịt mũi', 'Thuốc xịt mũi'),
    'Bôi ngoài da': ('Kem bôi da', 'Thuốc kem bôi da', 'Thuốc mỡ bôi da',
                    'Gel bôi da', 'Dung dịch bôi da'),
    'Đặt âm đạo': ('Viên đặt âm đạo', 'Viên nén đặt âm đạo',
                  'Viên nang mềm đặt âm đạo'),
    'Đặt trực tràng': ('Viên đặt trực tràng', 'Thuốc đạn đặt trực tràng'),
    'Ngậm dưới lưỡi': ('Viên ngậm dưới lưỡi', 'Viên nén ngậm dưới lưỡi'),
}
_ROUTES_BY_FORM = {
    normalize_search_text(form): route
    for route, forms in _FORMS_BY_ROUTE.items() for form in forms
}

# Match the complete description. Extra routes, negations, or unrecognised
# qualifiers must not be discarded just because one familiar phrase occurs.
_LIQUID = r'(?:dung dich|hon dich|huyen dich|nhu tuong|nhu dich)'
_POWDER = r'(?:bot|com|bot com|hat com|hat bot)(?: kho| dong kho| vo khuan| sui bot)?'
_PREPARATION = rf'(?:{_POWDER}(?: va dung moi)? (?:de )?pha (?:thanh )?(?:{_LIQUID} )?)'
_CONCENTRATE = rf'{_LIQUID} (?:dam dac|co dac) (?:dung )?(?:de )?pha (?:{_LIQUID} |dich )?'
_INJECTION = rf'(?:{_LIQUID} (?:thuoc )?(?:de )?|{_PREPARATION}|{_CONCENTRATE}|bot (?:dong kho )?pha |thuoc )'

_FORM_PATTERNS_BY_ROUTE = {
    'Uống': (
        rf'(?:thuoc )?(?:{_LIQUID} (?:thuoc )?|{_PREPARATION}|{_POWDER} (?:pha |de |dung de )?|gel |nuoc |dich |giot )(?:de )?uong(?: (?:dang )?(?:nho giot|giot|dam dac))?',
        r'(?:si ?ro|xi ?ro|syro|syrup)(?: thuoc| kho| uong(?: (?:dang )?(?:nho giot|giot))| \(nho giot\))?',
        r'vien (?:nen )?nhai(?: khong bao| duoc| dang gel mem)?',
        r'vien nen khong bao nhai duoc',
        r'vien nen (?:khong bao )?(?:phan tan|ra|tan) (?:tai |trong )(?:khoang )?mieng',
        r'vien (?:nen |nen dai )?(?:bao (?:phim |duong )?)?tan (?:trong|o) ruot',
        r'vien nang(?: cung| mem)? (?:bao )?tan (?:trong|o) ruot',
        r'vien (?:nang(?: cung)?|nen bao phim) chua (?:cac )?(?:vi hat|hat|pellets?|hat pellet|vi nang) (?:bao )?tan (?:trong|o) ruot',
        r'vien nen (?:bao phim )?khang (?:dich da day|acid da day|dich vi)',
    ),
    'Tiêm': (
        rf'(?:thuoc )?{_INJECTION}tiem(?: (?:vo khuan|vo trung|dau|dong kho|nuoc|bot|hon dich|dang dich treo|dam dac|giai phong keo dai))?',
        r'(?:thuoc )?bot(?: thuoc| tiem)?(?: dong kho| vo khuan| vo trung| say kho chan khong)? (?:de )?pha (?:dung dich )?tiem',
        r'solution for injection',
    ),
    'Tiêm truyền': (
        rf'(?:thuoc )?{_INJECTION}tiem truyen',
        r'(?:thuoc )?dich tiem truyen',
    ),
    'Truyền': (
        rf'(?:thuoc )?{_INJECTION}truyen',
        r'dich truyen',
    ),
    'Tiêm tĩnh mạch': (rf'(?:thuoc )?{_INJECTION}tiem (?:duong )?tinh mach(?: cham)?',),
    'Truyền tĩnh mạch': (
        rf'(?:thuoc )?{_INJECTION}(?:tiem )?truyen tinh mach(?: sau khi pha loang)?',
        r'dich truyen tinh mach',
    ),
    'Tiêm bắp': (rf'(?:thuoc )?{_INJECTION}tiem bap(?: cham)?',),
    'Tiêm dưới da': (rf'(?:thuoc )?{_INJECTION}tiem duoi da',),
    'Tiêm trong da': (rf'(?:thuoc )?{_INJECTION}tiem trong da',),
    'Nhỏ mắt': (rf'(?:thuoc |{_LIQUID} (?:thuoc |vo khuan |vo trung )?|gel |{_PREPARATION})nho mat(?: vo khuan)?',),
    'Tra mắt': (r'(?:thuoc )?(?:mo|dung dich thuoc|gel) tra mat',),
    'Nhỏ tai': (rf'(?:thuoc |{_LIQUID} (?:thuoc |vo khuan )?|{_PREPARATION})nho tai',),
    'Nhỏ mũi': (rf'(?:thuoc |{_LIQUID} (?:thuoc )?)nho mui',),
    'Xịt mũi': (rf'(?:thuoc |{_LIQUID} (?:thuoc )?|khi dung )xit mui(?: (?:co |dang )?phan lieu)?',),
    'Bôi ngoài da': (
        rf'(?:thuoc )?(?:kem|cream|mo|gel|cao|{_LIQUID}|hon nhu tuong) (?:boi|dung) (?:ngoai )?da',
        r'(?:thuoc )?(?:kem|mo|gel) boi ngoai',
        r'dau xoa(?: bop| ngoai da)?',
        r'(?:con(?: thuoc)?|kem|hon dich con) xoa bop',
    ),
    'Dùng ngoài': (rf'(?:thuoc )?(?:{_LIQUID}|kem|gel|mo|bot|nuoc|con thuoc|dau) dung ngoai',),
    'Đặt âm đạo': (r'(?:thuoc dat|vien(?: nen(?: khong bao)?| nang mem| dan| trung| thuoc)? dat) (?:am dao|phu khoa)',),
    'Đặt trực tràng': (r'(?:thuoc dat|vien(?: dan)? dat) (?:truc trang|hau mon)',),
    'Thụt trực tràng': (rf'(?:{_LIQUID}|gel) (?:thut|bom) (?:truc trang|hau mon)',),
    'Ngậm dưới lưỡi': (r'vien(?: nen| dong kho)? (?:ngam|dat) duoi luoi',),
    'Súc miệng': (r'(?:dung dich(?: nuoc)?|nuoc|thuoc) suc mieng',),
    'Hít': (
        rf'(?:{_LIQUID}|bot|chat long|duoc chat long nguyen chat) (?:dung )?(?:de )?hit(?: (?:phan lieu|qua duong mieng)(?: \(dang phun suong\))?)?',
        rf'(?:{_LIQUID} (?:dung cho )?)?khi dung(?: (?:dung de hit|hit qua duong mieng))?',
        r'(?:thuoc|ong) hit(?: (?:dinh lieu|phan lieu|dang phun suong))?',
        r'(?:thuoc )?bot hit(?: phan lieu| chua trong nang cung)?',
        r'vien nang(?: cung)? chua bot (?:dung )?de hit',
        r'thuoc phun mu(?: he hon dich)? dung de hit(?: qua duong mieng)?',
        r'(?:dung dich|thuoc|chat long(?: de bay hoi)?) (?:dung )?gay me duong ho hap',
    ),
    'Qua da': (r'(?:mieng dan(?: hap thu| phong thich| giai phong| tham| tri lieu)?|he tri lieu) qua da',),
}
_ROUTE_PATTERNS = tuple(
    (route, re.compile(pattern))
    for route, patterns in _FORM_PATTERNS_BY_ROUTE.items() for pattern in patterns
)


def suggest_reference_route(route, dosage_form):
    """Suggest only one route supported by the entire dosage-form description."""
    if str(route or '').strip():
        return None
    form = re.sub(r'\s+', ' ', normalize_search_text(dosage_form)).rstrip(' .')
    exact = _ROUTES_BY_FORM.get(form)
    if exact:
        return exact
    matches = {candidate for candidate, pattern in _ROUTE_PATTERNS if pattern.fullmatch(form)}
    return matches.pop() if len(matches) == 1 else None


def route_suggestion_fields(route, dosage_form):
    """Values owned by DAV sync/backfill, never written into upstream route."""
    suggested = suggest_reference_route(route, dosage_form)
    return {
        'suggested_route': suggested,
        'suggested_route_rule_version': ROUTE_RULE_VERSION if suggested else None,
    }
