// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { useProfile } = require('stremio/common');
const { useRouteActive } = require('stremio/common/useRouteFocused');
const { getSources, imdbId, normalizeItem, mergeItems, collectCatalogs } = require('./aggregateCatalogs');

const canonicalCache = new Map();
const { filterHref } = require('./discoverFilters');
const metadataKey = (item) => `${item.type}|${imdbId(item) || item.id}`;

const canonicalMetadata = async (item, addon, signal) => {
    const id = imdbId(item);
    if (!id || !addon) return null;
    const key = `${addon.transportUrl}|${item.type}|${id}`;
    const cached = canonicalCache.get(key);
    if (cached && Date.now() - cached.time < 15 * 60 * 1000) return cached.meta;
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 6000);
    try {
        if (signal.aborted) return null;
        const base = new URL(addon.transportUrl);
        if (!['https:', 'http:'].includes(base.protocol) || !base.pathname.endsWith('/manifest.json')) return null;
        base.pathname = base.pathname.slice(0, -'manifest.json'.length) + `meta/${item.type}/${id}.json`;
        const response = await fetch(base, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) return null;
        const { meta } = await response.json();
        if (meta?.id !== id || meta?.type !== item.type) return null;
        canonicalCache.set(key, { meta, time: Date.now() });
        while (canonicalCache.size > 600) canonicalCache.delete(canonicalCache.keys().next().value);
        return meta;
    } catch (_) { return null; }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
};

const enrichItems = async (items, addon, signal) => {
    const byId = new Map();
    const candidates = [...new Map(items.map((item) => [metadataKey(item), item])).values()];
    for (const item of items) {
        if (item.aggregateCinemeta) byId.set(metadataKey(item), { ...item, imdbRating: item.imdbRating ?? item.links?.find((link) => link.category === 'imdb')?.name });
    }
    const budget = new AbortController();
    const abort = () => budget.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    let cursor = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (cursor < candidates.length && !signal.aborted && !budget.signal.aborted) {
            const item = candidates[cursor++];
            const key = metadataKey(item);
            if (!byId.has(key)) byId.set(key, await canonicalMetadata(item, addon, budget.signal));
        }
    }));
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    const missing = candidates.some((item) => !byId.get(metadataKey(item)));
    return { items: items.map((item) => normalizeItem(item, byId.get(metadataKey(item)))), missing };
};

const useAggregatedDiscover = (core, raw, urlParams, queryParams, filters) => {
    const profile = useProfile();
    const active = useRouteActive();
    const enabled = !urlParams.type || ['movie', 'series'].includes(urlParams.type);
    const addonsKey = JSON.stringify(profile.addons || []);
    const addons = React.useMemo(() => JSON.parse(addonsKey), [addonsKey]);
    const kind = filters.kind;
    const typesKey = filters.types.join(',');
    const types = React.useMemo(() => typesKey ? typesKey.split(',') : [], [typesKey]);
    const genre = filters.genre;
    const href = React.useCallback((nextKind, nextGenre = genre) => filterHref({ types, kind: nextKind, genre: nextGenre }), [types, genre]);
    const [revision, refresh] = React.useReducer((value) => value + 1, 0);
    const [result, setResult] = React.useState(null);
    const resultRef = React.useRef(result);
    resultRef.current = result;
    const requestKey = `${addonsKey}|${typesKey}|${kind}`;
    const sources = React.useMemo(() => getSources(addons, kind, new Date(), types), [addons, kind, types]);
    const selected = React.useMemo(() => ({ request: { base: 'unified', path: { resource: 'catalog', type: types[0] || 'movie', id: kind, extra: genre ? [['genre', genre]] : [] } } }), [kind, genre, types]);

    React.useEffect(() => {
        if (!enabled || !active) return undefined;
        let timer;
        const onState = (models) => {
            if (models.includes('ctx')) {
                clearTimeout(timer);
                timer = setTimeout(refresh, 250);
            }
        };
        core.on('state', onState);
        return () => { clearTimeout(timer); core.off('state', onState); };
    }, [enabled, active, core]);

    React.useEffect(() => {
        if (!enabled || !active) return undefined;
        const controller = new AbortController();
        // Retain a complete visible list during background refreshes. On first
        // entry, publish each available page without waiting for slow providers.
        const showProgress = resultRef.current?.key !== requestKey;
        (async () => {
            try {
                const collected = await collectCatalogs(core, sources, controller.signal, undefined, (partial) => {
                    if (showProgress && !controller.signal.aborted) {
                        const items = mergeItems(partial.items.map((item) => normalizeItem(item, null)), kind);
                        setResult({ key: requestKey, items, failed: partial.failed, missing: false });
                    }
                });
                const cinemeta = addons.find((addon) => addon.manifest.id === 'com.linvo.cinemeta');
                const enriched = await enrichItems(collected.items, cinemeta, controller.signal);
                if (!controller.signal.aborted) setResult({ key: requestKey, items: mergeItems(enriched.items, kind), failed: collected.failed, missing: enriched.missing });
            } catch (_) {
                if (!controller.signal.aborted) setResult({ key: requestKey, items: [], failed: sources.length });
            }
        })();
        return () => controller.abort();
    }, [enabled, active, core, addons, kind, sources, requestKey, revision]);

    const current = result?.key === requestKey ? result : null;
    const movieCatalogs = React.useMemo(() => ['all', 'popular', 'latest'].map((id) => ({
        id, name: id === 'all' ? 'All' : id === 'popular' ? 'Popular' : 'Latest', type: types[0] || 'movie',
        addon: { manifest: { id: 'org.stremio.unified', name: '' } },
        selected: id === kind, deepLinks: { discover: href(id) },
    })), [kind, types, href]);
    const genres = React.useMemo(() => {
        const declared = (addons.find((addon) => addon.manifest.id === 'com.linvo.cinemeta')?.manifest.catalogs || [])
            .filter((catalog) => types.includes(catalog.type) && catalog.id === 'top')
            .flatMap((catalog) => catalog.extra?.find((extra) => extra.name === 'genre')?.options || []);
        return [...new Set([...declared, ...(genre ? [genre] : []), ...(current?.items || []).flatMap((item) => item.aggregateGenres || [])])].sort();
    }, [addons, current?.items, types, genre]);
    const extra = React.useMemo(() => [{ name: 'genre', isRequired: false, options: [null, ...genres].map((value) => ({ value, selected: value === genre, deepLinks: { discover: href(kind, value) } })) }], [genres, genre, kind, href]);
    const visible = React.useMemo(() => (current?.items || []).filter((item) => !genre || item.aggregateGenres?.includes(genre)).map((item) => ({ ...item, released: new Date(item.released || NaN) })), [current?.items, genre]);
    const aggregated = React.useMemo(() => ({
        ...raw,
        selected,
        aggregate: { kind, types, failed: current?.failed || 0, missing: current?.missing || false, sources: sources.length, retry: refresh },
        selectable: {
            ...raw.selectable,
            types: ['movie', 'series'].map((type) => ({ type, selected: types.includes(type), deepLinks: { discover: filterHref({ types: [type], kind, genre }) } })),
            catalogs: movieCatalogs, extra, nextPage: false,
        },
        catalog: { installed: true, content: current ? { type: 'Ready', content: visible } : { type: 'Loading' } },
    }), [raw, selected, kind, types, genre, current, sources.length, movieCatalogs, extra, visible]);
    return enabled ? aggregated : raw;
};

module.exports = useAggregatedDiscover;
