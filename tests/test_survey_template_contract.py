from copy import deepcopy
import pytest
from app.utils.survey_scoring import normalize_survey_content, validate_survey_content, score_survey_responses, evaluate_survey_results


def grid_template():
    return {'questions': [{'id': 'grid', 'type': 'multiple_choice_grid', 'text': 'Grid', 'required': True,
        'grid': {'columns': [{'id': 'no', 'label': 'Không', 'score': 0}, {'id': 'yes', 'label': 'Có', 'score': 1}],
                 'rows': [{'id': 'r1', 'text': 'Một', 'criteria': 'A', 'score_enabled': True, 'scores': {'no': 0, 'yes': 7}},
                          {'id': 'r2', 'text': 'Hai', 'criteria': 'B', 'score_enabled': True, 'scores': {'no': 0, 'yes': 3}}]}}]}


def test_cell_scores_survive_column_and_row_reorder():
    content = grid_template()
    validate_survey_content(content)
    assert score_survey_responses(content, {'r1': 'yes', 'r2': 'no'}) == {'A': 7, 'B': 0}
    content['questions'][0]['grid']['columns'].reverse()
    content['questions'][0]['grid']['rows'].reverse()
    assert score_survey_responses(content, {'r1': 'yes', 'r2': 'no'}) == {'A': 7, 'B': 0}


def test_legacy_adapter_preserves_scores_and_never_invents_missing_points():
    content = {'questions': [{'text': 'Legacy', 'type': 'multiple_choice_grid', 'scoring_criteria': 'A',
        'grid': {'columns': [{'text': 'Không', 'score': 0}, {'text': 'Có'}], 'rows': [{'text': 'Một'}]}}]}
    before = deepcopy(content)
    normalized = normalize_survey_content(content)
    assert content == before
    assert normalized == normalize_survey_content(normalized)
    q = normalized['questions'][0]
    assert q['grid']['columns'][0]['label'] == 'Không'
    assert 'score' not in q['grid']['columns'][1]
    assert q['grid']['rows'][0]['score_enabled'] is True
    with pytest.raises(ValueError, match='chưa cấu hình đủ điểm'):
        validate_survey_content(normalized)


@pytest.mark.parametrize('calculation,expected', [('sum', 10), ('average', 5), ('scale_conversion', 21)])
def test_result_config_is_applied_and_alerts_use_selected_answers(calculation, expected):
    content = grid_template()
    content['result_config'] = {'scoring_method': 'total', 'calculation_type': calculation,
        'conversion': {'factor': 2, 'offset': 1},
        'conditions': [{'operator': '>=', 'min_score': 5, 'conclusion': 'Đạt ngưỡng', 'note': 'QA'}],
        'special_alerts': [{'question_id': 'r1', 'operator': '>', 'threshold': 6, 'conclusion': 'Theo dõi'}]}
    validate_survey_content(content)
    result = evaluate_survey_results(content, {'r1': 'yes', 'r2': 'yes'})
    assert result['score'] == expected
    assert result['conclusions'][0]['conclusion'] == 'Đạt ngưỡng'
    assert result['alerts'][0]['conclusion'] == 'Theo dõi'


def test_group_conclusions_and_zero_do_not_trigger_unanswered_alerts():
    content = grid_template()
    content['questions'][0]['required'] = False
    content['result_config'] = {'scoring_method': 'by_group', 'group_configs': {
        'A': {'conditions': [{'operator': '=', 'min_score': 0, 'conclusion': 'Không điểm'}]}},
        'special_alerts': [{'question_id': 'r2', 'operator': '=', 'threshold': 0, 'conclusion': 'Sai nếu chưa trả lời'}]}
    result = evaluate_survey_results(content, {'r1': 'no'})
    assert result['groups']['A']['conclusions'][0]['conclusion'] == 'Không điểm'
    assert 'B' not in result['groups']
    assert not result['alerts']


def test_conversion_cannot_silently_fall_back_to_sum():
    content = grid_template()
    content['result_config'] = {'calculation_type': 'scale_conversion'}
    with pytest.raises(ValueError, match='hệ số'):
        validate_survey_content(content)
    with pytest.raises(ValueError, match='quy đổi'):
        evaluate_survey_results(content, {'r1': 'yes', 'r2': 'yes'})


def test_unscored_row_still_validates_selected_option():
    content = grid_template()
    content['questions'][0]['required'] = False
    content['questions'][0]['grid']['rows'][0]['score_enabled'] = False
    assert score_survey_responses(content, {'r1': 'yes'}) == {}
    with pytest.raises(ValueError, match='Không ghép được'):
        score_survey_responses(content, {'r1': 'unknown'})


@pytest.mark.parametrize('calculation', ['sum', 'average', 'scale_conversion'])
def test_unanswered_scored_items_do_not_produce_zero_conclusions(calculation):
    content = grid_template()
    content['questions'][0]['required'] = False
    content['questions'][0]['grid']['rows'][0]['score_enabled'] = False
    content['result_config'] = {'calculation_type': calculation,
        'conversion': {'factor': 2, 'offset': 1},
        'conditions': [{'operator': '<=', 'min_score': 0, 'conclusion': 'Must not appear'}]}
    result = evaluate_survey_results(content, {'r1': 'no'})
    assert result['score'] is None and result['conclusions'] == []
    # A real answered zero must remain distinguishable from missing scores.
    result = evaluate_survey_results(content, {'r2': 'no'})
    assert result['score'] == (1 if calculation == 'scale_conversion' else 0)
