"""Hard-delete service for examination cleanup."""

from sqlalchemy import text

class HardDeleteExaminationNotFound(Exception):
    """Raised when the examination to hard-delete does not exist."""

def hard_delete_examination_result(db, examination_id, logger=None):
    appointment_id = get_appointment_id_for_hard_delete(db, examination_id)
    remaining_exams = count_examinations_for_appointment(db, appointment_id)

    db.execute(text("DELETE FROM survey_responses WHERE examination_id = :exam_id"), {"exam_id": examination_id})
    db.execute(text("DELETE FROM survey_sessions WHERE examination_id = :exam_id"), {"exam_id": examination_id})
    db.execute(text("DELETE FROM examination_details WHERE examination_id = :exam_id"), {"exam_id": examination_id})
    db.execute(text("DELETE FROM examinations WHERE id = :exam_id"), {"exam_id": examination_id})

    db.execute(
        text("""
            DELETE FROM prescription_items
            WHERE prescription_id IN (
                SELECT id FROM prescriptions WHERE appointment_id = :appt_id
            )
        """),
        {"appt_id": appointment_id},
    )
    db.execute(text("DELETE FROM prescriptions WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})
    db.execute(text("DELETE FROM chi_dinh WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})
    db.execute(text("DELETE FROM appointment_services WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})
    db.execute(text("DELETE FROM appointment_relatives WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})
    db.execute(text("DELETE FROM notifications WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})
    db.execute(text("DELETE FROM google_calendar_events WHERE appointment_id = :appt_id"), {"appt_id": appointment_id})

    if remaining_exams <= 1:
        db.execute(text("DELETE FROM appointments WHERE id = :appt_id"), {"appt_id": appointment_id})
        if logger:
            logger.info(f"Đã xóa appointment {appointment_id} vì không còn examination nào")

    db.commit()

    if logger:
        logger.info(f"Examination {examination_id} và tất cả dữ liệu liên quan đã được xóa hẳn khỏi database")

    return {
        'success': True,
        'message': 'Đã xóa lượt khám thành công',
    }

def get_appointment_id_for_hard_delete(db, examination_id):
    appointment_result = db.execute(
        text("SELECT appointment_id FROM examinations WHERE id = :exam_id"),
        {"exam_id": examination_id},
    )
    appointment_row = appointment_result.fetchone()
    if not appointment_row:
        raise HardDeleteExaminationNotFound()
    return appointment_row[0]

def count_examinations_for_appointment(db, appointment_id):
    remaining_exams_result = db.execute(
        text("SELECT COUNT(*) FROM examinations WHERE appointment_id = :appt_id"),
        {"appt_id": appointment_id},
    )
    return remaining_exams_result.scalar()
