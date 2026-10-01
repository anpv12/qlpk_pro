// Module loader hook for tests: a module imported with ?graph=N passes the same query to every
// relative app module it imports, so each importFresh() call evaluates its own module graph.
export async function resolve(specifier, context, nextResolve) {
    const result = await nextResolve(specifier, context);
    const parent = context.parentURL ? new URL(context.parentURL) : null;
    const graph = parent?.searchParams.get('graph');
    if (graph && result.url.startsWith('file:') && result.url.includes('/app/static/js/') && !result.url.includes('?')) {
        return { ...result, url: `${result.url}?graph=${graph}` };
    }
    return result;
}
