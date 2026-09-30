"""survey_responses helpers split out by topic (records); re-exported by app.api.survey_responses."""

import logging
from flask import jsonify
from app.models.survey_response import SurveyResponse
from app.models.survey_template import SurveyTemplate
from app.models.examination import Examination
from app.realtime.events import emit_survey_changed
from app.utils.survey_scoring import score_survey_responses
from datetime import datetime

logger = logging.getLogger('app.api.survey_responses')


def get_appointment_id_for_examination(db, examination_id):
    if not examination_id:
        return None
    row = db.query(Examination.appointment_id).filter(Examination.id == examination_id).first()
    return row[0] if row else None


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


def calculate_total_scores(responses, survey_template_id, db):
    template = db.query(SurveyTemplate).filter(SurveyTemplate.id == survey_template_id).first()
    if not template:
        raise ValueError('Không tìm thấy mẫu khảo sát')
    return score_survey_responses(template.content, responses)
