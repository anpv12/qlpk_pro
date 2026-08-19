from flask import Blueprint, request, jsonify
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.survey_response import SurveyResponse
from app.models.survey_template import SurveyTemplate
from app.models.examination import Examination
from app.models.patient import Patient
from app.models.user import User
from app.api.auth import require_auth
from app.realtime.events import emit_survey_changed
import json
import logging
from datetime import datetime

survey_responses_router = Blueprint('survey_responses', __name__)
logger = logging.getLogger(__name__)

def get_appointment_id_for_examination(db, examination_id):
    if not examination_id:
        return None
    row = db.query(Examination.appointment_id).filter(Examination.id == examination_id).first()
    return row[0] if row else None

@survey_responses_router.route('/survey-templates/active', methods=['GET'])
@require_auth
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

    except Exception as e:
        logger.debug(f"Error getting active survey templates: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Lỗi khi lấy danh sách mẫu khảo sát'
        }), 500
    finally:
        db.close()

@survey_responses_router.route('/survey-templates/active/public', methods=['GET'])
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

    except Exception as e:
        logger.debug(f"Error getting active survey templates: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Lỗi khi lấy danh sách mẫu khảo sát'
        }), 500
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/examination/<int:examination_id>', methods=['GET'])
@require_auth
def get_survey_responses_by_examination(user, examination_id):
    """Lấy câu trả lời khảo sát theo examination_id"""
    try:
        db = next(get_db())
        responses = db.query(SurveyResponse).filter(
            SurveyResponse.examination_id == examination_id
        ).all()
        
        result = []
        for response in responses:
            response_data = response.to_dict()
            # Thêm thông tin template
            if response.survey_template:
                response_data['template_name'] = response.survey_template.name
                response_data['template_content'] = response.survey_template.content
            
            result.append(response_data)
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy câu trả lời: {str(e)}'
        }), 500

@survey_responses_router.route('/survey-templates/examination/<int:examination_id>/public', methods=['GET'])
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

    except Exception as e:
        logger.debug(f"Error getting survey templates by examination: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Lỗi khi lấy danh sách mẫu khảo sát'
        }), 500
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/examination/<int:examination_id>/public', methods=['GET'])
def get_survey_responses_by_examination_public(examination_id):
    """Lấy câu trả lời khảo sát theo examination_id (public route)"""
    try:
        db = next(get_db())
        responses = db.query(SurveyResponse).filter(
            SurveyResponse.examination_id == examination_id
        ).all()
        
        result = []
        for response in responses:
            response_data = response.to_dict()
            # Thêm thông tin template
            if response.survey_template:
                response_data['template_name'] = response.survey_template.name
                response_data['template_content'] = response.survey_template.content
            
            result.append(response_data)
        
        return jsonify({
            'success': True,
            'data': result
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi lấy câu trả lời: {str(e)}'
        }), 500

