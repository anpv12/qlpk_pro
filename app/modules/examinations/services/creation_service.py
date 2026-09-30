"""Creation service for the legacy POST /examinations endpoint."""

from datetime import datetime, timedelta
import random

from app.models.appointment import Appointment, AppointmentStatus, AppointmentType
from app.models.examination import Examination, ExaminationStatus, ExaminationType
from app.models.family_member import FamilyMember
from app.models.package import Package
from app.models.patient import Patient
from app.models.service import Service
from app.models.user import User
from app.modules.appointments.services.calendar_sync import enqueue_calendar_sync, schedule_calendar_sync_drain
from app.utils.medical_history_contract import normalize_physical_history
from app.utils.allergy_contract import normalize_allergy_entries
from app.utils.referral_source import apply_referral_source, build_referral_source_fields

class CreateExaminationValidationError(Exception):
    """Raised when the legacy create-examination payload should return HTTP 400."""

    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)

def create_examination_result(db, data, logger=None):
    normalize_create_examination_payload(data)
    validate_create_examination_payload(data)
    get_create_examination_doctor(db, data['doctor_id'])
    validate_create_examination_catalog(db, data)

    patient = upsert_create_examination_patient(db, data)
    appointment_datetime = datetime.strptime(
        f"{data['appointment_date']} {data['appointment_time']}",
        '%Y-%m-%d %H:%M'
    )

    ensure_no_duplicate_create_examination_appointment(db, patient, data, appointment_datetime)

    appointment = create_legacy_examination_appointment(db, patient, data, appointment_datetime)
    create_legacy_examination_row(db, patient, appointment, data, appointment_datetime)
    create_legacy_family_members(db, patient, data)

    enqueue_calendar_sync(db, appointment.id)
    db.commit()
    schedule_calendar_sync_drain([appointment.id])

    return {
        'message': 'Thêm lượt khám thành công',
        'appointment_id': appointment.id,
        'patient_id': patient.id,
    }

def validate_create_examination_payload(data):
    required_fields = [
        'appointment_date', 'appointment_time', 'doctor_id',
        'appointment_type', 'full_name',
        'gender', 'phone_number', 'date_of_birth', 'main_reason'
    ]

    for field in required_fields:
        if not data.get(field):
            raise CreateExaminationValidationError(f'Trường {field} là bắt buộc')

    if data['appointment_type'] == 'PACKAGE' and not data.get('package_id'):
        raise CreateExaminationValidationError('Vui lòng chọn gói khám')
    if data['appointment_type'] == 'SERVICE' and not data.get('service_id'):
        raise CreateExaminationValidationError('Vui lòng chọn dịch vụ')

def normalize_create_examination_payload(data):
    if data.get('appointment_type'):
        data['appointment_type'] = data['appointment_type'].upper()

def get_create_examination_doctor(db, doctor_id):
    doctor = db.query(User).filter(
        User.id == doctor_id,
        User.role.in_(['DOCTOR', 'PSYCHOLOGIST']),
        User.is_active == True,
    ).first()
    if not doctor:
        raise CreateExaminationValidationError('Bác sĩ không tồn tại')
    return doctor

def validate_create_examination_catalog(db, data):
    if data.get('package_id'):
        package = db.query(Package).get(data['package_id'])
        if not package:
            raise CreateExaminationValidationError('Gói khám không tồn tại')

    if data.get('service_id'):
        service = db.query(Service).get(data['service_id'])
        if not service:
            raise CreateExaminationValidationError('Dịch vụ không tồn tại')

