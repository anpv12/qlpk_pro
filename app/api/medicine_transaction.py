from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from app.core.database import get_db
from app.models.medicine_transaction import MedicineTransaction
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.api.auth import require_auth
from app.realtime.events import emit_inventory_changed
from app.utils.search_normalization import normalized_contains
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
            query = query.join(Medicine).outerjoin(
                MedicineBatch, MedicineTransaction.batch_id == MedicineBatch.id
            ).filter(
                or_(
                    normalized_contains(Medicine.name, search),
                    normalized_contains(MedicineBatch.batch_number, search),
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
    """Reject direct ledger writes.

    Movement rows are append-only records produced by the batch import,
    batch-adjustment, and prescription stock services.  A generic POST here
    could make the ledger disagree with both the lot and aggregate balances.
    """

    return jsonify({
        'success': False,
        'detail': 'Không ghi giao dịch kho trực tiếp. Hãy dùng API nhập lô, kiểm kê theo lô hoặc kê đơn.',
        'code': 'inventory.transaction_write_forbidden',
    }), 409
