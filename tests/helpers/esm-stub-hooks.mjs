// Node loader hooks for ES module page tests: a shared module's `export const X` reads a harness stub from the
// current fake window (window.X) when the test installed one, and the real export otherwise. Page entries
// (?case=N) and the real modules themselves (qlpk-real) load unchanged; fresh graphs (?graph=N) are wrapped too.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const JS_ROOT = new URL('../../app/static/js/', import.meta.url).href;

export async function load(url, context, nextLoad) {
    const query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
    if (!url.startsWith(JS_ROOT) || (query && !/^graph=\d+$/.test(query))) return nextLoad(url, context);
    const source = readFileSync(fileURLToPath(url), 'utf8');
    const names = [...new Set([
        ...[...source.matchAll(/^export (?:const|let|class|(?:async )?function\*?) ([\w$]+)/gm)].map(match => match[1]),
        ...[...source.matchAll(/^export \{([^}]*)\};?$/gm)].flatMap(match => match[1].split(',').map(part => part.trim().split(/\s+as\s+/).pop()).filter(Boolean))
    ])];
    if (!names.length) return nextLoad(url, context);
    const real = JSON.stringify(url + (query ? '&' : '?') + 'qlpk-real');
    const lines = [
        `export * from ${real};`,
        // Explicit named exports below shadow the star re-export of the same names.
        `import * as real from ${real};`,
        'const proxies = {};',
        'const pick = (name) => { const win = globalThis.window; const stub = win && Object.prototype.hasOwnProperty.call(win, name) ? win[name] : undefined; return stub !== undefined && stub !== proxies[name] ? stub : real[name]; };',
        'const live = (name) => { const value = real[name]; if (value === null || (typeof value !== "object" && typeof value !== "function")) return value;',
        '  return proxies[name] = new Proxy(typeof value === "function" ? function () {} : {}, {',
        '    get: (target, key) => { const current = pick(name); const result = current[key]; return typeof result === "function" && key !== "constructor" ? result.bind(current) : result; },',
        '    has: (target, key) => key in pick(name), set: (target, key, next) => { pick(name)[key] = next; return true; },',
        '    apply: (target, self, args) => Reflect.apply(pick(name), self, args), construct: (target, args) => Reflect.construct(pick(name), args) }); };',
        ...names.map(name => `export const ${name} = live(${JSON.stringify(name)});`)
    ];
    return { format: 'module', source: lines.join('\n'), shortCircuit: true };
}
