// Copyright (C) 2017-2026 Smart code 203358507

const PAGE_TIMEOUT = 12000;
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: false });

const catalogKind = (manifestId, catalog) => {
    if (!['movie', 'series'].includes(catalog.type)) return null;
    if (manifestId === 'com.linvo.cinemeta') return { top: 'popular', year: 'latest' }[catalog.id] || null;
    if (manifestId === 'tmdb-addon') return { 'tmdb.top': 'popular', 'tmdb.latest': 'latest' }[catalog.id] || null;
    // Only explicit release/new catalogs qualify. History, recently watched,
    // recommendations, franchises and arbitrary year catalogs are not releases.
    if (/^(new|latest|newest|最新)$/i.test(catalog.name || '')) return 'latest';
    const name = `${catalog.id} ${catalog.name || ''}`.toLowerCase().replace(/[_:.-]+/g, ' ');
    if (/(?:^|[ ._:-])(?:latest|new releases|latest releases|newest|recent releases|最新|近期上映)(?:$|[ ._:-])/.test(name)) return 'latest';
    return null;
};

const getSources = (addons, kind, now = new Date(), types = ['movie'], genre = null) => {
    const sources = (addons || []).flatMap((addon) => (
        (addon.manifest.catalogs || []).flatMap((catalog) => {
            const sourceKind = catalogKind(addon.manifest.id, catalog);
            if (!types.includes(catalog.type) || !sourceKind || (kind !== 'all' && sourceKind !== kind)) return [];
            const extras = catalog.extra || [];
            if (extras.some((extra) => extra.isRequired && (!extra.options?.length || ['search', 'ids'].includes(extra.name)))) return [];
            const required = extras.filter((extra) => extra.isRequired).map((extra) => [extra.name, extra.options[0]]);
            const years = addon.manifest.id === 'com.linvo.cinemeta' && catalog.id === 'year'
                ? [String(now.getUTCFullYear()), String(now.getUTCFullYear() - 1)].filter((year) => extras.find((extra) => extra.name === 'genre')?.options?.includes(year))
                : [null];
            const genreSupported = genre && !(addon.manifest.id === 'com.linvo.cinemeta' && catalog.id === 'year')
                && extras.some((extra) => extra.name === 'genre' && extra.options?.includes(genre));
            const filteredExtras = genreSupported ? [...required.filter(([name]) => name !== 'genre'), ['genre', genre]] : required;
            return years.map((year) => ({
                genre: genreSupported ? genre : null,
                request: {
                    base: addon.transportUrl,
                    path: { resource: 'catalog', type: catalog.type, id: catalog.id, extra: year === null ? filteredExtras : [['genre', year]] },
                },
                cinemeta: addon.manifest.id === 'com.linvo.cinemeta',
                paginated: extras.some((extra) => extra.name === 'skip'),
            }));
        })
    ));
    // Give each selected media type an early source before slower providers.
    const groups = types.map((type) => sources.filter((source) => source.request.path.type === type));
    return Array.from({ length: Math.max(0, ...groups.map((group) => group.length)) }, (_, index) => groups.flatMap((group) => group[index] ? [group[index]] : [])).flat();
};

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
    aggregateGenres: [...new Set([...(canonical?.genres || item.genres || (canonical?.links || item.links || []).filter((link) => link.category === 'Genres').map((link) => link.name)), ...(item.aggregateFilterGenre ? [item.aggregateFilterGenre] : [])])],
    links: [...(item.links || []).filter((link) => link.category !== 'imdb'), ...(canonical?.links || []).filter((link) => link.category === 'imdb')],
    aggregateImdbId: imdbId(item),
});