def upsert_create_examination_patient(db, data):
    patient = db.query(Patient).filter(Patient.phone == data['phone_number']).first()
    referral_source_fields = build_referral_source_fields(data.get('referral_source'))

    if not patient:
        from app.utils.patient_utils import generate_patient_code
        patient = Patient(
            patient_code=generate_patient_code(db),
            full_name=data['full_name'],
            nickname=data.get('nickname'),
            gender=data['gender'],
            id_number=data.get('id_number'),
            phone=data['phone_number'],
            date_of_birth=datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date() if data['date_of_birth'] else None,
            address=data.get('address'),
            province=data.get('province'),
            district=data.get('district'),
            ward=data.get('ward'),
            address_detail=data.get('address_detail'),
            occupation=data.get('occupation'),
            don_vi_cong_tac=data.get('don_vi_cong_tac'),
            dia_chi_cong_ty=data.get('dia_chi_cong_ty'),
            marital_status=data.get('marital_status'),
            sexual_orientation=data.get('sexual_orientation'),
            religion=data.get('religion'),
            ethnicity=data.get('ethnicity'),
            nationality=data.get('nationality'),
            education_level=data.get('education_level') or data.get('education'),
            emergency_contact=data.get('emergency_contact'),
            physical_history=normalize_physical_history(db, data.get('physical_history')),
            family_history=data.get('family_history'),
            referral_source=referral_source_fields['referral_source'],
            referral_source_tag=referral_source_fields['referral_source_tag'],
            referral_source_detail=referral_source_fields['referral_source_detail'],
            problem_start_time=data.get('problem_start_time'),
            symptom_progression=data.get('symptom_progression'),
            current_behavior=data.get('current_behavior'),
            allergies=normalize_allergy_entries(data.get('allergies')),
            current_medication=data.get('current_medication'),
        )
        db.add(patient)
        db.flush()
        return patient

    patient.full_name = data['full_name']
    patient.nickname = data.get('nickname')
    patient.gender = data['gender']
    patient.id_number = data.get('id_number')
    patient.phone = data['phone_number']
    patient.date_of_birth = datetime.strptime(data['date_of_birth'], '%Y-%m-%d').date() if data['date_of_birth'] else None
    patient.address = data.get('address')
    patient.province = data.get('province')
    patient.district = data.get('district')
    patient.ward = data.get('ward')
    patient.address_detail = data.get('address_detail')
    patient.occupation = data.get('occupation')
    patient.don_vi_cong_tac = data.get('don_vi_cong_tac')
    patient.dia_chi_cong_ty = data.get('dia_chi_cong_ty')
    patient.marital_status = data.get('marital_status')
    patient.sexual_orientation = data.get('sexual_orientation')
    patient.religion = data.get('religion')
    patient.ethnicity = data.get('ethnicity')
    patient.nationality = data.get('nationality')
    patient.education_level = data.get('education_level') or data.get('education')
    patient.emergency_contact = data.get('emergency_contact')
    patient.physical_history = normalize_physical_history(db, data.get('physical_history'))
    patient.family_history = data.get('family_history')
    apply_referral_source(patient, data.get('referral_source'))
    patient.problem_start_time = data.get('problem_start_time')
    patient.symptom_progression = data.get('symptom_progression')
    patient.current_behavior = data.get('current_behavior')
    patient.allergies = normalize_allergy_entries(data.get('allergies'))
    patient.current_medication = data.get('current_medication')
    return patient

def ensure_no_duplicate_create_examination_appointment(db, patient, data, appointment_datetime):
    time_window = timedelta(minutes=5)
    existing_appointment = db.query(Appointment).filter(
        Appointment.patient_id == patient.id,
        Appointment.doctor_id == data['doctor_id'],
        Appointment.is_deleted == False,
        Appointment.status.in_([
            AppointmentStatus.SCHEDULED,
            AppointmentStatus.CONFIRMED,
        ]),
        Appointment.appointment_date.between(
            appointment_datetime - time_window,
            appointment_datetime + time_window,
        ),
    ).first()

    if existing_appointment:
        raise CreateExaminationValidationError(
            'Đã có lịch hẹn cho bệnh nhân này với bác sĩ này vào thời gian tương tự. Vui lòng kiểm tra lại.'
        )

def create_legacy_examination_appointment(db, patient, data, appointment_datetime):
    appointment_code = f"LH{datetime.now().strftime('%Y%m%d')}{random.randint(1000, 9999)}"
    appointment = Appointment(
        appointment_code=appointment_code,
        patient_id=patient.id,
        doctor_id=data['doctor_id'],
        appointment_date=appointment_datetime,
        appointment_type=AppointmentType.SERVICE if data['appointment_type'] == 'SERVICE' else AppointmentType.PACKAGE,
        package_id=data.get('package_id'),
        service_id=data.get('service_id'),
        status='CONFIRMED',
        notes=data['main_reason'],
    )
    db.add(appointment)
    db.flush()
    return appointment

def create_legacy_examination_row(db, patient, appointment, data, appointment_datetime):
    examination_code = f"LK{datetime.now().strftime('%Y%m%d')}{random.randint(1000, 9999)}"
    examination = Examination(
        examination_code=examination_code,
        appointment_id=appointment.id,
        patient_id=patient.id,
        doctor_id=data['doctor_id'],
        examination_date=appointment_datetime,
        examination_type=ExaminationType.SERVICE if data['appointment_type'] == 'SERVICE' else ExaminationType.PACKAGE,
        service_id=data.get('service_id'),
        package_id=data.get('package_id'),
        status=ExaminationStatus.WAITING_TRANSFER,
        main_reason=data['main_reason'],
        main_symptoms=data.get('main_symptoms'),
        weight=data.get('weight'),
        height=data.get('height'),
        bmi=data.get('bmi'),
        pulse=data.get('pulse'),
        blood_pressure=data.get('blood_pressure'),
        temperature=data.get('temperature'),
        breathing=data.get('breathing'),
    )
    db.add(examination)
    return examination

def create_legacy_family_members(db, patient, data):
    if not data.get('family_members'):
        return

    for member_data in data['family_members']:
        if member_data.get('name') or member_data.get('relationship') or member_data.get('diagnosis'):
            db.add(FamilyMember(
                patient_id=patient.id,
                name=member_data.get('name'),
                kinship=member_data.get('relationship'),
                diagnosis=member_data.get('diagnosis'),
                examine_together=member_data.get('examine_together', False),
            ))

