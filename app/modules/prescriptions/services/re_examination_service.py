"""Re-examination side effects after prescription save."""

from datetime import datetime
import threading

from app.core.database import get_db
from app.realtime.events import emit_appointment_changed, emit_examination_changed
from app.services.notification_service import NotificationService

notification_service = NotificationService()

def _coerce_positive_int(value):
    if value in (None, '', 'null', 'undefined'):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None

def _enum_value(value):
    return value.value if hasattr(value, 'value') else value

def _service_duration(db, service_id, fallback_duration=None):
    service_id = _coerce_positive_int(service_id)
    if not service_id:
        return fallback_duration
    try:
        from app.models.service import Service
        selected_service = db.query(Service).filter(Service.id == service_id).first()
        return selected_service.duration_minutes if selected_service and selected_service.duration_minutes else fallback_duration
    except Exception:
        return fallback_duration

def _service_target(db, service_id, fallback_duration=None, source='service'):
    service_id = _coerce_positive_int(service_id)
    if not service_id:
        return None
    return {
        'examination_type': 'service',
        'package_service_id': service_id,
        'duration': _service_duration(db, service_id, fallback_duration),
        'source': source,
    }

def _package_target(package_id, fallback_duration=None, source='package'):
    package_id = _coerce_positive_int(package_id)
    if not package_id:
        return None
    return {
        'examination_type': 'package',
        'package_service_id': package_id,
        'duration': fallback_duration,
        'source': source,
    }

def _first_appointment_service_target(db, AppointmentService, appointment_id, fallback_duration=None, source='appointment_services'):
    if not appointment_id:
        return None
    appointment_service = db.query(AppointmentService).filter(
        AppointmentService.appointment_id == appointment_id,
        AppointmentService.service_id.isnot(None),
    ).order_by(AppointmentService.id.asc()).first()
    if not appointment_service:
        return None
    duration = appointment_service.duration_minutes or fallback_duration
    return _service_target(db, appointment_service.service_id, duration, source)

def _target_from_appointment(db, appointment, AppointmentService, source_prefix='appointment'):
    if not appointment:
        return None

    appointment_type = _enum_value(appointment.appointment_type)
    fallback_duration = appointment.duration_minutes

    if appointment_type == 'PACKAGE':
        return (
            _package_target(appointment.package_id, fallback_duration, f'{source_prefix}.package_id')
            or _service_target(db, appointment.service_id, fallback_duration, f'{source_prefix}.service_id')
            or _first_appointment_service_target(db, AppointmentService, appointment.id, fallback_duration, f'{source_prefix}.appointment_services')
        )

    return (
        _service_target(db, appointment.service_id, fallback_duration, f'{source_prefix}.service_id')
        or _first_appointment_service_target(db, AppointmentService, appointment.id, fallback_duration, f'{source_prefix}.appointment_services')
        or _package_target(appointment.package_id, fallback_duration, f'{source_prefix}.package_id')
    )

def _resolve_re_examination_target(db, data, original_appointment, existing_re_appointment, Appointment, AppointmentService):
    payload_service_id = _coerce_positive_int(data.get('re_examination_service_id'))
    if payload_service_id:
        return _service_target(db, payload_service_id, original_appointment.duration_minutes, 'payload.re_examination_service_id')

    # Nếu lịch tái khám đã được người dùng chọn service trước đó, giữ lại lựa chọn đó.
    existing_target = _target_from_appointment(db, existing_re_appointment, AppointmentService, 'existing_re_appointment')
    if existing_target:
        return existing_target

    current_target = _target_from_appointment(db, original_appointment, AppointmentService, 'current_appointment')
    if current_target:
        return current_target

    parent_id = _coerce_positive_int(getattr(original_appointment, 'original_appointment_id', None))
    if parent_id:
        parent_appointment = db.query(Appointment).filter(Appointment.id == parent_id).first()
        parent_target = _target_from_appointment(db, parent_appointment, AppointmentService, 'parent_appointment')
        if parent_target:
            return parent_target

    return None

