"""Stable questionnaire identities and server-owned scoring."""

from copy import deepcopy
import json
import math
from uuid import uuid4


class SurveyIdentityConflict(ValueError):
    pass


def validate_survey_identity_update(previous, updated):
    """Do not orphan saved answers while normalizing or editing a used template."""
    def identities(content):
        result = set()
        for question in questions_from_content(content):
            if not _has_id(question.get('id')):
                raise SurveyIdentityConflict('Mẫu đã có kết quả nhưng thiếu mã câu hỏi')
            qid = str(question['id'])
            result.add((qid,))
            for answer in question.get('answers', question.get('options', [])):
                if not _has_id(answer.get('id')):
                    raise SurveyIdentityConflict('Mẫu đã có kết quả nhưng thiếu mã đáp án')
                result.add((qid, 'answer', str(answer['id'])))
            for kind in ('rows', 'columns'):
                for item in question.get('grid', {}).get(kind, []):
                    if not isinstance(item, dict) or not _has_id(item.get('id')):
                        raise SurveyIdentityConflict('Mẫu đã có kết quả nhưng thiếu mã hàng/cột')
                    result.add((qid, kind, str(item['id'])))
        return result
    if not identities(previous).issubset(identities(updated)):
        raise SurveyIdentityConflict('Không được bỏ mã câu hỏi/đáp án của mẫu đã có kết quả')


def questions_from_content(content):
    if isinstance(content, str):
        content = json.loads(content)
    if content is not None and not isinstance(content, (dict, list)):
        raise ValueError('Cấu trúc mẫu khảo sát không hợp lệ')
    questions = content if isinstance(content, list) else (content or {}).get('questions', [])
    if not isinstance(questions, list):
        raise ValueError('Danh sách câu hỏi không hợp lệ')
    return questions


def _has_id(value):
    return value is not None and str(value).strip() != ''


def survey_questions_by_criteria(content):
    grouped = {}
    for q in questions_from_content(content):
        criteria = q.get('criteria', q.get('scoring_criteria', ''))
        if q.get('type') in ('multiple_choice_grid', 'checkbox_grid'):
            for row in q.get('grid', {}).get('rows', []):
                group = row.get('criteria', row.get('scoring_criteria', criteria))
                grouped.setdefault(group, []).append({**row, 'id': row.get('question_id') or row.get('id'),
                    'answers': q.get('grid', {}).get('columns', [])})
        else:
            grouped.setdefault(criteria, []).append(q)
    return grouped


def _normalize_grid_identities(grid, identity, question, seen):
    column_ids = set()
    for column in grid.get('columns', []):
        if isinstance(column, dict):
            identity(column, column_ids)
            column.setdefault('label', column.get('text', ''))
            if 'score' not in column and 'value' in column:
                column['score'] = column['value']
    for row in grid.get('rows', []):
        if isinstance(row, dict):
            if _has_id(row.get('question_id')) and not _has_id(row.get('id')):
                row['id'] = row['question_id']
            identity(row, seen)
            if 'scores' in row and not isinstance(row['scores'], dict):
                raise ValueError('Điểm từng ô phải gắn với mã cột')
            row.setdefault('criteria', row.get('scoring_criteria', question.get('criteria', '')))
            row.setdefault('score_enabled', True)


def normalize_survey_content(content):
    """Fill missing IDs on template writes; never regenerate existing identities."""
    if content is None:
        return None
    result = deepcopy(json.loads(content) if isinstance(content, str) else content)
    seen = set()

    def identity(item, used):
        if not isinstance(item, dict):
            raise ValueError('Cấu trúc câu hỏi hoặc đáp án không hợp lệ')
        if not _has_id(item.get('id')):
            item['id'] = 'id_' + uuid4().hex
        key = str(item['id'])
        if key in used:
            raise ValueError('Mã câu hỏi hoặc đáp án bị trùng')
        used.add(key)

    for question in questions_from_content(result):
        identity(question, seen)
        if 'criteria' not in question and 'scoring_criteria' in question:
            question['criteria'] = question['scoring_criteria']
        answer_ids = set()
        answers = question.get('answers', question.get('options', []))
        if not isinstance(answers, list):
            raise ValueError('Danh sách đáp án không hợp lệ')
        for answer in answers:
            identity(answer, answer_ids)
        grid = question.get('grid', {})
        if not isinstance(grid, dict) or not isinstance(grid.get('columns', []), list) or not isinstance(grid.get('rows', []), list):
            raise ValueError('Cấu trúc lưới khảo sát không hợp lệ')
        _normalize_grid_identities(grid, identity, question, seen)
    return result


