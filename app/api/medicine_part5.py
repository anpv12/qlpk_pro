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


@medicine_router.route('/medicine/statistics/export', methods=['GET'])
@require_auth
def export_statistics_excel(user):
    """Xuất Excel thống kê thuốc: Sheet 1 = Bác sĩ, Tâm lý gia, Sheet 2 = Tồn kho"""
    from app.models.prescription import Prescription, PrescriptionItem
    from app.models.appointment import Appointment
    from app.models.user import User as UserModel
    from app.models.patient import Patient
    from sqlalchemy.orm import joinedload
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from io import BytesIO

    db = next(get_db())
    try:
        # Parse params
        from_date = request.args.get('from_date')
        to_date = request.args.get('to_date')
        doctor_id = request.args.get('doctor_id')
        medicine_type = request.args.get('medicine_type')

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

        # Common styles
        header_font = Font(bold=True, color="FFFFFF", size=11)
        header_fill = PatternFill(start_color="14479B", end_color="14479B", fill_type="solid")
        header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
        doctor_fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
        doctor_font = Font(bold=True, size=11)
        total_fill = PatternFill(start_color="F0F9FF", end_color="F0F9FF", fill_type="solid")
        total_font = Font(bold=True, color="DC2626", size=11)
        thin_border = Border(
            left=Side(style='thin'), right=Side(style='thin'),
            top=Side(style='thin'), bottom=Side(style='thin')
        )

        wb = Workbook()

        # ==================== SHEET 1: ĐƠN THUỐC ====================
        ws1 = wb.active
        ws1.title = "Bác sĩ, Tâm lý gia"

        # Title
        ws1.merge_cells('A1:J1')
        title_cell = ws1['A1']
        date_label = ""
        if from_date_obj:
            date_label += f" từ {from_date_obj.strftime('%d/%m/%Y')}"
        if to_date_obj:
            date_label += f" đến {to_date_obj.strftime('%d/%m/%Y')}"
        title_cell.value = f"THỐNG KÊ THEO BÁC SĨ/TÂM LÝ GIA{date_label}"
        title_cell.font = Font(bold=True, size=14, color="14479B")
        title_cell.alignment = Alignment(horizontal="center")

        # Headers — 10 columns
        headers1 = ["Bệnh nhân", "Ngày hẹn", "Giờ hẹn", "Dịch vụ", "Mã đơn", "Tên thuốc", "Mua tại", "Số lượng", "Thành tiền", "Ngày tái khám"]
        col_widths = [25, 14, 10, 22, 18, 30, 14, 12, 15, 14]
        for col_idx, (header, width) in enumerate(zip(headers1, col_widths), 1):
            cell = ws1.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws1.column_dimensions[cell.column_letter].width = width

        # Query prescriptions grouped by doctor
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

        if from_date_obj:
            prescriptions_query = prescriptions_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            prescriptions_query = prescriptions_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            prescriptions_query = prescriptions_query.filter(Appointment.doctor_id == int(doctor_id))

        prescriptions = prescriptions_query.order_by(
            UserModel.full_name, Appointment.appointment_date.desc()
        ).all()

        # Group by doctor
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

        row = 4
        grand_total_pres = 0
        grand_total_qty = 0
        grand_total_amount = 0

        prescription_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
        prescription_font = Font(bold=True, size=11)
        doctor_fill_dark = PatternFill(start_color="14479B", end_color="14479B", fill_type="solid")
        doctor_font_white = Font(bold=True, size=11, color="FFFFFF")

        for doc_id, doc_data in doctors_grouped.items():
            # Level 1: Doctor header row — merge all 10 cols
            ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=10)
            cell = ws1.cell(row=row, column=1, value=f"▸ {doc_data['name']}")
            cell.font = doctor_font_white
            cell.fill = doctor_fill_dark
            for c in range(1, 11):
                ws1.cell(row=row, column=c).border = thin_border
                ws1.cell(row=row, column=c).fill = doctor_fill_dark
            row += 1

            for pres in doc_data['prescriptions']:
                appt = pres.appointment
                patient = appt.patient
                services = ', '.join([s.service.name for s in appt.appointment_services if s.service]) if appt.appointment_services else ''

                recheck = ''
                if pres.re_examination_date:
                    recheck = pres.re_examination_date.strftime('%d/%m/%Y') if hasattr(pres.re_examination_date, 'strftime') else str(pres.re_examination_date)

                appt_date = appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else ''
                appt_time = appt.appointment_date.strftime('%H:%M') if appt.appointment_date else ''

                pres_code = pres.prescription_code or ''

                # Filter items by medicine_type if needed
                filtered_items = []
                for item in pres.items:
                    if medicine_type:
                        med = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
                        if not med or med.prescription_type != medicine_type:
                            continue
                    filtered_items.append(item)

                # Calculate prescription totals
                pres_qty = sum(float(it.quantity) if it.quantity else 0 for it in filtered_items)
                pres_amount = sum(
                    (float(it.quantity) if it.quantity else 0) * (0 if it.is_external else (float(it.unit_price) if it.unit_price else 0))
                    for it in filtered_items
                )

                # Level 2: Patient row — cols 1-5 patient info, cols 8-9 totals, col 10 recheck
                ws1.cell(row=row, column=1, value=f"  → {patient.full_name}" if patient else '').font = prescription_font
                ws1.cell(row=row, column=2, value=appt_date).font = prescription_font
                ws1.cell(row=row, column=3, value=str(appt_time)).font = prescription_font
                ws1.cell(row=row, column=4, value=services).font = prescription_font
                ws1.cell(row=row, column=5, value=pres_code).font = prescription_font
                # cols 6-7 empty for patient row
                ws1.cell(row=row, column=8, value=pres_qty).font = prescription_font
                ws1.cell(row=row, column=8).number_format = '#,##0'
                ws1.cell(row=row, column=9, value=pres_amount).font = prescription_font
                ws1.cell(row=row, column=9).number_format = '#,##0'
                ws1.cell(row=row, column=10, value=recheck).font = prescription_font
                for c in range(1, 11):
                    ws1.cell(row=row, column=c).fill = prescription_fill
                    ws1.cell(row=row, column=c).border = thin_border
                row += 1

                # Level 3: Medicine item rows — only cols 6-9
                for item in filtered_items:
                    qty = float(item.quantity) if item.quantity else 0
                    price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
                    amount = qty * price
                    purchase = 'Bên ngoài' if item.is_external else 'Phòng khám'

                    ws1.cell(row=row, column=6, value=item.medicine_name)
                    ws1.cell(row=row, column=7, value=purchase)
                    ws1.cell(row=row, column=8, value=qty)
                    ws1.cell(row=row, column=8).number_format = '#,##0'
                    ws1.cell(row=row, column=9, value=amount)
                    ws1.cell(row=row, column=9).number_format = '#,##0'
                    for c in range(1, 11):
                        ws1.cell(row=row, column=c).border = thin_border
                    row += 1

                grand_total_pres += 1
                grand_total_qty += pres_qty
                grand_total_amount += pres_amount

        # Grand total row
        ws1.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
        cell = ws1.cell(row=row, column=1, value=f"TỔNG CỘNG — {grand_total_pres} đơn thuốc")
        cell.font = total_font
        cell.fill = total_fill
        ws1.cell(row=row, column=8, value=grand_total_qty).font = total_font
        ws1.cell(row=row, column=8).number_format = '#,##0'
        ws1.cell(row=row, column=9, value=grand_total_amount).font = total_font
        ws1.cell(row=row, column=9).number_format = '#,##0'
        for c in range(1, 11):
            ws1.cell(row=row, column=c).border = thin_border
            ws1.cell(row=row, column=c).fill = total_fill

        # ==================== SHEET 2: TỒN KHO ====================
        ws2 = wb.create_sheet("Tồn kho")

        ws2.merge_cells('A1:I1')
        title2 = ws2['A1']
        title2.value = f"THỐNG KÊ TỒN KHO{date_label}"
        title2.font = Font(bold=True, size=14, color="14479B")
        title2.alignment = Alignment(horizontal="center")

        headers2 = ["STT", "Tên thuốc", "Loại", "Giá nhập", "Giá bán", "Đã bốc", "Tồn kho", "Hạn dùng", "Trạng thái"]
        col_widths2 = [6, 30, 12, 14, 14, 10, 10, 14, 12]
        for col_idx, (header, width) in enumerate(zip(headers2, col_widths2), 1):
            cell = ws2.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws2.column_dimensions[cell.column_letter].width = width

        # Query inventory data
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
        if from_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            dispensed_query = dispensed_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            dispensed_query = dispensed_query.filter(Appointment.doctor_id == int(doctor_id))
        dispensed_query = dispensed_query.group_by(PrescriptionItem.medicine_id)
        dispensed_map = {r[0]: float(r[1]) if r[1] else 0 for r in dispensed_query.all()}

        medicines_query = db.query(Medicine).filter(Medicine.is_active == True)
        if medicine_type:
            medicines_query = medicines_query.filter(Medicine.prescription_type == medicine_type)
        medicines = medicines_query.options(joinedload(Medicine.batches)).order_by(Medicine.name).all()

        type_map = {'BASIC': 'Cơ bản', 'H': 'Thuốc H', 'N': 'Thuốc N', 'TOXIC': 'Thuốc độc'}

        status_fills = {
            'Đủ hàng': PatternFill(start_color="D1FAE5", end_color="D1FAE5", fill_type="solid"),
            'Sắp hết': PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
            'Cần nhập': PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
        }

        row2 = 4
        for idx, med in enumerate(medicines, 1):
            stock_qty = float(med.stock_quantity) if med.stock_quantity else 0
            export_qty = dispensed_map.get(med.id, 0)

            latest_batch = latest_batch_of(med.batches)

            status = 'Đủ hàng'
            if med.low_stock_threshold and stock_qty <= med.low_stock_threshold:
                status = 'Cần nhập' if stock_qty == 0 else 'Sắp hết'

            import_price = (float(latest_batch.import_price)
                            if latest_batch and latest_batch.import_price is not None else None)

            expiry = latest_batch.expiry_date.strftime('%d/%m/%Y') if latest_batch and latest_batch.expiry_date else '-'

            values2 = [
                idx,
                med.name,
                type_map.get(med.prescription_type, 'Cơ bản'),
                import_price,
                float(med.unit_price) if med.unit_price else 0,
                export_qty,
                stock_qty,
                expiry,
                status
            ]
            for col_idx, val in enumerate(values2, 1):
                cell = ws2.cell(row=row2, column=col_idx, value=val)
                cell.border = thin_border
                if col_idx in (4, 5):
                    cell.number_format = '#,##0'
                if col_idx == 9:
                    cell.fill = status_fills.get(val, PatternFill())
            row2 += 1

        # ==================== SHEET 3: LỊCH SỬ KÊ THUỐC ====================
        ws3 = wb.create_sheet("Lịch sử kê thuốc")

        ws3.merge_cells('A1:H1')
        title3 = ws3['A1']
        title3.value = f"LỊCH SỬ KÊ THUỐC{date_label}"
        title3.font = Font(bold=True, size=14, color="14479B")
        title3.alignment = Alignment(horizontal="center")

        headers3 = ["Tên thuốc", "Tên gốc/Biệt dược", "Loại thuốc", "Bác sĩ / Ngày kê", "Bệnh nhân", "Mã đơn", "Số viên kê", "Thành tiền"]
        col_widths3 = [30, 25, 12, 25, 25, 18, 12, 15]
        for col_idx, (header, width) in enumerate(zip(headers3, col_widths3), 1):
            cell = ws3.cell(row=3, column=col_idx, value=header)
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = header_align
            cell.border = thin_border
            ws3.column_dimensions[cell.column_letter].width = width

        # Query prescription items (reuse same pattern as API)
        items_query = db.query(PrescriptionItem).join(
            Prescription, PrescriptionItem.prescription_id == Prescription.id
        ).join(
            Appointment, Prescription.appointment_id == Appointment.id
        ).join(
            UserModel, Appointment.doctor_id == UserModel.id
        ).join(
            Patient, Appointment.patient_id == Patient.id
        )
        if from_date_obj:
            items_query = items_query.filter(Appointment.appointment_date >= from_date_obj)
        if to_date_obj:
            items_query = items_query.filter(Appointment.appointment_date <= to_date_obj)
        if doctor_id:
            items_query = items_query.filter(Appointment.doctor_id == int(doctor_id))
        if medicine_type:
            med_ids = db.query(Medicine.id).filter(Medicine.prescription_type == medicine_type).subquery()
            items_query = items_query.filter(PrescriptionItem.medicine_id.in_(med_ids))

        all_items = items_query.order_by(
            PrescriptionItem.medicine_name, UserModel.full_name, Appointment.appointment_date.desc()
        ).all()

        # Group into medicine → doctor → items
        med_map = {}
        med_cache = {}
        for item in all_items:
            pres = item.prescription
            appt = pres.appointment
            doc = appt.doctor
            pat = appt.patient
            m = db.query(Medicine).filter(Medicine.id == item.medicine_id).first() if item.medicine_id else None
            mname = m.name if m else item.medicine_name
            mkey = item.medicine_id if item.medicine_id else f"external:{item.id}"
            did = doc.id if doc else 0

            if mkey not in med_cache:
                med_cache[mkey] = {
                    'name': mname,
                    'generic_name': m.generic_name if m else '',
                    'med_type': type_map.get(m.prescription_type, 'Cơ bản') if m else 'Cơ bản'
                }

            if mkey not in med_map:
                med_map[mkey] = {'doctors': {}}
            if did not in med_map[mkey]['doctors']:
                med_map[mkey]['doctors'][did] = {
                    'name': doc.full_name if doc else 'Chưa xác định',
                    'items': []
                }

            qty = float(item.quantity) if item.quantity else 0
            price = 0 if item.is_external else (float(item.unit_price) if item.unit_price else 0)
            med_map[mkey]['doctors'][did]['items'].append({
                'date': appt.appointment_date.strftime('%d/%m/%Y') if appt.appointment_date else '',
                'patient': pat.full_name if pat else '',
                'code': pres.prescription_code or '',
                'qty': qty,
                'amount': qty * price
            })

        # Write to sheet
        row3 = 4
        grand_qty = 0
        grand_amount = 0

        medicine_fill = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
        medicine_font = Font(bold=True, size=11)

        for mkey in sorted(med_map.keys(), key=lambda key: med_cache.get(key, {}).get('name', '')):
            info = med_cache.get(mkey, {})
            med_data = med_map[mkey]

            # Medicine header row
            med_total_qty = sum(
                sum(it['qty'] for it in d['items'])
                for d in med_data['doctors'].values()
            )
            med_total_amount = sum(
                sum(it['amount'] for it in d['items'])
                for d in med_data['doctors'].values()
            )

            values_med = [info.get('name', ''), info.get('generic_name', ''), info.get('med_type', ''), '', '', '', med_total_qty, med_total_amount]
            for col_idx, val in enumerate(values_med, 1):
                cell = ws3.cell(row=row3, column=col_idx, value=val)
                cell.font = medicine_font
                cell.fill = medicine_fill
                cell.border = thin_border
                if col_idx == 7:
                    cell.number_format = '#,##0'
                elif col_idx == 8:
                    cell.number_format = '#,##0'
            row3 += 1

            for did, doc_data in med_data['doctors'].items():
                # Doctor sub-header
                doc_qty = sum(it['qty'] for it in doc_data['items'])
                doc_amount = sum(it['amount'] for it in doc_data['items'])

                values_doc = ['', '', '', doc_data['name'], '', '', doc_qty, doc_amount]
                for col_idx, val in enumerate(values_doc, 1):
                    cell = ws3.cell(row=row3, column=col_idx, value=val)
                    cell.font = doctor_font
                    cell.fill = doctor_fill
                    cell.border = thin_border
                    if col_idx == 7:
                        cell.number_format = '#,##0'
                    elif col_idx == 8:
                        cell.number_format = '#,##0'
                row3 += 1

                # Individual items
                for it in doc_data['items']:
                    values_it = ['', '', '', it['date'], it['patient'], it['code'], it['qty'], it['amount']]
                    for col_idx, val in enumerate(values_it, 1):
                        cell = ws3.cell(row=row3, column=col_idx, value=val)
                        cell.border = thin_border
                        if col_idx == 7:
                            cell.number_format = '#,##0'
                        elif col_idx == 8:
                            cell.number_format = '#,##0'
                    row3 += 1

            grand_qty += med_total_qty
            grand_amount += med_total_amount

        # Grand total
        ws3.merge_cells(start_row=row3, start_column=1, end_row=row3, end_column=6)
        cell = ws3.cell(row=row3, column=1, value="TỔNG CỘNG")
        cell.font = total_font
        cell.fill = total_fill
        ws3.cell(row=row3, column=7, value=grand_qty).font = total_font
        ws3.cell(row=row3, column=7).number_format = '#,##0'
        ws3.cell(row=row3, column=8, value=grand_amount).font = total_font
        ws3.cell(row=row3, column=8).number_format = '#,##0'
        for c in range(1, 9):
            ws3.cell(row=row3, column=c).border = thin_border
            ws3.cell(row=row3, column=c).fill = total_fill

        # Save to buffer
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
