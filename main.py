from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
from app.core.config import settings
from app.core.database import engine
from app.models import Base, User, Patient, Appointment
from app.models.occupation import Occupation
from app.models.sexual_orientation import SexualOrientation
from app.models.administrative_region import AdministrativeRegion
from app.models.administrative_unit import AdministrativeUnit
from app.utils.api_error_contract import attach_stable_error_code
from app.api.appointment import router as appointment_router
from app.api.auth import router as auth_router, check_router, require_auth
from app.api.user import user_router
from app.api.patient import router as patient_router
from app.api.group import router as group_router
from app.api.user_group import router as user_group_router
from app.api.notification import router as notification_router, api_router as notification_api_router
from app.api.global_search import router as global_search_router
from app.api.service_category import router as service_category_router
from app.api.service import router as service_router
from app.api.package import router as package_router
from app.api.examination import examination_bp
from app.api.examination_management import examination_management_bp
from app.api.attachments import attachments_router
from app.api.examination_details import router as examination_details_router
from app.api.medicine import medicine_router
from app.api.medicine_category import medicine_category_router
from app.api.medicine_batch import medicine_batch_router
from app.api.supplier import supplier_router
from app.api.medicine_transaction import medicine_transaction_router
from app.modules.prescriptions.api.internal import router as prescription_router
from app.api.family_member import family_member_router
from app.api.appointment_relative import appointment_relative_router
from app.api.survey_templates import survey_templates_router
from app.api.survey_responses import survey_responses_router
from app.api.survey_template_management import router as survey_template_management_router
from app.api.survey_sessions import survey_sessions
from app.api.survey_criteria import survey_criteria_bp
from app.api.payment_waiting import payment_waiting_bp
from app.api.examination_detail import examination_detail_bp
from app.api.occupation import occupation_bp
from app.api.sexual_orientation import sexual_orientation_bp
from app.api.atc_code import atc_code_bp
from app.api.atc_group import atc_group_bp
from app.api.route_administration import route_administration_bp
from app.api.dosage_form import dosage_form_bp
from app.api.icd import icd_router
from app.api.text_expansions import text_expansions_bp
from app.api.holiday import holiday_router
from app.api.doctor_busy_schedule import doctor_busy_schedule_bp
from app.api.vietnam_address import vietnam_address_bp
from app.api.usage_suggestions import usage_suggestions_bp
from app.modules.orders.api.catalog import order_catalog_bp
from app.api.calendar import calendar_bp
from app.api.dashboard import dashboard_bp
from app.api.expense import expense_bp
from app.api.user_shortcuts import shortcut_router
from app.api.drug_interaction import drug_interaction_bp
from app.api.document import document_bp
from app.api.active_ingredient import active_ingredient_bp
from app.api.allergen import allergen_bp
from app.modules.prescriptions.api.public import public_prescription_bp
from app.modules.medicines.api.reference_catalog import reference_catalog_bp
from app.realtime import init_realtime, socketio


# Tạo database tables với retry logic
import os
import time
import psycopg2
from sqlalchemy.exc import OperationalError

