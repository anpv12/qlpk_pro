// Global variables
let textExpansions = {};
let isLoaded = false;
let loadRevision = 0;
let pendingLoads = 0;
let cachedSessionRevision = null;

function clearExpansionCache() {
    loadRevision += 1;
    textExpansions = {};
    isLoaded = false;
    cachedSessionRevision = null;
}

function isExpansionCacheCurrent() {
    const owner = window.QLPKApiTransport?.session?.owner;
    if (isLoaded && owner && (owner.snapshot().status !== 'authenticated' || owner.snapshot().revision !== cachedSessionRevision)) clearExpansionCache();
    return isLoaded;
}

window.QLPKApiTransport?.session?.owner.subscribe(current => {
    if (isLoaded || !['unknown', 'loading', 'authenticated'].includes(current.status)) clearExpansionCache();
});
window.addEventListener('storage', event => {
    if (!event.key || ['qlpk_token', 'token', 'qlpk_user'].includes(event.key)) clearExpansionCache();
});
document.addEventListener('qlpk:logout:confirmed', clearExpansionCache);

const EXPANDABLE_FIELDS = 'textarea, input[type="text"], input[type="email"], input[type="search"]';

// One delegated Tab listener for every current and future text field.
function initializeTextExpansion() {
    document.addEventListener('keydown', event => {
        if (event.target instanceof Element && event.target.matches(EXPANDABLE_FIELDS)) handleTextExpansion(event, event.target);
    });
    setTimeout(() => { if (!isLoaded && !pendingLoads) loadTextExpansions(); }, 500);
}

// Load data immediately when script loads
loadTextExpansions();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initializeTextExpansion);
else initializeTextExpansion();

// Load text expansions from server
async function loadTextExpansions() {
    const revision = ++loadRevision;
    pendingLoads += 1;
    try {
        const response = await fetch('/api/text-expansions/active', { method: 'GET' });
        
        if (response.ok) {
            const result = await response.json();
            if (revision !== loadRevision) return;
            if (result.success && result.data) {
				// Clear existing data first
				textExpansions = {};
				// Copy all data from result
				Object.assign(textExpansions, result.data);
				isLoaded = true;
				cachedSessionRevision = window.QLPKApiTransport?.session?.owner.snapshot().revision ?? null;
			} else {
				textExpansions = {};
				isLoaded = false;
			}
        } else {
            if (revision !== loadRevision) return;
            console.warn('Text Expansion: API request failed', response.status);
            textExpansions = {};
            isLoaded = false;
        }
    } catch (error) {
        if (revision !== loadRevision) return;
        console.error('Text Expansion: Error loading expansions', error);
        textExpansions = {};
        isLoaded = false;
    } finally {
        pendingLoads -= 1;
    }
}

// Handle text expansion on keydown
// Tab without modifiers, in an ordinary field, with a loaded expansion cache.
function canExpandText(e, element) {
    if (e.key !== 'Tab' && e.keyCode !== 9) return false;
    if (e.ctrlKey || e.altKey || e.shiftKey) return false;
    if (element.classList.contains('code-editor') || element.getAttribute('data-no-expand') === 'true') return false;
    return isExpansionCacheCurrent() && Boolean(textExpansions) && Object.keys(textExpansions).length > 0;
}

function handleTextExpansion(e, element) {
    // Only handle Tab key, without Ctrl/Alt/Shift, outside code editors, once expansions are loaded
    if (!canExpandText(e, element)) return;
    
    const currentValue = element.value || '';
    if (!currentValue) return;
    
    const cursorPosition = element.selectionStart || 0;
    
    // Find the word before cursor
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    if (!textBeforeCursor.trim()) return;
    
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1] || '';
    
    // Check if last word is an abbreviation (must be non-empty)
    if (lastWord && textExpansions[lastWord]) {
        e.preventDefault();
        e.stopPropagation();
        
        // Replace the abbreviation with full text
        const newText = textBeforeCursor.replace(new RegExp(lastWord + '$'), textExpansions[lastWord]);
        const newValue = newText + currentValue.substring(cursorPosition);
        
        element.value = newValue;
        
        // Set cursor position after the expanded text
        const newCursorPosition = newText.length;
        element.setSelectionRange(newCursorPosition, newCursorPosition);
        
        // Show visual feedback
        showExpansionFeedback(element, lastWord, textExpansions[lastWord]);
        
        return false;
    }
}

// Show visual feedback when text is expanded
function showExpansionFeedback(element, abbreviation, fullText) {
    const feedback = document.createElement('div');
    feedback.className = 'text-expansion-feedback';
    feedback.textContent = `${abbreviation} → ${fullText}`;
    const rect = element.getBoundingClientRect();
    feedback.style.setProperty('--text-expansion-feedback-top', `${rect.top + window.pageYOffset - 30}px`);
    feedback.style.setProperty('--text-expansion-feedback-left', `${rect.left + window.pageXOffset}px`);
    document.body.appendChild(feedback);
    setTimeout(() => feedback.classList.add('is-visible'), 10);
    setTimeout(() => {
        feedback.classList.remove('is-visible');
        setTimeout(() => feedback.remove(), 300);
    }, 1500);
}

// Manual text expansion function (can be called programmatically)
function expandText(element) {
    if (!isExpansionCacheCurrent()) return false;
    const currentValue = element.value;
    const cursorPosition = element.selectionStart;
    
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (textExpansions[lastWord]) {
        const newText = textBeforeCursor.replace(new RegExp(lastWord + '$'), textExpansions[lastWord]);
        const newValue = newText + currentValue.substring(cursorPosition);
        
        element.value = newValue;
        
        const newCursorPosition = newText.length;
        element.setSelectionRange(newCursorPosition, newCursorPosition);
        
        showExpansionFeedback(element, lastWord, textExpansions[lastWord]);
        return true;
    }
    
    return false;
}

// Get all available abbreviations
function getAvailableAbbreviations() {
    isExpansionCacheCurrent();
    return Object.keys(textExpansions);
}

// Check if an abbreviation exists
function hasAbbreviation(abbreviation) {
    isExpansionCacheCurrent();
    return abbreviation in textExpansions;
}

// Get full text for an abbreviation
function getFullText(abbreviation) {
    isExpansionCacheCurrent();
    return textExpansions[abbreviation] || null;
}

// Refresh text expansions (useful after admin updates)
function refreshTextExpansions() {
    clearExpansionCache();
    return loadTextExpansions();
}

// Add custom abbreviation (for runtime additions)
function addCustomAbbreviation(abbreviation, fullText) {
    textExpansions[abbreviation] = fullText;
}

// Remove custom abbreviation
function removeCustomAbbreviation(abbreviation) {
    delete textExpansions[abbreviation];
}

// Export functions for global use
export const textExpansion = {
    expandText: expandText,
    getAvailableAbbreviations: getAvailableAbbreviations,
    hasAbbreviation: hasAbbreviation,
    getFullText: getFullText,
    refreshTextExpansions: refreshTextExpansions,
    addCustomAbbreviation: addCustomAbbreviation,
    removeCustomAbbreviation: removeCustomAbbreviation,
    isLoaded: isExpansionCacheCurrent,
    getCount: () => getAvailableAbbreviations().length
};
