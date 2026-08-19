"""Dashboard API — Revenue & ICD stats"""
from flask import Blueprint, jsonify, request
from sqlalchemy import String, cast, func, extract, text
from app.core.database import get_db
from app.models.examination import Examination, ExaminationStatus
from app.models.appointment import Appointment
from app.models.medicine import Medicine
from app.models.patient import Patient
from app.models.user import User, UserRole
from app.api.auth import require_auth
from app.realtime.presence import get_online_user_ids
from app.utils.referral_source import (
    REFERRAL_SOURCE_BY_KEY,
    REFERRAL_SOURCE_CONFIG,
    get_referral_source_key,
)
from app.utils.upload_storage import normalize_upload_url
import logging

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint('dashboard_api', __name__)

def _get_patient_referral_source_key(patient):
    return get_referral_source_key(patient)


def _parse_dashboard_date_range(default_days=6):
    from datetime import date, timedelta, datetime as dt

    today = date.today()
    from_str = request.args.get('from_date', (today - timedelta(days=default_days)).isoformat())
    to_str = request.args.get('to_date', today.isoformat())
    start = dt.strptime(from_str, '%Y-%m-%d')
    end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())
    return from_str, to_str, start, end

def _parse_referral_source_date_range():
    from datetime import date, datetime as dt

    today = date.today()
    year_start = date(today.year, 1, 1)
    from_str = request.args.get('from_date', year_start.isoformat())
    to_str = request.args.get('to_date', today.isoformat())
    start = dt.strptime(from_str, '%Y-%m-%d')
    end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())
    return from_str, to_str, start, end


def _get_referral_source_cases(db, start, end):
    rows = db.query(Appointment, Patient, Examination)\
        .join(Patient, Appointment.patient_id == Patient.id)\
        .outerjoin(Examination, Examination.appointment_id == Appointment.id)\
        .filter(
            Appointment.appointment_date >= start,
            Appointment.appointment_date <= end,
            Appointment.is_deleted == False,
            Appointment.status.notin_(['CANCELLED', 'NO_SHOW'])
        )\
        .order_by(Appointment.appointment_date.desc())\
        .all()

    cases_by_appointment = {}
    for appt, patient, exam in rows:
        source_raw = (patient.referral_source_detail or patient.referral_source or '').strip()
        source_key = _get_patient_referral_source_key(patient)
        if not source_key:
            continue

        case = cases_by_appointment.get(appt.id)
        if not case:
            source_cfg = REFERRAL_SOURCE_BY_KEY[source_key]
            case = {
                'appointment_id': appt.id,
                'patient_id': patient.id,
                'patient_name': patient.full_name or '',
                'phone': patient.phone or '',
                'exam_date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'exam_time': appt.appointment_date.strftime('%H:%M') if appt.appointment_date else '',
                'main_reason': '',
                'source_key': source_key,
                'source_label': source_cfg['label'],
                'source_value': source_raw or source_cfg['label'],
            }
            cases_by_appointment[appt.id] = case

        if exam and exam.main_reason and not case['main_reason']:
            case['main_reason'] = exam.main_reason

    return list(cases_by_appointment.values())

