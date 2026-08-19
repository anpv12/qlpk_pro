from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.core.database import get_db
from app.models.medicine_transaction import MedicineTransaction
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
import logging
from datetime import datetime, date

logger = logging.getLogger(__name__)

medicine_transaction_router = Blueprint('medicine_transaction', __name__)


@medicine_transaction_router.route('/medicine-transactions/', methods=['GET'])
@require_auth
def get_transactions(user):
    """Lấy lịch sử giao dịch"""
    db = next(get_db())
    try:
        transaction_type = request.args.get('type', '')
        from_date = request.args.get('from_date', '')
        to_date = request.args.get('to_date', '')
        search = request.args.get('search', '')
        
        query = db.query(MedicineTransaction)
        
        # Filter theo loại giao dịch
        if transaction_type:
            query = query.filter(MedicineTransaction.type == transaction_type)
        
        # Filter theo ngày
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d').date()
                query = query.filter(MedicineTransaction.created_at >= datetime.combine(from_date_obj, datetime.min.time()))
            except ValueError:
                pass
        
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').date()
                query = query.filter(MedicineTransaction.created_at <= datetime.combine(to_date_obj, datetime.max.time()))
            except ValueError:
                pass
        
        # Filter theo tìm kiếm
        if search:
            query = query.join(Medicine).filter(
                or_(
                    Medicine.name.ilike(f'%{search}%'),
                    MedicineBatch.batch_number.ilike(f'%{search}%')
                )
            )
        
        # Sắp xếp theo thời gian mới nhất
        transactions = query.order_by(MedicineTransaction.created_at.desc()).limit(1000).all()
        
        data = [t.to_dict() for t in transactions]
        
        return jsonify({
            'success': True,
            'transactions': data,
            'total': len(data)
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting transactions: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()


@medicine_transaction_router.route('/medicine-transactions/', methods=['POST'])
@require_auth
def create_transaction(user):
    """Tạo giao dịch mới"""
    db = next(get_db())
    try:
        data = request.get_json()
        
        medicine_id = data.get('medicine_id')
        batch_id = data.get('batch_id')
        transaction_type = data.get('type')
        quantity = data.get('quantity')
        price = data.get('price')
        note = data.get('note', '')
        
        if not medicine_id or not transaction_type or quantity is None:
            return jsonify({'detail': 'Thiếu thông tin bắt buộc'}), 400
        
        transaction = MedicineTransaction(
            medicine_id=medicine_id,
            batch_id=batch_id,
            type=transaction_type,
            quantity=quantity,
            price=price,
            note=note,
            created_by=user.id
        )
        
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        emit_inventory_changed('transaction_created', entity='medicine_transaction', entity_id=transaction.id, extra={
            'medicine_id': medicine_id,
            'batch_id': batch_id,
            'transaction_type': transaction_type,
        })
        
        return jsonify({
            'success': True,
            'transaction': transaction.to_dict()
        }), 201
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating transaction: {e}")
        return jsonify({'success': False, 'detail': str(e)}), 500
    finally:
        db.close()
