"""Seed verified scoring for the existing GAD-7, PHQ-9, GDS-30 and Zung SAS templates.

Dry-run by default. Never rescore answers or reopen/extend a survey session.
See references/modules/survey-scoring-seed.md for sources and scope.
"""
import argparse
import hashlib
from copy import deepcopy
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.database import SessionLocal
from app.models.survey_template import SurveyTemplate
from app.models.survey_session import SurveySession, SurveySessionStatus
from app.models.survey_response import SurveyResponse
from app.utils.survey_scoring import validate_survey_content, validate_survey_identity_update

REVISION = 'verified-scoring-20260906-v1'
PROFILES = {22: ('GAD-7', 7, 4), 26: ('PHQ-9', 9, 4), 28: ('GDS', 29, 2), 30: ('ZAI', 20, 4)}
BASELINES = {
    22: '31d2318196f9b7f8a8c9e864fa5a3d2092eca38f1ef97f0989bbb23cfe1f4990',
    26: '5d6cb92b1135ef04f779c42a2be344f8d864242cac05f66a3620bf0bb356c8db',
    28: '79e21d65e35dc8a140bd4afc7c3532ae031c238a789903a7780abc305e671a69',
    30: '62855fb1011b25c15f5bebf63dc01f2134ab057bc0a5358494674394b8116a65',
}
PHQ_SOURCE = 'https://www.uab.edu/medicine/pcp-sci/images/SCIMS/PHQ-9_Instruction_Manual.pdf'
GDS_SOURCE = 'https://web.stanford.edu/~yesavage/GDS.english.long.html'
ZUNG_SOURCES = ['https://pmc.ncbi.nlm.nih.gov/articles/PMC9792673/',
                'https://pmc.ncbi.nlm.nih.gov/articles/PMC5591521/']
NOTE = 'Kết quả sàng lọc, cần được bác sĩ đánh giá cùng thông tin lâm sàng.'


def condition(low, high, label):
    return {'id': f'range_{low}_{high}', 'operator': 'between', 'min_score': low,
            'max_score': high, 'conclusion': label, 'note': NOTE}


def build_content(template_id, previous):
    content = deepcopy(previous)
    if content.get('scoring_seed', {}).get('revision') == REVISION:
        validate_survey_content(content)
        return content
    digest = hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    if digest != BASELINES[template_id]:
        raise ValueError(f'Mẫu {template_id} đã thay đổi so với bản đối chiếu; không ghi đè')
    code, count, ncols = PROFILES[template_id]
    q = content['questions'][0]
    rows, columns = q['grid']['rows'], q['grid']['columns']
    if q['type'] != 'multiple_choice_grid' or len(rows) != count or len(columns) != ncols:
        raise ValueError(f'{code}: cấu trúc khác mẫu đã đối chiếu; dừng seed')
    if any('scores' in r for r in rows) or any(c.get('score', c.get('value')) is not None for c in columns):
        raise ValueError(f'{code}: đã có cấu hình điểm; không ghi đè')
    if content.get('result_config'):
        raise ValueError(f'{code}: đã có cấu hình kết quả; cần đối chiếu trước')
    q['required'] = True
    config = {'scoring_method': 'total', 'calculation_type': 'sum',
              'conditions': [], 'group_configs': {}, 'special_alerts': []}
    source = [PHQ_SOURCE]
    if template_id in (22, 26):
        labels = ['Không ngày nào', 'Vài ngày', 'Hơn một nửa số ngày', 'Gần như mỗi ngày']
        q['text'] = 'Trong hai tuần qua, bạn bị những vấn đề sau làm phiền thường xuyên đến mức nào?'
        for i, col in enumerate(columns):
            col.update(score=i, text=labels[i], label=labels[i])
        if template_id == 22:
            config['conditions'] = [condition(0, 4, 'Mức độ lo âu tối thiểu'),
                condition(5, 9, 'Mức độ lo âu nhẹ'), condition(10, 14, 'Mức độ lo âu vừa'),
                condition(15, 21, 'Mức độ lo âu nặng')]
            # The functional-difficulty item is recorded but contributes zero points.
            for item in content['questions'][1:]:
                if any(a.get('score') != 0 for a in item.get('answers', [])):
                    raise ValueError('GAD-7: câu ảnh hưởng có điểm khác 0')
            content['score_conversion'] = '<p>GAD-7: tổng 7 mục, từ 0 đến 21 điểm. Câu về ảnh hưởng sinh hoạt không cộng vào tổng điểm.</p>'
        else:
            config['conditions'] = [condition(0, 4, 'Mức độ triệu chứng trầm cảm tối thiểu'),
                condition(5, 9, 'Mức độ triệu chứng trầm cảm nhẹ'),
                condition(10, 14, 'Mức độ triệu chứng trầm cảm vừa'),
                condition(15, 19, 'Mức độ triệu chứng trầm cảm khá nặng'),
                condition(20, 27, 'Mức độ triệu chứng trầm cảm nặng')]
            config['special_alerts'] = [{'id': 'phq9_item9_followup', 'question_id': rows[8]['id'],
                'operator': '>=', 'threshold': 1,
                'conclusion': 'Cần bác sĩ trao đổi trực tiếp về ý nghĩ tự làm hại bản thân.',
                'note': 'Mục 9 có câu trả lời khác “Không ngày nào”; không suy ra mức nguy cơ chỉ từ tổng điểm.'}]
            content['score_conversion'] = '<p>PHQ-9: tổng 9 mục trong hai tuần qua, từ 0 đến 27 điểm.</p>'
    elif template_id == 28:
        source = [GDS_SOURCE]
        rows.append({'id': 'seed_gds30_item30', 'text': 'Tôi thấy đầu óc mình vẫn minh mẫn như trước đây',
                     'criteria': 'Trầm cảm', 'score_enabled': True})
        reverse = {1, 5, 7, 9, 15, 19, 21, 27, 29, 30}
        for col, label, score in zip(columns, ['Đúng', 'Không'], [1, 0]):
            col.update(text=label, label=label, score=score)
        for i, row in enumerate(rows, 1):
            values = [0, 1] if i in reverse else [1, 0]
            row['scores'] = {str(c['id']): v for c, v in zip(columns, values)}
        config['conditions'] = [condition(0, 9, 'Chưa vượt ngưỡng sàng lọc GDS-30'),
            condition(10, 19, 'Mức độ triệu chứng trầm cảm nhẹ theo GDS-30'),
            condition(20, 30, 'Mức độ triệu chứng trầm cảm nặng theo GDS-30')]
        content['score_conversion'] = '<p>GDS-30: tổng 30 mục, từ 0 đến 30 điểm; điểm từng mục có tính chiều đảo.</p>'
    else:
        source = ZUNG_SOURCES
        q['text'] = 'Trong tuần qua, hãy chọn mức độ phù hợp nhất với tình trạng của bạn.'
        for i, col in enumerate(columns, 1):
            col['score'] = i
        for i, row in enumerate(rows, 1):
            values = [4, 3, 2, 1] if i in {5, 9, 13, 17, 19} else [1, 2, 3, 4]
            row['scores'] = {str(c['id']): v for c, v in zip(columns, values)}
        config.update(calculation_type='scale_conversion', conversion={'factor': 1.25, 'offset': 0})
        # Use the sourced screening threshold; do not invent severity bands.
        config['conditions'] = [dict(id='zung_below', operator='<', min_score=45,
            conclusion='Chưa vượt ngưỡng sàng lọc lo âu Zung', note=NOTE),
            dict(id='zung_followup', operator='>=', min_score=45,
            conclusion='Cần bác sĩ đánh giá thêm về triệu chứng lo âu', note=NOTE)]
        content['score_conversion'] = '<p>Zung SAS: tổng điểm thô 20–80; chỉ số lo âu = điểm thô × 1,25 (25–100). Ngưỡng sàng lọc dùng chỉ số 45, không dùng điểm thô.</p>'
    for row in rows:
        row['score_enabled'] = True
    content['result_config'] = config
    content['scoring_seed'] = {'revision': REVISION, 'instrument': code, 'sources': source}
    validate_survey_content(content)
    validate_survey_identity_update(previous, content)
    return content