def _score_selected_values(enabled, kind, options, question, values):
    score = 0
    for selected in values:
        matches = [a for a in options if isinstance(a, dict)
                   and _has_id(a.get('id')) and str(a['id']) == str(selected)]
        if len(matches) > 1:
            raise ValueError('Mã đáp án bị trùng trong câu hỏi')
        answer = matches[0] if matches else None
        if answer is None and str(selected).isdigit():
            index = int(selected)
            if index < len(options) and isinstance(options[index], dict) and not _has_id(options[index].get('id')):
                answer = options[index]
        if kind == 'linear_scale':
            bounds = question.get('linear_scale', {})
            number = float(selected)
            if not bounds.get('min', 1) <= number <= bounds.get('max', 5):
                raise ValueError('Điểm ngoài thang khảo sát')
        elif answer is not None:
            number = answer.get('score', answer.get('value'))
        else:
            raise ValueError('Không ghép được đáp án với mẫu khảo sát')
        if not enabled:
            continue
        if isinstance(number, bool) or not isinstance(number, (int, float)) or not math.isfinite(number):
            raise ValueError('Điểm đáp án chưa được cấu hình hợp lệ')
        score += number
    return score


def _score_template_questions(content, score_question):
    for question in questions_from_content(content):
        criteria = question.get('scoring_criteria', question.get('criteria', ''))
        if question.get('type') in ('multiple_choice_grid', 'checkbox_grid'):
            grid = question.get('grid', {})
            options = grid.get('columns') or question.get('answers', [])
            for row in grid.get('rows', []):
                row_options = [{**col, 'score': row['scores'].get(str(col.get('id')))}
                               for col in options] if 'scores' in row else options
                score_question(question, row.get('question_id') or row.get('id'), row_options,
                               row.get('scoring_criteria', row.get('criteria', criteria)),
                               row.get('score_enabled', True))
        else:
            score_question(question, question.get('id'),
                           question.get('answers', question.get('options', [])), criteria)


