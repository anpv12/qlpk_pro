const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { moduleFiles } = require('./helpers/module-source');

test('loading legacy options preserves answer identities, text and scores in editor HTML', async () => {
    const original = [{ id: 1, question: 'Câu hỏi cũ', type: 'multiple_choice',
        options: [0, 1, 2, 3].map(value => ({ id: `answer-${value}`, text: `Mức ${value}`, value })) }];
    const snapshot = JSON.stringify(original);
    const elements = new Map(['scSurveyName', 'scSurveyDesc', 'scSaveBtn', 'scQuestionsList']
        .map(id => [id, { value: '', children: [1] }]));
    const context = vm.createContext({
        window: {}, structuredClone,
        document: { getElementById: id => elements.get(id), addEventListener() {} },
        localStorage: { getItem: () => 'test-only' },
        fetch: async () => ({ json: async () => ({ success: true, data: {
            name: 'Legacy', content: original
        } }) })
    });
    // Capture the real renderer HTML while skipping event binding and the unrelated performer request.
    // The editor is split into parts; overrides go into the part that owns loadTemplate and the renderer.
    for (const file of moduleFiles('survey-template-create.js')) {
        let source = fs.readFileSync(`app/static/js/${file}`, 'utf8');
        if (source.includes('\tasync function loadTemplate(')) {
            source = source.replace('\tObject.assign(moduleParts, {', `
            window.rendered = [];
            renderQuestionCard = q => window.rendered.push(buildCardHTML(q, moduleState.state.questionCounter));
            loadPerformers = async () => {};
            renderPerformerOptions = () => {};
            window.loadTemplateForTest = loadTemplate;
            Object.assign(moduleParts, {`);
        }
        vm.runInContext(source, context);
    }
    await context.window.loadTemplateForTest(20);
    assert.equal(context.window.rendered.length, 1);
    const html = context.window.rendered[0];
    assert.equal((html.match(/class="sc-answer-row"/g) || []).length, 4);
    for (let score = 0; score < 4; score++) {
        assert.ok(html.includes(`data-answer-id="answer-${score}"`));
        assert.ok(html.includes(`value="Mức ${score}"`));
        assert.ok(html.includes(`class="sc-answer-score" value="${score}"`));
    }
    assert.equal(JSON.stringify(original), snapshot, 'Loading must not mutate source data');
    original.splice(0, 1, { id: 2, text: 'Câu hỏi mới', type: 'multiple_choice',
        answers: [{ id: 'canonical', text: 'Đáp án chính', score: 0, value: 9 },
            { id: 'unconfigured', text: 'Chưa có điểm' }],
        options: [{ id: 'old', text: 'Alias cũ', value: 2 }] });
    await context.window.loadTemplateForTest(21);
    const canonicalHtml = context.window.rendered[1];
    assert.ok(canonicalHtml.includes('data-answer-id="canonical"'));
    assert.ok(canonicalHtml.includes('class="sc-answer-score" value="0"'));
    assert.ok(canonicalHtml.includes('class="sc-answer-score" value=""'));
    assert.ok(!canonicalHtml.includes('Alias cũ'), 'Canonical answers take precedence over legacy options');
});
