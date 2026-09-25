from copy import deepcopy
import json
from pathlib import Path

import pytest

from scripts.seed_survey_scoring import build_content
from app.utils.survey_scoring import evaluate_survey_results, score_survey_responses, validate_survey_content

LEGACY = json.loads((Path(__file__).parent / 'fixtures/survey_seed_legacy.json').read_text())


def answers_for(content, scores):
    grid = content['questions'][0]['grid']
    return {r['id']: next(c['id'] for c in grid['columns']
        if r.get('scores', {}).get(c['id'], c['score']) == value)
        for r, value in zip(grid['rows'], scores)}


@pytest.mark.parametrize('tid,count,max_score', [(22, 7, 21), (26, 9, 27), (28, 30, 30), (30, 20, 80)])
def test_seed_valid_complete_idempotent_and_extremes(tid, count, max_score):
    previous = deepcopy(LEGACY[str(tid)])
    result = build_content(tid, previous)
    assert previous == LEGACY[str(tid)]
    validate_survey_content(result)
    assert build_content(tid, result) == result
    grid = result['questions'][0]['grid']
    assert len(grid['rows']) == count
    low = 1 if tid == 30 else 0
    high = max_score // count
    for point, expected in [(low, low * count), (high, max_score)]:
        answer = answers_for(result, [point] * count)
        assert sum(score_survey_responses(result, answer).values()) == expected
        summary = evaluate_survey_results(result, answer)
        assert summary['score'] == expected * (1.25 if tid == 30 else 1)
        assert len(summary['conclusions']) == 1
    with pytest.raises(ValueError, match='bắt buộc'):
        score_survey_responses(result, {})


@pytest.mark.parametrize('tid,limits', [(22, [0, 4, 5, 9, 10, 14, 15, 21]),
                                      (26, [0, 4, 5, 9, 10, 14, 15, 19, 20, 27]),
                                      (28, [0, 9, 10, 19, 20, 30])])
def test_every_cutoff_has_exactly_one_conclusion(tid, limits):
    content = build_content(tid, LEGACY[str(tid)])
    count = len(content['questions'][0]['grid']['rows'])
    maximum = 1 if tid == 28 else 3
    for total in limits:
        remaining = total
        points = []
        for _ in range(count):
            value = min(remaining, maximum)
            points.append(value)
            remaining -= value
        summary = evaluate_survey_results(content, answers_for(content, points))
        assert summary['score'] == total
        assert len(summary['conclusions']) == 1


def test_gad_functional_answer_does_not_raise_total():
    content = build_content(22, LEGACY['22'])
    answers = answers_for(content, [1] * 7)
    extra = content['questions'][1]
    for option in extra['answers']:
        answers[extra['id']] = option['id']
        assert evaluate_survey_results(content, answers)['score'] == 7


def test_phq_alert_is_item_nine_not_whole_grid():
    content = build_content(26, LEGACY['26'])
    assert not evaluate_survey_results(content, answers_for(content, [3] * 8 + [0]))['alerts']
    assert len(evaluate_survey_results(content, answers_for(content, [0] * 8 + [1]))['alerts']) == 1


def test_reverse_keys_and_zung_index_cutoff():
    for tid, reverse in [(28, {1, 5, 7, 9, 15, 19, 21, 27, 29, 30}), (30, {5, 9, 13, 17, 19})]:
        content = build_content(tid, LEGACY[str(tid)])
        grid = content['questions'][0]['grid']
        for number, row in enumerate(grid['rows'], 1):
            values = list(row['scores'].values())
            assert values == (([0, 1] if number in reverse else [1, 0]) if tid == 28
                              else ([4, 3, 2, 1] if number in reverse else [1, 2, 3, 4]))
    content = build_content(30, LEGACY['30'])
    for raw in [35, 36]:
        points = [1] * 20
        for i in range(raw - 20):
            points[i] += 1
        summary = evaluate_survey_results(content, answers_for(content, points))
        assert summary['score'] == raw * 1.25
        assert len(summary['conclusions']) == 1
        assert ('Cần bác sĩ' in summary['conclusions'][0]['conclusion']) == (raw == 36)


def test_seed_rejects_unreviewed_edits():
    content = deepcopy(LEGACY['22'])
    content['questions'][0]['grid']['rows'].reverse()
    with pytest.raises(ValueError, match='đã thay đổi'):
        build_content(22, content)
