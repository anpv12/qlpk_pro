"""Conservative DAV suggestions; stock conversion still needs user confirmation."""
import re
import unicodedata


def normalized(value):
    text = unicodedata.normalize('NFD', str(value or '').strip().lower())
    return re.sub(r'\s+', ' ', ''.join(c for c in text if not unicodedata.combining(c)).replace('đ', 'd'))


def clinic_defaults(reference):
    country = normalized(reference.manufacturer_country)
    unknown = {'', '-', '--', 'n/a', 'unknown', 'null', 'none', 'khong ro',
               'chua ro', 'chua xac dinh', 'khong xac dinh', 'chua cap nhat'}
    imported = None if country in unknown else country not in {'viet nam', 'vietnam', 'vn', 'vnm'}
    route = (reference.route or '').strip()
    form = normalized(reference.dosage_form)
    unit = 'viên' if re.match(r'^(vien\b|tablets?\b|capsules?\b)', form) else None
    if re.match(r'^mieng dan\b', form):
        unit = 'miếng'
    result = {'administration_method': route if len(route) <= 50 else None,
              'suggested_administration_method': None if route else getattr(reference, 'suggested_route', None),
              'is_imported': imported, 'unit': unit,
              'packaging_unit': None, 'units_per_box': None}
    # A known container does not require a known conversion. Ratios below
    # still require a whole, unambiguous description; never parse a strength.
    packaging = normalized(reference.packaging).rstrip(' .;')
    units = {'vien': 'viên', 'mieng': 'miếng'}
    containers = {'hop': 'hộp', 'vi': 'vỉ', 'lo': 'lọ', 'chai': 'chai',
                  'ong': 'ống', 'tuyp': 'tuýp', 'goi': 'gói'}
    outer = re.match(r'^(hop|vi|lo|chai|ong|tuyp|goi)\b', packaging)
    if outer and not re.search(r'\bhoac\b|;', packaging):
        result['packaging_unit'] = containers[outer.group(1)]
    liquid = form in {'dung dich tiem', 'hon dich tiem', 'dung dich tiem truyen',
                      'dung dich truyen', 'dung dich uong', 'hon dich uong', 'siro'}
    volume = re.fullmatch(r'(?:hop\s+\d+\s+)?(?:lo|chai|ong)\s+(?:(?:\d+\s*)?[x×*]\s*)?'
                          r'\d+(?:[.,]\d+)?(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*ml', packaging)
    if liquid and volume:
        result['unit'] = 'ml'
        # The inventory count is integer-only; never round fractional/ranged volumes.
        fixed_volume = re.fullmatch(r'(?:lo|chai|ong)\s+(\d+)\s*ml', packaging)
        if fixed_volume and 0 < int(fixed_volume.group(1)) <= 1000000:
            result['units_per_box'] = int(fixed_volume.group(1))
        return result
    direct = re.fullmatch(r'(hop|vi|lo|chai)\s+(\d+)\s+(vien|mieng)', packaging)
    nested = re.fullmatch(r'(hop)\s+(\d+)\s+(?:vi|lo|chai)\s*(?:[x×*]\s*)?(\d+)\s+(vien|mieng)', packaging)
    if direct:
        outer, count, inner = direct.groups()
        count = int(count)
    elif nested:
        outer, first, second, inner = nested.groups()
        count = int(first) * int(second)
    else:
        return result
    if unit and units[inner] == unit and 0 < count <= 1000000:
        result.update(packaging_unit=containers[outer], units_per_box=count)
    return result