const mergeItems = (items, kind, now = Date.now()) => {
    const unique = new Map();
    for (const item of items) {
        if (!['movie', 'series'].includes(item.type) || typeof item.id !== 'string' || item.id === 'tmdb:no-content') continue;
        const key = `${item.type}|${item.aggregateImdbId || imdbId(item) || (/^tmdb:[1-9]\d*$/.test(item.id) ? item.id : `${item.aggregateSource || ''}|${item.id}`)}`;
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
            const difference = kind !== 'latest'
                ? rating(b) - rating(a)
                : (releaseDate(b) ?? -Infinity) - (releaseDate(a) ?? -Infinity);
            return (Number.isNaN(difference) ? 0 : difference) || collator.compare(a.name || '', b.name || '') || a.id.localeCompare(b.id);
        });
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
    const type = request.path.type || 'movie';
    if (!['movie', 'series'].includes(type)) throw new Error('unsupported-catalog');
    const extras = [...request.path.extra, ...(offset ? [['skip', String(offset)]] : [])];
    const suffix = extras.length ? '/' + extras.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&') : '';
    url.pathname = url.pathname.slice(0, -'manifest.json'.length) + `catalog/${type}/${encodeURIComponent(request.path.id)}${suffix}.json`;
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

// The first pass samples every source/media type. Subsequent calls continue one
// source to exhaustion before switching, keeping Core's cumulative pagination.
// Returning after each page bounds work without imposing a catalog-size limit.
const createCatalogPager = (core, sources, signal, fetchPage = fetchCatalogPage) => {
    const cursors = sources.map((source) => ({ source, offset: 0, ids: new Set(), pages: [], done: false }));
    const items = [];
    let failed = 0;
    let primeIndex = 0;
    let selectedCursor = null;
    let running = false;
    const snapshot = () => ({ items: [...items], failed, hasMore: cursors.some((cursor) => !cursor.done), priming: primeIndex < cursors.length });
    const next = async () => {
        if (running) throw new Error('catalog-page-in-flight');
        running = true;
        try {
            while (cursors.some((cursor) => !cursor.done)) {
                if (signal.aborted) throw new Error('cancelled');
                const cursor = primeIndex < cursors.length ? cursors[primeIndex++] : cursors.find((entry) => !entry.done);
                if (cursor.done) continue;
                const { source } = cursor;
                try {
                    const raw = await fetchPage(source.request, cursor.offset, signal);
                    if (signal.aborted) throw new Error('cancelled');
                    const expected = [...new Set(raw.map((item) => item.id).filter((id) => typeof id === 'string' && !cursor.ids.has(id)))];
                    if (!expected.length) { cursor.done = true; continue; }
                    // Switching back after the first-page pass restores Core's
                    // selection. Replayed pages are never appended a second time.
                    if (cursor.offset && selectedCursor !== cursor) {
                        await readCatalog(core, source.request, signal);
                        for (const pageIds of cursor.pages.slice(1)) await readCatalog(core, source.request, signal, pageIds);
                    }
                    const state = await readCatalog(core, source.request, signal, cursor.offset ? expected : null);
                    selectedCursor = cursor;
                    if (state.catalog.content.type === 'Err') {
                        if (state.catalog.content.content !== 'EmptyContent') failed++;
                        cursor.done = true;
                        continue;
                    }
                    const batch = state.catalog.content.content;
                    const added = batch.filter((item) => !cursor.ids.has(item.id));
                    if (!added.length) { cursor.done = true; continue; }
                    items.push(...added.map((item) => ({ ...item, aggregateCinemeta: source.cinemeta, aggregateSource: source.request.base, aggregateFilterGenre: source.genre })));
                    cursor.pages.push(expected);
                    cursor.ids = new Set(batch.map((item) => item.id));
                    cursor.offset += raw.length;
                    if (!source.paginated) cursor.done = true;
                    return snapshot();
                } catch (error) {
                    if (signal.aborted) throw error;
                    selectedCursor = null;
                    cursor.done = true;
                    failed++;
                }
            }
            return snapshot();
        } finally { running = false; }
    };
    return { next };
};

const collectCatalogs = async (core, sources, signal, fetchPage = fetchCatalogPage, onProgress = null) => {
    const pager = createCatalogPager(core, sources, signal, fetchPage);
    let result;
    do {
        result = await pager.next();
        await onProgress?.(result);
    } while (result.hasMore);
    return result;
};

module.exports = { catalogKind, getSources, imdbId, releaseDate, normalizeItem, mergeItems, collectCatalogs, createCatalogPager, readCatalog, fetchCatalogPage };