@dashboard_bp.route('/api/dashboard/service-summary', methods=['GET'])
@require_auth
def get_service_summary(user):
    """Tổng hợp dịch vụ / thuốc theo khoảng thời gian đang chọn"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        from app.models.service import Service
        from app.models.prescription import Prescription, PrescriptionItem

        mode = request.args.get('mode', 'week')
        year_str = request.args.get('year', '')

        # Build time bounds — support from_date/to_date or legacy mode
        today = date.today()
        from_str = request.args.get('from_date', '')
        to_str = request.args.get('to_date', '')
        if from_str and to_str:
            start = dt.strptime(from_str, '%Y-%m-%d')
            end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())
        elif mode == 'month':
            target_year = int(year_str) if year_str else today.year
            start = dt(target_year, 1, 1)
            end = dt(target_year, 12, 31, 23, 59, 59)
        else:  # week
            week_start = today - timedelta(days=6)
            start = dt.combine(week_start, dt.min.time())
            end = dt.combine(today, dt.max.time())

        # --- Service ranking ---
        svc_rows = db.query(
            Service.name.label('name'),
            func.count(Appointment.id).label('count'),
            func.sum(Service.default_price).label('revenue')
        ).join(
            Appointment, Appointment.service_id == Service.id
        ).filter(
            Appointment.appointment_date >= start,
            Appointment.appointment_date <= end,
            Appointment.status == 'CONFIRMED',
            Appointment.is_deleted == False
        ).group_by(Service.name).order_by(func.sum(Service.default_price).desc()).all()

        # --- Medicine ranking ---
        medicine_group_key = func.coalesce(cast(PrescriptionItem.medicine_id, String), PrescriptionItem.medicine_name)
        med_rows = db.query(
            func.coalesce(func.max(Medicine.name), func.max(PrescriptionItem.medicine_name)).label('name'),
            func.sum(PrescriptionItem.quantity).label('count'),
            func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).label('revenue')
        ).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).outerjoin(
            Medicine, PrescriptionItem.medicine_id == Medicine.id
        ).filter(
            Appointment.appointment_date >= start,
            Appointment.appointment_date <= end
        ).group_by(medicine_group_key).order_by(
            func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).desc()
        ).all()

        return jsonify({
            'mode': mode,
            'services': [{'name': r.name, 'count': int(r.count), 'revenue': float(r.revenue)} for r in svc_rows],
            'medicines': [{'name': r.name, 'count': float(r.count), 'revenue': float(r.revenue)} for r in med_rows],
        }), 200

    except Exception as e:
        logger.error(f"Error getting service summary: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/export-icd-excel', methods=['GET'])
@require_auth
def export_icd_excel(user):
    """Xuất Excel thống kê ICD theo khoảng ngày"""
    import io
    from datetime import date, timedelta, datetime as dt
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        from flask import send_file
    except ImportError:
        return jsonify({'error': 'openpyxl chưa được cài đặt'}), 500

    db = next(get_db())
    try:
        from app.models.icd import ICD
        today = date.today()
        from_str = request.args.get('from_date', (today - timedelta(days=6)).isoformat())
        to_str = request.args.get('to_date', today.isoformat())
        start = dt.strptime(from_str, '%Y-%m-%d')
        end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())

        # Thống kê ICD bằng SQL trực tiếp
        query_sql = """
            SELECT 
                icd.icd_code, 
                icd.disease_name, 
                COUNT(e.id) AS cnt
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.id
            CROSS JOIN LATERAL jsonb_array_elements_text(e.diagnosis) AS elem
            JOIN icd ON icd.id = elem::int
            WHERE e.diagnosis IS NOT NULL 
              AND e.diagnosis != '[]'::jsonb
              AND a.appointment_date >= :start 
              AND a.appointment_date <= :end
              AND (icd.is_deleted IS NULL OR icd.is_deleted = false)
            GROUP BY icd.icd_code, icd.disease_name
            ORDER BY cnt DESC
        """
        results = db.execute(text(query_sql), {"start": start, "end": end}).fetchall()

        total = sum(r.cnt for r in results) or 1
        items = []
        for r in results:
            items.append({
                'code': r.icd_code,
                'name': r.disease_name,
                'count': r.cnt
            })

        def mk_border():
            s = Side(style='thin', color='D1D5DB')
            return Border(left=s, right=s, top=s, bottom=s)

        wb = openpyxl.Workbook()

        # ===== Sheet 1: Tổng hợp =====
        ws = wb.active
        ws.title = "Tổng hợp"

        period = f"{dt.strptime(from_str,'%Y-%m-%d').strftime('%d/%m/%Y')} – {dt.strptime(to_str,'%Y-%m-%d').strftime('%d/%m/%Y')}"
        ws.append([f"Thống kê bệnh theo ICD — {period}"])
        ws['A1'].font = Font(bold=True, size=13, color="1D4ED8")
        ws.append([])
        ws.append(["STT", "Mã ICD", "Tên bệnh", "Số ca", "Tỷ lệ %"])

        hdr_fill = PatternFill("solid", fgColor="1D4ED8")
        for c in range(1, 6):
            cell = ws.cell(row=3, column=c)
            cell.font = Font(bold=True, color="FFFFFF", size=11)
            cell.fill = hdr_fill
            cell.alignment = Alignment(horizontal='center', vertical='center')
            cell.border = mk_border()
        ws.row_dimensions[3].height = 22

        z_fill = PatternFill("solid", fgColor="F8FAFC")
        w_fill = PatternFill("solid", fgColor="FFFFFF")
        for i, item in enumerate(items, 1):
            row_i = i + 3
            pct = round(item['count'] / total * 100, 1)
            row_data = [i, item['code'], item['name'], item['count'], pct]
            fill = z_fill if i % 2 == 0 else w_fill
            for c, v in enumerate(row_data, 1):
                cell = ws.cell(row=row_i, column=c, value=v)
                cell.border = mk_border()
                cell.fill = fill
                cell.alignment = Alignment(vertical='center')
            ws.cell(row=row_i, column=4).number_format = '#,##0'
            ws.cell(row=row_i, column=5).number_format = '0.0'

        tr = len(items) + 4
        ws.cell(row=tr, column=3, value="TỔNG CỘNG").font = Font(bold=True)
        ws.cell(row=tr, column=4, value=sum(i['count'] for i in items)).font = Font(bold=True)
        ws.cell(row=tr, column=4).number_format = '#,##0'

        for col, w in [('A',6),('B',12),('C',40),('D',10),('E',10)]:
            ws.column_dimensions[col].width = w

        # ===== Sheet 2: Chi tiết ca khám nhóm theo ICD =====
        from app.models.patient import Patient
        from app.models.user import User

        all_exams = db.query(
            Examination, Patient, User, Appointment
        ).join(Appointment, Examination.appointment_id == Appointment.id)\
         .join(Patient, Examination.patient_id == Patient.id)\
         .join(User, Examination.doctor_id == User.id)\
         .filter(
            Examination.diagnosis.isnot(None), 
            Examination.diagnosis != text("'[]'::jsonb"),
            Appointment.appointment_date >= start, Appointment.appointment_date <= end
         ).order_by(Appointment.appointment_date.desc()).all()

        icd_all = db.query(ICD).filter(ICD.is_deleted == False).all()
        icd_map = {icd.id: icd for icd in icd_all}

        # Group exams by ICD code
        grouped = {}
        for exam, patient, doctor, appt in all_exams:
            if not exam.diagnosis or not isinstance(exam.diagnosis, list):
                continue
            for icd_id in exam.diagnosis:
                if icd_id not in icd_map:
                    continue
                icd = icd_map[icd_id]
                code = icd.icd_code
                name = icd.disease_name
                if code not in grouped:
                    grouped[code] = {'name': name, 'cases': []}
                grouped[code]['cases'].append({
                    'patient': patient.full_name,
                    'doctor': doctor.full_name,
                    'date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                    'time': exam.examination_date.strftime('%H:%M') if exam.examination_date else ''
                })

        # Sort by count desc (match sheet 1 order)
        sorted_codes = sorted(grouped.keys(), key=lambda c: len(grouped[c]['cases']), reverse=True)

        ws2 = wb.create_sheet("Chi tiết ca khám")
        ws2.append([f"Chi tiết ca khám theo ICD — {period}"])
        ws2['A1'].font = Font(bold=True, size=13, color="7C3AED")
        ws2.append([])

        row_num = 3
        grp_fill = PatternFill("solid", fgColor="EDE9FE")
        detail_hdr_fill = PatternFill("solid", fgColor="F5F3FF")

        for code in sorted_codes:
            grp = grouped[code]
            case_count = len(grp['cases'])

            # Group header row
            for c, v in enumerate([f"{code} — {grp['name']}", '', '', f"{case_count} ca", ''], 1):
                cell = ws2.cell(row=row_num, column=c, value=v)
                cell.font = Font(bold=True, size=11, color="5B21B6")
                cell.fill = grp_fill
                cell.border = mk_border()
            ws2.merge_cells(start_row=row_num, start_column=1, end_row=row_num, end_column=3)
            row_num += 1

            # Detail header
            for c, v in enumerate(["STT", "Bệnh nhân", "Bác sĩ", "Ngày khám", "Giờ"], 1):
                cell = ws2.cell(row=row_num, column=c, value=v)
                cell.font = Font(bold=True, size=10, color="64748B")
                cell.fill = detail_hdr_fill
                cell.border = mk_border()
                cell.alignment = Alignment(horizontal='center', vertical='center')
            row_num += 1

            # Detail rows
            for j, case in enumerate(grp['cases'], 1):
                fill = z_fill if j % 2 == 0 else w_fill
                for c, v in enumerate([j, case['patient'], case['doctor'], case['date'], case['time']], 1):
                    cell = ws2.cell(row=row_num, column=c, value=v)
                    cell.border = mk_border()
                    cell.fill = fill
                    cell.alignment = Alignment(vertical='center')
                row_num += 1

            row_num += 1  # blank row between groups

        for col, w in [('A',6),('B',25),('C',30),('D',12),('E',8)]:
            ws2.column_dimensions[col].width = w

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        fname = f"icd_{from_str}_{to_str}.xlsx"
        return send_file(output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True, download_name=fname)

    except Exception as e:
        logger.error(f"Export ICD excel error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/icd-detail', methods=['GET'])
@require_auth
def get_icd_detail(user):
    """Chi tiết các ca khám theo mã ICD trong khoảng ngày"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        from app.models.patient import Patient
        from app.models.user import User

        icd_code = request.args.get('icd_code', '')
        today = date.today()
        from_str = request.args.get('from_date', (today - timedelta(days=6)).isoformat())
        to_str = request.args.get('to_date', today.isoformat())
        start = dt.strptime(from_str, '%Y-%m-%d')
        end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())

        from app.models.icd import ICD
        # 1. Tìm ICD theo icd_code
        icd_rec = db.query(ICD).filter(ICD.icd_code == icd_code, ICD.is_deleted == False).first() if icd_code != '—' else None

        # 2. Query ca khám
        query = db.query(Examination, Patient, User, Appointment)\
                  .join(Appointment, Examination.appointment_id == Appointment.id)\
                  .join(Patient, Examination.patient_id == Patient.id)\
                  .join(User, Examination.doctor_id == User.id)\
                  .filter(
                      Examination.diagnosis.isnot(None),
                      Appointment.appointment_date >= start,
                      Appointment.appointment_date <= end
                  )
                  
        if icd_code != '—' and icd_rec:
            # Lọc các bản ghi chứa icd_rec.id trong mảng JSONB diagnosis
            query = query.filter(Examination.diagnosis.contains([icd_rec.id]))
            
        rows = query.order_by(Appointment.appointment_date.desc()).all()

        items = []
        from app.utils.examination_utils import resolve_diagnosis_to_str
        for exam, patient, doctor, appt in rows:
            diag_str = resolve_diagnosis_to_str(db, exam.diagnosis)
            items.append({
                'patient_name': patient.full_name,
                'phone': patient.phone_number if hasattr(patient, 'phone_number') else '',
                'doctor_name': doctor.full_name,
                'exam_date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'diagnosis': diag_str,
                'exam_time': exam.examination_date.strftime('%H:%M') if exam.examination_date else ''
            })

        return jsonify({'items': items, 'icd_code': icd_code}), 200

    except Exception as e:
        logger.error(f"Error getting ICD detail: {e}", exc_info=True)
        return jsonify({'error': str(e), 'items': []}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/export-excel', methods=['GET'])
@require_auth
def export_dashboard_excel(user):
    """Xuất Excel tổng hợp doanh thu dịch vụ và thuốc"""
    import io
    from datetime import date, timedelta, datetime as dt
    from app.models.service import Service
    from app.models.prescription import Prescription, PrescriptionItem
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        from flask import send_file
    except ImportError:
        return jsonify({'error': 'openpyxl chưa được cài đặt'}), 500

    db = next(get_db())
    try:
        today = date.today()
        from_str = request.args.get('from_date', '')
        to_str = request.args.get('to_date', '')

        if from_str and to_str:
            start = dt.strptime(from_str, '%Y-%m-%d')
            end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())
            period_label = f"{dt.strptime(from_str,'%Y-%m-%d').strftime('%d/%m/%Y')} – {dt.strptime(to_str,'%Y-%m-%d').strftime('%d/%m/%Y')}"
        else:
            mode = request.args.get('mode', 'week')
            year_str = request.args.get('year', '')
            if mode == 'month':
                target_year = int(year_str) if year_str else today.year
                start = dt(target_year, 1, 1)
                end = dt(target_year, 12, 31, 23, 59, 59)
                period_label = f"Năm {target_year}"
            else:
                week_start = today - timedelta(days=6)
                start = dt.combine(week_start, dt.min.time())
                end = dt.combine(today, dt.max.time())
                period_label = f"{week_start.strftime('%d/%m/%Y')} – {today.strftime('%d/%m/%Y')}"

        def make_header(ws, cols, color="0F766E"):
            thin = Side(style='thin', color='000000')
            brd = Border(left=thin, right=thin, top=thin, bottom=thin)
            for c, v in enumerate(cols, 1):
                cell = ws.cell(row=1, column=c, value=v)
                cell.font = Font(name='Arial', bold=True, color="FFFFFF", size=11)
                cell.fill = PatternFill("solid", fgColor=color)
                cell.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
                cell.border = brd

        def write_row(ws, r, data):
            thin = Side(style='thin', color='000000')
            brd = Border(left=thin, right=thin, top=thin, bottom=thin)
            data_font = Font(name='Arial', size=10)
            for c, v in enumerate(data, 1):
                cell = ws.cell(row=r, column=c, value=v)
                cell.border = brd
                cell.font = data_font
                cell.alignment = Alignment(vertical='center')

        wb = openpyxl.Workbook()

        # ===== Sheet 1: Dịch vụ =====
        svc_rows = db.query(
            Service.name, func.count(Appointment.id).label('cnt'),
            func.sum(Service.default_price).label('rev')
        ).join(Appointment, Appointment.service_id == Service.id)\
         .filter(Appointment.appointment_date >= start, Appointment.appointment_date <= end,
                 Appointment.status == 'CONFIRMED', Appointment.is_deleted == False)\
         .group_by(Service.name).order_by(func.sum(Service.default_price).desc()).all()

        ws1 = wb.active
        ws1.title = "Dịch vụ"
        ws1['A1'] = f"Doanh thu dịch vụ — {period_label}"
        ws1['A1'].font = Font(name='Arial', bold=True, size=13, color="0F766E")
        ws1.insert_rows(1)  # push header down then rebuild
        ws1.delete_rows(1)
        # Row 1 = title, row 2 = blank, row 3 = column header
        ws1.append([f"Doanh thu dịch vụ — {period_label}"])
        ws1['A1'].font = Font(name='Arial', bold=True, size=13, color="0F766E")
        ws1.append([])

        make_header(ws1, ["STT", "Tên dịch vụ", "Số ca", "Doanh thu (đ)", "Tỷ lệ %"], "0F766E")
        # We override row 3 because append wrote to rows 1,2 already; need to write row 3 headers:
        ws1.delete_rows(3)
        ws1.append(["STT", "Tên dịch vụ", "Số ca", "Doanh thu (đ)", "Tỷ lệ %"])
        make_header(ws1, ["STT", "Tên dịch vụ", "Số ca", "Doanh thu (đ)", "Tỷ lệ %"], "0F766E")

        total_svc = sum(float(r.rev or 0) for r in svc_rows)
        for i, r in enumerate(svc_rows, 1):
            rev = float(r.rev or 0)
            pct = round(rev / total_svc * 100, 2) if total_svc else 0
            row_i = i + 3
            write_row(ws1, row_i, [i, r.name, int(r.cnt), rev, pct])
            ws1.cell(row=row_i, column=4).number_format = '#,##0'
            ws1.cell(row=row_i, column=5).number_format = '0.00'
        tr = len(svc_rows) + 4
        ws1.cell(row=tr, column=2, value="TỔNG CỘNG").font = Font(name='Arial', bold=True)
        ws1.cell(row=tr, column=4, value=total_svc).font = Font(name='Arial', bold=True)
        ws1.cell(row=tr, column=4).number_format = '#,##0'
        for col, w in [('A',6),('B',32),('C',10),('D',18),('E',10)]:
            ws1.column_dimensions[col].width = w
        ws1.row_dimensions[3].height = 22

        # ===== Sheet 2: Thuốc =====
        medicine_group_key = func.coalesce(cast(PrescriptionItem.medicine_id, String), PrescriptionItem.medicine_name)
        med_rows = db.query(
            func.coalesce(func.max(Medicine.name), func.max(PrescriptionItem.medicine_name)).label('name'),
            func.sum(PrescriptionItem.quantity).label('cnt'),
            func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).label('rev')
        ).join(Prescription, PrescriptionItem.prescription_id == Prescription.id)\
         .join(Appointment, Prescription.appointment_id == Appointment.id)\
         .outerjoin(Medicine, PrescriptionItem.medicine_id == Medicine.id)\
         .filter(Appointment.appointment_date >= start, Appointment.appointment_date <= end)\
         .group_by(medicine_group_key)\
         .order_by(func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).desc()).all()

        ws2 = wb.create_sheet("Thuốc")
        ws2.append([f"Doanh thu thuốc — {period_label}"])
        ws2['A1'].font = Font(name='Arial', bold=True, size=13, color="0F766E")
        ws2.append([])
        ws2.append(["STT", "Tên thuốc", "Số lượng", "Doanh thu (đ)", "Tỷ lệ %"])
        make_header(ws2, ["STT", "Tên thuốc", "Số lượng", "Doanh thu (đ)", "Tỷ lệ %"], "0F766E")

        total_med = sum(float(r.rev or 0) for r in med_rows)
        for i, r in enumerate(med_rows, 1):
            rev = float(r.rev or 0)
            pct = round(rev / total_med * 100, 2) if total_med else 0
            row_i = i + 3
            write_row(ws2, row_i, [i, r.name, float(r.cnt), rev, pct])
            ws2.cell(row=row_i, column=4).number_format = '#,##0'
            ws2.cell(row=row_i, column=5).number_format = '0.00'
        tr2 = len(med_rows) + 4
        ws2.cell(row=tr2, column=2, value="TỔNG CỘNG").font = Font(name='Arial', bold=True)
        ws2.cell(row=tr2, column=4, value=total_med).font = Font(name='Arial', bold=True)
        ws2.cell(row=tr2, column=4).number_format = '#,##0'
        for col, w in [('A',6),('B',36),('C',12),('D',18),('E',10)]:
            ws2.column_dimensions[col].width = w
        ws2.row_dimensions[3].height = 22

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"doanh_thu_{from_str or today.strftime('%Y-%m-%d')}_{to_str or today.strftime('%Y-%m-%d')}.xlsx"
        return send_file(output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True, download_name=filename)

    except Exception as e:
        logger.error(f"Export excel error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/revenue/detail', methods=['GET'])
@require_auth
def get_revenue_detail(user):
    """Trích xuất chi tiết doanh thu theo dịch vụ hoặc thuốc cho 1 ngày/tháng"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        from app.models.service import Service
        from app.models.prescription import Prescription, PrescriptionItem

        mode = request.args.get('mode', 'week')
        rev_type = request.args.get('type', 'service')
        date_key = request.args.get('date_key', '')
        year_str = request.args.get('year', '')

        # 1. Parse date_key to start and end datetime bounds
        start = None
        end = None

        if mode == 'month':
            # date_key comes as "Tháng 3"
            target_year = int(year_str) if year_str else date.today().year
            try:
                m = int(date_key.replace('Tháng ', '').strip())
            except ValueError:
                return jsonify({'error': 'Invalid date_key format'}), 400
            
            if m < 12:
                start = dt(target_year, m, 1)
                end = dt(target_year, m + 1, 1) - timedelta(seconds=1)
            else:
                start = dt(target_year, 12, 1)
                end = dt(target_year, 12, 31, 23, 59, 59)

        else: # week mode
            # date_key comes as "8/3"
            try:
                parts = date_key.split('/')
                day = int(parts[0])
                month = int(parts[1])
                target_year = date.today().year
                
                # Handling year wrap-around for 'week' mode if viewing late Dec / early Jan
                today = date.today()
                if today.month == 1 and month == 12:
                    target_year -= 1
                elif today.month == 12 and month == 1:
                    target_year += 1

                target_date = date(target_year, month, day)
                start = dt.combine(target_date, dt.min.time())
                end = dt.combine(target_date, dt.max.time())
            except (ValueError, IndexError):
                return jsonify({'error': 'Invalid date_key format'}), 400

        items = []
        total_sum = 0

        # 2. Query Data based on rev_type
        if rev_type == 'service':
            results = db.query(
                Service.name.label('name'),
                func.count(Appointment.id).label('quantity'),
                func.sum(Service.default_price).label('total_amount')
            ).join(
                Appointment, Appointment.service_id == Service.id
            ).filter(
                Appointment.appointment_date >= start,
                Appointment.appointment_date <= end,
                Appointment.status == 'CONFIRMED',
                Appointment.is_deleted == False
            ).group_by(
                Service.name
            ).order_by(
                func.sum(Service.default_price).desc()
            ).all()

            for r in results:
                items.append({
                    'name': r.name,
                    'quantity': r.quantity,
                    'total_amount': float(r.total_amount)
                })
                total_sum += float(r.total_amount)

        elif rev_type == 'medicine':
            medicine_group_key = func.coalesce(cast(PrescriptionItem.medicine_id, String), PrescriptionItem.medicine_name)
            results = db.query(
                func.coalesce(func.max(Medicine.name), func.max(PrescriptionItem.medicine_name)).label('name'),
                func.sum(PrescriptionItem.quantity).label('quantity'),
                func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).label('total_amount'),
                func.max(PrescriptionItem.unit).label('unit')
            ).join(
                Prescription, PrescriptionItem.prescription_id == Prescription.id
            ).join(
                Appointment, Prescription.appointment_id == Appointment.id
            ).outerjoin(
                Medicine, PrescriptionItem.medicine_id == Medicine.id
            ).filter(
                Appointment.appointment_date >= start,
                Appointment.appointment_date <= end
            ).group_by(
                medicine_group_key
            ).order_by(
                func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity).desc()
            ).all()

            for r in results:
                items.append({
                    'name': r.name,
                    'quantity': float(r.quantity),
                    'unit': r.unit or 'Viên',
                    'total_amount': float(r.total_amount)
                })
                total_sum += float(r.total_amount)
        
        else:
            return jsonify({'error': 'Invalid type parameter'}), 400

        return jsonify({
            'mode': mode,
            'type': rev_type,
            'date_key': date_key,
            'items': items,
            'total_sum': total_sum
        }), 200

    except Exception as e:
        logger.error(f"Error getting revenue detail: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/revenue', methods=['GET'])
@require_auth
def get_revenue(user):
    """Doanh thu = tiền thuốc + tiền dịch vụ, theo ngày trong khoảng from_date → to_date"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        from app.models.prescription import Prescription, PrescriptionItem

        today = date.today()
        from_str = request.args.get('from_date', '')
        to_str = request.args.get('to_date', '')

        if from_str and to_str:
            start_date = dt.strptime(from_str, '%Y-%m-%d').date()
            end_date = dt.strptime(to_str, '%Y-%m-%d').date()
        else:
            # legacy fallback
            mode = request.args.get('mode', 'week')
            if mode == 'month':
                year = request.args.get('year', type=int) or today.year
                start_date = date(year, 1, 1)
                end_date = date(year, 12, 31)
            else:
                start_date = today - timedelta(days=6)
                end_date = today

        def get_medicine_revenue(s, e):
            result = db.query(
                func.coalesce(func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity), 0)
            ).join(Prescription, PrescriptionItem.prescription_id == Prescription.id)\
             .join(Appointment, Prescription.appointment_id == Appointment.id)\
             .filter(Appointment.appointment_date >= s, Appointment.appointment_date <= e).scalar() or 0
            return float(result)

        def get_service_revenue(s, e):
            from app.models.service import Service
            result = db.query(
                func.coalesce(func.sum(Service.default_price), 0)
            ).join(Appointment, Appointment.service_id == Service.id)\
             .filter(Appointment.appointment_date >= s, Appointment.appointment_date <= e,
                     Appointment.status == 'CONFIRMED', Appointment.is_deleted == False).scalar() or 0
            return float(result)

        items = []
        d = start_date
        while d <= end_date:
            ds = dt.combine(d, dt.min.time())
            de = dt.combine(d, dt.max.time())
            med = get_medicine_revenue(ds, de)
            svc = get_service_revenue(ds, de)
            items.append({'label': f'{d.day}/{d.month}', 'total': med + svc, 'medicine': med, 'service': svc})
            d += timedelta(days=1)

        return jsonify({'items': items}), 200

    except Exception as e:
        logger.error(f"Error getting revenue: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/exam-today', methods=['GET'])
@require_auth
def get_exam_today(user):
    """Số ca khám hôm nay: đã khám vs chưa khám"""
    db = next(get_db())
    try:
        from datetime import date, datetime as dt
        today = date.today()
        today_start = dt.combine(today, dt.min.time())
        today_end = dt.combine(today, dt.max.time())

        # Count appointments today that have examinations
        from sqlalchemy.orm import joinedload
        appointments_today = db.query(Appointment).filter(
            Appointment.appointment_date >= today_start,
            Appointment.appointment_date <= today_end,
            Appointment.is_deleted == False,
            Appointment.status.notin_(['CANCELLED', 'NO_SHOW'])
        ).all()

        examined = 0
        not_examined = 0
        for appt in appointments_today:
            # Check if any examination is COMPLETED
            exams = db.query(Examination).filter(
                Examination.appointment_id == appt.id,
                Examination.status == ExaminationStatus.COMPLETED
            ).first()
            if exams:
                examined += 1
            else:
                not_examined += 1

        return jsonify({
            'examined': examined,
            'not_examined': not_examined,
            'total': examined + not_examined
        }), 200

    except Exception as e:
        logger.error(f"Error getting exam today: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/top-icd', methods=['GET'])
@require_auth
def get_top_icd(user):
    """Thống kê ICD theo khoảng ngày"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        from app.models.icd import ICD

        today = date.today()
        default_from = (today - timedelta(days=6)).isoformat()
        default_to = today.isoformat()

        from_str = request.args.get('from_date', default_from)
        to_str = request.args.get('to_date', default_to)

        start = dt.strptime(from_str, '%Y-%m-%d')
        end = dt.combine(dt.strptime(to_str, '%Y-%m-%d').date(), dt.max.time())

        # Thống kê ICD bằng SQL trực tiếp
        query_sql = """
            SELECT 
                icd.icd_code, 
                icd.disease_name, 
                COUNT(e.id) AS count
            FROM examinations e
            JOIN appointments a ON e.appointment_id = a.id
            CROSS JOIN LATERAL jsonb_array_elements_text(e.diagnosis) AS elem
            JOIN icd ON icd.id = elem::int
            WHERE e.diagnosis IS NOT NULL 
              AND jsonb_typeof(e.diagnosis) = 'array'
              AND e.diagnosis != '[]'::jsonb
              AND a.appointment_date >= :start 
              AND a.appointment_date <= :end
              AND (icd.is_deleted IS NULL OR icd.is_deleted = false)
            GROUP BY icd.icd_code, icd.disease_name
            ORDER BY count DESC
        """
        results = db.execute(text(query_sql), {"start": start, "end": end}).fetchall()

        total = sum(r.count for r in results) or 1
        items = []
        for r in results:
            items.append({
                'icd_code': r.icd_code,
                'disease_name': r.disease_name,
                'count': r.count,
                'percentage': round(r.count / total * 100, 1)
            })

        items.sort(key=lambda x: x['count'], reverse=True)
        return jsonify({'items': items}), 200

    except Exception as e:
        logger.error(f"Error getting top ICD: {e}")
        return jsonify({'error': str(e), 'items': []}), 500
    finally:
        db.close()



@dashboard_bp.route('/api/dashboard/referral-sources', methods=['GET'])
@require_auth
def get_referral_sources(user):
    """Thống kê lượt khám theo nguồn giới thiệu của bệnh nhân."""
    db = next(get_db())
    try:
        from_str, to_str, start, end = _parse_referral_source_date_range()
        cases = _get_referral_source_cases(db, start, end)

        counts = {item['key']: 0 for item in REFERRAL_SOURCE_CONFIG}
        for case in cases:
            counts[case['source_key']] += 1

        items = []
        for item in REFERRAL_SOURCE_CONFIG:
            items.append({
                'key': item['key'],
                'label': item['label'],
                'color': item['color'],
                'count': counts[item['key']],
            })

        return jsonify({
            'from_date': from_str,
            'to_date': to_str,
            'total': sum(counts.values()),
            'items': items,
        }), 200

    except Exception as e:
        logger.error(f"Error getting referral source stats: {e}", exc_info=True)
        return jsonify({'error': str(e), 'items': []}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/referral-source-detail', methods=['GET'])
@require_auth
def get_referral_source_detail(user):
    """Danh sách ca khám thuộc một nguồn giới thiệu."""
    db = next(get_db())
    try:
        source_key = request.args.get('source', '').strip()
        if source_key not in REFERRAL_SOURCE_BY_KEY:
            return jsonify({'error': 'Nguồn giới thiệu không hợp lệ', 'items': []}), 400

        from_str, to_str, start, end = _parse_referral_source_date_range()
        cases = [
            case for case in _get_referral_source_cases(db, start, end)
            if case['source_key'] == source_key
        ]

        source_cfg = REFERRAL_SOURCE_BY_KEY[source_key]
        return jsonify({
            'from_date': from_str,
            'to_date': to_str,
            'source': source_key,
            'source_label': source_cfg['label'],
            'items': cases,
            'total': len(cases),
        }), 200

    except Exception as e:
        logger.error(f"Error getting referral source detail: {e}", exc_info=True)
        return jsonify({'error': str(e), 'items': []}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/export-referral-source-excel', methods=['GET'])
@require_auth
def export_referral_source_excel(user):
    """Xuất Excel thống kê nguồn giới thiệu theo khoảng ngày."""
    import io
    from datetime import datetime as dt
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
        from flask import send_file
    except ImportError:
        return jsonify({'error': 'openpyxl chưa được cài đặt'}), 500

    db = next(get_db())
    try:
        from_str, to_str, start, end = _parse_referral_source_date_range()
        cases = _get_referral_source_cases(db, start, end)

        counts = {item['key']: 0 for item in REFERRAL_SOURCE_CONFIG}
        grouped_cases = {item['key']: [] for item in REFERRAL_SOURCE_CONFIG}
        for case in cases:
            counts[case['source_key']] += 1
            grouped_cases[case['source_key']].append(case)

        total = sum(counts.values())
        pct_base = total or 1
        period = f"{dt.strptime(from_str, '%Y-%m-%d').strftime('%d/%m/%Y')} – {dt.strptime(to_str, '%Y-%m-%d').strftime('%d/%m/%Y')}"

        def mk_border():
            side = Side(style='thin', color='D1D5DB')
            return Border(left=side, right=side, top=side, bottom=side)

        wb = openpyxl.Workbook()
        hdr_fill = PatternFill('solid', fgColor='0F766E')
        group_fill = PatternFill('solid', fgColor='CCFBF1')
        detail_hdr_fill = PatternFill('solid', fgColor='F0FDF4')
        z_fill = PatternFill('solid', fgColor='F8FAFC')
        w_fill = PatternFill('solid', fgColor='FFFFFF')

        ws = wb.active
        ws.title = 'Tổng hợp'
        ws.append([f'Thống kê nguồn giới thiệu — {period}'])
        ws['A1'].font = Font(bold=True, size=13, color='0F766E')
        ws.append([])
        ws.append(['STT', 'Nguồn giới thiệu', 'Số lượt khám', 'Tỷ lệ %'])

        for col in range(1, 5):
            cell = ws.cell(row=3, column=col)
            cell.font = Font(bold=True, color='FFFFFF', size=11)
            cell.fill = hdr_fill
            cell.border = mk_border()
            cell.alignment = Alignment(horizontal='center', vertical='center')

        for index, cfg in enumerate(REFERRAL_SOURCE_CONFIG, 1):
            row_idx = index + 3
            count = counts[cfg['key']]
            percentage = round(count / pct_base * 100, 1)
            fill = z_fill if index % 2 == 0 else w_fill
            for col, value in enumerate([index, cfg['label'], count, percentage], 1):
                cell = ws.cell(row=row_idx, column=col, value=value)
                cell.border = mk_border()
                cell.fill = fill
                cell.alignment = Alignment(vertical='center')
            ws.cell(row=row_idx, column=3).number_format = '#,##0'
            ws.cell(row=row_idx, column=4).number_format = '0.0'

        total_row = len(REFERRAL_SOURCE_CONFIG) + 4
        ws.cell(row=total_row, column=2, value='TỔNG CỘNG').font = Font(bold=True)
        ws.cell(row=total_row, column=3, value=total).font = Font(bold=True)
        ws.cell(row=total_row, column=3).number_format = '#,##0'
        for col in range(1, 5):
            ws.cell(row=total_row, column=col).border = mk_border()

        for col, width in [('A', 8), ('B', 34), ('C', 14), ('D', 12)]:
            ws.column_dimensions[col].width = width

        ws2 = wb.create_sheet('Chi tiết')
        ws2.append([f'Chi tiết lượt khám theo nguồn giới thiệu — {period}'])
        ws2['A1'].font = Font(bold=True, size=13, color='0F766E')
        ws2.append([])

        row_num = 3
        detail_headers = ['STT', 'Bệnh nhân', 'Điện thoại', 'Ngày khám', 'Giờ', 'Lý do khám', 'Nguồn nhập']
        for cfg in REFERRAL_SOURCE_CONFIG:
            source_cases = grouped_cases[cfg['key']]
            group_title = f"{cfg['label']} — {len(source_cases)} lượt khám"
            for col in range(1, 8):
                cell = ws2.cell(row=row_num, column=col, value=group_title if col == 1 else '')
                cell.font = Font(bold=True, size=11, color='0F766E')
                cell.fill = group_fill
                cell.border = mk_border()
                cell.alignment = Alignment(vertical='center')
            ws2.merge_cells(start_row=row_num, start_column=1, end_row=row_num, end_column=7)
            row_num += 1

            for col, value in enumerate(detail_headers, 1):
                cell = ws2.cell(row=row_num, column=col, value=value)
                cell.font = Font(bold=True, size=10, color='64748B')
                cell.fill = detail_hdr_fill
                cell.border = mk_border()
                cell.alignment = Alignment(horizontal='center', vertical='center')
            row_num += 1

            if source_cases:
                for index, case in enumerate(source_cases, 1):
                    fill = z_fill if index % 2 == 0 else w_fill
                    row_values = [
                        index,
                        case['patient_name'],
                        case['phone'],
                        case['exam_date'],
                        case['exam_time'],
                        case['main_reason'] or '—',
                        case['source_value'] or case['source_label'],
                    ]
                    for col, value in enumerate(row_values, 1):
                        cell = ws2.cell(row=row_num, column=col, value=value)
                        cell.border = mk_border()
                        cell.fill = fill
                        cell.alignment = Alignment(vertical='top', wrap_text=col in (6, 7))
                    row_num += 1
            else:
                for col in range(1, 8):
                    cell = ws2.cell(row=row_num, column=col, value='Không có dữ liệu' if col == 2 else '')
                    cell.border = mk_border()
                    cell.fill = w_fill
                    cell.alignment = Alignment(vertical='center')
                row_num += 1

            row_num += 1

        for col, width in [('A', 8), ('B', 26), ('C', 16), ('D', 14), ('E', 10), ('F', 44), ('G', 30)]:
            ws2.column_dimensions[col].width = width

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"nguon_gioi_thieu_{from_str}_{to_str}.xlsx"
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename,
        )

    except Exception as e:
        logger.error(f"Export referral source excel error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/staff-online', methods=['GET'])
@require_auth
def get_staff_online(user):
    """Trạng thái online của bác sĩ / tâm lý gia / lễ tân"""
    db = next(get_db())
    try:
        online_user_ids = get_online_user_ids()

        staff = db.query(User).filter(
            User.role.in_([UserRole.DOCTOR, UserRole.PSYCHOLOGIST, UserRole.STAFF]),
            User.is_active == True
        ).order_by(User.full_name).all()

        role_map = {
            UserRole.DOCTOR: 'Bác sĩ',
            UserRole.PSYCHOLOGIST: 'Tâm lý gia',
            UserRole.STAFF: 'Lễ tân'
        }

        items = []
        for s in staff:
            is_online = s.id in online_user_ids
            role_label = role_map.get(s.role, 'Nhân viên')
            items.append({
                'id': s.id,
                'full_name': s.full_name,
                'role': str(s.role.value) if s.role else '',
                'role_label': role_label,
                'avatar': normalize_upload_url(s.avatar),
                'is_online': is_online,
                'last_login': s.last_login.isoformat() if s.last_login else None
            })

        online_count = sum(1 for i in items if i['is_online'])
        return jsonify({
            'items': items,
            'online_count': online_count,
            'total': len(items)
        }), 200

    except Exception as e:
        logger.error(f"Error getting staff online: {e}")
        return jsonify({'error': str(e), 'items': []}), 500
    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/export-thu-chi', methods=['GET'])
@require_auth
def export_thu_chi_excel(user):
    """Xuất Excel thống kê thu chi theo ngày"""
    import io
    from datetime import date, timedelta, datetime as dt
    from app.models.service import Service
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.expense import Expense
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side, numbers
        from flask import send_file
    except ImportError:
        return jsonify({'error': 'openpyxl chưa được cài đặt'}), 500

    db = next(get_db())
    try:
        today = date.today()
        from_str = request.args.get('from_date', '')
        to_str = request.args.get('to_date', '')

        if from_str and to_str:
            start_date = dt.strptime(from_str, '%Y-%m-%d').date()
            end_date = dt.strptime(to_str, '%Y-%m-%d').date()
        else:
            start_date = today - timedelta(days=30)
            end_date = today

        # Cap to today
        if end_date > today:
            end_date = today

        start = dt.combine(start_date, dt.min.time())
        end = dt.combine(end_date, dt.max.time())
        period_label = f"{start_date.strftime('%d/%m/%Y')} – {end_date.strftime('%d/%m/%Y')}"

        # --- Styles ---
        thin = Side(style='thin', color='000000')
        brd = Border(left=thin, right=thin, top=thin, bottom=thin)
        header_fill_blue = PatternFill("solid", fgColor="0F766E")
        header_font = Font(name='Arial', bold=True, color="FFFFFF", size=11)
        data_font = Font(name='Arial', size=10)
        center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
        right_align = Alignment(horizontal='right', vertical='center')
        white_fill = PatternFill("solid", fgColor="FFFFFF")
        total_fill = PatternFill("solid", fgColor="F0FDF4")

        # --- Query revenue per day ---
        def get_service_revenue_daily(d):
            from app.models.service import Service
            s = dt.combine(d, dt.min.time())
            e = dt.combine(d, dt.max.time())
            result = db.query(func.coalesce(func.sum(Service.default_price), 0))\
                .join(Appointment, Appointment.service_id == Service.id)\
                .filter(Appointment.appointment_date >= s, Appointment.appointment_date <= e,
                        Appointment.status == 'CONFIRMED', Appointment.is_deleted == False).scalar() or 0
            return float(result)

        def get_medicine_revenue_daily(d):
            s = dt.combine(d, dt.min.time())
            e = dt.combine(d, dt.max.time())
            result = db.query(func.coalesce(func.sum(PrescriptionItem.unit_price * PrescriptionItem.quantity), 0))\
                .join(Prescription, PrescriptionItem.prescription_id == Prescription.id)\
                .join(Appointment, Prescription.appointment_id == Appointment.id)\
                .filter(Appointment.appointment_date >= s, Appointment.appointment_date <= e).scalar() or 0
            return float(result)

        # --- Query expense per day ---
        expense_rows = db.query(
            Expense.date,
            func.sum(Expense.amount).label('total')
        ).filter(
            Expense.date >= start_date,
            Expense.date <= end_date
        ).group_by(Expense.date).all()

        chi_by_date = {r.date: float(r.total or 0) for r in expense_rows}

        # --- Build daily data ---
        daily_data = []
        d = start_date
        while d <= end_date:
            svc = get_service_revenue_daily(d)
            med = get_medicine_revenue_daily(d)
            thu = svc + med
            chi = chi_by_date.get(d, 0)
            if thu > 0 or chi > 0:
                daily_data.append({
                    'date': d,
                    'service': svc,
                    'medicine': med,
                    'thu': thu,
                    'chi': chi,
                    'diff': thu - chi
                })
            d += timedelta(days=1)

        # --- Build workbook ---
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Thu Chi"

        # Title
        ws.merge_cells('A1:G1')
        title_cell = ws['A1']
        title_cell.value = f"THỐNG KÊ THU CHI — {period_label}"
        title_cell.font = Font(name='Arial', bold=True, size=14, color="0F766E")
        title_cell.alignment = Alignment(horizontal='center', vertical='center')
        ws.row_dimensions[1].height = 30

        # Blank row
        ws.append([])

        # Headers row 3
        headers = ["STT", "Ngày", "Dịch vụ (đ)", "Thuốc (đ)", "Tổng thu (đ)", "Chi tiêu (đ)", "Chênh lệch (đ)"]
        for c, v in enumerate(headers, 1):
            cell = ws.cell(row=3, column=c, value=v)
            cell.font = header_font
            cell.fill = header_fill_blue
            cell.alignment = center_align
            cell.border = brd
        ws.row_dimensions[3].height = 24

        # Data rows
        total_svc = total_med = total_thu = total_chi = total_diff = 0
        for i, row in enumerate(daily_data, 1):
            r = i + 3
            data = [
                i,
                row['date'].strftime('%d/%m/%Y'),
                row['service'],
                row['medicine'],
                row['thu'],
                row['chi'],
                row['diff']
            ]
            for c, v in enumerate(data, 1):
                cell = ws.cell(row=r, column=c, value=v)
                cell.border = brd
                cell.font = data_font
                cell.alignment = Alignment(vertical='center')
                if c >= 3:
                    cell.number_format = '#,##0'
                    cell.alignment = right_align
                if c == 1:
                    cell.alignment = center_align
                if c == 2:
                    cell.alignment = center_align

            # Color the diff column
            diff_cell = ws.cell(row=r, column=7)
            if row['diff'] >= 0:
                diff_cell.font = Font(name='Arial', color="059669", bold=True)
            else:
                diff_cell.font = Font(name='Arial', color="DC2626", bold=True)

            total_svc += row['service']
            total_med += row['medicine']
            total_thu += row['thu']
            total_chi += row['chi']
            total_diff += row['diff']

        # Total row
        tr = len(daily_data) + 4
        ws.cell(row=tr, column=1, value="")
        ws.cell(row=tr, column=2, value="TỔNG CỘNG").font = Font(name='Arial', bold=True, size=11, color="0F766E")
        for c, v in enumerate([total_svc, total_med, total_thu, total_chi, total_diff], 3):
            cell = ws.cell(row=tr, column=c, value=v)
            cell.font = Font(name='Arial', bold=True, size=11, color="0F766E")
            cell.number_format = '#,##0'
            cell.alignment = right_align
            cell.border = brd
            cell.fill = total_fill
        ws.cell(row=tr, column=2).fill = total_fill
        ws.cell(row=tr, column=2).border = brd
        ws.cell(row=tr, column=2).alignment = Alignment(vertical='center')
        ws.cell(row=tr, column=1).fill = total_fill
        ws.cell(row=tr, column=1).border = brd

        # Diff total color
        diff_total_cell = ws.cell(row=tr, column=7)
        diff_total_cell.font = Font(name='Arial', bold=True, size=11, color="059669" if total_diff >= 0 else "DC2626")

        # Column widths
        for col, w in [('A', 6), ('B', 14), ('C', 16), ('D', 16), ('E', 18), ('F', 16), ('G', 18)]:
            ws.column_dimensions[col].width = w

        # Freeze header
        ws.freeze_panes = 'A4'

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"thong_ke_thu_chi_{from_str or today.strftime('%Y-%m-%d')}_{to_str or today.strftime('%Y-%m-%d')}.xlsx"
        return send_file(output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True, download_name=filename)

    except Exception as e:
        logger.error(f"Export thu chi excel error: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/exam-stats-by-day', methods=['GET'])
@require_auth
def get_exam_stats_by_day(user):
    """Số lượt khám theo từng ngày trong khoảng from_date → to_date, phân nhóm theo role"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt
        today = date.today()
        from_str = request.args.get('from_date', (today - timedelta(days=29)).isoformat())
        to_str   = request.args.get('to_date',   today.isoformat())
        start_date = dt.strptime(from_str, '%Y-%m-%d').date()
        end_date   = dt.strptime(to_str,   '%Y-%m-%d').date()

        start_dt = dt.combine(start_date, dt.min.time())
        end_dt   = dt.combine(end_date,   dt.max.time())

        # Query tất cả appointments trong khoảng, join User để lấy role
        rows = db.query(
            func.date(Appointment.appointment_date).label('day'),
            User.role.label('doctor_role'),
            func.count(Appointment.id).label('cnt')
        ).join(
            User, Appointment.doctor_id == User.id
        ).filter(
            Appointment.appointment_date >= start_dt,
            Appointment.appointment_date <= end_dt,
            Appointment.is_deleted == False,
            Appointment.status.notin_(['CANCELLED', 'NO_SHOW'])
        ).group_by(
            func.date(Appointment.appointment_date),
            User.role
        ).all()

        # Build day_map: { 'YYYY-MM-DD': { 'doctor': N, 'psychologist': N } }
        day_map = {}
        for r in rows:
            key = str(r.day)
            if key not in day_map:
                day_map[key] = {'doctor': 0, 'psychologist': 0}
            role_val = r.doctor_role.value.lower() if hasattr(r.doctor_role, 'value') else str(r.doctor_role).lower()
            if role_val == UserRole.PSYCHOLOGIST.value.lower():
                day_map[key]['psychologist'] += int(r.cnt)
            else:
                day_map[key]['doctor'] += int(r.cnt)

        items = []
        d = start_date
        while d <= end_date:
            key = d.isoformat()
            counts = day_map.get(key, {'doctor': 0, 'psychologist': 0})
            items.append({
                'label': f'{d.day}/{d.month}',
                'date': key,
                'count': counts['doctor'] + counts['psychologist'],
                'doctor_count': counts['doctor'],
                'psychologist_count': counts['psychologist']
            })
            d += timedelta(days=1)

        return jsonify({'items': items}), 200

    except Exception as e:
        logger.error(f"Error getting exam stats by day: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()

@dashboard_bp.route('/api/dashboard/exam-detail-by-day', methods=['GET'])
@require_auth
def get_exam_detail_by_day(user):
    """Chi tiết ca khám trong 1 ngày cụ thể"""
    db = next(get_db())
    try:
        from datetime import datetime as dt
        from app.models.patient import Patient
        from app.models.service import Service

        date_str = request.args.get('date', '')
        if not date_str:
            return jsonify({'error': 'Thiếu tham số date'}), 400

        target = dt.strptime(date_str, '%Y-%m-%d')
        start  = dt.combine(target.date(), dt.min.time())
        end    = dt.combine(target.date(), dt.max.time())

        rows = db.query(
            Appointment, Patient, User
        ).join(Patient, Appointment.patient_id == Patient.id)\
         .join(User,    Appointment.doctor_id  == User.id)\
         .filter(
            Appointment.appointment_date >= start,
            Appointment.appointment_date <= end,
            Appointment.is_deleted == False,
            Appointment.status.notin_(['CANCELLED', 'NO_SHOW'])
         ).order_by(Appointment.appointment_date).all()

        items = []
        for appt, patient, doctor in rows:
            svc_name = ''
            if appt.service_id:
                svc = db.query(Service).filter(Service.id == appt.service_id).first()
                if svc:
                    svc_name = svc.name

            status_map = {
                'SCHEDULED': 'Chờ xác nhận', 'CONFIRMED': 'Đã xác nhận',
                'COMPLETED': 'Hoàn thành',   'IN_PROGRESS': 'Đang khám',
            }
            items.append({
                'time':         appt.appointment_date.strftime('%H:%M'),
                'patient_name': patient.full_name,
                'phone':        getattr(patient, 'phone_number', '') or '',
                'doctor_name':  doctor.full_name,
                'doctor_role':  doctor.role.value if doctor.role else '',
                'service':      svc_name,
                'status':       status_map.get(str(appt.status).replace('AppointmentStatus.', ''), str(appt.status)),
                'category':     appt.appointment_category.value if appt.appointment_category else '',
                'notes':        appt.notes or '',
            })

        return jsonify({'date': date_str, 'items': items, 'total': len(items)}), 200

    except Exception as e:
        logger.error(f"Error getting exam detail by day: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()
