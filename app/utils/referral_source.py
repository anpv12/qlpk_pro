REFERRAL_SOURCE_CONFIG = [
    {'key': 'facebook', 'label': 'Facebook', 'color': '#1877F2'},
    {'key': 'website', 'label': 'Website', 'color': '#22C55E'},
    {'key': 'referral', 'label': 'Người quen giới thiệu', 'color': '#F59E0B'},
    {'key': 'medpro', 'label': 'Medpro', 'color': '#EF4444'},
    {'key': 'walk_in', 'label': 'Khách vãng lai', 'color': '#06B6D4'},
    {'key': 'other', 'label': 'Khác', 'color': '#8B5CF6'},
]

REFERRAL_SOURCE_BY_KEY = {item['key']: item for item in REFERRAL_SOURCE_CONFIG}
REFERRAL_SOURCE_TAG_BY_LABEL = {item['label']: item['key'] for item in REFERRAL_SOURCE_CONFIG}


def build_referral_source_fields(value):
    source = str(value or '').strip()
    if not source:
        return {
            'referral_source': None,
            'referral_source_tag': 'not_set',
            'referral_source_detail': None,
        }

    tag = REFERRAL_SOURCE_TAG_BY_LABEL.get(source, 'other')
    return {
        'referral_source': source,
        'referral_source_tag': tag,
        'referral_source_detail': source,
    }


def apply_referral_source(patient, value):
    fields = build_referral_source_fields(value)
    patient.referral_source = fields['referral_source']
    patient.referral_source_tag = fields['referral_source_tag']
    patient.referral_source_detail = fields['referral_source_detail']
    return fields


def get_referral_source_key(patient):
    source_tag = (getattr(patient, 'referral_source_tag', None) or '').strip()
    if source_tag == 'not_set' or source_tag not in REFERRAL_SOURCE_BY_KEY:
        return None
    return source_tag
