import { byId, replace } from '../shared/dom.js';
import { surveyResultSummary } from '../shared/survey-result-summary.js';

// Page regions toggled through [hidden]: '#loading-spinner', '#survey-content', '#no-survey-message', '.actions'.
function setShown(selectors, visible) {
    document.querySelectorAll(selectors).forEach(node => { node.hidden = !visible; });
}

function showNoSurveyMessage(text) {
    const message = byId('no-survey-message');
    if (text !== undefined) message.textContent = text;
    message.hidden = false;
}

function disableSurveyInputs() {
    document.querySelectorAll('#survey-content input, #survey-content select, #survey-content textarea').forEach(input => { input.disabled = true; });
}

function setText(id, text) {
    const node = byId(id);
    if (node) node.textContent = text;
}

function showResultSummary(summary) {
    replace(byId('survey-result-summary'), surveyResultSummary(summary));
}

export { disableSurveyInputs, setShown, setText, showNoSurveyMessage, showResultSummary };