def score_survey_responses(content, responses, *, details=False):
    """Resolve exact IDs; numeric legacy options without IDs use frontend's zero-based index."""
    if not isinstance(responses, dict):
        raise ValueError('Câu trả lời khảo sát không hợp lệ')
    responses = {str(key): value for key, value in responses.items()}
    remaining = set(responses)
    consumed = set()
    totals = {}
    question_scores = {}
    group_counts = {}

    def score_question(question, key, options, criteria, enabled=True):
        if not _has_id(key) or str(key) not in responses:
            if question.get('required'):
                raise ValueError('Chưa trả lời câu hỏi bắt buộc')
            return
        key = str(key)
        if key in consumed:
            raise ValueError('Mã câu hỏi bị trùng trong mẫu khảo sát')
        consumed.add(key)
        remaining.discard(key)
        value = responses[key]
        if value is None or value == '' or value == []:
            if question.get('required'):
                raise ValueError('Chưa trả lời câu hỏi bắt buộc')
            return
        kind = question.get('type', 'multiple_choice')
        if kind in ('short_answer', 'paragraph', 'date', 'time'):
            return
        if isinstance(value, list) and kind not in ('checkboxes', 'checkbox_grid'):
            raise ValueError('Câu hỏi chỉ cho phép chọn một đáp án')
        values = value if isinstance(value, list) else [value]
        if len(values) != len(set(map(str, values))):
            raise ValueError('Đáp án bị lặp')
        score = _score_selected_values(enabled, kind, options, question, values)
        if not enabled:
            return
        if criteria:
            totals[criteria] = totals.get(criteria, 0) + score
            group_counts[criteria] = group_counts.get(criteria, 0) + 1
        question_scores[key] = score

    _score_template_questions(content, score_question)
    if remaining:
        raise ValueError('Có câu trả lời không thuộc mã câu hỏi của mẫu khảo sát')
    if any(not math.isfinite(value) for value in totals.values()):
        raise ValueError('Tổng điểm vượt giới hạn hợp lệ')
    return {'groups': totals, 'questions': question_scores, 'counts': group_counts} if details else totals


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _validate_result_config(content, keys):
    config = content.get('result_config', {}) if isinstance(content, dict) else {}
    if not isinstance(config, dict) or not isinstance(config.get('conditions', []), list) or not isinstance(config.get('group_configs', {}), dict) or not isinstance(config.get('special_alerts', []), list):
        raise ValueError('Cấu hình kết quả không hợp lệ')
    if config.get('scoring_method', 'total') not in ('total', 'by_group'):
        raise ValueError('Cách tính kết quả không hợp lệ')
    if config.get('calculation_type', 'sum') not in ('sum', 'average', 'scale_conversion'):
        raise ValueError('Phương thức tính điểm không hợp lệ')
    if config.get('scoring_method', 'total') == 'total' and config.get('calculation_type') == 'scale_conversion':
        conversion = config.get('conversion', {})
        if not isinstance(conversion, dict) or not _number(conversion.get('factor')) or not _number(conversion.get('offset')):
            raise ValueError('Vui lòng cấu hình hệ số và số cộng khi quy đổi điểm')
    conditions = list(config.get('conditions', []))
    for group in config.get('group_configs', {}).values():
        if not isinstance(group, dict) or not isinstance(group.get('conditions', []), list):
            raise ValueError('Cấu hình kết quả nhóm không hợp lệ')
        conditions.extend(group.get('conditions', []))
    for condition in conditions:
        if not isinstance(condition, dict) or condition.get('operator') not in ('between', '>', '>=', '<', '<=', '=') or not _number(condition.get('min_score')):
            raise ValueError('Điều kiện kết quả không hợp lệ')
        if condition['operator'] == 'between' and (not _number(condition.get('max_score')) or condition['max_score'] < condition['min_score']):
            raise ValueError('Khoảng điểm kết quả không hợp lệ')
    for alert in config.get('special_alerts', []):
        if not isinstance(alert, dict) or str(alert.get('question_id')) not in keys or not _number(alert.get('threshold')) or alert.get('operator') not in ('>', '>=', '<', '<=', '='):
            raise ValueError('Lưu ý đặc biệt phải gắn với câu hỏi và điều kiện hợp lệ')


def _validate_question_options(index, keys, q):
    kind = q.get('type', 'multiple_choice')
    if kind in ('multiple_choice_grid', 'checkbox_grid'):
        grid = q.get('grid', {})
        options = grid.get('columns', [])
        rows = grid.get('rows', [])
        if not options or not rows:
            raise ValueError(f'Câu {index} cần có hàng và cột')
        for row in rows:
            if not _has_id(row.get('id')) or not row.get('text'):
                raise ValueError(f'Câu {index} thiếu mã hoặc nội dung hàng')
            keys.add(str(row.get('question_id') or row['id']))
            if row.get('score_enabled', True):
                for col in options:
                    score = row['scores'].get(str(col.get('id'))) if 'scores' in row else col.get('score', col.get('value'))
                    if not _number(score):
                        raise ValueError(f'Câu {index}, hàng “{row["text"]}”: chưa cấu hình đủ điểm')
    elif kind in ('multiple_choice', 'checkboxes', 'dropdown'):
        options = q.get('answers', q.get('options', []))
        if len(options) < 2:
            raise ValueError(f'Câu {index} cần ít nhất hai đáp án')
        if any(not _number(a.get('score', a.get('value'))) for a in options):
            raise ValueError(f'Câu {index} chưa cấu hình đủ điểm đáp án')
    elif kind in ('short_answer', 'paragraph', 'date', 'time', 'linear_scale'):
        options = []
    else:
        raise ValueError(f'Câu {index}: loại câu hỏi chưa được hỗ trợ')
    keys.add(str(q['id']))
    for option in options:
        if not _has_id(option.get('id')) or not str(option.get('label', option.get('text', ''))).strip():
            raise ValueError(f'Câu {index} thiếu mã hoặc nội dung đáp án/cột')


