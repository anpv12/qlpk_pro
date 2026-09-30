"""app.api.dashboard: phần 2 — tách từ dashboard.py (import ở cuối dashboard.py để đăng ký route/giữ tên cũ)."""

from flask import jsonify, request
from sqlalchemy import String, cast, func, text
from app.core.database import get_db
from app.models.examination import Examination, ExaminationStatus
from app.models.appointment import Appointment
from app.models.medicine import Medicine
from app.api.auth import require_auth
from app.api.dashboard import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    dashboard_bp,
)
from app.utils.api_error_contract import api_error_boundary


def _write_medicine_revenue_sheet(db, end, make_header, period_label, start, wb, write_row):
    from openpyxl.styles import Font
    from app.models.prescription import Prescription, PrescriptionItem
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


def _write_service_revenue_sheet(db, end, make_header, period_label, start, wb, write_row):
    from openpyxl.styles import Font
    from app.models.service import Service
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


@dashboard_bp.route('/api/dashboard/export-excel', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
def export_dashboard_excel(user):
    """Xuất Excel tổng hợp doanh thu dịch vụ và thuốc"""
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

        _write_service_revenue_sheet(db, end, make_header, period_label, start, wb, write_row)

        _write_medicine_revenue_sheet(db, end, make_header, period_label, start, wb, write_row)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        filename = f"doanh_thu_{from_str or today.strftime('%Y-%m-%d')}_{to_str or today.strftime('%Y-%m-%d')}.xlsx"
        return send_file(output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True, download_name=filename)

    finally:
        db.close()


def _revenue_detail_items(db, end, rev_type, start):
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.service import Service
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
        return (jsonify({'error': 'Invalid type parameter'}), 400), None, None
    return None, items, total_sum


def _revenue_detail_range(date_key, mode, year_str):
    from datetime import date, timedelta, datetime as dt
    # 1. Parse date_key to start and end datetime bounds
    start = None
    end = None

    if mode == 'month':
        # date_key comes as "Tháng 3"
        target_year = int(year_str) if year_str else date.today().year
        try:
            m = int(date_key.replace('Tháng ', '').strip())
        except ValueError:
            return (jsonify({'error': 'Invalid date_key format'}), 400), None, None

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
            return (jsonify({'error': 'Invalid date_key format'}), 400), None, None
    return None, end, start


@dashboard_bp.route('/api/dashboard/revenue/detail', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
def get_revenue_detail(user):
    """Trích xuất chi tiết doanh thu theo dịch vụ hoặc thuốc cho 1 ngày/tháng"""
    db = next(get_db())
    try:
        mode = request.args.get('mode', 'week')
        rev_type = request.args.get('type', 'service')
        date_key = request.args.get('date_key', '')
        year_str = request.args.get('year', '')

        early_response, end, start = _revenue_detail_range(date_key, mode, year_str)
        if early_response is not None:
            return early_response

        error_response, items, total_sum = _revenue_detail_items(db, end, rev_type, start)
        if error_response is not None:
            return error_response

        return jsonify({
            'mode': mode,
            'type': rev_type,
            'date_key': date_key,
            'items': items,
            'total_sum': total_sum
        }), 200

    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/revenue', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
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

    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/exam-today', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
def get_exam_today(user):
    """Số ca khám hôm nay: đã khám vs chưa khám"""
    db = next(get_db())
    try:
        from datetime import date, datetime as dt
        today = date.today()
        today_start = dt.combine(today, dt.min.time())
        today_end = dt.combine(today, dt.max.time())

        # Count appointments today that have examinations
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

    finally:
        db.close()


@dashboard_bp.route('/api/dashboard/top-icd', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}', items=[])
def get_top_icd(user):
    """Thống kê ICD theo khoảng ngày"""
    db = next(get_db())
    try:
        from datetime import date, timedelta, datetime as dt

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

    finally:
        db.close()
