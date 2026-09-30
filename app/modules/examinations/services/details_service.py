"""Services for examination detail sections and modal data."""

import json

from app.models.examination import Examination
from app.models.examination_detail import ExaminationDetail

class ExaminationNotFound(Exception):
    """Raised when an examination does not exist."""

class NoDataProvided(Exception):
    """Raised when the request body is empty."""

class MissingRequiredFields(Exception):
    """Raised when a detail save payload is incomplete."""

class AppointmentIdRequired(Exception):
    """Raised when an appointment-scoped payload has no appointment id."""


DOCTOR_DETAIL_FIELDS = {
    'bac_si_kham_form_kham': {'main_reason'},
    'bac_si_kham_tien_su': {'medical_history'},
    'bac_si_kham_kham_tong_quat': {
        'general_examination',
        'bieu_hien_chung',
        'circulation',
        'digestive',
        'renal_urogenital',
        'musculoskeletal',
        'ent',
        'endocrine_nutrition_others',
        'neurological',
    },
    'bac_si_kham_kham_tam_than': {
        'orientation',
        'emotions',
        'perception',
        'thought',
        'behavior',
        'memory',
        'intelligence',
        'attention',
    },
}


def _filter_fields_for_section(section, fields):
    allowed_fields = DOCTOR_DETAIL_FIELDS.get(section)
    if allowed_fields is None:
        return dict(fields)
    return {
        field_name: field_value
        for field_name, field_value in fields.items()
        if field_name in allowed_fields
    }


def _is_allowed_detail(section, field_name):
    allowed_fields = DOCTOR_DETAIL_FIELDS.get(section)
    return allowed_fields is None or field_name in allowed_fields

def get_examination_by_id(db, examination_id):
    examination = db.query(Examination).filter(Examination.id == examination_id).first()
    if not examination:
        raise ExaminationNotFound()
    return examination

def get_examination_by_appointment_id(db, appointment_id):
    examination = db.query(Examination).filter(Examination.appointment_id == appointment_id).first()
    if not examination:
        raise ExaminationNotFound()
    return examination

def get_examination_details_result(db, examination_id, section=None):
    get_examination_by_id(db, examination_id)
    query = db.query(ExaminationDetail).filter(ExaminationDetail.examination_id == examination_id)

    if section:
        query = query.filter(ExaminationDetail.section == section)

    result = {}
    for detail in query.all():
        if not _is_allowed_detail(detail.section, detail.field_name):
            continue
        if detail.section not in result:
            result[detail.section] = {}
        result[detail.section][detail.field_name] = detail.field_value
    return result

def replace_examination_details(db, examination_id, data):
    get_examination_by_id(db, examination_id)
    if not data:
        raise NoDataProvided()

    db.query(ExaminationDetail).filter(ExaminationDetail.examination_id == examination_id).delete()

    for section, fields in data.items():
        if not isinstance(fields, dict):
            continue
        new_section = section
        for field_name, field_value in _filter_fields_for_section(section, fields).items():
            db.add(ExaminationDetail(
                examination_id=examination_id,
                section=new_section,
                field_name=field_name,
                field_value=serialize_field_value(field_value),
            ))

    db.commit()

def get_section_details_result(db, examination_id, section):
    get_examination_by_id(db, examination_id)
    new_section = section
    section_variants = [new_section]
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination_id,
        ExaminationDetail.section.in_(section_variants)
    ).all()

    return [
        {
            "field_name": detail.field_name,
            "field_value": detail.field_value,
        }
        for detail in details
        if _is_allowed_detail(detail.section, detail.field_name)
    ]

def save_section_details_result(db, examination_id, section, data):
    examination = get_examination_by_id(db, examination_id)
    if not data:
        raise NoDataProvided()

    new_section = section
    section_variants = [new_section]
    data = _filter_fields_for_section(new_section, data)
    if not data:
        raise NoDataProvided()
    added_count = 0

    for field_name, field_value in data.items():
        if field_name == "criteria_name":
            continue

        delete_detail_field(db, examination_id, section_variants, field_name)
        serialized_value = serialize_field_value(field_value)
        if serialized_value is not None:
            db.add(ExaminationDetail(
                examination_id=examination_id,
                section=new_section,
                field_name=field_name,
                field_value=serialized_value,
            ))
            added_count += 1

    db.commit()
    return {
        "examination_id": examination.id,
        "appointment_id": examination.appointment_id,
        "section": new_section,
        "saved_fields": added_count,
    }

def delete_examination_details_result(db, examination_id):
    get_examination_by_id(db, examination_id)
    db.query(ExaminationDetail).filter(ExaminationDetail.examination_id == examination_id).delete()
    db.commit()

def get_psychological_examination_result(db, examination_id):
    get_examination_by_id(db, examination_id)
    section_variants = ['tam_ly_gia_kham_kham_tam_ly']
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination_id,
        ExaminationDetail.section.in_(section_variants)
    ).all()
    return {detail.field_name: detail.field_value for detail in details}

