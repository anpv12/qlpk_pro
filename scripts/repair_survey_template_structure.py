"""Repair missing identities/legacy field names without assigning clinical scores."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.database import SessionLocal
from app.models.survey_template import SurveyTemplate
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.survey_response import SurveyResponse
from app.utils.survey_scoring import normalize_survey_content, validate_survey_content


def repair(db, apply=False):
    backup = {'templates': [], 'sessions': [], 'responses': []}
    needs_configuration = []
    for template in db.query(SurveyTemplate).filter(SurveyTemplate.is_active.is_(True), SurveyTemplate.content.isnot(None)).all():
        previous = deepcopy(template.content)
        normalized = normalize_survey_content(previous)
        try:
            validate_survey_content(normalized)
        except ValueError as exc:
            needs_configuration.append({'id': template.id, 'message': str(exc)})
        if previous == normalized:
            continue
        backup['templates'].append({'id': template.id, 'content': previous})
        # Freeze old results before changing catalog identities. Scores/answers are untouched.
        results = db.query(SurveyResponse).filter_by(survey_template_id=template.id).all()
        for result in results:
            if not result.template_snapshot:
                backup['responses'].append({'id': result.id, 'template_snapshot': None})
                if apply:
                    result.template_snapshot = {'name': template.name, 'content': deepcopy(previous)}
        sessions = db.query(SurveySession).filter_by(survey_template_id=template.id).all()
        for session in sessions:
            snapshot = session.template_snapshot or {'name': template.name, 'content': previous}
            if (session.status not in (SurveySessionStatus.pending, SurveySessionStatus.in_progress)
                    or session.draft_responses or any(r.session_id == session.id for r in results)
                    or snapshot.get('content') != previous):
                continue
            backup['sessions'].append({'id': session.id, 'template_snapshot': session.template_snapshot})
            if apply:
                session.template_snapshot = {**snapshot, 'content': deepcopy(normalized)}
        if apply:
            template.content = normalized
    return backup, needs_configuration


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    if args.apply and not args.backup:
        parser.error('--apply requires --backup')
    with SessionLocal() as db:
        backup, needs_configuration = repair(db, apply=args.apply)
        if args.apply:
            # Exclusive creation avoids overwriting an earlier recovery copy.
            with args.backup.open('x') as handle:
                args.backup.chmod(0o600)
                json.dump(backup, handle, ensure_ascii=False)
            db.commit()
        print(json.dumps({'applied': args.apply, 'changes': {k: len(v) for k, v in backup.items()},
                          'needs_configuration': needs_configuration}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
