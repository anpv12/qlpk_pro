from copy import deepcopy
import subprocess

import pytest

from app.utils.survey_scoring import normalize_survey_content, score_survey_responses, validate_survey_identity_update, SurveyIdentityConflict


def test_cls_result_renderer_missing_score_and_identity():
    subprocess.run(['node', 'tests/order_survey_results.test.js'], check=True)


def questionnaire():
    return {'questions': [
        {'id': 'q1', 'type': 'multiple_choice', 'criteria': 'Nhóm A',
         'answers': [{'id': 'a0', 'text': 'Không', 'score': 0},
                     {'id': 'a2', 'text': 'Có', 'score': 2}]},
        {'id': 'q2', 'type': 'multiple_choice', 'criteria': 'Nhóm A',
         'answers': [{'id': 'b3', 'score': 3}]},
        {'id': 'q3', 'type': 'multiple_choice', 'criteria': 'Nhóm B',
         'answers': [{'id': 'c0', 'score': 0}]},
    ]}


def test_exact_ids_zero_and_aggregate_survive_answer_reorder():
    content = questionnaire()
    answers = {'q1': 'a2', 'q2': 'b3', 'q3': 'c0'}
    assert score_survey_responses(content, answers) == {'Nhóm A': 5, 'Nhóm B': 0}
    content['questions'][0]['answers'].reverse()
    assert score_survey_responses(content, answers) == {'Nhóm A': 5, 'Nhóm B': 0}


def test_missing_group_is_absent_not_zero():
    assert score_survey_responses(questionnaire(), {'q1': 'a0'}) == {'Nhóm A': 0}


def test_legacy_without_answer_ids_uses_zero_based_index():
    content = {'questions': [{'id': 'q', 'criteria': 'A',
               'answers': [{'score': 3}, {'score': 2}, {'score': 1}, {'score': 0}]}]}
    assert [score_survey_responses(content, {'q': str(i)})['A'] for i in range(4)] == [3, 2, 1, 0]


def test_numeric_id_is_identity_not_position():
    content = {'questions': [{'id': 0, 'criteria': 'A', 'answers': [{'id': 2, 'score': 7}, {'id': 1, 'score': 4}]}]}
    assert score_survey_responses(content, {'0': '2'}) == {'A': 7}


@pytest.mark.parametrize('answers', [{'temp_31_1_12345': '2'}, {'q1': 'missing'}, {'q1': '1'}])
def test_unmatched_values_are_rejected_instead_of_partial_success(answers):
    with pytest.raises(ValueError):
        score_survey_responses(questionnaire(), answers)


def test_missing_required_answer_rejected():
    content = questionnaire()
    content['questions'][0]['required'] = True
    with pytest.raises(ValueError):
        score_survey_responses(content, {})


def test_template_normalization_generates_ids_once_and_preserves_input():
    content = {'questions': [{'id': '', 'answers': [{'id': '', 'score': 0}, {'score': 2}]}]}
    original = deepcopy(content)
    normalized = normalize_survey_content(content)
    assert content == original
    assert normalized == normalize_survey_content(normalized)
    q = normalized['questions'][0]
    assert q['id'] and len({a['id'] for a in q['answers']}) == 2


def test_duplicate_ids_rejected():
    content = questionnaire()
    content['questions'][1]['id'] = 'q1'
    with pytest.raises(ValueError):
        normalize_survey_content(content)


def test_used_template_must_not_orphan_existing_answers():
    original = questionnaire()
    assert validate_survey_identity_update(original, deepcopy(original)) is None
    updated = deepcopy(original)
    updated['questions'][0]['answers'][0]['id'] = 'replacement'
    with pytest.raises(SurveyIdentityConflict):
        validate_survey_identity_update(original, updated)
    original['questions'][0]['answers'][0]['id'] = ''
    with pytest.raises(SurveyIdentityConflict):
        validate_survey_identity_update(original, normalize_survey_content(original))


def test_grid_uses_row_criteria_and_column_score():
    content = normalize_survey_content({'questions': [{'id': 'grid', 'type': 'multiple_choice_grid',
        'grid': {'rows': [{'id': 'row0', 'criteria': 'A'}, {'id': 'row1', 'criteria': 'B'}],
                 'columns': [{'id': 'zero', 'score': 0}, {'id': 'three', 'score': 3}]}}]})
    assert score_survey_responses(content, {'row0': 'three', 'row1': 'zero'}) == {'A': 3, 'B': 0}


def test_invalid_score_and_duplicate_selection_rejected():
    content = questionnaire()
    content['questions'][0]['answers'][0]['score'] = None
    with pytest.raises(ValueError):
        score_survey_responses(content, {'q1': 'a0'})
    with pytest.raises(ValueError):
        score_survey_responses(questionnaire(), {'q1': ['a2', 'a2']})


def test_single_choice_rejects_multiple_and_checkboxes_sum_exact_choices():
    content = questionnaire()
    with pytest.raises(ValueError):
        score_survey_responses(content, {'q1': ['a0', 'a2']})
    content['questions'][0]['type'] = 'checkboxes'
    assert score_survey_responses(content, {'q1': ['a0', 'a2']}) == {'Nhóm A': 2}


def test_ambiguous_legacy_question_or_answer_ids_rejected():
    content = questionnaire()
    content['questions'][1] = deepcopy(content['questions'][0])
    with pytest.raises(ValueError):
        score_survey_responses(content, {'q1': 'a0'})
    content = questionnaire()
    content['questions'][0]['answers'].append({'id': 'a0', 'score': 9})
    with pytest.raises(ValueError):
        score_survey_responses(content, {'q1': 'a0'})
