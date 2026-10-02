import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ES modules are detected from their own import/export syntax, so a converted file needs no config edit.
const jsRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'static', 'js');
const MODULE_SYNTAX = /^(?:import(?:\s+[\w{*]|\s*['"])|export\s+(?:\{|default\b|const\b|let\b|function\b|async\b|class\b))/m;
function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : listJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}
const esModuleFiles = listJs(jsRoot).filter(file => MODULE_SYNTAX.test(fs.readFileSync(file, 'utf8')))
  .map(file => '**/' + path.relative(jsRoot, file).split(path.sep).join('/'));
const browser = ['window','document','navigator','localStorage','sessionStorage','fetch','console','setTimeout','clearTimeout','setInterval','clearInterval','requestAnimationFrame','cancelAnimationFrame','URL','URLSearchParams','FormData','Blob','File','Event','CustomEvent','KeyboardEvent','MouseEvent','MutationObserver','ResizeObserver','IntersectionObserver','performance','HTMLElement','HTMLInputElement','Element','Node','NodeList','getComputedStyle','alert','confirm','prompt','location','history','Intl','structuredClone','queueMicrotask','AbortController','Headers','Request','Response','crypto','atob','btoa','Image','DOMParser','XMLSerializer','TextEncoder','TextDecoder','Notification','open','close','scrollTo','innerWidth','innerHeight','matchMedia','self','globalThis','io','Swal','bootstrap','flatpickr','Chart','echarts','XLSX','Sortable','IDBKeyRange','FileReader','DataTransfer','ClipboardEvent','InputEvent','FocusEvent','PointerEvent','DragEvent','CSS','Option','HTMLSelectElement','HTMLTextAreaElement','HTMLButtonElement','HTMLFormElement','HTMLAnchorElement','Audio','ScrollToOptions','WebSocket','XMLHttpRequest','screen','devicePixelRatio','print','onbeforeunload','name','parent','top','frames','frameElement','MessageChannel','BroadcastChannel','ServiceWorker','caches','indexedDB','Worker','SharedWorker','Path2D','OffscreenCanvas','ImageData','HTMLCanvasElement','CanvasRenderingContext2D','DOMRect','Range','Selection','getSelection','NodeFilter','TreeWalker','ShadowRoot','DocumentFragment','HTMLTemplateElement','HTMLTableElement','HTMLTableRowElement','EventTarget','AbortSignal','ErrorEvent','PromiseRejectionEvent','PageTransitionEvent','BeforeUnloadEvent','HashChangeEvent','PopStateEvent','StorageEvent','TransitionEvent','AnimationEvent','WheelEvent','TouchEvent','UIEvent','HTMLImageElement','HTMLLabelElement','HTMLDivElement','HTMLSpanElement','SVGElement','HTMLCollection','DOMTokenList','NamedNodeMap','Attr','Text','Comment','CharacterData','ProcessingInstruction','XPathResult','MediaQueryList','Screen','Location','History','Storage','Navigator','Window','Document','HTMLDocument','Performance','PerformanceObserver','ReportingObserver','reportError','cancelIdleCallback','requestIdleCallback','isSecureContext','origin','crossOriginIsolated','speechSynthesis','SpeechSynthesisUtterance'];
const globals = Object.fromEntries(browser.map(n => [n, 'readonly']));
export default [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals },
  rules: {
    'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'after-used', caughtErrors: 'none' }],
    'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-duplicate-case': 'error', 'no-redeclare': 'error',
    'no-self-assign': 'error', 'no-constant-condition': 'warn', 'no-empty': 'warn', 'no-prototype-builtins': 'warn',
    'no-useless-escape': 'warn', 'no-fallthrough': 'error', 'no-cond-assign': 'error', 'no-unsafe-optional-chaining': 'error',
    'no-async-promise-executor': 'error', 'no-inner-declarations': 'off', 'no-dupe-else-if': 'error', 'no-dupe-args': 'error',
    'no-func-assign': 'error', 'no-import-assign': 'error', 'no-loss-of-precision': 'error', 'no-unsafe-negation': 'error',
    'no-unused-private-class-members': 'warn', 'no-useless-catch': 'warn', 'use-isnan': 'error', 'valid-typeof': 'error',
    'no-var': 'warn', 'prefer-const': 'warn', 'eqeqeq': ['warn', 'smart'], 'no-implicit-globals': 'off', 'no-shadow': 'off',
    'complexity': ['warn', 15], 'max-lines-per-function': ['warn', { max: 80, skipBlankLines: true, skipComments: true }],
    'max-depth': ['warn', 4], 'max-params': ['warn', 5], 'max-lines': ['warn', { max: 600, skipBlankLines: true, skipComments: true }],
    'no-debugger': 'error', 'no-console': ['warn', { allow: ['warn', 'error'] }], 'no-alert': 'warn', 'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error',
    'no-param-reassign': 'off', 'no-return-await': 'off', 'require-await': 'off', 'no-await-in-loop': 'off', 'no-promise-executor-return': 'warn', 'no-template-curly-in-string': 'warn', 'no-unmodified-loop-condition': 'warn', 'no-unused-expressions': ['warn', { allowShortCircuit: true, allowTernary: true }], 'no-useless-return': 'warn', 'no-lonely-if': 'off', 'no-else-return': 'off', 'no-nested-ternary': 'warn', 'no-sequences': 'warn', 'no-throw-literal': 'warn', 'prefer-promise-reject-errors': 'warn', 'no-restricted-syntax': ['warn', { selector: "CallExpression[callee.object.name='window'][callee.property.name='confirm']", message: 'native confirm' }, { selector: "MemberExpression[object.name='window'][property.name='Swal']", message: 'window.Swal direct' }]
  }
}, {
  // Only files with import/export syntax are ES modules; every other file is a classic <script> (or an IIFE
  // imported for side effects) whose top-level names are page globals, declared with /* global */ and
  // /* exported */ headers. Intentional page globals are the norm here, so no-implicit-globals stays off.
  files: esModuleFiles,
  languageOptions: { sourceType: 'module' }
}, {
  // Shared owner of SweetAlert2 dialogs: the only file allowed to touch window.Swal directly.
  files: ['shared/confirmation-dialog.js'],
  rules: { 'no-restricted-syntax': ['warn', { selector: "CallExpression[callee.object.name='window'][callee.property.name='confirm']", message: 'native confirm' }] }
}, {
  // Legacy global aliases guarded with `if (typeof x === 'undefined') { var x = ... }`: `var` is required so the
  // alias hoists into the page-wide scope shared with other classic scripts (let/const would clash across files).
  files: ['prescriptions/shared/prescription-document-template.js'],
  rules: { 'no-var': 'off' }
}, {
  // Vendored flatpickr locale (UMD build), kept byte-identical to upstream.
  ignores: ['flatpickr-vn.js']
}];
