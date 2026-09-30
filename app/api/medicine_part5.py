"""app.api.medicine: phần 5 — tách từ medicine.py (import ở cuối medicine.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify, make_response
from app.core.database import get_db
from app.models.medicine import Medicine
from app.api.auth import require_auth
from datetime import datetime
from sqlalchemy import func
from app.api.medicine import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    latest_batch_of,
    logger,
    medicine_router,
)

MEDICINE_TYPE_LABELS = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}


def _parse_export_dates(from_date, to_date):
    from_date_obj = None
    to_date_obj = None
    if from_date:
        try:
            from_date_obj = datetime.strptime(from_date, '%Y-%m-%d')
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    if to_date:
        try:
            to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').replace(hour=23, minute=59, second=59)
        except ValueError as exc:
            logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
    return from_date_obj, to_date_obj


def _export_styles():
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side

    def solid(color):
        return PatternFill(start_color=color, end_color=color, fill_type="solid")

    return {
        'header_font': Font(bold=True, color="FFFFFF", size=11),
        'header_fill': solid("14479B"),
        'header_align': Alignment(horizontal="center", vertical="center", wrap_text=True),
        'doctor_fill': solid("E0F2FE"),
        'doctor_font': Font(bold=True, size=11),
        'total_fill': solid("F0F9FF"),
        'total_font': Font(bold=True, color="DC2626", size=11),
        'thin_border': Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        ),
        'prescription_fill': solid("DBEAFE"),
        'prescription_font': Font(bold=True, size=11),
        'doctor_fill_dark': solid("14479B"),
        'doctor_font_white': Font(bold=True, size=11, color="FFFFFF"),
        'status_fills': {
            'Đủ hàng': solid("D1FAE5"),
            'Sắp hết': solid("FEF3C7"),
            'Cần nhập': solid("FEE2E2"),
        },
    }


def _write_sheet_title(ws, cell_range, text):
    from openpyxl.styles import Font, Alignment
    ws.merge_cells(cell_range)
    title = ws[cell_range.split(':')[0]]
    title.value = text
    title.font = Font(bold=True, size=14, color="14479B")
    title.alignment = Alignment(horizontal="center")


def _write_sheet_headers(ws, headers, widths, styles):
    for col_idx, (header, width) in enumerate(zip(headers, widths), 1):
        cell = ws.cell(row=3, column=col_idx, value=header)
        cell.font = styles['header_font']
        cell.fill = styles['header_fill']
        cell.alignment = styles['header_align']
        cell.border = styles['thin_border']
        ws.column_dimensions[cell.column_letter].width = width


def _apply_appointment_filters(query, from_date_obj, to_date_obj, doctor_id):
    from app.models.appointment import Appointment
    if from_date_obj:
        query = query.filter(Appointment.appointment_date >= from_date_obj)
    if to_date_obj:
        query = query.filter(Appointment.appointment_date <= to_date_obj)
    if doctor_id:
        query = query.filter(Appointment.doctor_id == int(doctor_id))
    return query


def _query_export_prescriptions(db, from_date_obj, to_date_obj, doctor_id):
    from app.models.prescription import Prescription
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload
    prescriptions_query = db.query(Prescription).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).join(
        UserModel, Appointment.doctor_id == UserModel.id
    ).join(
        Patient, Appointment.patient_id == Patient.id
    ).options(
        joinedload(Prescription.items),
        joinedload(Prescription.appointment).joinedload(Appointment.doctor),
        joinedload(Prescription.appointment).joinedload(Appointment.patient),
        joinedload(Prescription.appointment).joinedload(Appointment.appointment_services)
    )
    prescriptions_query = _apply_appointment_filters(prescriptions_query, from_date_obj, to_date_obj, doctor_id)
    return prescriptions_query.order_by(
        UserModel.full_name, Appointment.appointment_date.desc()
    ).all()


def _group_prescriptions_by_doctor(prescriptions):
    doctors_grouped = {}
    for pres in prescriptions:
        doc = pres.appointment.doctor
        doc_id = doc.id if doc else 0
        if doc_id not in doctors_grouped:
            doctors_grouped[doc_id] = {
                'name': doc.full_name if doc else 'Chưa xác định',
                'prescriptions': []
            }
        doctors_grouped[doc_id]['prescriptions'].append(pres)
    return doctors_grouped


def _item_quantity(item):
    return float(item.quantity) if item.quantity else 0


def _item_price(item):
    return 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)


def _format_date_value(value, fmt):
    if not value:
        return ''
    return value.strftime(fmt) if hasattr(value, 'strftime') else str(value)


def _filter_items_by_type(db, items, medicine_type):
    filtered_items = []
    for item in items:
        if medicine_type:
            med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            if not med or med.prescription_type != medicine_type:
                continue
        filtered_items.append(item)
    return filtered_items


def _write_doctor_header_row(ws, row, name, styles):
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=10)
    cell = ws.cell(row=row, column=1, value=f"▸ {name}")
    cell.font = styles['doctor_font_white']
    cell.fill = styles['doctor_fill_dark']
    for c in range(1, 11):
        ws.cell(row=row, column=c).border = styles['thin_border']
        ws.cell(row=row, column=c).fill = styles['doctor_fill_dark']


def _write_prescription_patient_row(ws, row, pres, pres_qty, pres_amount, styles):
    appt = pres.appointment
    patient = appt.patient
    services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''
    recheck = _format_date_value(pres.re_examination_date, '%d/%m/%Y')
    appt_date = appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else ''
    appt_time = appt.appointment_date.strftime('%H:%M') if appt.appointment_date else ''
    font = styles['prescription_font']
    # Level 2: Patient row — cols 1-5 patient info, cols 8-9 totals, col 10 recheck
    ws.cell(row=row, column=1, value=f"  → {patient.full_name}" if patient else '').font = font
    ws.cell(row=row, column=2, value=appt_date).font = font
    ws.cell(row=row, column=3, value=str(appt_time)).font = font
    ws.cell(row=row, column=4, value=services).font = font
    ws.cell(row=row, column=5, value=pres.prescription_code or '').font = font
    ws.cell(row=row, column=8, value=pres_qty).font = font
    ws.cell(row=row, column=8).number_format = '#,##0'
    ws.cell(row=row, column=9, value=pres_amount).font = font
    ws.cell(row=row, column=9).number_format = '#,##0'
    ws.cell(row=row, column=10, value=recheck).font = font
    for c in range(1, 11):
        ws.cell(row=row, column=c).fill = styles['prescription_fill']
        ws.cell(row=row, column=c).border = styles['thin_border']


def _write_prescription_item_row(ws, row, item, styles):
    # Level 3: Medicine item rows — only cols 6-9
    qty = _item_quantity(item)
    amount = qty * _item_price(item)
    ws.cell(row=row, column=6, value=item.medicine_name)
    ws.cell(row=row, column=7, value='Bên ngoài' if item.is_external else 'Phòng khám')
    ws.cell(row=row, column=8, value=qty)
    ws.cell(row=row, column=8).number_format = '#,##0'
    ws.cell(row=row, column=9, value=amount)
    ws.cell(row=row, column=9).number_format = '#,##0'
    for c in range(1, 11):
        ws.cell(row=row, column=c).border = styles['thin_border']


def _write_prescription_block(ws, row, db, pres, medicine_type, styles):
    filtered_items = _filter_items_by_type(db, pres.items, medicine_type)
    pres_qty = sum(_item_quantity(it) for it in filtered_items)
    pres_amount = sum(_item_quantity(it) * _item_price(it) for it in filtered_items)
    _write_prescription_patient_row(ws, row, pres, pres_qty, pres_amount, styles)
    row += 1
    for item in filtered_items:
        _write_prescription_item_row(ws, row, item, styles)
        row += 1
    return row, pres_qty, pres_amount


def _write_total_row(ws, row, label_end_col, last_col, values, styles):
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=label_end_col)
    cell = ws.cell(row=row, column=1, value=values[0])
    cell.font = styles['total_font']
    cell.fill = styles['total_fill']
    for offset, value in enumerate(values[1:], 1):
        column = label_end_col + offset
        ws.cell(row=row, column=column, value=value).font = styles['total_font']
        ws.cell(row=row, column=column).number_format = '#,##0'
    for c in range(1, last_col + 1):
        ws.cell(row=row, column=c).border = styles['thin_border']
        ws.cell(row=row, column=c).fill = styles['total_fill']


def _write_prescription_sheet(ws, db, filters, styles):
    ws.title = "Bác sĩ, Tâm lý gia"
    _write_sheet_title(ws, 'A1:J1', f"THỐNG KÊ THEO BÁC SĨ/TÂM LÝ GIA{filters['date_label']}")
    headers = ["Bệnh nhân", "Ngày hẹn", "Giờ hẹn", "Dịch vụ", "Mã đơn", "Tên thuốc", "Mua tại", "Số lượng", "Thành tiền", "Ngày tái khám"]
    _write_sheet_headers(ws, headers, [25, 14, 10, 22, 18, 30, 14, 12, 15, 14], styles)
    prescriptions = _query_export_prescriptions(db, filters['from_date_obj'], filters['to_date_obj'], filters['doctor_id'])
    row = 4
    grand_total_pres = 0
    grand_total_qty = 0
    grand_total_amount = 0
    for doc_data in _group_prescriptions_by_doctor(prescriptions).values():
        _write_doctor_header_row(ws, row, doc_data['name'], styles)
        row += 1
        for pres in doc_data['prescriptions']:
            row, pres_qty, pres_amount = _write_prescription_block(ws, row, db, pres, filters['medicine_type'], styles)
            grand_total_pres += 1
            grand_total_qty += pres_qty
            grand_total_amount += pres_amount
    _write_total_row(ws, row, 7, 10, [f"TỔNG CỘNG — {grand_total_pres} đơn thuốc", grand_total_qty, grand_total_amount], styles)


def _query_dispensed_map(db, from_date_obj, to_date_obj, doctor_id):
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    dispensed_query = db.query(
        PrescriptionItem.medicine_id,
        func.sum(PrescriptionItem.quantity)
    ).join(
        Prescription, PrescriptionItem.prescription_id == Prescription.id
    ).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).filter(
        PrescriptionItem.medicine_id.isnot(None),
        PrescriptionItem.is_external == False
    )
    dispensed_query = _apply_appointment_filters(dispensed_query, from_date_obj, to_date_obj, doctor_id)
    dispensed_query = dispensed_query.group_by(PrescriptionItem.medicine_id)
    return {r[0]: float(r[1]) if r[1] else 0 for r in dispensed_query.all()}


def _inventory_row_values(idx, med, dispensed_map):
    stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
    latest_batch = latest_batch_of(med.batches)
    status = 'Đủ hàng'
    if med.low_stock_threshold and stock_qty <= med.low_stock_threshold:
        status = 'Cần nhập' if stock_qty == 0 else 'Sắp hết'
    import_price = (float(latest_batch.import_price)
                    if latest_batch and latest_batch.import_price is not None else None)
    expiry = latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-'
    return [
        idx,
        med.name,
        MEDICINE_TYPE_LABELS.get(med.prescription_type, 'Cơ bản'),
        import_price,
        float(med.unit_price) if med.unit_price else 0,
        dispensed_map.get(med.id, 0),
        stock_qty,
        expiry,
        status
    ]


def _write_inventory_sheet(ws, db, filters, styles):
    from openpyxl.styles import PatternFill
    from sqlalchemy.orm import joinedload
    _write_sheet_title(ws, 'A1:I1', f"THỐNG KÊ TỒN KHO{filters['date_label']}")
    headers = ["STT", "Tên thuốc", "Loại", "Giá nhập", "Giá bán", "Đã bốc", "Tồn kho", "Hạn dùng", "Trạng thái"]
    _write_sheet_headers(ws, headers, [6, 30, 12, 14, 14, 10, 10, 14, 12], styles)
    dispensed_map = _query_dispensed_map(db, filters['from_date_obj'], filters['to_date_obj'], filters['doctor_id'])
    medicines_query = db.query(Medicine).filter(Medicine.is_active == True)
    if filters['medicine_type']:
        medicines_query = medicines_query.filter(Medicine.prescription_type == filters['medicine_type'])
    medicines = medicines_query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()
    row = 4
    for idx, med in enumerate(medicines, 1):
        for col_idx, val in enumerate(_inventory_row_values(idx, med, dispensed_map), 1):
            cell = ws.cell(row=row, column=col_idx, value=val)
            cell.border = styles['thin_border']
            if col_idx in (4, 5):
                cell.number_format = '#,##0'
            if col_idx == 9:
                cell.fill = styles['status_fills'].get(val, PatternFill())
        row += 1


def _query_history_items(db, filters):
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    items_query = db.query(PrescriptionItem).join(
        Prescription, PrescriptionItem.prescription_id == Prescription.id
    ).join(
        Appointment, Prescription.appointment_id == Appointment.id
    ).join(
        UserModel, Appointment.doctor_id == UserModel.id
    ).join(
        Patient, Appointment.patient_id == Patient.id
    )
    items_query = _apply_appointment_filters(items_query, filters['from_date_obj'], filters['to_date_obj'], filters['doctor_id'])
    if filters['medicine_type']:
        med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == filters['medicine_type']).subquery()
        items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))
    return items_query.order_by(
        PrescriptionItem.medicine_name, UserModel.full_name, Appointment.appointment_date.desc()
    ).all()


def _group_history_items(db, all_items):
    """Group into medicine → doctor → items."""
    med_map = {}
    med_cache = {}
    for item in all_items:
        pres = item.prescription
        appt = pres.appointment
        doc = appt.doctor
        pat = appt.patient
        m = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
        mkey = item.medicine_id if item.medicine_id else f"external:{item.id}"
        did = doc.id if doc else 0
        if mkey not in med_cache:
            med_cache[mkey] = {
                'name': m.name if m else item.medicine_name,
                'generic_name': m.generic_name if m else '',
                'med_type': MEDICINE_TYPE_LABELS.get(m.prescription_type, 'Cơ bản') if m else 'Cơ bản'
            }
        doctors = med_map.setdefault(mkey, {'doctors': {}})['doctors']
        if did not in doctors:
            doctors[did] = {'name': doc.full_name if doc else 'Chưa xác định', 'items': []}
        qty = _item_quantity(item)
        doctors[did]['items'].append({
            'date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
            'patient': pat.full_name if pat else '',
            'code': pres.prescription_code or '',
            'qty': qty,
            'amount': qty * _item_price(item)
        })
    return med_map, med_cache


def _write_history_row(ws, row, values, styles, font=None, fill=None):
    for col_idx, val in enumerate(values, 1):
        cell = ws.cell(row=row, column=col_idx, value=val)
        if font is not None:
            cell.font = font
        if fill is not None:
            cell.fill = fill
        cell.border = styles['thin_border']
        if col_idx in (7, 8):
            cell.number_format = '#,##0'


def _write_history_medicine(ws, row, info, med_data, styles):
    med_total_qty = sum(sum(it['qty'] for it in d['items']) for d in med_data['doctors'].values())
    med_total_amount = sum(sum(it['amount'] for it in d['items']) for d in med_data['doctors'].values())
    values_med = [info.get('name', ''), info.get('generic_name', ''), info.get('med_type', ''), '', '', '', med_total_qty, med_total_amount]
    _write_history_row(ws, row, values_med, styles, styles['prescription_font'], styles['prescription_fill'])
    row += 1
    for doc_data in med_data['doctors'].values():
        doc_qty = sum(it['qty'] for it in doc_data['items'])
        doc_amount = sum(it['amount'] for it in doc_data['items'])
        _write_history_row(ws, row, ['', '', '', doc_data['name'], '', '', doc_qty, doc_amount], styles, styles['doctor_font'], styles['doctor_fill'])
        row += 1
        for it in doc_data['items']:
            _write_history_row(ws, row, ['', '', '', it['date'], it['patient'], it['code'], it['qty'], it['amount']], styles)
            row += 1
    return row, med_total_qty, med_total_amount


def _write_history_sheet(ws, db, filters, styles):
    _write_sheet_title(ws, 'A1:H1', f"LỊCH SỬ KÊ THUỐC{filters['date_label']}")
    headers = ["Tên thuốc", "Tên gốc/Biệt dược", "Loại thuốc", "Bác sĩ / Ngày kê", "Bệnh nhân", "Mã đơn", "Số viên kê", "Thành tiền"]
    _write_sheet_headers(ws, headers, [30, 25, 12, 25, 25, 18, 12, 15], styles)
    med_map, med_cache = _group_history_items(db, _query_history_items(db, filters))
    row = 4
    grand_qty = 0
    grand_amount = 0
    for mkey in sorted(med_map.keys(), key=lambda key: med_cache.get(key, {}).get('name', '')):
        row, med_qty, med_amount = _write_history_medicine(ws, row, med_cache.get(mkey, {}), med_map[mkey], styles)
        grand_qty += med_qty
        grand_amount += med_amount
    _write_total_row(ws, row, 6, 8, ["TỔNG CỘNG", grand_qty, grand_amount], styles)


def _export_date_label(from_date_obj, to_date_obj):
    date_label = ""
    if from_date_obj:
        date_label += f" từ {from_date_obj.strftime('%d/%m/%Y')}"
    if to_date_obj:
        date_label += f" đến {to_date_obj.strftime('%d/%m/%Y')}"
    return date_label


@medicine_router.route('/medicine/statistics/export', methods=['GET'])
@require_auth
def export_statistics_excel(user):
    """Xuất Excel thống kê thuốc: Sheet 1 = Bác sĩ, Tâm lý gia, Sheet 2 = Tồn kho"""
    from openpyxl import Workbook
    from io import BytesIO

    db = next(get_db())
    try:
        from_date_obj, to_date_obj = _parse_export_dates(request.args.get('from_date'), request.args.get('to_date'))
        filters = {
            'from_date_obj': from_date_obj,
            'to_date_obj': to_date_obj,
            'doctor_id': request.args.get('doctor_id'),
            'medicine_type': request.args.get('medicine_type'),
            'date_label': _export_date_label(from_date_obj, to_date_obj),
        }
        styles = _export_styles()
        wb = Workbook()
        _write_prescription_sheet(wb.active, db, filters, styles)
        _write_inventory_sheet(wb.create_sheet("Tồn kho"), db, filters, styles)
        _write_history_sheet(wb.create_sheet("Lịch sử kê thuốc"), db, filters, styles)

        buffer = BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        response = make_response(buffer.getvalue())
        response.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        filename = f"thong_ke_thuoc_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        return response

    except Exception as e:
        logger.error(f"Error exporting statistics: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
