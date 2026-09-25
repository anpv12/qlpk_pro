"""Status transition services for examination workflows."""

from datetime import datetime

from app.models.examination import Examination, ExaminationStatus
from app.modules.examinations.view_models.management import get_examination_status_text
from app.modules.appointments.services.doctor_queue import mark_doctor_queue_entry

class StatusTransitionExaminationNotFound(Exception):
    """Raised when an examination row does not exist for a status transition."""

class InvalidStatusTransition(Exception):
    """Raised when the current status does not allow the requested transition."""

    def __init__(self, detail):
        self.detail = detail
        super().__init__(detail)

class InvalidStatusValue(Exception):
    """Raised when a direct management status update receives an invalid status."""

def transfer_to_conclusion_result(db, examination_id):
    examination = get_examination_for_status_transition(db, examination_id)
    if examination.status != ExaminationStatus.PSYCHOLOGIST_EXAM:
        raise InvalidStatusTransition('Chỉ có thể chuyển kết luận từ trạng thái "Tâm lý gia khám"')

    apply_status_transition(examination, ExaminationStatus.CONCLUSION, touch_updated_at=True)
    db.commit()
    return {
        'message': 'Chuyển kết luận thành công',
        'examination_id': examination.id,
        'new_status': examination.status.value,
    }

def transfer_to_payment_result(db, examination_id):
    examination = get_examination_for_status_transition(db, examination_id)
    if examination.status not in [ExaminationStatus.DOCTOR_EXAM, ExaminationStatus.CONCLUSION]:
        raise InvalidStatusTransition('Chỉ có thể chuyển sang chờ thanh toán từ trạng thái "Bác sĩ khám" hoặc "Kết luận"')

    apply_status_transition(examination, ExaminationStatus.WAITING_PAYMENT, touch_updated_at=True)
    db.commit()
    return {
        'message': 'Chuyển sang chờ thanh toán thành công',
        'examination_id': examination.id,
        'new_status': examination.status.value,
    }

def complete_psychologist_examination_result(db, examination_id):
    examination = get_examination_for_status_transition(db, examination_id)
    if examination.status != ExaminationStatus.PSYCHOLOGIST_EXAM:
        raise InvalidStatusTransition('Chỉ có thể hoàn thành khám từ trạng thái "Tâm lý gia khám"')

    apply_status_transition(examination, ExaminationStatus.WAITING_PAYMENT, touch_updated_at=True)
    db.commit()
    return {
        'message': 'Hoàn thành khám tâm lý gia thành công',
        'examination_id': examination.id,
        'new_status': examination.status.value,
    }

def confirm_examination_result(db, examination_id):
    examination = get_examination_for_status_transition(db, examination_id)
    apply_status_transition(examination, ExaminationStatus.COMPLETED, touch_updated_at=True)
    db.commit()
    return {
        'success': True,
        'message': 'Xác nhận hóa đơn thành công',
        'examination_id': examination.id,
        'status': examination.status.value,
    }

def update_management_examination_status_result(db, examination_id, data):
    examination = get_examination_for_status_transition(db, examination_id, active_only=True)
    new_status = data.get('status')
    if not new_status or new_status not in [status.value for status in ExaminationStatus]:
        raise InvalidStatusValue()

    apply_status_transition(examination, ExaminationStatus(new_status))
    db.commit()
    return {
        'message': 'Cập nhật trạng thái thành công',
        'status': examination.status.value,
        'status_text': get_examination_status_text(examination.status),
    }

def get_examination_for_status_transition(db, examination_id, active_only=False):
    query = db.query(Examination).filter(Examination.id == examination_id)
    if active_only:
        query = query.filter(Examination.is_active == True)

    examination = query.first()
    if not examination:
        raise StatusTransitionExaminationNotFound()
    return examination

def apply_status_transition(examination, status, touch_updated_at=False):
    mark_doctor_queue_entry(examination.appointment, examination.status, status)
    examination.status = status
    if touch_updated_at:
        examination.updated_at = datetime.now()
