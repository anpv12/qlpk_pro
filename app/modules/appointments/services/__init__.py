"""Appointment domain services."""

from app.modules.appointments.services.confirmation_service import (
    AppointmentConfirmationNotFound,
    AppointmentConfirmationResult,
    AppointmentConfirmationValidationError,
    confirm_scheduled_appointment,
)
from app.modules.appointments.services.creation_service import (
    AppointmentCreationDuplicateError,
    AppointmentCreationRequiresConfirmation,
    AppointmentCreationResult,
    AppointmentCreationValidationError,
    create_appointment_from_payload,
)
from app.modules.appointments.services.deletion_service import (
    AppointmentDeletionBlocked,
    AppointmentDeletionNotFound,
    AppointmentDeletionRequiresForce,
    AppointmentHardDeletionResult,
    AppointmentSoftDeletionResult,
    hard_delete_appointment_record,
    soft_delete_appointment,
)
from app.modules.appointments.services.export_service import (
    AppointmentExportResult,
    build_appointments_export_file,
)
from app.modules.appointments.services.import_service import (
    AppointmentImportNoData,
    AppointmentImportResult,
    import_appointments_batch,
)
from app.modules.appointments.services.query_service import (
    AppointmentListResult,
    get_appointment_list,
    get_appointment_stats,
)
from app.modules.appointments.services.re_examination_service import (
    ReExaminationCreationResult,
    ReExaminationError,
    cancel_re_examination_appointment,
    create_re_examination_from_payload,
    create_re_examination_from_prescription,
    get_re_examination_appointment,
)
from app.modules.appointments.services.side_effects import (
    apply_appointment_update_side_effects,
    schedule_appointment_reminder,
    schedule_appointment_update_reminder,
    sync_calendar_for_appointment,
    sync_re_examination_calendar_on_create,
    sync_transferred_appointment_calendar,
)
from app.modules.appointments.services.status_transition_service import (
    AppointmentBackToScheduledResult,
    AppointmentExaminationTransitionResult,
    AppointmentStatusTransitionNotFound,
    move_appointment_back_to_scheduled,
    return_appointment_to_doctor,
    return_appointment_to_receptionist,
)
from app.modules.appointments.services.transfer_service import (
    AppointmentTransferResult,
    AppointmentTransferValidationError,
    get_new_examination_status,
    transfer_appointments_between_roles,
)
from app.modules.appointments.services.update_service import (
    AppointmentAdminUpdateResult,
    AppointmentAdminValidationError,
    apply_appointment_admin_updates,
    apply_psychologist_detail_updates_from_appointment_payload,
    apply_examination_clinical_updates_from_appointment_payload,
    apply_patient_updates_from_appointment_payload,
    ensure_examination_for_confirmed_appointment,
)
from app.utils.address_contract import build_full_address

__all__ = [
    "AppointmentAdminUpdateResult",
    "AppointmentAdminValidationError",
    "AppointmentBackToScheduledResult",
    "AppointmentConfirmationNotFound",
    "AppointmentConfirmationResult",
    "AppointmentConfirmationValidationError",
    "AppointmentCreationDuplicateError",
    "AppointmentCreationRequiresConfirmation",
    "AppointmentCreationResult",
    "AppointmentCreationValidationError",
    "AppointmentDeletionBlocked",
    "AppointmentDeletionNotFound",
    "AppointmentDeletionRequiresForce",
    "AppointmentExaminationTransitionResult",
    "AppointmentExportResult",
    "AppointmentHardDeletionResult",
    "AppointmentImportNoData",
    "AppointmentImportResult",
    "AppointmentListResult",
    "AppointmentSoftDeletionResult",
    "AppointmentStatusTransitionNotFound",
    "AppointmentTransferResult",
    "AppointmentTransferValidationError",
    "ReExaminationCreationResult",
    "ReExaminationError",
    "apply_appointment_admin_updates",
    "apply_appointment_update_side_effects",
    "apply_psychologist_detail_updates_from_appointment_payload",
    "apply_examination_clinical_updates_from_appointment_payload",
    "apply_patient_updates_from_appointment_payload",
    "build_full_address",
    "build_appointments_export_file",
    "cancel_re_examination_appointment",
    "confirm_scheduled_appointment",
    "create_appointment_from_payload",
    "create_re_examination_from_payload",
    "create_re_examination_from_prescription",
    "ensure_examination_for_confirmed_appointment",
    "get_appointment_list",
    "get_appointment_stats",
    "get_new_examination_status",
    "get_re_examination_appointment",
    "hard_delete_appointment_record",
    "import_appointments_batch",
    "move_appointment_back_to_scheduled",
    "return_appointment_to_doctor",
    "return_appointment_to_receptionist",
    "schedule_appointment_reminder",
    "schedule_appointment_update_reminder",
    "soft_delete_appointment",
    "sync_calendar_for_appointment",
    "sync_re_examination_calendar_on_create",
    "sync_transferred_appointment_calendar",
    "transfer_appointments_between_roles",
]
