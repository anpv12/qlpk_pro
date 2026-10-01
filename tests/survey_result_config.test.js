const assert = require('node:assert/strict');

let root = null;
globalThis.window = {};
globalThis.document = { getElementById: () => root };

(async () => {
await import('../app/static/js/survey-result-config.js');
const { moduleState } = await import('../app/static/js/survey-template-create-parts/state.js');
const editor = moduleState.resultConfig;
const saved = { conditions: [{ operator: 'between', min_score: 0, max_score: 10,
    conclusion: 'Original' }], group_configs: { A: { conditions: [
    { id: 3, operator: '=', min_score: 0 }, { id: 3, operator: '=', min_score: 1 }
] } } };
editor.initTab(saved);
const loaded = editor.collectConfig();
const ids = [loaded.conditions[0].id, ...loaded.group_configs.A.conditions.map(c => c.id)];
assert.equal(new Set(ids).size, 3);
assert.ok(ids.every(id => typeof id === 'string' && id.length));
assert.equal(saved.conditions[0].id, undefined, 'Opening must not mutate the input snapshot');

const minimum = { value: '' };
const row = {
    dataset: { condId: loaded.conditions[0].id },
    querySelector: selector => ({ '.sc-rc-cond-operator': { value: 'between' },
        '.sc-rc-min-score': minimum, '.sc-rc-max-score': { value: '10' } })[selector],
    querySelectorAll: () => [{ value: 'Edited' }, { value: '' }]
};
root = { querySelector: () => null,
    querySelectorAll: selector => selector === '.sc-rc-cond-table tbody tr' ? [row] : [] };
assert.equal(editor.collectConfig().conditions[0].min_score, null);
assert.ok(editor.validateConfig(), 'Blank thresholds must block save');
minimum.value = '0';
assert.equal(editor.collectConfig().conditions[0].min_score, 0);
assert.equal(editor.validateConfig(), null);
assert.equal(editor.collectConfig().conditions[0].conclusion, 'Edited');
assert.equal(saved.conditions[0].conclusion, 'Original');
console.log('Result config: legacy identities, snapshot isolation, blank and zero thresholds passed');
})();
