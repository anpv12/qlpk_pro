from flask import Blueprint, request, jsonify
from app.core.database import get_db
from app.models.survey_response import SurveyResponse
from app.models.survey_template import SurveyTemplate
from app.utils.survey_scoring import survey_questions_by_criteria
from app.models.examination import Examination
from app.api.auth import require_auth
from app.realtime.events import emit_survey_changed
from app.utils.survey_scoring import score_survey_responses
import json
import logging
from datetime import datetime
from app.utils.api_error_contract import api_error_boundary

survey_responses_router = Blueprint('survey_responses', __name__)
logger = logging.getLogger(__name__)

def get_appointment_id_for_examination(db, examination_id):
    if not examination_id:
        return None
    row = db.query(Examination.appointment_id).filter(Examination.id == examination_id).first()
    return row[0] if row else None

@survey_responses_router.route('/survey-templates/active', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi lấy danh sách mẫu khảo sát')
def get_active_survey_templates(user):
    """Get all active survey templates"""
    try:
        db = next(get_db())

        templates = db.query(SurveyTemplate).filter(SurveyTemplate.is_active == True).all()

        templates_data = []
        for template in templates:
            # Parse content JSON để lấy câu hỏi theo tiêu chí
            questions_by_criteria = {}
            if template.content:
                content = json.loads(template.content) if isinstance(template.content, str) else template.content
                
                # Xử lý cả cấu trúc cũ và mới
                questions = []
                if isinstance(content, list):
                    # Cấu trúc mới (như DASS-21): content là array trực tiếp
                    questions = content
                elif isinstance(content, dict):
                    # Cấu trúc cũ: content có key 'questions'
                    questions = content.get('questions', [])
                
                for question in questions:
                    criteria = question.get('scoring_criteria', question.get('criteria', ''))
                    if criteria not in questions_by_criteria:
                        questions_by_criteria[criteria] = []
                    questions_by_criteria[criteria].append(question)
            
            template_data = {
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'questions_by_criteria': questions_by_criteria,
                'created_at': template.created_at.isoformat() if template.created_at else None,
                'updated_at': template.updated_at.isoformat() if template.updated_at else None
            }
            templates_data.append(template_data)

        return jsonify({
            'success': True,
            'data': templates_data
        })

    finally:
        db.close()

@survey_responses_router.route('/survey-templates/active/public', methods=['GET'])
@api_error_boundary(success=False, message='Lỗi khi lấy danh sách mẫu khảo sát')
def get_active_survey_templates_public():
    """Get all active survey templates (public route for survey)"""
    try:
        db = next(get_db())

        templates = db.query(SurveyTemplate).filter(SurveyTemplate.is_active == True).all()

        templates_data = []
        for template in templates:
            # Parse content JSON để lấy câu hỏi theo tiêu chí
            questions_by_criteria = {}
            if template.content:
                content = json.loads(template.content) if isinstance(template.content, str) else template.content
                
                # Xử lý cả cấu trúc cũ và mới
                questions = []
                if isinstance(content, list):
                    # Cấu trúc mới (như DASS-21): content là array trực tiếp
                    questions = content
                elif isinstance(content, dict):
                    # Cấu trúc cũ: content có key 'questions'
                    questions = content.get('questions', [])
                
                for question in questions:
                    criteria = question.get('scoring_criteria', question.get('criteria', ''))
                    if criteria not in questions_by_criteria:
                        questions_by_criteria[criteria] = []
                    questions_by_criteria[criteria].append(question)
            
            template_data = {
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'questions_by_criteria': questions_by_criteria,
                'created_at': template.created_at.isoformat() if template.created_at else None,
                'updated_at': template.updated_at.isoformat() if template.updated_at else None
            }
            templates_data.append(template_data)

        return jsonify({
            'success': True,
            'data': templates_data
        })

    finally:
        db.close()

@survey_responses_router.route('/survey-responses/examination/<int:examination_id>', methods=['GET'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi lấy câu trả lời: {error}')
def get_survey_responses_by_examination(user, examination_id):
    """Lấy câu trả lời khảo sát theo examination_id"""
    try:
        db = next(get_db())
        from app.modules.orders.api.chi_dinh import _get_accessible_chi_dinh
        order_id = request.args.get('order_id', type=int)
        if order_id:
            order, error = _get_accessible_chi_dinh(db, user, order_id)
            if error:
                return jsonify(success=False, message=error), 403
            responses = db.query(SurveyResponse).filter_by(order_id=order_id, examination_id=examination_id).all()
        else:
            from app.utils.clinical_access import examination_access_error
            examination = db.query(Examination).filter_by(id=examination_id).first()
            if not examination or examination_access_error(db, user, examination):
                return jsonify(success=False, message='Không có quyền xem kết quả'), 403
            responses = db.query(SurveyResponse).filter_by(examination_id=examination_id).all()
        
        result = []
        for response in responses:
            response_data = response.to_dict()
            # Thêm thông tin template
            if response.survey_template:
                response_data['template_name'] = response.survey_template.name
                response_data['template_content'] = (response.template_snapshot or {}).get('content', response.survey_template.content)
                response_data['questions_by_criteria'] = survey_questions_by_criteria(response_data['template_content'])
            
            result.append(response_data)
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    finally:
        db.close()

@survey_responses_router.route('/survey-templates/examination/<int:examination_id>/public', methods=['GET'])
@api_error_boundary(success=False, message='Lỗi khi lấy danh sách mẫu khảo sát')
def get_survey_templates_by_examination_public(examination_id):
    """Lấy danh sách template khảo sát theo examination_id (public route)"""
    try:
        db = next(get_db())
        
        # Lấy tất cả survey responses cho examination này
        responses = db.query(SurveyResponse).filter(
            SurveyResponse.examination_id == examination_id
        ).all()
        
        # Lấy danh sách template_id từ responses
        template_ids = [response.survey_template_id for response in responses]
        
        # Nếu có survey responses, lấy templates tương ứng
        if template_ids:
            templates = db.query(SurveyTemplate).filter(
                SurveyTemplate.id.in_(template_ids),
                SurveyTemplate.is_active == True
            ).all()
        else:
            # Nếu chưa có survey responses, load tất cả active templates
            # (fallback behavior)
            templates = db.query(SurveyTemplate).filter(
                SurveyTemplate.is_active == True
            ).all()
        
        templates_data = []
        for template in templates:
            # Parse content JSON để lấy câu hỏi theo tiêu chí
            questions_by_criteria = {}
            if template.content:
                content = json.loads(template.content) if isinstance(template.content, str) else template.content
                
                # Xử lý cả cấu trúc cũ và mới
                questions = []
                if isinstance(content, list):
                    # Cấu trúc mới (như DASS-21): content là array trực tiếp
                    questions = content
                elif isinstance(content, dict):
                    # Cấu trúc cũ: content có key 'questions'
                    questions = content.get('questions', [])
                
                for question in questions:
                    criteria = question.get('scoring_criteria', question.get('criteria', ''))
                    if criteria not in questions_by_criteria:
                        questions_by_criteria[criteria] = []
                    questions_by_criteria[criteria].append(question)
            
            template_data = {
                'id': template.id,
                'name': template.name,
                'description': template.description,
                'content': template.content,  # Thêm raw content
                'questions_by_criteria': questions_by_criteria,
                'created_at': template.created_at.isoformat() if template.created_at else None,
                'updated_at': template.updated_at.isoformat() if template.updated_at else None
            }
            templates_data.append(template_data)

        return jsonify({
            'success': True,
            'data': templates_data
        })

    finally:
        db.close()

@survey_responses_router.route('/survey-responses/examination/<int:examination_id>/public', methods=['GET'])
@api_error_boundary(success=False, message='Lỗi khi lấy câu trả lời: {error}')
def get_survey_responses_by_examination_public(examination_id):
    """Lấy câu trả lời khảo sát theo examination_id (public route)"""
    db = next(get_db())
    from app.models.survey_session import SurveySession, SurveySessionStatus
    session = db.query(SurveySession).filter_by(session_token=request.args.get('session_token'), examination_id=examination_id).first()
    if not session or not session.order_id:
        return jsonify(success=False, message='Phiên khảo sát không hợp lệ'), 403
    responses = db.query(SurveyResponse).filter_by(session_id=session.id).all()
    if not responses and session.status == SurveySessionStatus.completed:
        responses = db.query(SurveyResponse).filter_by(order_id=session.order_id, session_id=None).all()

    result = []
    for response in responses:
        response_data = response.to_dict()
        # Thêm thông tin template
        if response.survey_template:
            response_data['template_name'] = response.survey_template.name
            response_data['template_content'] = (response.template_snapshot or {}).get('content', response.survey_template.content)
            response_data['questions_by_criteria'] = survey_questions_by_criteria(response_data['template_content'])
            
        result.append(response_data)
        
    return jsonify({
        'success': True,
        'data': result
    })
        

def _create_new_survey_response(data, db, user):
    # Create new response
    new_response = SurveyResponse(
        examination_id=data['examination_id'],
        survey_template_id=data['survey_template_id'],
        patient_id=data['patient_id'],
        doctor_id=user.id,
        responses=data['responses'],
        notes=data.get('notes', ''),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )

    # Calculate total scores
    total_scores = calculate_total_scores(data['responses'], data['survey_template_id'], db)
    new_response.total_scores = total_scores

    # Debug log
    logger.debug(f"💾 [SAVE-AUTH] Saving total_scores to new_response: {total_scores}")

    db.add(new_response)
    db.commit()
    db.refresh(new_response)
    emit_survey_changed(
        'response_created',
        response=new_response,
        appointment_id=get_appointment_id_for_examination(db, new_response.examination_id),
        extra={'source': 'authenticated'}
    )

    # Verify after commit
    logger.debug(f"✅ [VERIFY-AUTH] After commit, new_response ID {new_response.id}.total_scores: {new_response.total_scores}")

    return jsonify({
        'success': True,
        'message': 'Tạo kết quả khảo sát thành công',
        'data': {
            'id': new_response.id,
            'total_scores': total_scores
        }
    })


def _update_existing_survey_response(data, db, existing_response):
    # Update existing response
    existing_response.responses = data['responses']
    existing_response.notes = data.get('notes', '')
    existing_response.updated_at = datetime.utcnow()

    # Calculate total scores
    total_scores = calculate_total_scores(data['responses'], data['survey_template_id'], db)
    existing_response.total_scores = total_scores

    # Debug log
    logger.debug(f"💾 [SAVE-AUTH] Saving total_scores to existing_response ID {existing_response.id}: {total_scores}")

    db.commit()
    db.refresh(existing_response)
    emit_survey_changed(
        'response_updated',
        response=existing_response,
        appointment_id=get_appointment_id_for_examination(db, existing_response.examination_id),
        extra={'source': 'authenticated'}
    )

    # Verify after commit
    logger.debug(f"✅ [VERIFY-AUTH] After commit, existing_response ID {existing_response.id}.total_scores: {existing_response.total_scores}")

    return jsonify({
        'success': True,
        'message': 'Cập nhật kết quả khảo sát thành công',
        'data': {
            'id': existing_response.id,
            'total_scores': total_scores
        }
    })


@survey_responses_router.route('/survey-responses', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi tạo kết quả khảo sát')
def create_survey_response(user):
    """Create a new survey response"""
    try:
        db = next(get_db())
        data = request.get_json()

        # Validate required fields
        required_fields = ['examination_id', 'survey_template_id', 'patient_id', 'responses']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'success': False,
                    'message': f'Thiếu trường bắt buộc: {field}'
                }), 400

        # Check if response already exists
        existing_response = db.query(SurveyResponse).filter(
            SurveyResponse.examination_id == data['examination_id'],
            SurveyResponse.survey_template_id == data['survey_template_id'],
            SurveyResponse.patient_id == data['patient_id']
        ).first()

        if existing_response and existing_response.order_id:
            return jsonify(success=False, message='Bài đã nộp chỉ được xem'), 409
        if existing_response:
            return _update_existing_survey_response(data, db, existing_response)
        else:
            return _create_new_survey_response(data, db, user)

    except ValueError:
        db.rollback()
        return jsonify({'success': False, 'code': 'SURVEY_ANSWER_MISMATCH',
                        'message': 'Chưa lưu được kết quả. Vui lòng kiểm tra lại mẫu và câu trả lời khảo sát.'}), 400
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/public', methods=['POST'])
@api_error_boundary(success=False, message='Không thể lưu kết quả khảo sát')
def create_survey_response_public():
    from app.modules.orders.services.survey_lifecycle import submit_order_survey, SurveyLifecycleError
    from app.api.survey_sessions import _emit_survey_completion_notifications
    from app.realtime.events import emit_order_changed
    db = next(get_db())
    try:
        result, order, session, changed = submit_order_survey(db, request.get_json(silent=True))
        db.commit()
        if changed:
            emit_order_changed('survey_result_available', order=order)
            emit_survey_changed('response_created', response=result, session=session,
                                appointment_id=order.appointment_id)
            _emit_survey_completion_notifications(db, session, result.survey_template_id)
        return jsonify(success=True, data={'id': result.id, 'total_scores': result.total_scores,
                       'result_summary': result.to_dict()['result_summary'],
                       'order_id': order.id, 'order_status': order.status})
    except SurveyLifecycleError as exc:
        db.rollback()
        return jsonify(success=False, message=str(exc)), exc.status
    except ValueError:
        db.rollback()
        return jsonify(success=False, code='SURVEY_ANSWER_MISMATCH',
                       message='Chưa lưu được kết quả. Vui lòng kiểm tra lại mẫu và câu trả lời khảo sát.'), 400
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/<int:response_id>', methods=['PUT'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi cập nhật câu trả lời: {error}')
def update_survey_response(user, response_id):
    """Cập nhật câu trả lời khảo sát"""
    try:
        data = request.get_json()
        db = next(get_db())
        
        survey_response = db.query(SurveyResponse).filter(
            SurveyResponse.id == response_id
        ).first()
        
        if not survey_response:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy câu trả lời'
            }), 404
        
        if survey_response.order_id and 'responses' in data:
            return jsonify(success=False, message='Bài đã nộp chỉ được xem'), 409
        # Cập nhật dữ liệu
        if 'responses' in data:
            survey_response.responses = data['responses']
            # Tính lại tổng điểm
            total_scores = calculate_total_scores(data['responses'], survey_response.survey_template_id, db)
            survey_response.total_scores = total_scores
        
        if 'notes' in data:
            survey_response.notes = data['notes']
        
        db.commit()
        db.refresh(survey_response)
        emit_survey_changed(
            'response_updated',
            response=survey_response,
            appointment_id=get_appointment_id_for_examination(db, survey_response.examination_id),
            extra={'source': 'authenticated'}
        )
        
        return jsonify({
            'success': True,
            'data': survey_response.to_dict(),
            'message': 'Đã cập nhật câu trả lời thành công'
        })
        
    except ValueError:
        db.rollback()
        return jsonify({'success': False, 'code': 'SURVEY_ANSWER_MISMATCH',
                        'message': 'Chưa lưu được kết quả. Vui lòng kiểm tra lại mẫu và câu trả lời khảo sát.'}), 400

