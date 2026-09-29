(function (window, document) {
'use strict';

// Global variables
let textExpansions = {};
let isLoaded = false;
let loadRevision = 0;
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

// Initialize text expansion functionality
function initializeTextExpansion() {
    // Apply text expansion to all text inputs and textareas
    $(document).on('keydown', 'textarea, input[type="text"], input[type="email"], input[type="search"]', function(e) {
        handleTextExpansion(e, $(this));
    });
    
    // Also apply to dynamically added elements
    $(document).on('keydown', '.form-control', function(e) {
        if ($(this).is('textarea, input[type="text"], input[type="email"], input[type="search"]')) {
            handleTextExpansion(e, $(this));
        }
    });
}

// Load data immediately when script loads (don't wait for jQuery)
loadTextExpansions();

// Initialize event handlers when jQuery is ready
if (typeof jQuery !== 'undefined') {
    $(document).ready(function() {
        initializeTextExpansion();
        // Also try loading again in case first attempt failed
        if (!isLoaded) {
            setTimeout(function() {
                loadTextExpansions();
            }, 500);
        }
    });
} else {
    // Wait for jQuery to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
                if (typeof jQuery !== 'undefined') {
                    $(document).ready(function() {
                        initializeTextExpansion();
                        if (!isLoaded) {
                            loadTextExpansions();
                        }
                    });
                }
            }, 100);
        });
    } else {
        setTimeout(function() {
            if (typeof jQuery !== 'undefined') {
                $(document).ready(function() {
                    initializeTextExpansion();
                    if (!isLoaded) {
                        loadTextExpansions();
                    }
                });
            }
        }, 100);
    }
}

// Load text expansions from server
async function loadTextExpansions() {
    const revision = ++loadRevision;
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
    }
}

// Handle text expansion on keydown
// Tab without modifiers, in an ordinary field, with a loaded expansion cache.
function canExpandText(e, $element) {
    if (e.key !== 'Tab' && e.keyCode !== 9) return false;
    if (e.ctrlKey || e.altKey || e.shiftKey) return false;
    if ($element.hasClass('code-editor') || $element.attr('data-no-expand') === 'true') return false;
    return isExpansionCacheCurrent() && Boolean(textExpansions) && Object.keys(textExpansions).length > 0;
}

function handleTextExpansion(e, $element) {
    // Only handle Tab key, without Ctrl/Alt/Shift, outside code editors, once expansions are loaded
    if (!canExpandText(e, $element)) return;
    
    const currentValue = $element.val() || '';
    if (!currentValue) return;
    
    const cursorPosition = $element[0].selectionStart || 0;
    
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
        
        $element.val(newValue);
        
        // Set cursor position after the expanded text
        const newCursorPosition = newText.length;
        $element[0].setSelectionRange(newCursorPosition, newCursorPosition);
        
        // Show visual feedback
        showExpansionFeedback($element, lastWord, textExpansions[lastWord]);
        
        return false;
    }
}

// Show visual feedback when text is expanded
function showExpansionFeedback($element, abbreviation, fullText) {
    // Create a temporary tooltip-like element
    const feedback = $(`
        <div class="text-expansion-feedback">
            ${abbreviation} → ${fullText}
        </div>
    `);
    
    // Position the feedback near the input
    const elementOffset = $element.offset();
    
    feedback[0].style.setProperty('--text-expansion-feedback-top', `${elementOffset.top - 30}px`);
    feedback[0].style.setProperty('--text-expansion-feedback-left', `${elementOffset.left}px`);
    
    $('body').append(feedback);
    
    // Animate in
    setTimeout(() => {
        feedback.addClass('is-visible');
    }, 10);
    
    // Animate out and remove
    setTimeout(() => {
        feedback.removeClass('is-visible');
        setTimeout(() => {
            feedback.remove();
        }, 300);
    }, 1500);
}

// Manual text expansion function (can be called programmatically)
function expandText($element) {
    if (!isExpansionCacheCurrent()) return false;
    const currentValue = $element.val();
    const cursorPosition = $element[0].selectionStart;
    
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];
    
    if (textExpansions[lastWord]) {
        const newText = textBeforeCursor.replace(new RegExp(lastWord + '$'), textExpansions[lastWord]);
        const newValue = newText + currentValue.substring(cursorPosition);
        
        $element.val(newValue);
        
        const newCursorPosition = newText.length;
        $element[0].setSelectionRange(newCursorPosition, newCursorPosition);
        
        showExpansionFeedback($element, lastWord, textExpansions[lastWord]);
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
window.textExpansion = {
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
})(window, document);
