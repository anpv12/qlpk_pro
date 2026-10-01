const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loadPage, flush } = require('./helpers/esm-page');

const template = fs.readFileSync('app/templates/survey-template-create.html', 'utf8');
const BODY = template.slice(template.indexOf('<body'), template.lastIndexOf('</body>')).replace(/<script[\s\S]*?<\/script>/g, '').replace(/^<body[^>]*>/, '');

async function loadEditor(content, id) {
    const page = await loadPage('survey-template-create.js', { html: BODY, before(window) {
        window.QLPKUserFeedback = { show() {} };
        window.QLPKHtml = require('./helpers/html-escape').QLPKHtml;
    } });
    const parts = await import('../app/static/js/survey-template-create-parts/page-state.js');
    const pending = parts.loadTemplate(id);
    page.requests.find(request => request.url === `/api/survey-templates/${id}`).respond(200, { success: true, data: { name: 'Legacy', content } });
    await flush();
    page.requests.filter(request => request.url === '/users/doctors').forEach(request => request.respond(200, []));
    await pending;
    await flush();
    return page.document.querySelectorAll('.sc-q-card');
}

const answers = card => [...card.querySelectorAll('.sc-answer-row')].map(row => ({
    id: row.getAttribute('data-answer-id'), text: row.querySelector('.sc-answer-text').value, score: row.querySelector('.sc-answer-score').value }));

test('loading legacy options preserves answer identities, text and scores in the editor', async () => {
    const original = [{ id: 1, question: 'Câu hỏi cũ', type: 'multiple_choice',
        options: [0, 1, 2, 3].map(value => ({ id: `answer-${value}`, text: `Mức ${value}`, value })) }];
    const snapshot = JSON.stringify(original);
    const cards = await loadEditor(original, 20);
    assert.equal(cards.length, 1);
    assert.deepEqual(answers(cards[0]), [0, 1, 2, 3].map(score => ({ id: `answer-${score}`, text: `Mức ${score}`, score: String(score) })));
    assert.equal(JSON.stringify(original), snapshot, 'Loading must not mutate source data');
});

test('canonical answers take precedence over legacy options and keep unconfigured scores empty', async () => {
    const cards = await loadEditor([{ id: 2, text: 'Câu hỏi mới', type: 'multiple_choice',
        answers: [{ id: 'canonical', text: 'Đáp án chính', score: 0, value: 9 }, { id: 'unconfigured', text: 'Chưa có điểm' }],
        options: [{ id: 'old', text: 'Alias cũ', value: 2 }] }], 21);
    const rows = answers(cards[0]);
    assert.deepEqual(rows.map(row => row.id), ['canonical', 'unconfigured']);
    assert.deepEqual(rows.map(row => row.score), ['0', '']);
    assert.ok(!rows.some(row => row.text === 'Alias cũ'));
});
