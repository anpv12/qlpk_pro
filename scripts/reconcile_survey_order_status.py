"""Audit legacy order responses; --apply records only fully resolved results."""
import argparse
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.chi_dinh import ChiDinh
from app.models.survey_response import SurveyResponse
from app.utils.survey_scoring import score_survey_responses, questions_from_content
from app.modules.orders.services.survey_lifecycle import transition_order


def reconcile(db, apply=False):
    report = []
    for order in db.query(ChiDinh).filter(ChiDinh.survey_template_id.isnot(None), ChiDinh.status != 'completed').with_for_update().all():
        result = db.query(SurveyResponse).filter_by(order_id=order.id).order_by(SurveyResponse.updated_at.desc(), SurveyResponse.id.desc()).first()
        if not result:
            continue
        try:
            content = result.survey_template.content
            questions = questions_from_content(content)
            keys = []
            for q in questions:
                if q.get('type') in ('multiple_choice_grid', 'checkbox_grid'):
                    keys.extend(row.get('question_id') or row.get('id') for row in q.get('grid', {}).get('rows', []))
                else:
                    keys.append(q.get('id'))
            if not keys or any(k is None or not str(k).strip() or str(k) not in (result.responses or {}) for k in keys):
                raise ValueError('Thiếu câu trả lời hoặc mã câu hỏi; không tự kết luận hoàn thành')
            scores = score_survey_responses(content, result.responses)
            if scores != result.total_scores:
                raise ValueError('Điểm đã lưu không khớp; không tự sửa điểm')
            report.append({'order_id': order.id, 'response_id': result.id, 'action': 'has_result'})
            if apply:
                transition_order(order, 'has_result', result.updated_at or result.created_at)
        except ValueError as exc:
            report.append({'order_id': order.id, 'response_id': result.id, 'action': 'review', 'reason': str(exc)})
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    with SessionLocal() as db:
        print(reconcile(db, args.apply))
        if args.apply: db.commit()
        else: db.rollback()