@survey_responses_router.route('/survey-responses', methods=['POST'])
@require_auth
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

        if existing_response:
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
        else:
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

    except Exception as e:
        logger.debug(f"Error creating survey response: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Lỗi khi tạo kết quả khảo sát'
        }), 500
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/public', methods=['POST'])
def create_survey_response_public():
    """Create a new survey response (public route for survey)"""
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

        if existing_response:
            # Update existing response
            existing_response.responses = data['responses']
            existing_response.notes = data.get('notes', '')
            existing_response.updated_at = datetime.utcnow()
            
            # Calculate total scores
            total_scores = calculate_total_scores(data['responses'], data['survey_template_id'], db)
            existing_response.total_scores = total_scores
            
            # Debug log
            logger.debug(f"💾 [SAVE-PUBLIC] Saving total_scores to existing_response ID {existing_response.id}: {total_scores}")
            
            db.commit()
            db.refresh(existing_response)
            emit_survey_changed(
                'response_updated',
                response=existing_response,
                appointment_id=get_appointment_id_for_examination(db, existing_response.examination_id),
                extra={'source': 'public'}
            )
            
            # Verify after commit
            logger.debug(f"✅ [VERIFY-PUBLIC] After commit, existing_response ID {existing_response.id}.total_scores: {existing_response.total_scores}")
            
            return jsonify({
                'success': True,
                'message': 'Cập nhật kết quả khảo sát thành công',
                'data': {
                    'id': existing_response.id,
                    'total_scores': total_scores
                }
            })
        else:
            # Create new response (without doctor_id for public route)
            new_response = SurveyResponse(
                examination_id=data['examination_id'],
                survey_template_id=data['survey_template_id'],
                patient_id=data['patient_id'],
                doctor_id=None,  # Will be set later by doctor
                responses=data['responses'],
                notes=data.get('notes', ''),
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            # Calculate total scores
            total_scores = calculate_total_scores(data['responses'], data['survey_template_id'], db)
            new_response.total_scores = total_scores
            
            db.add(new_response)
            db.commit()
            db.refresh(new_response)
            emit_survey_changed(
                'response_created',
                response=new_response,
                appointment_id=get_appointment_id_for_examination(db, new_response.examination_id),
                extra={'source': 'public'}
            )
            
            return jsonify({
                'success': True,
                'message': 'Tạo kết quả khảo sát thành công',
                'data': {
                    'id': new_response.id,
                    'total_scores': total_scores
                }
            })

    except Exception as e:
        logger.debug(f"Error creating survey response: {str(e)}")
        return jsonify({
            'success': False,
            'message': 'Lỗi khi tạo kết quả khảo sát'
        }), 500
    finally:
        db.close()

@survey_responses_router.route('/survey-responses/<int:response_id>', methods=['PUT'])
@require_auth
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
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi cập nhật câu trả lời: {str(e)}'
        }), 500

@survey_responses_router.route('/survey-responses/<int:response_id>/recalculate-scores', methods=['POST'])
@require_auth
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
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Lỗi khi tính lại điểm: {str(e)}'
        }), 500