def validate_survey_content(content):
    """Require a runnable configuration before saving/publishing; never invent scores."""
    questions = questions_from_content(content)
    if not questions:
        raise ValueError('Mẫu khảo sát phải có ít nhất một câu hỏi')
    normalize_survey_content(content)  # Detect duplicate identities.
    keys = set()
    for index, q in enumerate(questions, 1):
        if not _has_id(q.get('id')) or not str(q.get('text', q.get('question', ''))).strip():
            raise ValueError(f'Câu {index} thiếu mã hoặc nội dung')
        _validate_question_options(index, keys, q)
    _validate_result_config(content, keys)


def evaluate_survey_results(content, responses):
    """Apply the saved configuration; raw group totals retain their existing contract."""
    scored = score_survey_responses(content, responses, details=True)
    config = content.get('result_config', {}) if isinstance(content, dict) else {}
    if not config:
        return None
    method = config.get('scoring_method', 'total')
    calculation = config.get('calculation_type', 'sum') if method == 'total' else 'sum'
    total = sum(scored['questions'].values()) if scored['questions'] else None
    if calculation == 'average':
        total = total / len(scored['questions']) if scored['questions'] else None
    elif calculation == 'scale_conversion':
        conversion = config.get('conversion', {})
        if not _number(conversion.get('factor')) or not _number(conversion.get('offset')):
            raise ValueError('Chưa cấu hình công thức quy đổi điểm')
        total = total * conversion['factor'] + conversion['offset'] if total is not None else None

    def matches(score, condition, threshold='min_score'):
        if score is None:
            return False
        value = condition.get(threshold)
        if not _number(value):
            return False
        op = condition.get('operator')
        if op == 'between':
            return _number(condition.get('max_score')) and value <= score <= condition['max_score']
        return {'>': score > value, '>=': score >= value, '<': score < value,
                '<=': score <= value, '=': score == value}.get(op, False)

    def conclusions(score, conditions):
        return [{'conclusion': c.get('conclusion', ''), 'note': c.get('note', '')}
                for c in conditions if matches(score, c) and (c.get('conclusion') or c.get('note'))]

    groups = {name: {'score': score, 'conclusions': conclusions(score, config.get('group_configs', {}).get(name, {}).get('conditions', []))}
              for name, score in scored['groups'].items()} if method == 'by_group' else {}
    # Grid parent alerts refer to the sum of its scored rows.
    question_scores = dict(scored['questions'])
    for q in questions_from_content(content):
        rows = [str(r.get('question_id') or r.get('id')) for r in q.get('grid', {}).get('rows', [])]
        answered = [question_scores[k] for k in rows if k in question_scores]
        if answered:
            question_scores[str(q['id'])] = sum(answered)
    alerts = [{'conclusion': a.get('conclusion', ''), 'note': a.get('note', '')}
              for a in config.get('special_alerts', [])
              if matches(question_scores.get(str(a.get('question_id'))), a, 'threshold')]
    return {'scoring_method': method, 'calculation_type': calculation, 'score': total,
            'conclusions': conclusions(total, config.get('conditions', [])) if method == 'total' else [],
            'groups': groups, 'alerts': alerts}
