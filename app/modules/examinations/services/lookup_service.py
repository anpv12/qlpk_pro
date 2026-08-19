"""Lookup/read services for lightweight examination endpoints."""

from app.models.examination import Examination
from app.models.package import Package
from app.models.service import Service
from app.models.user import User

class LookupExaminationNotFound(Exception):
    """Raised when an examination cannot be found by appointment id."""

def get_examination_doctors_result(db):
    doctors = db.query(User).filter_by(is_active=True).all()
    return [
        {
            'id': doctor.id,
            'name': doctor.name,
            'specialization': doctor.specialization,
            'phone': doctor.phone,
        }
        for doctor in doctors
    ]

def get_examination_packages_result(db):
    packages = db.query(Package).filter_by(is_active=True).all()
    return [
        {
            'id': package.id,
            'name': package.name,
            'description': package.description,
            'price': float(package.price),
            'duration_minutes': package.duration_minutes,
        }
        for package in packages
    ]

def get_examination_services_result(db):
    services = db.query(Service).filter_by(is_active=True).order_by(Service.id.asc()).all()
    return [
        {
            'id': service.id,
            'name': service.name,
            'description': service.description,
            'default_price': float(service.default_price),
            'duration_minutes': service.duration_minutes,
        }
        for service in services
    ]

def get_examination_id_by_appointment_result(db, appointment_id):
    examination = db.query(Examination).filter(Examination.appointment_id == appointment_id).first()
    if not examination:
        raise LookupExaminationNotFound()

    return {
        'examination_id': examination.id,
        'weight': float(examination.weight) if examination.weight else None,
        'height': float(examination.height) if examination.height else None,
        'bmi': float(examination.bmi) if examination.bmi else None,
        'appointment_id': examination.appointment_id,
        'status': examination.status.value,
    }