def save_psychological_examination_result(db, examination_id, data):
    get_examination_by_id(db, examination_id)
    if not data:
        raise NoDataProvided()

    new_section = 'tam_ly_gia_kham_kham_tam_ly'
    section_variants = [new_section]

    db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination_id,
        ExaminationDetail.section.in_(section_variants)
    ).delete()

    form_data = data.get('data', {})
    for field_name, field_value in form_data.items():
        serialized_value = serialize_field_value(field_value)
        if serialized_value is not None:
            db.add(ExaminationDetail(
                examination_id=examination_id,
                section=new_section,
                field_name=field_name,
                field_value=serialized_value,
            ))

    db.commit()

def get_examination_id_payload_by_appointment(db, appointment_id):
    examination = get_examination_by_appointment_id(db, appointment_id)
    return {
        "examination_id": examination.id,
        "appointment_id": examination.appointment_id,
        "examination_code": examination.examination_code,
        "status": examination.status,
    }

def save_detail_by_appointment_result(db, data):
    if not data:
        raise NoDataProvided()

    appointment_id = data.get('appointment_id')
    section = data.get('section')
    field_name = data.get('field_name')
    field_value = data.get('field_value')

    if not all([appointment_id, section, field_name]):
        raise MissingRequiredFields()

    examination = get_examination_by_appointment_id(db, appointment_id)
    new_section = section
    section_variants = [new_section]

    if not _is_allowed_detail(new_section, field_name):
        raise NoDataProvided()

    delete_detail_field(db, examination.id, section_variants, field_name)
    serialized_value = serialize_field_value(field_value)
    if serialized_value is not None:
        db.add(ExaminationDetail(
            examination_id=examination.id,
            section=new_section,
            field_name=field_name,
            field_value=serialized_value,
        ))

    db.commit()
    return {
        "examination_id": examination.id,
        "appointment_id": examination.appointment_id,
        "section": new_section,
        "field_name": field_name,
    }

def save_modal_data_result(db, data):
    if not data:
        raise NoDataProvided()

    appointment_id = data.get('appointment_id')
    if not appointment_id:
        raise AppointmentIdRequired()

    examination = get_examination_by_appointment_id(db, appointment_id)

    # Preserve legacy behavior: main_reason is committed before section data is processed.
    if 'main_reason' in data:
        examination.main_reason = data['main_reason']
        db.commit()

    saved_count = 0
    for section, fields in data.get('sections', {}).items():
        if not isinstance(fields, dict):
            continue

        new_section = section
        section_variants = [new_section]
        fields = _filter_fields_for_section(new_section, fields)
        db.query(ExaminationDetail).filter(
            ExaminationDetail.examination_id == examination.id,
            ExaminationDetail.section.in_(section_variants)
        ).delete()

        for field_name, field_value in fields.items():
            serialized_value = serialize_non_empty_field_value(field_value)
            if serialized_value is None:
                continue
            db.add(ExaminationDetail(
                examination_id=examination.id,
                section=new_section,
                field_name=field_name,
                field_value=serialized_value,
            ))
            saved_count += 1

    db.commit()
    return {
        "message": "Examination modal data saved successfully",
        "saved_fields": saved_count,
        "examination_id": examination.id,
    }

def load_modal_data_result(db, appointment_id):
    examination = get_examination_by_appointment_id(db, appointment_id)
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination.id
    ).order_by(ExaminationDetail.id.desc()).all()

    sections_data = {}
    for detail in details:
        if not _is_allowed_detail(detail.section, detail.field_name):
            continue
        if detail.section not in sections_data:
            sections_data[detail.section] = {}
        if detail.field_name not in sections_data[detail.section]:
            sections_data[detail.section][detail.field_name] = detail.field_value

    return {
        "main_reason": examination.main_reason or "",
        "sections": sections_data,
        "examination_id": examination.id,
    }

def get_details_by_appointment_result(db, appointment_id):
    examination = get_examination_by_appointment_id(db, appointment_id)
    details = db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination.id
    ).all()
    return [
        {
            "section": detail.section,
            "field_name": detail.field_name,
            "field_value": detail.field_value,
        }
        for detail in details
        if _is_allowed_detail(detail.section, detail.field_name)
    ]

def delete_detail_field(db, examination_id, section_variants, field_name):
    return db.query(ExaminationDetail).filter(
        ExaminationDetail.examination_id == examination_id,
        ExaminationDetail.section.in_(section_variants),
        ExaminationDetail.field_name == field_name
    ).delete()

def serialize_field_value(field_value):
    if field_value is None:
        return None
    if isinstance(field_value, (dict, list)):
        return json.dumps(field_value, ensure_ascii=False)
    return str(field_value)

def serialize_non_empty_field_value(field_value):
    if field_value is None or not str(field_value).strip():
        return None
    return serialize_field_value(field_value)
