from flask import Blueprint, request, jsonify
from sqlalchemy.orm import joinedload
from sqlalchemy import or_
from app.core.database import get_db
from app.models.medicine_transaction import MedicineTransaction
from app.models.medicine import Medicine
from app.models.medicine_batch import MedicineBatch
from app.api.auth import require_auth
from app.utils.search_normalization import normalized_contains
import logging
from datetime import datetime
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

medicine_transaction_router = Blueprint('medicine_transaction', __name__)


@medicine_transaction_router.route('/medicine-transactions/', methods=['GET'])
@require_auth
@api_error_boundary(success=False, detail='{error}')
def get_transactions(user):
    """Lấy lịch sử giao dịch"""
    db = next(get_db())
    try:
        transaction_type = request.args.get('type', '')
        from_date = request.args.get('from_date', '')
        to_date = request.args.get('to_date', '')
        search = request.args.get('search', '')
        batch_id = request.args.get('batch_id', type=int)
        page = max(1, request.args.get('page', 1, type=int) or 1)
        per_page = min(100, max(1, request.args.get('per_page', 50, type=int) or 50))
        
        query = db.query(MedicineTransaction).options(
            joinedload(MedicineTransaction.batch), joinedload(MedicineTransaction.medicine),
            joinedload(MedicineTransaction.creator),
        )
        if batch_id:
            query = query.filter(MedicineTransaction.batch_id == batch_id)
        
        # Filter theo loại giao dịch
        if transaction_type:
            query = query.filter(MedicineTransaction.type == transaction_type)
        
        # Filter theo ngày
        if from_date:
            try:
                from_date_obj = datetime.strptime(from_date, '%Y-%m-%d').date()
                query = query.filter(MedicineTransaction.created_at >= datetime.combine(from_date_obj, datetime.min.time()))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        
        if to_date:
            try:
                to_date_obj = datetime.strptime(to_date, '%Y-%m-%d').date()
                query = query.filter(MedicineTransaction.created_at <= datetime.combine(to_date_obj, datetime.max.time()))
            except ValueError as exc:
                logger.warning("Bỏ qua bộ lọc ngày không hợp lệ: %s", exc)
        
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
        total = query.count()
        transactions = query.order_by(MedicineTransaction.created_at.desc(), MedicineTransaction.id.desc()).offset(
            (page - 1) * per_page).limit(per_page).all()
        
        data = [t.to_dict() for t in transactions]
        
        return jsonify({
            'success': True,
            'transactions': data,
            'total': total,
            'page': page,
            'per_page': per_page,
            'total_pages': (total + per_page - 1) // per_page,
        }), 200
        
    finally:
        db.close()


@medicine_transaction_router.route('/medicine-transactions/', methods=['POST'])
@require_auth
def create_transaction(user):
    """Reject direct ledger writes.

    Movement rows are append-only records produced by the batch import,
    verified opening, and prescription stock services.  A generic POST here
    could make the ledger disagree with both the lot and aggregate balances.
    """

    return jsonify({
        'success': False,
        'detail': 'Không ghi giao dịch kho trực tiếp. Giao dịch được ghi nhận qua nhập kho hoặc cấp/hoàn thuốc.',
        'code': 'inventory.transaction_write_forbidden',
    }), 409
