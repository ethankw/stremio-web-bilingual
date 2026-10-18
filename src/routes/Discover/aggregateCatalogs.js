// Copyright (C) 2017-2026 Smart code 203358507

const SOURCE_LIMIT = 200;
const MAX_PAGES = 10;
const RESULT_LIMIT = 300;
const PAGE_TIMEOUT = 12000;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });

const catalogKind = (manifestId, catalog) => {
    if (catalog.type !== 'movie') return null;
    if (manifestId === 'com.linvo.cinemeta') return { top: 'popular', year: 'latest' }[catalog.id] || null;
    if (manifestId === 'tmdb-addon') return { 'tmdb.top': 'popular', 'tmdb.latest': 'latest' }[catalog.id] || null;
    // Only explicit release/new catalogs qualify. History, recently watched,
    // recommendations, franchises and arbitrary year catalogs are not releases.
    if (/^(new|latest|newest|最新)$/i.test(catalog.name || '')) return 'latest';
    const name = `${catalog.id} ${catalog.name || ''}`.toLowerCase().replace(/[_:.-]+/g, ' ');
    if (/(?:^|[ ._:-])(?:latest|new releases|latest releases|newest|recent releases|最新|近期上映)(?:$|[ ._:-])/.test(name)) return 'latest';
    return null;
};

const getSources = (addons, kind, now = new Date()) => (addons || []).flatMap((addon) => (
    (addon.manifest.catalogs || []).flatMap((catalog) => {
        if (catalogKind(addon.manifest.id, catalog) !== kind) return [];
        const extras = catalog.extra || [];
        if (extras.some((extra) => extra.isRequired && (!extra.options?.length || ['search', 'ids'].includes(extra.name)))) return [];
        const required = extras.filter((extra) => extra.isRequired).map((extra) => [extra.name, extra.options[0]]);
        const years = addon.manifest.id === 'com.linvo.cinemeta' && catalog.id === 'year'
            ? [String(now.getUTCFullYear()), String(now.getUTCFullYear() - 1)].filter((year) => extras.find((extra) => extra.name === 'genre')?.options?.includes(year))
            : [null];
        return years.map((year) => ({
            request: {
                base: addon.transportUrl,
                path: { resource: 'catalog', type: 'movie', id: catalog.id, extra: year === null ? required : [['genre', year]] },
            },
            cinemeta: addon.manifest.id === 'com.linvo.cinemeta',
            paginated: extras.some((extra) => extra.name === 'skip'),
        }));
    })
));

const imdbId = (item) => {
    if (/^tt\d{7,10}$/.test(item.id)) return item.id;
    for (const link of item.links || []) {
        try {
            const url = new URL(link.url);
            if (['imdb.com', 'www.imdb.com'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol)) {
                const match = /^\/title\/(tt\d{7,10})(?:\/|$)/.exec(url.pathname);
                if (match) return match[1];
            }
        } catch (_) { /* Addon links are untrusted, malformed links are ignored. */ }
    }
    return null;
};

const releaseDate = (item) => {
    const value = item.released;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
    // A year is not a date: do not invent January 1 to break sorting ties.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
};

const normalizeItem = (item, canonical) => ({
    ...item,
    // Only Cinemeta's IMDb field is used for ranking. Some plugins label
    // TMDB vote_average as imdbRating (even in an IMDb link).
    imdbRating: canonical?.imdbRating ?? (item.aggregateCinemeta ? item.imdbRating ?? item.links?.find((link) => link.category === 'imdb')?.name : null) ?? null,
    name: canonical?.name || item.name,
    released: canonical?.released || item.released,
    releaseInfo: canonical?.releaseInfo || item.releaseInfo,
    aggregateGenres: canonical?.genres || (canonical?.links || item.links || []).filter((link) => link.category === 'Genres').map((link) => link.name),
    links: [...(item.links || []).filter((link) => link.category !== 'imdb'), ...(canonical?.links || []).filter((link) => link.category === 'imdb')],
    aggregateImdbId: imdbId(item),
});

const mergeItems = (items, kind, now = Date.now()) => {
    const unique = new Map();
    for (const item of items) {
        if (item.type !== 'movie' || typeof item.id !== 'string' || item.id === 'tmdb:no-content') continue;
        const key = item.aggregateImdbId || imdbId(item) || (/^tmdb:[1-9]\d*$/.test(item.id) ? item.id : `${item.aggregateSource || ''}|${item.id}`);
        const previous = unique.get(key);
        if (!previous) unique.set(key, item);
        else {
            const preferred = /^tt\d+$/.test(item.id) && !/^tt\d+$/.test(previous.id) ? item : previous;
            const other = preferred === item ? previous : item;
            unique.set(key, {
                ...other, ...preferred,
                imdbRating: preferred.imdbRating ?? other.imdbRating,
                watched: previous.watched || item.watched,
                inLibrary: previous.inLibrary || item.inLibrary,
                released: releaseDate(preferred) !== null ? preferred.released : other.released,
            });
        }
    }
    const rating = (item) => {
        const value = Number(item.imdbRating);
        return value > 0 && value <= 10 ? value : -1;
    };
    return [...unique.values()]
        .filter((item) => kind !== 'latest' || releaseDate(item) === null || releaseDate(item) <= now)
        .sort((a, b) => {
            const difference = kind === 'popular'
                ? rating(b) - rating(a)
                : (releaseDate(b) ?? -Infinity) - (releaseDate(a) ?? -Infinity);
            return (Number.isNaN(difference) ? 0 : difference) || collator.compare(a.name || '', b.name || '') || a.id.localeCompare(b.id);
        }).slice(0, RESULT_LIMIT);
};

