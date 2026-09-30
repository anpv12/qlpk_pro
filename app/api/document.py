from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.document_folder import DocumentFolder
from app.models.document import Document
from app.api.auth import require_auth
from app.realtime.events import emit_document_changed
from app.services.drive_service import DriveService
import logging
from app.utils.api_error_contract import api_error_boundary

logger = logging.getLogger(__name__)

document_bp = Blueprint('document', __name__, url_prefix='/api')

# Helper function để kiểm tra admin
def is_admin(current_user):
    return current_user and current_user.role == 'admin'

# --- API THƯ MỤC (/api/document-folders) ---

@document_bp.route('/document-folders', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
def get_folders(current_user):
    db: Session = SessionLocal()
    try:
        # Lấy tất cả thư mục
        folders = db.query(DocumentFolder).all()
        
        # Build tree
        folder_dict = {}
        for f in folders:
            folder_dict[f.id] = {
                "id": f.id,
                "name": f.name,
                "parent_id": f.parent_id,
                "created_at": f.created_at.isoformat() if f.created_at else None,
                "children": []
            }
            
        tree = []
        for f in folders:
            if f.parent_id:
                if f.parent_id in folder_dict:
                    folder_dict[f.parent_id]["children"].append(folder_dict[f.id])
            else:
                tree.append(folder_dict[f.id])
                
        return jsonify(tree), 200
    finally:
        db.close()

@document_bp.route('/document-folders', methods=['POST'])
@require_auth
@api_error_boundary(error='{error}')
def create_folder(current_user):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    data = request.json
    name = data.get('name')
    parent_id = data.get('parent_id')
    
    if not name:
        return jsonify({"error": "Folder name is required"}), 400
        
    db: Session = SessionLocal()
    try:
        new_folder = DocumentFolder(
            name=name,
            parent_id=parent_id if parent_id else None,
            created_by=current_user.id
        )
        db.add(new_folder)
        db.commit()
        db.refresh(new_folder)
        emit_document_changed('folder_created', entity='folder', entity_id=new_folder.id, folder_id=new_folder.id, extra={
            'parent_id': new_folder.parent_id,
        })
        return jsonify({
            "id": new_folder.id,
            "name": new_folder.name,
            "parent_id": new_folder.parent_id
        }), 201
    finally:
        db.close()

@document_bp.route('/document-folders/<int:folder_id>', methods=['PUT'])
@require_auth
@api_error_boundary(error='{error}')
def update_folder(current_user, folder_id):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    data = request.json
    name = data.get('name')
    
    if not name:
        return jsonify({"error": "Folder name is required"}), 400
        
    db: Session = SessionLocal()
    try:
        folder = db.query(DocumentFolder).filter(DocumentFolder.id == folder_id).first()
        if not folder:
            return jsonify({"error": "Folder not found"}), 404
            
        folder.name = name
        db.commit()
        emit_document_changed('folder_updated', entity='folder', entity_id=folder.id, folder_id=folder.id, extra={
            'parent_id': folder.parent_id,
        })
        return jsonify({"message": "Folder updated successfully"}), 200
    finally:
        db.close()

@document_bp.route('/document-folders/<int:folder_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(error='{error}')
def delete_folder(current_user, folder_id):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    db: Session = SessionLocal()
    try:
        folder = db.query(DocumentFolder).filter(DocumentFolder.id == folder_id).first()
        if not folder:
            return jsonify({"error": "Folder not found"}), 404
            
        # Kiểm tra xem có file hoặc thư mục con không
        has_children = db.query(DocumentFolder).filter(DocumentFolder.parent_id == folder_id).first()
        has_docs = db.query(Document).filter(Document.folder_id == folder_id).first()
        
        if has_children or has_docs:
            return jsonify({"error": "Không thể xóa thư mục vì đang chứa dữ liệu con."}), 400
            
        db.delete(folder)
        db.commit()
        emit_document_changed('folder_deleted', entity='folder', entity_id=folder_id, folder_id=folder_id)
        return jsonify({"message": "Folder deleted successfully"}), 200
    finally:
        db.close()

# --- API TÀI LIỆU (/api/documents) ---

@document_bp.route('/documents', methods=['GET'])
@require_auth
@api_error_boundary(error='{error}')
def get_documents(current_user):
    folder_id = request.args.get('folder_id')
    if not folder_id:
        return jsonify({"error": "folder_id is required"}), 400
        
    db: Session = SessionLocal()
    try:
        docs = db.query(Document).filter(Document.folder_id == folder_id).order_by(Document.created_at.desc()).all()
        
        result = []
        for d in docs:
            result.append({
                "id": d.id,
                "name": d.name,
                "type": d.type,
                "mime_type": d.mime_type,
                "url": d.url,
                "size_bytes": d.size_bytes,
                "created_at": d.created_at.strftime("%d/%m/%Y"),
                "updated_at": d.updated_at.strftime("%d/%m/%Y")
            })
        return jsonify(result), 200
    finally:
        db.close()

@document_bp.route('/documents/upload', methods=['POST'])
@require_auth
@api_error_boundary(error='{error}')
def upload_document(current_user):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    file = request.files['file']
    folder_id = request.form.get('folder_id')
    
    if file.filename == '' or not folder_id:
        return jsonify({"error": "File and folder_id are required"}), 400
        
    db: Session = SessionLocal()
    try:
        # Khởi tạo Drive Service
        drive_service = DriveService()
        
        # Upload lên Drive
        file_size = len(file.read())
        file.seek(0) # Reset con trỏ file sau khi tính size
        
        drive_result = drive_service.upload_file(file, file.filename, file.mimetype)
        
        # Lưu vào DB
        new_doc = Document(
            folder_id=folder_id,
            name=file.filename,
            type="file",
            mime_type=file.mimetype,
            google_drive_file_id=drive_result['id'],
            url=drive_result['view_link'],
            size_bytes=file_size,
            uploaded_by=current_user.id
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        emit_document_changed('document_uploaded', entity='document', entity_id=new_doc.id, folder_id=new_doc.folder_id)
        
        return jsonify({
            "id": new_doc.id,
            "name": new_doc.name,
            "url": new_doc.url
        }), 201
    finally:
        db.close()

@document_bp.route('/documents/link', methods=['POST'])
@require_auth
@api_error_boundary(error='{error}')
def add_document_link(current_user):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    data = request.json
    folder_id = data.get('folder_id')
    name = data.get('name')
    url = data.get('url')
    
    if not all([folder_id, name, url]):
        return jsonify({"error": "Missing required fields"}), 400
        
    db: Session = SessionLocal()
    try:
        new_doc = Document(
            folder_id=folder_id,
            name=name,
            type="link",
            mime_type="link",
            url=url,
            uploaded_by=current_user.id
        )
        db.add(new_doc)
        db.commit()
        db.refresh(new_doc)
        emit_document_changed('document_link_created', entity='document', entity_id=new_doc.id, folder_id=new_doc.folder_id)
        
        return jsonify({
            "id": new_doc.id,
            "name": new_doc.name,
            "url": new_doc.url
        }), 201
    finally:
        db.close()

@document_bp.route('/documents/<int:doc_id>', methods=['DELETE'])
@require_auth
@api_error_boundary(error='{error}')
def delete_document(current_user, doc_id):
    if not is_admin(current_user):
        return jsonify({"error": "Unauthorized. Admin only."}), 403
        
    db: Session = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == doc_id).first()
        if not doc:
            return jsonify({"error": "Document not found"}), 404
            
        # Nếu là file Drive, xóa trên Drive trước
        if doc.type == 'file' and doc.google_drive_file_id:
            try:
                drive_service = DriveService()
                drive_service.delete_file(doc.google_drive_file_id)
            except Exception:
                logger.exception("Lỗi không thể xóa file trên Drive")
                # Vẫn tiếp tục xóa trong DB để tránh rác
                
        folder_id = doc.folder_id
        db.delete(doc)
        db.commit()
        emit_document_changed('document_deleted', entity='document', entity_id=doc_id, folder_id=folder_id)
        return jsonify({"message": "Document deleted successfully"}), 200
    finally:
        db.close()