@survey_responses_router.route('/survey-responses/<int:response_id>/recalculate-scores', methods=['POST'])
@require_auth
@api_error_boundary(success=False, message='Lỗi khi tính lại điểm: {error}')
def recalculate_survey_scores(user, response_id):
    """Tính lại điểm cho khảo sát"""
    try:
        db = next(get_db())
        
        survey_response = db.query(SurveyResponse).filter(
            SurveyResponse.id == response_id
        ).first()
        
        if not survey_response:
            return jsonify({
                'success': False,
                'message': 'Không tìm thấy câu trả lời'
            }), 404
        
        if survey_response.order_id:
            return jsonify(success=False, message='Điểm bài đã nộp được giữ theo kết quả đã lưu'), 409
        # Tính lại tổng điểm
        total_scores = calculate_total_scores(survey_response.responses, survey_response.survey_template_id, db)
        survey_response.total_scores = total_scores
        
        db.commit()
        db.refresh(survey_response)
        emit_survey_changed(
            'scores_recalculated',
            response=survey_response,
            appointment_id=get_appointment_id_for_examination(db, survey_response.examination_id),
            extra={'source': 'authenticated'}
        )
        
        return jsonify({
            'success': True,
            'data': {
                'id': survey_response.id,
                'total_scores': total_scores
            },
            'message': 'Đã tính lại điểm thành công'
        })
        
    except ValueError:
        db.rollback()
        return jsonify({'success': False, 'code': 'SURVEY_ANSWER_MISMATCH',
                        'message': 'Chưa lưu được kết quả. Vui lòng kiểm tra lại mẫu và câu trả lời khảo sát.'}), 400

def calculate_total_scores(responses, survey_template_id, db):
    template = db.query(SurveyTemplate).filter(SurveyTemplate.id == survey_template_id).first()
    if not template:
        raise ValueError('Không tìm thấy mẫu khảo sát')
    return score_survey_responses(template.content, responses)