const sameRequest = (a, b) => a?.base === b?.base && a?.path?.id === b?.path?.id && a?.path?.type === b?.path?.type && JSON.stringify(a?.path?.extra) === JSON.stringify(b?.path?.extra);

const readCatalog = (core, request, signal, expectedIds = null) => new Promise((resolve, reject) => {
    let active = true;
    let checking = false;
    let inspectAgain = false;
    const finish = (error, state) => {
        if (!active) return;
        active = false;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        core.off('state', onState);
        if (error) reject(error); else resolve(state);
    };
    const abort = () => finish(new Error('cancelled'));
    const inspect = async () => {
        if (!active) return;
        if (checking) { inspectAgain = true; return; }
        checking = true;
        inspectAgain = false;
        try {
            const state = await core.transport.getState('discover');
            if (!sameRequest(state.selected?.request, request) || !state.catalog || state.catalog.content.type === 'Loading') return;
            if (expectedIds !== null && state.catalog.content.type === 'Ready') {
                const ids = new Set(state.catalog.content.content.map((item) => item.id));
                if (!expectedIds.every((id) => ids.has(id))) return;
            }
            finish(null, state);
        } catch (_) { finish(new Error('catalog-failed')); }
        finally {
            checking = false;
            if (active && inspectAgain) inspect();
        }
    };
    const onState = (models) => { if (models.includes('discover')) inspect(); };
    const timer = setTimeout(() => finish(new Error('catalog-timeout')), PAGE_TIMEOUT);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    core.on('state', onState);
    const action = expectedIds === null
        ? { action: 'Load', args: { model: 'CatalogWithFiltersSelection', args: { request } } }
        : { action: 'CatalogWithFilters', args: { action: 'LoadNextPage' } };
    core.transport.dispatch(action, 'discover').then(inspect, () => finish(new Error('catalog-failed')));
});

// Core intentionally strips skip from Load requests and exposes cumulative ready
// items while a subsequent page is loading. Inspect the raw page first to know
// which new IDs must arrive; an empty page must not be confused with loading.
const fetchCatalogPage = async (request, offset, signal) => {
    const url = new URL(request.base);
    if (!['https:', 'http:'].includes(url.protocol) || !url.pathname.endsWith('/manifest.json')) throw new Error('unsupported-catalog');
    const extras = [...request.path.extra, ...(offset ? [['skip', String(offset)]] : [])];
    const suffix = extras.length ? '/' + extras.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&') : '';
    url.pathname = url.pathname.slice(0, -'manifest.json'.length) + `catalog/movie/${encodeURIComponent(request.path.id)}${suffix}.json`;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, PAGE_TIMEOUT);
    try {
        if (signal.aborted) throw new Error('cancelled');
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('catalog-failed');
        const text = await response.text();
        if (text.length > 4 * 1024 * 1024) throw new Error('catalog-too-large');
        const payload = JSON.parse(text);
        if (!Array.isArray(payload.metas)) throw new Error('invalid-catalog');
        if (payload.metas.some((item) => item.id === 'tmdb:no-content' && item.genres?.includes('Error'))) throw new Error('catalog-failed');
        return payload.metas.filter((item) => item.id !== 'tmdb:no-content');
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
};

const collectCatalogs = async (core, sources, signal, fetchPage = fetchCatalogPage, onProgress = null) => {
    const items = [];
    let failed = 0;
    for (const source of sources) {
        if (signal.aborted) throw new Error('cancelled');
        let offset = 0;
        let collectedIds = new Set();
        const started = Date.now();
        try {
            for (let page = 0; page < MAX_PAGES && offset < SOURCE_LIMIT; page++) {
                if (Date.now() - started > 35000) { failed++; break; }
                const raw = await fetchPage(source.request, offset, signal);
                if (!raw.length) break;
                const expected = [...new Set(raw.map((item) => item.id).filter((id) => typeof id === 'string' && !collectedIds.has(id)))];
                if (!expected.length) break;
                const state = await readCatalog(core, source.request, signal, page > 0 ? expected : null);
                if (state.catalog.content.type === 'Err') {
                    if (state.catalog.content.content !== 'EmptyContent') failed++;
                    break;
                }
                const batch = state.catalog.content.content;
                const next = batch.filter((item) => !collectedIds.has(item.id));
                items.push(...next.slice(0, SOURCE_LIMIT - collectedIds.size).map((item) => ({ ...item, aggregateCinemeta: source.cinemeta, aggregateSource: source.request.base })));
                if (!signal.aborted) onProgress?.({ items: [...items], failed });
                collectedIds = new Set(batch.map((item) => item.id));
                offset += raw.length;
                if (!source.paginated) break;
            }
        } catch (error) {
            if (signal.aborted) throw error;
            failed++;
        }
    }
    return { items, failed };
};

module.exports = { SOURCE_LIMIT, RESULT_LIMIT, catalogKind, getSources, imdbId, releaseDate, normalizeItem, mergeItems, collectCatalogs, readCatalog, fetchCatalogPage };
