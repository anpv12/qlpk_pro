// Text Expansion JavaScript - Áp dụng toàn hệ thống

// Global variables
let textExpansions = {};
let isLoaded = false;

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
    try {
        const token = localStorage.getItem('qlpk_token');
        if (!token) {
            console.warn('Text Expansion: No token found, skipping load');
            return;
        }
        
        const response = await fetch('/api/text-expansions/active', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const result = await response.json();
            if (result.success && result.data) {
				// Clear existing data first
				textExpansions = {};
				// Copy all data from result
				Object.assign(textExpansions, result.data);
				isLoaded = true;
			} else {
				textExpansions = {};
				isLoaded = false;
			}
        } else {
            console.warn('Text Expansion: API request failed', response.status);
            textExpansions = {};
            isLoaded = false;
        }
    } catch (error) {
        console.error('Text Expansion: Error loading expansions', error);
        textExpansions = {};
        isLoaded = false;
    }
}

// Handle text expansion on keydown
function handleTextExpansion(e, $element) {
    // Only handle Tab key for now
    if (e.key !== 'Tab' && e.keyCode !== 9) return;
    
    // Don't expand if Ctrl, Alt, or Shift is pressed
    if (e.ctrlKey || e.altKey || e.shiftKey) return;
    
    // Don't expand in code editors or special inputs
    if ($element.hasClass('code-editor') || $element.attr('data-no-expand') === 'true') {
        return;
    }
    
    // Check if textExpansions is loaded and not empty
    if (!isLoaded || !textExpansions || Object.keys(textExpansions).length === 0) {
        return;
    }
    
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
    const elementHeight = $element.outerHeight();
    
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
    return Object.keys(textExpansions);
}

// Check if an abbreviation exists
function hasAbbreviation(abbreviation) {
    return abbreviation in textExpansions;
}

// Get full text for an abbreviation
function getFullText(abbreviation) {
    return textExpansions[abbreviation] || null;
}

// Refresh text expansions (useful after admin updates)
function refreshTextExpansions() {
    isLoaded = false;
    loadTextExpansions();
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
    isLoaded: () => isLoaded,
    getCount: () => Object.keys(textExpansions).length
};
