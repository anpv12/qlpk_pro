"""Domain event helpers for realtime UI refresh."""

from __future__ import annotations

from app.realtime.socket import emit_realtime_event


def _enum_value(value):
    return getattr(value, "value", value)


def _appointment_payload(appointment=None, appointment_id=None, action="changed", extra=None):
    payload = {
        "action": action,
        "appointment_id": appointment_id or getattr(appointment, "id", None),
    }
    if appointment is not None:
        payload.update({
            "patient_id": getattr(appointment, "patient_id", None),
            "doctor_id": getattr(appointment, "doctor_id", None),
            "psychologist_id": getattr(appointment, "psychologist_id", None),
            "status": _enum_value(getattr(appointment, "status", None)),
        })
        examinations = list(getattr(appointment, "examinations", []) or [])
        if examinations:
            exam = examinations[0]
            payload.update({
                "examination_id": getattr(exam, "id", None),
                "examination_status": _enum_value(getattr(exam, "status", None)),
            })
    if extra:
        payload.update(extra)
    return payload


def emit_appointment_changed(action="changed", appointment=None, appointment_id=None, extra=None, rooms=None):
    base_rooms = [
        "workflow:operations",
        "page:dashboard",
        "page:appointment-management",
        "page:receptionist-new",
        "page:doctor-examination",
        "page:psychologist-examination",
        "page:payment-waiting",
        "role:staff",
    ]
    emit_realtime_event(
        "appointment.changed",
        _appointment_payload(appointment, appointment_id, action, extra),
        rooms=list(dict.fromkeys(base_rooms + list(rooms or []))),
    )


def emit_examination_changed(action="changed", examination=None, examination_id=None, appointment_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "examination_id": examination_id or getattr(examination, "id", None),
        "appointment_id": appointment_id or getattr(examination, "appointment_id", None),
        "status": _enum_value(getattr(examination, "status", None)) if examination is not None else None,
    }
    if examination is not None:
        payload.update({
            "patient_id": getattr(examination, "patient_id", None),
            "doctor_id": getattr(examination, "doctor_id", None),
            "payment_status": getattr(examination, "payment_status", None),
        })
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "examination.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:dashboard",
            "page:receptionist-new",
            "page:doctor-examination",
            "page:psychologist-examination",
            "page:payment-waiting",
            "role:staff",
        ] + list(rooms or []))),
    )


def emit_order_changed(action="changed", order=None, order_id=None, appointment_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "order_id": order_id or getattr(order, "id", None),
        "appointment_id": appointment_id or getattr(order, "appointment_id", None),
        "status": getattr(order, "status", None) if order is not None else None,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "order.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:order-management",
            "page:doctor-examination",
            "page:psychologist-examination",
            "role:staff",
        ] + list(rooms or []))),
    )


def emit_survey_changed(action="changed", session=None, response=None, examination_id=None, appointment_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "session_id": getattr(session, "id", None),
        "response_id": getattr(response, "id", None),
        "examination_id": examination_id or getattr(session, "examination_id", None) or getattr(response, "examination_id", None),
        "appointment_id": appointment_id,
        "patient_id": getattr(session, "patient_id", None) or getattr(response, "patient_id", None),
        "survey_template_id": getattr(response, "survey_template_id", None),
        "status": _enum_value(getattr(session, "status", None)) if session is not None else None,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "survey.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:order-management",
            "page:doctor-examination",
            "page:psychologist-examination",
            "role:staff",
        ] + list(rooms or []))),
    )


def emit_payment_changed(action="changed", examination=None, examination_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "examination_id": examination_id or getattr(examination, "id", None),
        "appointment_id": getattr(examination, "appointment_id", None) if examination is not None else None,
        "status": _enum_value(getattr(examination, "status", None)) if examination is not None else None,
        "payment_status": getattr(examination, "payment_status", None) if examination is not None else None,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "payment.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:dashboard",
            "page:appointment-management",
            "page:payment-waiting",
            "page:receptionist-new",
            "page:doctor-examination",
            "page:psychologist-examination",
            "role:staff",
        ] + list(rooms or []))),
    )


def emit_patient_changed(action="changed", patient=None, patient_id=None, appointment_id=None, examination_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "patient_id": patient_id or getattr(patient, "id", None),
        "appointment_id": appointment_id,
        "examination_id": examination_id,
    }
    if patient is not None:
        payload.update({
            "patient_code": getattr(patient, "patient_code", None),
            "full_name": getattr(patient, "full_name", None),
        })
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "patient.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:dashboard",
            "page:appointment-management",
            "page:receptionist-new",
            "page:doctor-examination",
            "page:psychologist-examination",
            "page:payment-waiting",
            "role:staff",
        ] + list(rooms or []))),
    )


def emit_catalog_changed(action="changed", entity=None, entity_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "catalog.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "workflow:admin",
            "workflow:inventory",
            "workflow:personal",
            "page:appointment-management",
            "page:receptionist-new",
            "page:doctor-examination",
            "page:psychologist-examination",
            "page:order-management",
            "page:user-management",
            "page:group-management",
            "page:permission-management",
            "page:service-management",
            "page:service-category",
            "page:package-management",
            "page:icd-management",
            "page:survey-template-management",
            "page:survey-template-create",
            "page:text-expansion-management",
            "page:holiday-management",
            "page:shortcut-settings",
            "page:active-ingredient",
            "page:allergen",
            "page:drug-interaction",
            "role:staff",
            "role:doctor",
            "role:psychologist",
            "role:admin",
        ] + list(rooms or []))),
    )


def emit_inventory_changed(action="changed", entity=None, entity_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "inventory.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:inventory",
            "page:medicine-management",
            "page:medicine-reference-catalog",
            "page:dashboard",
        ] + list(rooms or []))),
    )


def emit_finance_changed(action="changed", entity=None, entity_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "finance.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:finance",
            "page:chi-tieu",
            "role:admin",
        ] + list(rooms or []))),
    )

def emit_document_changed(action="changed", entity=None, entity_id=None, folder_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "entity": entity,
        "entity_id": entity_id,
        "folder_id": folder_id,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "document.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:inventory",
            "page:document-management",
            "role:admin",
        ] + list(rooms or []))),
    )


def emit_busy_schedule_changed(action="changed", schedule=None, schedule_id=None, extra=None, rooms=None):
    payload = {
        "action": action,
        "schedule_id": schedule_id or getattr(schedule, "id", None),
        "doctor_id": getattr(schedule, "doctor_id", None) if schedule is not None else None,
        "status": getattr(schedule, "status", None) if schedule is not None else None,
    }
    if extra:
        payload.update(extra)
    emit_realtime_event(
        "busy_schedule.changed",
        payload,
        rooms=list(dict.fromkeys([
            "workflow:operations",
            "page:appointment-management",
            "page:doctor-busy-schedule",
            "role:staff",
            "role:doctor",
        ] + list(rooms or []))),
    )


def emit_notification_changed(action="changed", user_id=None, role=None, extra=None, rooms=None):
    payload = {"action": action, "user_id": user_id, "role": role}
    if extra:
        payload.update(extra)
    target_rooms = list(rooms or [])
    if user_id:
        target_rooms.append(f"user:{user_id}")
    if role:
        target_rooms.append(f"role:{role}")
    target_rooms.append("workflow:operations")
    emit_realtime_event("notification.changed", payload, rooms=list(dict.fromkeys(target_rooms)))
