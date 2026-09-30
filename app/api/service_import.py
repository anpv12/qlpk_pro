"""app.api.service: phần 3 — tách từ service.py (import ở cuối service.py để đăng ký route/giữ tên cũ)."""

from flask import request, jsonify
from app.api.auth import require_auth
from app.core.database import get_db
from app.models.service import Service
from app.models.service_category import ServiceCategory
from app.realtime.events import emit_catalog_changed
from app.api.service import (  # noqa: E402 — module gốc đã khởi tạo xong các tên này
    logger,
    router,
)


def _import_service_rows(db, df, error_count, errors, success_count):
    import pandas as pd
    for index, row in df.iterrows():
        try:
            name = str(row['Tên dịch vụ']).strip()
            category_name = str(row['Danh mục']).strip()
            price_str = str(row['Đơn giá (VNĐ)']).strip()
            duration_str = str(row['Thời gian (phút)']).strip()
            description = str(row['Mô tả']).strip() if pd.notna(row['Mô tả']) else None
            status = str(row['Trạng thái']).strip()

            # Validate required fields
            if not name:
                errors.append(f'Row {index + 2}: Tên dịch vụ không được để trống')
                error_count += 1
                continue

            if not category_name:
                errors.append(f'Row {index + 2}: Danh mục không được để trống')
                error_count += 1
                continue

            # Find category by name
            category = db.query(ServiceCategory).filter(ServiceCategory.name == category_name).first()
            if not category:
                errors.append(f'Row {index + 2}: Danh mục "{category_name}" không tồn tại')
                error_count += 1
                continue

            # Validate price
            try:
                price = float(price_str.replace(',', ''))
                if price < 0:
                    errors.append(f'Row {index + 2}: Đơn giá không được âm')
                    error_count += 1
                    continue
            except ValueError:
                errors.append(f'Row {index + 2}: Đơn giá không hợp lệ')
                error_count += 1
                continue

            # Validate duration
            try:
                duration = int(duration_str) if duration_str else 60
                if duration <= 0:
                    duration = 60
            except ValueError:
                duration = 60

            # Convert status to boolean
            is_active = status.lower() in ['kích hoạt', 'active', 'true', '1', 'yes']

            # Check if service already exists
            existing_service = db.query(Service).filter(Service.name == name).first()
            if existing_service:
                errors.append(f'Row {index + 2}: Dịch vụ "{name}" đã tồn tại')
                error_count += 1
                continue

            # Create new service
            new_service = Service(
                name=name,
                category_id=category.id,
                default_price=price,
                duration_minutes=duration,
                description=description,
                is_active=is_active
            )

            db.add(new_service)
            success_count += 1

        except Exception as e:
            errors.append(f'Row {index + 2}: {str(e)}')
            error_count += 1
    return error_count, success_count


@router.route('/import', methods=['POST'])
@require_auth
def import_services(current_user):
    db = next(get_db())
    try:
        if 'file' not in request.files:
            return jsonify({'detail': 'No file uploaded'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'detail': 'No file selected'}), 400

        if not file.filename.endswith(('.xlsx', '.xls')):
            return jsonify({'detail': 'File must be Excel format (.xlsx or .xls)'}), 400

        # Read Excel file
        import pandas as pd

        try:
            df = pd.read_excel(file, header=0)
        except Exception as e:
            return jsonify({'detail': f'Error reading Excel file: {str(e)}'}), 400

        # Validate columns
        required_columns = ['Tên dịch vụ', 'Danh mục', 'Đơn giá (VNĐ)', 'Thời gian (phút)', 'Mô tả', 'Trạng thái']
        if not all(col in df.columns for col in required_columns):
            return jsonify({'detail': f'File must contain columns: {", ".join(required_columns)}'}), 400

        # Process data
        success_count = 0
        error_count = 0
        errors = []

        error_count, success_count = _import_service_rows(db, df, error_count, errors, success_count)

        # Commit if any successful imports
        if success_count > 0:
            db.commit()
            emit_catalog_changed('services_imported', entity='service', extra={'success_count': success_count})

        result = {
            'success_count': success_count,
            'error_count': error_count,
            'errors': errors
        }

        if error_count > 0:
            return jsonify({
                'detail': f'Import completed with {error_count} errors',
                'result': result
            }), 207  # Multi-Status
        else:
            return jsonify({
                'detail': f'Successfully imported {success_count} services',
                'result': result
            }), 200

    except Exception as e:
        db.rollback()
        logger.error(f"Error in import_services: {e}")
        return jsonify({'detail': f'Internal server error: {str(e)}'}), 500
    finally:
        db.close()