def _apply_re_examination_target_to_appointment(appointment, target, AppointmentType):
    if not appointment or not target:
        return
    if target['examination_type'] == 'package':
        appointment.appointment_type = AppointmentType.PACKAGE
        appointment.package_id = target['package_service_id']
        appointment.service_id = None
    else:
        appointment.appointment_type = AppointmentType.SERVICE
        appointment.service_id = target['package_service_id']
        appointment.package_id = None
    if target.get('duration'):
        appointment.duration_minutes = target['duration']

def _is_true_flag(value):
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {'1', 'true', 'yes', 'y'}


def sync_re_examination_after_prescription_save(
    db,
    data,
    appointment_id,
    re_examination_date,
    re_exam_time_raw,
    logger,
):
    """Sync re-examination appointment without changing legacy commit/error behavior."""
    # Xử lý appointment tái khám
    try:
        from app.models.appointment import Appointment, AppointmentStatus, AppointmentCategory, AppointmentType
        from app.models.appointment_service import AppointmentService
        from app.models.examination import Examination, ExaminationStatus, ExaminationType
        
        # Lấy appointment gốc
        original_appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
        if not original_appointment:
            logger.warning(f"Không tìm thấy appointment gốc: {appointment_id}")
            return {'ok': False, 'detail': 'Không tìm thấy lịch hẹn gốc để tạo lịch tái khám'}
        else:
            # Appointment id chỉ chứng minh lịch con đã tồn tại. Chỉ trạng thái
            # CONFIRMED mới khóa ngày/giờ ở workflow bác sĩ; SCHEDULED vẫn được
            # phép cập nhật hoặc hủy qua lần lưu đơn tiếp theo.
            existing_re_appointment = db.query(Appointment).filter(
                Appointment.original_appointment_id == appointment_id,
                Appointment.appointment_category == AppointmentCategory.RE_EXAMINATION,
                Appointment.is_deleted == False,
                Appointment.status != AppointmentStatus.CANCELLED
            ).order_by(Appointment.appointment_date.desc(), Appointment.id.desc()).first()

            if (
                existing_re_appointment
                and existing_re_appointment.status == AppointmentStatus.CONFIRMED
            ):
                logger.info(
                    "Giữ nguyên lịch tái khám đã xác nhận: "
                    f"appointment_id={appointment_id}, re_appointment_id={existing_re_appointment.id}"
                )
                return {
                    'ok': True,
                    'skipped': 'already_confirmed',
                    'appointment_id': existing_re_appointment.id,
                    'status': AppointmentStatus.CONFIRMED.value,
                }
            
            if re_examination_date:
                # Có ngày tái khám → tạo hoặc update appointment tái khám
                # Sử dụng time từ request, mặc định 09:00 nếu không có
                re_examination_time = re_exam_time_raw if re_exam_time_raw else "09:00"
                re_examination_date_str = (
                    re_examination_date.strftime('%Y-%m-%d')
                    if hasattr(re_examination_date, 'strftime')
                    else str(re_examination_date)
                )
                try:
                    requested_re_examination_datetime = datetime.strptime(
                        f"{re_examination_date_str} {re_examination_time}",
                        '%Y-%m-%d %H:%M'
                    )
                except ValueError:
                    return {'ok': False, 'detail': 'Định dạng ngày/giờ tái khám không hợp lệ'}

                if requested_re_examination_datetime <= datetime.now():
                    if _is_true_flag(data.get('re_examination_is_historical')):
                        logger.info(
                            "Bỏ qua tạo appointment tái khám cho ngày lịch sử: "
                            f"appointment_id={appointment_id}, re_examination_date={re_examination_date_str} {re_examination_time}"
                        )
                        return {'ok': True, 'skipped': 'historical_re_examination_date'}
                    return {'ok': False, 'detail': 'Ngày tái khám không hợp lệ hoặc không nằm trong tương lai'}
                
                # Lấy thông tin từ appointment gốc
                doctor_id = original_appointment.doctor_id
                re_exam_target = _resolve_re_examination_target(
                    db,
                    data,
                    original_appointment,
                    existing_re_appointment,
                    Appointment,
                    AppointmentService,
                )
                examination_type = re_exam_target['examination_type'] if re_exam_target else None
                package_service_id = re_exam_target['package_service_id'] if re_exam_target else None
                re_exam_duration = re_exam_target.get('duration') if re_exam_target else None
                
                if not doctor_id or not package_service_id:
                    logger.error(
                        "Thiếu thông tin để tạo appointment tái khám: "
                        f"doctor_id={doctor_id}, package_service_id={package_service_id}, "
                        f"appointment_id={appointment_id}"
                    )
                    return {'ok': False, 'detail': 'Không thể tạo lịch tái khám vì lịch hiện tại chưa có dịch vụ/gói hợp lệ'}
                else:
                    if existing_re_appointment:
                        # Đã có appointment tái khám SCHEDULED → update
                        from datetime import datetime as dt
                        re_examination_datetime = dt.strptime(
                            f"{re_examination_date} {re_examination_time}", 
                            '%Y-%m-%d %H:%M'
                        )
                        existing_re_appointment.appointment_date = re_examination_datetime
                        
                        _apply_re_examination_target_to_appointment(
                            existing_re_appointment,
                            re_exam_target,
                            AppointmentType,
                        )
                        
                        # Update examination liên quan
                        examination = db.query(Examination).filter(
                            Examination.appointment_id == existing_re_appointment.id
                        ).first()
                        if examination:
                            examination.examination_date = re_examination_datetime
                            examination.examination_type = ExaminationType.SERVICE if examination_type == 'service' else ExaminationType.PACKAGE
                            examination.service_id = existing_re_appointment.service_id
                            examination.package_id = existing_re_appointment.package_id
                        
                        db.commit()
                        emit_appointment_changed('re_examination_updated', appointment=existing_re_appointment)
                        if examination:
                            emit_examination_changed('re_examination_updated', examination=examination)
                        
                        # Đồng bộ với Google Calendar: Bác sĩ + Lễ tân
                        try:
                            from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
                            from app.models.user import User, UserRole
                            from app.services.google_calendar_service import GoogleCalendarService
                            
                            # 1. Sync cho Bác sĩ
                            doctor_conn = db.query(GoogleCalendarConnection).filter(
                                GoogleCalendarConnection.user_id == existing_re_appointment.doctor_id,
                                GoogleCalendarConnection.is_active == True
                            ).first()
                            
                            if doctor_conn:
                                all_events = db.query(GoogleCalendarEvent).filter(
                                    GoogleCalendarEvent.appointment_id == existing_re_appointment.id
                                ).all()
                                
                                doctor_event_found = False
                                for event in all_events:
                                    try:
                                        if GoogleCalendarService.update_event(existing_re_appointment, event, doctor_conn):
                                            doctor_event_found = True
                                            logger.info(f"Updated Doctor's Google Calendar event {event.event_id}")
                                            break
                                    except:
                                        continue
                                
                                if not doctor_event_found:
                                    event_id = GoogleCalendarService.create_event(existing_re_appointment, doctor_conn)
                                    if event_id:
                                        new_event = GoogleCalendarEvent(
                                            appointment_id=existing_re_appointment.id,
                                            user_id=existing_re_appointment.doctor_id,
                                            event_id=event_id
                                        )
                                        db.add(new_event)
                                        db.commit()
                                        logger.info(f"Created new Google Calendar event for Doctor")

                            # 2. Sync cho TẤT CẢ Lễ tân
                            receptionist_conns = db.query(GoogleCalendarConnection).join(
                                User, GoogleCalendarConnection.user_id == User.id
                            ).filter(
                                User.role == UserRole.STAFF,
                                GoogleCalendarConnection.is_active == True
                            ).all()
                            
                            for recep_conn in receptionist_conns:
                                try:
                                    all_events = db.query(GoogleCalendarEvent).filter(
                                        GoogleCalendarEvent.appointment_id == existing_re_appointment.id
                                    ).all()
                                    
                                    recep_event_found = False
                                    for event in all_events:
                                        try:
                                            if GoogleCalendarService.update_event(existing_re_appointment, event, recep_conn):
                                                recep_event_found = True
                                                logger.info(f"Updated Receptionist {recep_conn.user_id}'s event")
                                                break
                                        except:
                                            continue
                                    
                                    if not recep_event_found:
                                        event_id = GoogleCalendarService.create_event(existing_re_appointment, recep_conn)
                                        if event_id:
                                            new_event = GoogleCalendarEvent(
                                                appointment_id=existing_re_appointment.id,
                                                user_id=recep_conn.user_id,
                                                event_id=event_id
                                            )
                                            db.add(new_event)
                                            db.commit()
                                            logger.info(f"Created new event for Receptionist {recep_conn.user_id}")
                                except Exception as e:
                                    logger.error(f"Error syncing for receptionist {recep_conn.user_id}: {e}")

                        except Exception as e:
                            logger.error(f"Error syncing re-examination update to Google Calendar: {e}")
                            try:
                                db.commit()
                            except:
                                pass
                        
                        # Gửi email thông báo
                        try:
                            def create_reminder_async(appointment_id):
                                thread_db = next(get_db())
                                try:
                                    notification_service.create_appointment_reminder(appointment_id, reminder_hours=24)
                                    logger.info(f"Re-examination appointment reminder sent after update for appointment ID: {appointment_id}")
                                except Exception as e:
                                    logger.info(f"Error sending re-examination appointment reminder after update for appt ID {appointment_id}: {e}")
                                finally:
                                    thread_db.close()
                            
                            reminder_thread = threading.Thread(target=create_reminder_async, args=(existing_re_appointment.id,))
                            reminder_thread.daemon = True
                            reminder_thread.start()
                        except Exception as e:
                            logger.info(f"Error scheduling reminder creation for updated re-examination appt ID {existing_re_appointment.id}: {e}")
                        
                        logger.info(f"Đã cập nhật appointment tái khám: {existing_re_appointment.id}")
                        return {
                            'ok': True,
                            'appointment_id': existing_re_appointment.id,
                            'status': _enum_value(existing_re_appointment.status),
                        }
                    else:
                        from app.models.patient import Patient
                        from app.models.user import User
                        from app.models.examination import Examination, ExaminationStatus, ExaminationType
                        import random
                        
                        # Tạo datetime
                        from datetime import datetime as dt
                        try:
                            re_examination_datetime = dt.strptime(
                                f"{re_examination_date.strftime('%Y-%m-%d')} {re_examination_time}", 
                                '%Y-%m-%d %H:%M'
                            )
                        except ValueError:
                            logger.error("Định dạng ngày/giờ không hợp lệ")
                            re_examination_datetime = None
                        
                        if re_examination_datetime and re_examination_datetime > dt.now():
                            # Tạo appointment code
                            appointment_code = f"APT{dt.now().strftime('%Y%m%d%H%M%S%f')}{random.randint(100,999)}R"
                            
                            # Xác định service_id và package_id
                            service_id = None
                            package_id = None
                            if examination_type == 'package':
                                package_id = package_service_id
                            else:
                                service_id = package_service_id
                            
                            # Tạo appointment tái khám
                            re_appointment = Appointment(
                                appointment_code=appointment_code,
                                patient_id=original_appointment.patient_id,
                                doctor_id=doctor_id,
                                appointment_date=re_examination_datetime,
                                duration_minutes=re_exam_duration or original_appointment.duration_minutes,
                                status=AppointmentStatus.SCHEDULED,
                                appointment_category=AppointmentCategory.RE_EXAMINATION,
                                appointment_type=AppointmentType.SERVICE if examination_type == 'service' else AppointmentType.PACKAGE,
                                service_id=service_id,
                                package_id=package_id,
                                target_type=original_appointment.target_type,
                                target_name=original_appointment.target_name,
                                notes=f"Lịch hẹn tái khám từ lịch hẹn ngày {original_appointment.appointment_date.strftime('%d/%m/%Y')}",
                                original_appointment_id=appointment_id
                            )
                            
                            db.add(re_appointment)
                            try:
                                db.commit()
                            except Exception as e:
                                db.rollback()
                                appointment_code = f"APT{dt.now().strftime('%Y%m%d%H%M%S%f')}{random.randint(1000,9999)}R"
                                re_appointment.appointment_code = appointment_code
                                db.add(re_appointment)
                                db.commit()
                            
                            db.refresh(re_appointment)
                            
                            # Đồng bộ với Google Calendar: Bác sĩ + Lễ tân
                            try:
                                from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
                                from app.models.user import User, UserRole
                                from app.services.google_calendar_service import GoogleCalendarService
                                
                                # 1. Sync cho Bác sĩ
                                calendar_connection = db.query(GoogleCalendarConnection).filter(
                                    GoogleCalendarConnection.user_id == re_appointment.doctor_id,
                                    GoogleCalendarConnection.is_active == True
                                ).first()
                                
                                if calendar_connection:
                                    event_id = GoogleCalendarService.create_event(re_appointment, calendar_connection)
                                    if event_id:
                                        calendar_event = GoogleCalendarEvent(
                                            appointment_id=re_appointment.id,
                                            user_id=re_appointment.doctor_id,  # Event của bác sĩ
                                            event_id=event_id
                                        )
                                        db.add(calendar_event)
                                        db.commit()
                                        logger.info(f"Created Google Calendar event {event_id} for re-examination from prescription appointment {re_appointment.id}")
                                
                                # 2. Sync cho TẤT CẢ Lễ tân
                                receptionist_conns = db.query(GoogleCalendarConnection).join(
                                    User, GoogleCalendarConnection.user_id == User.id
                                ).filter(
                                    User.role == UserRole.STAFF,
                                    GoogleCalendarConnection.is_active == True
                                ).all()
                                
                                for recep_conn in receptionist_conns:
                                    try:
                                        event_id = GoogleCalendarService.create_event(re_appointment, recep_conn)
                                        if event_id:
                                            new_event = GoogleCalendarEvent(
                                                appointment_id=re_appointment.id,
                                                user_id=recep_conn.user_id,  # Event của lễ tân
                                                event_id=event_id
                                            )
                                            db.add(new_event)
                                            db.commit()
                                            logger.info(f"Created Google Calendar event for receptionist {recep_conn.user_id}")
                                    except Exception as e:
                                        logger.error(f"Error creating event for receptionist {recep_conn.user_id}: {e}")

                            except Exception as e:
                                logger.error(f"Error syncing re-examination from prescription to Google Calendar: {e}")
                                # Không fail appointment nếu calendar sync lỗi
                                # Đảm bảo appointment đã được commit
                                try:
                                    db.commit()
                                except:
                                    pass
                            
                            # Tạo examination record
                            examination_code = f"LK{dt.now().strftime('%Y%m%d%H%M%S%f')}{random.randint(100,999)}R"
                            examination = Examination(
                                appointment_id=re_appointment.id,
                                patient_id=original_appointment.patient_id,
                                doctor_id=doctor_id,
                                examination_date=re_examination_datetime,
                                examination_code=examination_code,
                                status=ExaminationStatus.WAITING_TRANSFER,
                                examination_type=ExaminationType.SERVICE if examination_type == 'service' else ExaminationType.PACKAGE,
                                service_id=service_id,
                                package_id=package_id,
                                main_reason="Tái khám",
                                symptoms=""
                            )
                            
                            db.add(examination)
                            try:
                                db.commit()
                            except Exception as e:
                                db.rollback()
                                examination_code = f"LK{dt.now().strftime('%Y%m%d%H%M%S%f')}{random.randint(1000,9999)}R"
                                examination.examination_code = examination_code
                                db.add(examination)
                                db.commit()
                            emit_appointment_changed('re_examination_created', appointment=re_appointment)
                            emit_examination_changed('created', examination=examination)
                            
                            # Tạo reminder cho lịch hẹn tái khám (async)
                            try:
                                def create_reminder_async(appointment_id):
                                    thread_db = next(get_db())
                                    try:
                                        notification_service.create_appointment_reminder(appointment_id, reminder_hours=24)
                                        logger.info(f"Re-examination appointment reminder created for appointment ID: {appointment_id}")
                                    except Exception as e:
                                        logger.info(f"Error creating re-examination appointment reminder for appt ID {appointment_id}: {e}")
                                    finally:
                                        thread_db.close()
                                
                                reminder_thread = threading.Thread(target=create_reminder_async, args=(re_appointment.id,))
                                reminder_thread.daemon = True
                                reminder_thread.start()
                            except Exception as e:
                                logger.info(f"Error scheduling reminder creation for re-examination appt ID {re_appointment.id}: {e}")
                            
                            logger.info(f"Đã tạo appointment tái khám: {re_appointment.id}")
                            return {
                                'ok': True,
                                'appointment_id': re_appointment.id,
                                'status': AppointmentStatus.SCHEDULED.value,
                            }
                        else:
                            logger.warning("Ngày tái khám không hợp lệ hoặc không trong tương lai")
                            return {'ok': False, 'detail': 'Ngày tái khám không hợp lệ hoặc không nằm trong tương lai'}
            else:
                # Không có ngày tái khám → cancel appointment tái khám (nếu có)
                if existing_re_appointment:
                    if existing_re_appointment.status == AppointmentStatus.SCHEDULED:
                        # Cancel appointment
                        existing_re_appointment.is_deleted = True
                        existing_re_appointment.deleted_at = datetime.utcnow()
                        existing_re_appointment.status = AppointmentStatus.CANCELLED
                        
                        # Đánh dấu examinations liên quan là không active
                        examinations = db.query(Examination).filter(
                            Examination.appointment_id == existing_re_appointment.id
                        ).all()
                        for exam in examinations:
                            exam.is_active = False
                        
                        # Xóa event trên Google Calendar nếu có
                        try:
                            from app.models.google_calendar import GoogleCalendarConnection, GoogleCalendarEvent
                            from app.services.google_calendar_service import GoogleCalendarService
                            from app.models.user import User, UserRole
                            
                            # Lấy tất cả events liên quan
                            calendar_events = db.query(GoogleCalendarEvent).filter(
                                GoogleCalendarEvent.appointment_id == existing_re_appointment.id
                            ).all()
                            
                            # Lấy connection của Doctor
                            doctor_connection = db.query(GoogleCalendarConnection).filter(
                                GoogleCalendarConnection.user_id == existing_re_appointment.doctor_id,
                                GoogleCalendarConnection.is_active == True
                            ).first()
                            
                            # Lấy connections của tất cả Receptionist (STAFF)
                            receptionist_connections = db.query(GoogleCalendarConnection).join(
                                User, GoogleCalendarConnection.user_id == User.id
                            ).filter(
                                User.role == UserRole.STAFF,
                                GoogleCalendarConnection.is_active == True
                            ).all()
                            
                            for event in calendar_events:
                                # 1. Thử xóa với connection của Doctor
                                if doctor_connection:
                                    try:
                                        GoogleCalendarService.delete_event(event, doctor_connection)
                                        logger.info(f"Deleted Google Calendar event {event.event_id} using doctor connection")
                                    except Exception as e:
                                        logger.warning(f"Failed to delete event {event.event_id} with doctor connection: {e}")
                                
                                # 2. Thử xóa với connection của tất cả Receptionist
                                for conn in receptionist_connections:
                                    try:
                                        GoogleCalendarService.delete_event(event, conn)
                                        logger.info(f"Deleted Google Calendar event {event.event_id} using staff connection (user {conn.user_id})")
                                    except Exception as e:
                                        # Ignore 404 (Resource Not Found) implies event not on this calendar
                                        pass
                                
                                # Xóa record trong database
                                db.delete(event)
                        except Exception as e:
                            logger.error(f"Error deleting Google Calendar event for cancelled re-examination: {e}")
                            # Không fail appointment nếu calendar sync lỗi
                        
                        db.commit()
                        emit_appointment_changed('re_examination_cancelled', appointment=existing_re_appointment)
                        emit_examination_changed('re_examination_cancelled', appointment_id=existing_re_appointment.id)
                        logger.info(f"Đã hủy appointment tái khám: {existing_re_appointment.id}")
                        return {
                            'ok': True,
                            'appointment_id': existing_re_appointment.id,
                            'status': AppointmentStatus.CANCELLED.value,
                        }
                    else:
                        logger.info(f"Appointment tái khám đã được khám (status={existing_re_appointment.status}), không hủy")
                        return {
                            'ok': True,
                            'appointment_id': existing_re_appointment.id,
                            'status': _enum_value(existing_re_appointment.status),
                        }
        return {'ok': True}
    except Exception as e:
        logger.error(f"Lỗi xử lý appointment tái khám: {str(e)}")
        # Không rollback prescription vì đã commit
        return {'ok': False, 'detail': f'Lỗi xử lý lịch tái khám: {str(e)}'}