def calculate_total_scores(responses, survey_template_id, db):
    """Tính tổng điểm theo tiêu chí"""
    try:
        # Get the survey template to access its content
        survey_template = db.query(SurveyTemplate).filter(SurveyTemplate.id == survey_template_id).first()
        if not survey_template:
            logger.debug(f"⚠️ [SCORE] Template {survey_template_id} not found")
            return {}

        content = json.loads(survey_template.content) if isinstance(survey_template.content, str) else survey_template.content
        
        # Xử lý cả cấu trúc cũ và mới
        questions = []
        if isinstance(content, list):
            # Cấu trúc mới (như DASS-21): content là array trực tiếp
            questions = content
        elif isinstance(content, dict):
            # Cấu trúc cũ: content có key 'questions'
            questions = content.get('questions', [])
        
        logger.debug(f"\n{'='*80}")
        logger.debug(f"📊 [SCORE] Calculating scores for template {survey_template_id}")
        logger.debug(f"📋 [SCORE] Questions count: {len(questions)}")
        logger.debug(f"📦 [SCORE] Responses keys: {list(responses.keys())}")
        logger.debug(f"📦 [SCORE] Responses (full): {json.dumps(responses, indent=2, ensure_ascii=False)}")
        logger.debug(f"{'='*80}\n")
        
        total_scores = {}
        
        for q_idx, question in enumerate(questions):
            criteria = question.get('scoring_criteria', question.get('criteria', ''))
            answers = question.get('answers', question.get('options', []))
            question_type = question.get('type', '')
            question_id = question.get('id', '')
            
            logger.debug(f"\n🔍 [SCORE] Question {q_idx + 1}/{len(questions)}:")
            logger.debug(f"   ID: {question_id}")
            logger.debug(f"   Type: {question_type}")
            logger.debug(f"   Criteria: {criteria}")
            logger.debug(f"   Answers count: {len(answers)}")
            if len(answers) > 0:
                logger.debug(f"   First answer: {answers[0]}")
            
            # ===== CASE 1: GRID QUESTION (DASS-21) =====
            if question_type in ['multiple_choice_grid', 'checkbox_grid']:
                grid_rows = question.get('grid', {}).get('rows', [])
                logger.debug(f"   📊 GRID QUESTION detected with {len(grid_rows)} rows")
                
                for row_idx, row in enumerate(grid_rows):
                    # Frontend gửi row.question_id hoặc row.id
                    row_question_id = row.get('question_id')
                    row_id = row.get('id')
                    row_qid = str(row_question_id or row_id or row_idx)
                    
                    logger.debug(f"\n   🔍 Row {row_idx + 1}/{len(grid_rows)}:")
                    logger.debug(f"      row.question_id = {row_question_id}")
                    logger.debug(f"      row.id = {row_id}")
                    logger.debug(f"      row_qid (calculated) = {row_qid}")
                    logger.debug(f"      row data: {row}")
                    
                    # Thử tìm với cả string và int key
                    answer_value = None
                    found_key = None
                    
                    if row_qid in responses:
                        answer_value = responses[row_qid]
                        found_key = row_qid
                        logger.debug(f"      ✅ Found by string key '{row_qid}': {answer_value}")
                    elif row_qid.isdigit() and int(row_qid) in responses:
                        answer_value = responses[int(row_qid)]
                        found_key = str(int(row_qid))
                        logger.debug(f"      ✅ Found by int key {int(row_qid)}: {answer_value}")
                    else:
                        # Thử tìm với tất cả các biến thể có thể
                        logger.debug(f"      ⚠️ Not found with row_qid={row_qid}, trying all response keys...")
                        for key in responses.keys():
                            key_str = str(key)
                            if key_str == row_qid or (row_qid.isdigit() and key_str == str(int(row_qid))):
                                answer_value = responses[key]
                                found_key = str(key)
                                logger.debug(f"      ✅ Found by variant key '{key}': {answer_value}")
                                break
                        if answer_value is None:
                            logger.debug(f"      ❌ No match found in responses keys: {list(responses.keys())}")
                    
                    if answer_value is None:
                        logger.debug(f"      ⚠️ Skipping row {row_idx} - no answer found")
                        continue
                    
                    # Tìm answer bằng ID hoặc index
                    answer = None
                    answer_found_by = None
                    try:
                        # Thử parse như index (1-based từ frontend)
                        # Xử lý đặc biệt: "0" có nghĩa là chọn answer đầu tiên (index 0)
                        answer_value_int = int(answer_value)
                        if answer_value_int == 0:
                            # "0" có nghĩa là chọn answer đầu tiên (index 0)
                            answer_index = 0
                        else:
                            # Các giá trị khác là 1-based index
                            answer_index = answer_value_int - 1
                        
                        if 0 <= answer_index < len(answers):
                            answer = answers[answer_index]
                            answer_found_by = f"index {answer_index}"
                            logger.debug(f"      ✅ Answer found by {answer_found_by}: {answer}")
                        else:
                            logger.debug(f"      ⚠️ Index {answer_index} out of range (answers count: {len(answers)})")
                    except (ValueError, TypeError):
                        # Nếu không phải số, tìm bằng ID
                        logger.debug(f"      🔍 answer_value '{answer_value}' is not a number, searching by ID...")
                        for ans_idx, ans in enumerate(answers):
                            ans_id = ans.get('id', ans_idx)
                            if str(ans_id) == str(answer_value):
                                answer = ans
                                answer_found_by = f"ID {ans_id}"
                                logger.debug(f"      ✅ Answer found by {answer_found_by}: {answer}")
                                break
                        if answer is None:
                            logger.debug(f"      ❌ No answer found with ID matching '{answer_value}'")
                            logger.debug(f"      Available answer IDs: {[ans.get('id', idx) for idx, ans in enumerate(answers)]}")
                    
                    # Tính score từ answer tìm được
                    if answer:
                        score = answer.get('score', answer.get('value', 0))
                        if criteria not in total_scores:
                            total_scores[criteria] = 0
                        total_scores[criteria] += score
                        logger.debug(f"      ✅ Added score {score} to criteria '{criteria}' (new total: {total_scores[criteria]})")
                    else:
                        logger.debug(f"      ❌ Cannot calculate score - answer not found")
            
            # ===== CASE 2: NORMAL QUESTION =====
            else:
                question_id_str = str(question_id)
                logger.debug(f"   📝 NORMAL QUESTION detected")
                logger.debug(f"      question_id (string): {question_id_str}")
                
                # Thử tìm với cả string và int key
                answer_value = None
                found_key = None
                
                if question_id_str in responses:
                    answer_value = responses[question_id_str]
                    found_key = question_id_str
                    logger.debug(f"      ✅ Found by string key '{question_id_str}': {answer_value}")
                elif question_id_str.isdigit() and int(question_id_str) in responses:
                    answer_value = responses[int(question_id_str)]
                    found_key = str(int(question_id_str))
                    logger.debug(f"      ✅ Found by int key {int(question_id_str)}: {answer_value}")
                else:
                    logger.debug(f"      ⚠️ Not found with question_id={question_id_str}, trying all response keys...")
                    for key in responses.keys():
                        key_str = str(key)
                        if key_str == question_id_str or (question_id_str.isdigit() and key_str == str(int(question_id_str))):
                            answer_value = responses[key]
                            found_key = str(key)
                            logger.debug(f"      ✅ Found by variant key '{key}': {answer_value}")
                            break
                    if answer_value is None:
                        logger.debug(f"      ❌ No match found in responses keys: {list(responses.keys())}")
                
                if answer_value is None:
                    logger.debug(f"      ⚠️ Skipping question - no answer found")
                    continue
                
                # Tìm answer bằng ID hoặc index
                answer = None
                answer_found_by = None
                try:
                    # Thử parse như index (1-based từ frontend)
                    # Xử lý đặc biệt: "0" có nghĩa là chọn answer đầu tiên (index 0)
                    answer_value_int = int(answer_value)
                    if answer_value_int == 0:
                        # "0" có nghĩa là chọn answer đầu tiên (index 0)
                        answer_index = 0
                    else:
                        # Các giá trị khác là 1-based index
                        answer_index = answer_value_int - 1
                    
                    if 0 <= answer_index < len(answers):
                        answer = answers[answer_index]
                        answer_found_by = f"index {answer_index}"
                        logger.debug(f"      ✅ Answer found by {answer_found_by}: {answer}")
                    else:
                        logger.debug(f"      ⚠️ Index {answer_index} out of range (answers count: {len(answers)})")
                except (ValueError, TypeError):
                    # Nếu không phải số, tìm bằng ID
                    logger.debug(f"      🔍 answer_value '{answer_value}' is not a number, searching by ID...")
                    for ans_idx, ans in enumerate(answers):
                        ans_id = ans.get('id', ans_idx)
                        if str(ans_id) == str(answer_value):
                            answer = ans
                            answer_found_by = f"ID {ans_id}"
                            logger.debug(f"      ✅ Answer found by {answer_found_by}: {answer}")
                            break
                    if answer is None:
                        logger.debug(f"      ❌ No answer found with ID matching '{answer_value}'")
                        logger.debug(f"      Available answer IDs: {[ans.get('id', idx) for idx, ans in enumerate(answers)]}")
                
                # Tính score từ answer tìm được
                if answer:
                    score = answer.get('score', answer.get('value', 0))
                    if criteria not in total_scores:
                        total_scores[criteria] = 0
                    total_scores[criteria] += score
                    logger.debug(f"      ✅ Added score {score} to criteria '{criteria}' (new total: {total_scores[criteria]})")
                else:
                    logger.debug(f"      ❌ Cannot calculate score - answer not found")
        
        logger.debug(f"\n{'='*80}")
        logger.debug(f"📊 [SCORE] Final total_scores: {json.dumps(total_scores, indent=2, ensure_ascii=False)}")
        logger.debug(f"{'='*80}\n")
        return total_scores
        
    except Exception as e:
        logger.exception("Lỗi tính điểm khảo sát")
        return {}
