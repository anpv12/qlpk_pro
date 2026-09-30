from app.core.database import Base
from .user import User, UserRole, UserGroup  # noqa: F401 — importing registers the mapped table
from .patient import Patient
from .appointment import Appointment, AppointmentStatus, AppointmentType
from .examination import Examination
from .examination_detail import ExaminationDetail
# ExaminationService model removed - using AppointmentService instead
from .medicine import Medicine
from .medicine_price_history import MedicinePriceHistory
from .medicine_reference_catalog import MedicineReferenceCatalog
from .medicine_category import MedicineCategory
from .medicine_batch import MedicineBatch
from .supplier import Supplier
from .medicine_transaction import MedicineTransaction  # noqa: F401 — importing registers the mapped table
from .atc_code import ATCCode
from .atc_group import ATCGroup
from .route_administration import RouteAdministration
from .dosage_form import DosageForm
from .prescription import Prescription, PrescriptionItem
from .group import Group  # noqa: F401 — importing registers the mapped table
from .notification import Notification
from .service_category import ServiceCategory
from .service import Service, ServicePrice
from .appointment_service import AppointmentService
from .package import Package
from .doctor import Doctor
from .family_member import FamilyMember
from .appointment_relative import AppointmentRelative
from .attachment import Attachment
from .survey_template import SurveyTemplate
from .survey_criteria import SurveyCriteria
from .survey_response import SurveyResponse
from .survey_session import SurveySession, SurveySessionStatus
from .icd import ICD
from .doctor_busy_schedule import DoctorBusySchedule
from .province import Province
from .district import District
from .ward import Ward
from .administrative_region import AdministrativeRegion
from .administrative_unit import AdministrativeUnit
from .chi_dinh import ChiDinh
from .google_calendar import GoogleCalendarConnection, GoogleCalendarEvent, GoogleCalendarSyncJob, GoogleCalendarTransferJob  # noqa: F401 — importing registers the mapped table
from .expense import Expense
from .expense_column import ExpenseColumn
from .user_shortcut import UserShortcut
from .drug_interaction import DrugInteraction
from .document_folder import DocumentFolder
from .document import Document
from .active_ingredient import ActiveIngredient
from .allergen import Allergen
from .holiday import Holiday
from .occupation import Occupation
from .sexual_orientation import SexualOrientation
from .text_expansion import TextExpansion
from .legacy_database_archive import LegacyDatabaseArchive

__all__ = [
    "Base",
    "User",
    "UserRole", 
    "Patient",
    "Appointment",
    "AppointmentStatus",
    "AppointmentType",


    "Examination",
    "ExaminationDetail",
    # "ExaminationService", # Removed - using AppointmentService instead
    "Medicine",
    "MedicinePriceHistory",
    "MedicineReferenceCatalog",
    "MedicineCategory",
    "MedicineBatch",
    "Supplier",
    "ATCCode",
    "ATCGroup",
    "RouteAdministration",
    "DosageForm",
    "Prescription",
    "PrescriptionItem",
    "Notification",
    "ServiceCategory",
    "Service",
    "ServicePrice",
    "AppointmentService",
    "Package",
    "Doctor",
    "FamilyMember",
    "AppointmentRelative",
    "Attachment",
    "SurveyTemplate",
    "SurveyResponse",
    "SurveyCriteria",
    "SurveySession",
    "SurveySessionStatus",
    "ICD",
    "DoctorBusySchedule",
    "Province",
    "District",
    "Ward",
    "AdministrativeRegion",
    "AdministrativeUnit",
    "ChiDinh",
    "GoogleCalendarConnection",
    "GoogleCalendarEvent",
    "GoogleCalendarSyncJob",
    "Expense",
    "ExpenseColumn",
    "UserShortcut",
    "DrugInteraction",
    "DocumentFolder",
    "Document",
    "ActiveIngredient",
    "Allergen",
    "Holiday",
    "Occupation",
    "SexualOrientation",
    "TextExpansion",
    "LegacyDatabaseArchive"
] 