def seed(db, *, apply=False, backup_path=None):
    backup = {'revision': REVISION, 'templates': [], 'sessions': [], 'responses': []}
    mutations = []
    for tid, (code, _, _) in PROFILES.items():
        template = db.query(SurveyTemplate).filter_by(id=tid, is_active=True).with_for_update().one()
        if code not in template.name:
            raise ValueError(f'Mẫu {tid} không khớp {code}')
        before = deepcopy(template.content)
        after = build_content(tid, before)
        if before == after:
            continue
        backup['templates'].append({'id': tid, 'name': template.name, 'content': before,
                                    'updated_at': template.updated_at.isoformat() if template.updated_at else None})
        mutations.append((template, 'content', after))
        results = db.query(SurveyResponse).filter_by(survey_template_id=tid).with_for_update().all()
        for result in results:
            if not result.template_snapshot:
                backup['responses'].append({'id': result.id, 'template_snapshot': None})
                mutations.append((result, 'template_snapshot', {'name': template.name, 'content': deepcopy(before)}))
        for session in db.query(SurveySession).filter_by(survey_template_id=tid).with_for_update().all():
            previous_snapshot = deepcopy(session.template_snapshot)
            has_answers = bool(session.draft_responses) or any(r.session_id == session.id for r in results)
            active = session.status in (SurveySessionStatus.pending, SurveySessionStatus.in_progress) and not session.is_expired()
            # Preserve old sessions; repair an empty active session only if it uses this exact catalog revision.
            snapshot = previous_snapshot or {'name': template.name, 'content': deepcopy(before)}
            if active and not has_answers and snapshot.get('content') == before:
                snapshot = {**snapshot, 'content': deepcopy(after)}
            if previous_snapshot != snapshot:
                backup['sessions'].append({'id': session.id, 'template_snapshot': previous_snapshot})
                mutations.append((session, 'template_snapshot', snapshot))
    if apply:
        if not backup_path:
            raise ValueError('Cần đường dẫn sao lưu')
        with os.fdopen(os.open(backup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
            json.dump(backup, handle, ensure_ascii=False, indent=2)
        for obj, field, value in mutations:
            setattr(obj, field, value)
        db.commit()
    return {kind: len(backup[kind]) for kind in ('templates', 'sessions', 'responses')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    with SessionLocal() as db:
        print(json.dumps({'applied': args.apply, 'changes': seed(db, apply=args.apply, backup_path=args.backup)}, ensure_ascii=False))