def init_database():
    auto_create_tables = settings.AUTO_CREATE_TABLES
    if auto_create_tables is None:
        auto_create_tables = settings.DEBUG

    if not auto_create_tables:
        print("Skipping Base.metadata.create_all; run Alembic migrations before starting the app.")
        return

    max_retries = 30
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            print(f"Attempting to connect to database (attempt {attempt + 1}/{max_retries})")
            Base.metadata.create_all(bind=engine)
            print("Database connection successful!")
            break
        except OperationalError as e:
            if "does not exist" in str(e):
                print(f"Database does not exist, waiting for PostgreSQL to be ready...")
            else:
                print(f"Database connection failed: {e}")

            if attempt < max_retries - 1:
                print(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                print("Max retries reached. Database connection failed.")
                raise e

# Khởi tạo database với retry
init_database()

# Tạo Flask app với cấu hình template và static folders
app = Flask(__name__, 
           template_folder='app/templates',
           static_folder='app/static')
app.config['SECRET_KEY'] = settings.SECRET_KEY

# ProxyFix để Flask nhận biết HTTPS từ nginx
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Config để Flask biết đang chạy HTTPS (chỉ trong production)
if not settings.DEBUG:
    app.config['PREFERRED_URL_SCHEME'] = 'https'
    if settings.BASE_URL:
        # Parse domain từ BASE_URL (ví dụ: https://qlpk.io.vn -> qlpk.io.vn)
        from urllib.parse import urlparse
        parsed = urlparse(settings.BASE_URL)
        app.config['SERVER_NAME'] = parsed.netloc

_asset_version_cache = {
    "checked_at": 0.0,
    "value": settings.APP_VERSION,
}

def get_template_app_version():
    if not settings.DEBUG:
        return settings.APP_VERSION

    now = time.time()
    if now - _asset_version_cache["checked_at"] < 2:
        return _asset_version_cache["value"]

    latest_mtime = int(float(settings.APP_VERSION or 0))
    for root in (app.static_folder, app.template_folder):
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [dirname for dirname in dirnames if dirname != "__pycache__"]
            for filename in filenames:
                if filename.startswith("."):
                    continue
                path = os.path.join(dirpath, filename)
                try:
                    latest_mtime = max(latest_mtime, int(os.path.getmtime(path)))
                except OSError:
                    continue

    _asset_version_cache["checked_at"] = now
    _asset_version_cache["value"] = str(latest_mtime)
    return _asset_version_cache["value"]

# Inject APP_VERSION into all templates
@app.context_processor
def inject_app_version():
    return dict(app_version=get_template_app_version())

@app.after_request
def add_html_cache_headers(response):
    if response.mimetype == 'text/html':
        response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    return response

@app.after_request
def add_json_error_code(response):
    return attach_stable_error_code(response)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(
        f'{app.static_folder}/assets',
        'favicon.ico',
        mimetype='image/vnd.microsoft.icon'
    )


# CORS - Cấu hình chi tiết cho development và production
CORS(app, 
     resources={r"/*": {"origins": settings.BACKEND_CORS_ORIGINS}},
     supports_credentials=True,
     allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
     expose_headers=["Content-Range", "X-Content-Range"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
)
init_realtime(app)

# Middleware để chỉ cho phép truy cập qua domain, chặn truy cập bằng IP
@app.before_request
def check_allowed_host():
    """Chỉ cho phép truy cập qua domain, chặn truy cập bằng IP"""
    import re
    from app.core.config import settings
    
    # Cho phép health check endpoint (cần cho docker healthcheck)
    if request.path == '/health':
        return None
    
    # Lấy Host header từ request (bỏ port nếu có)
    host = request.host.split(':')[0]
    
    # Trong môi trường development (DEBUG=True), cho phép localhost và 127.0.0.1
    if settings.DEBUG:
        if host in ['localhost', '127.0.0.1']:
            return None
    
    # Danh sách domain được phép từ config
    allowed_domains = getattr(settings, 'ALLOWED_HOSTS', ['pktamly.io.vn', 'www.pktamly.io.vn','qlpk.io.vn', 'www.qlpk.io.vn'])
    
    # Kiểm tra nếu Host là IP address (chứa số và dấu chấm)
    ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
    if re.match(ip_pattern, host):
        # Nếu là IP, reject
        return jsonify({
            'error': 'Access denied',
            'message': 'Địa chỉ này hiện đang không còn được hoạt động. Vui lòng truy cập https://qlpk.io.vn'
        }), 403
    
    # Kiểm tra nếu Host không nằm trong danh sách allowed domains
    if host not in allowed_domains:
        return jsonify({
            'error': 'Access denied',
            'message': f'Vui lòng truy cập đúng đường dẫn: https://qlpk.io.vn'
        }), 403
    
    return None

# Đăng ký blueprints
app.register_blueprint(auth_router)
app.register_blueprint(check_router)
app.register_blueprint(user_router)
app.register_blueprint(group_router)
app.register_blueprint(user_group_router)
# Register appointment_router TWICE: once for /api/appointments and once for /api (alias for backward compatibility)
app.register_blueprint(appointment_router, url_prefix='/api/appointments')
app.register_blueprint(appointment_router, url_prefix='/api', name='appointments_alias')
app.register_blueprint(patient_router, url_prefix='/api/patients')
app.register_blueprint(notification_router)
app.register_blueprint(notification_api_router)
app.register_blueprint(global_search_router)
app.register_blueprint(service_category_router)
app.register_blueprint(service_router)
app.register_blueprint(package_router)
app.register_blueprint(examination_bp)
app.register_blueprint(examination_management_bp)
app.register_blueprint(attachments_router, url_prefix='/attachments')
app.register_blueprint(examination_details_router, url_prefix='/api')
app.register_blueprint(medicine_router, url_prefix='/api')
app.register_blueprint(medicine_category_router, url_prefix='/api')
app.register_blueprint(medicine_batch_router, url_prefix='/api')
app.register_blueprint(supplier_router, url_prefix='/api')
app.register_blueprint(medicine_transaction_router, url_prefix='/api')
app.register_blueprint(prescription_router, url_prefix='/api/prescription')
app.register_blueprint(public_prescription_bp)
from app.modules.orders.api.chi_dinh import router as chi_dinh_router
app.register_blueprint(chi_dinh_router, url_prefix='/api/chi-dinh')
app.register_blueprint(family_member_router, url_prefix='/api')
app.register_blueprint(appointment_relative_router, url_prefix='/api')
app.register_blueprint(survey_templates_router, url_prefix='/api')
app.register_blueprint(survey_responses_router, url_prefix='/api')
app.register_blueprint(survey_template_management_router, url_prefix='/api')
app.register_blueprint(survey_sessions, url_prefix='/api')
app.register_blueprint(survey_criteria_bp, url_prefix='/api')
app.register_blueprint(payment_waiting_bp)
app.register_blueprint(examination_detail_bp)
app.register_blueprint(occupation_bp, url_prefix='/api')
app.register_blueprint(sexual_orientation_bp, url_prefix='/api')
app.register_blueprint(atc_code_bp, url_prefix='/api')
app.register_blueprint(atc_group_bp, url_prefix='/api')
app.register_blueprint(route_administration_bp, url_prefix='/api')
app.register_blueprint(dosage_form_bp, url_prefix='/api')
app.register_blueprint(icd_router, url_prefix='/api/icd')
app.register_blueprint(text_expansions_bp)
app.register_blueprint(holiday_router)
app.register_blueprint(doctor_busy_schedule_bp, url_prefix='/api')
app.register_blueprint(vietnam_address_bp, url_prefix='/api')
app.register_blueprint(usage_suggestions_bp, url_prefix='/api')
app.register_blueprint(order_catalog_bp, url_prefix='/api')
app.register_blueprint(calendar_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(expense_bp)
app.register_blueprint(shortcut_router)
app.register_blueprint(drug_interaction_bp, url_prefix='/api')
app.register_blueprint(document_bp)
app.register_blueprint(active_ingredient_bp)
app.register_blueprint(allergen_bp)
app.register_blueprint(reference_catalog_bp)

# Thêm logging để debug static files

# Root endpoint
@app.route('/')
def root():
    return redirect(url_for('index_page'))

@app.route('/index.html')
def index_page():
    return render_template('index.html')

@app.route('/login')
def login_redirect():
    return redirect('/login.html')

@app.route('/login.html')
def login_page():
    return render_template('login.html')

@app.route('/group-management.html')
def group_management_page():
    return render_template('group-management.html')

@app.route('/user-management.html')
def user_management_page():
    return render_template('user-management.html')

@app.route('/permission-management.html')
def permission_management_page():
    return render_template('permission-management.html')

@app.route('/appointment-management.html')
def appointment_management_page():
    return render_template('appointment-management.html')

@app.route('/service-category.html')
def service_category_page():
    return render_template('service-category.html')

@app.route('/order-catalog.html')
def order_catalog_page():
    return render_template('order-catalog.html')

@app.route('/service-management.html')
def service_management_page():
    return render_template('service-management.html')

@app.route('/package-management.html')
def package_management_page():
    return render_template('package-management.html')

@app.route('/medicine-management.html')
def medicine_management_page():
    return render_template('medicine-management.html')

@app.route('/medicine-reference-catalog.html')
def medicine_reference_catalog_page():
    return render_template('medicine-reference-catalog.html')

@app.route('/medicine-statistics')
@app.route('/medicine-statistics.html')
def medicine_statistics_page():
    return render_template('medicine-statistics.html')



@app.route('/receptionist-new.html')
def receptionist_new_page():
    return render_template('receptionist-new.html')

@app.route('/doctor-examination.html')
def doctor_examination_page():
    return render_template('doctor-examination.html')

@app.route('/psychologist-examination.html')
def psychologist_examination_page():
    return render_template('psychologist-examination.html')

@app.route('/order-management.html')
def order_management_page():
    return render_template('order-management.html')

@app.route('/payment-waiting.html')
def payment_waiting_page():
    return render_template('payment-waiting.html')

@app.route('/patient-survey.html')
def patient_survey_page():
    return render_template('patient-survey.html')

@app.route('/survey-template-management.html')
def survey_template_management_page():
    return render_template('survey-template-management.html')

@app.route('/survey-template-create.html')
def survey_template_create_page():
    return render_template('survey-template-create.html')

@app.route('/icd-management.html')
def icd_management_page():
    return render_template('icd-management.html')

@app.route('/text-expansion-management.html')
def text_expansion_management_page():
    return render_template('text-expansion-management.html')

@app.route('/holiday-management.html')
def holiday_management_page():
    return render_template('holiday-management.html')

@app.route('/doctor-busy-schedule.html')
def doctor_busy_schedule_page():
    return render_template('doctor-busy-schedule.html')

@app.route('/shortcut-settings.html')
def shortcut_settings_page():
    return render_template('shortcut-settings.html')

@app.route('/drug-interaction.html')
def drug_interaction_page():
    return render_template('drug-interaction.html')

@app.route('/active-ingredient.html')
def active_ingredient_page():
    return render_template('active-ingredient.html')

@app.route('/allergen.html')
def allergen_page():
    return render_template('allergen.html')

@app.route('/document-management.html')
def document_management_page():
    return render_template('document-management.html')

@app.route('/api/token/refresh')
@require_auth
def refresh_token_api(user):
    from app.services.auth import create_access_token
    token = create_access_token({"sub": user.username})
    return jsonify({"token": token})

@app.route('/chi-tieu')
@app.route('/chi-tieu.html')
def chi_tieu_page():
    return render_template('chi-tieu.html')

@app.route('/privacy-policy')
def privacy_policy_page():
    return render_template('privacy-policy.html')

@app.route('/terms-of-service')
def terms_of_service_page():
    return render_template('terms-of-service.html')

@app.route('/health')
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/uploads/<category>/<path:filename>')
def serve_public_upload(category, filename):
    """Serve only public upload categories; medical files stay behind API routes."""
    try:
        from app.utils.upload_storage import public_upload_directory
        return send_from_directory(public_upload_directory(category), filename)
    except ValueError:
        return jsonify({'error': 'Upload category not public'}), 404

# Download file endpoint
@app.route('/downloads/<filename>')
def download_file(filename):
    """Legacy export-download URL backed by the root uploads directory."""
    from app.utils.upload_storage import public_upload_directory

    return send_from_directory(public_upload_directory('downloads'), filename, as_attachment=True)



if __name__ == "__main__":
    socketio.run(
        app,
        host=settings.HOST,
        port=settings.PORT,
        debug=settings.DEBUG
    ) 
