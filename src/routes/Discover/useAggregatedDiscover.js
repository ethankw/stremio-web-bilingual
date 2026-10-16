// Copyright (C) 2017-2026 Smart code 203358507

const React = require('react');
const { useProfile } = require('stremio/common');
const { useRouteActive } = require('stremio/common/useRouteFocused');
const { catalogKind, getSources, imdbId, normalizeItem, mergeItems, collectCatalogs } = require('./aggregateCatalogs');

const canonicalCache = new Map();
const href = (kind, genre) => `#/discover/unified/movie/${kind}${genre ? `?genre=${encodeURIComponent(genre)}` : ''}`;

const canonicalMetadata = async (item, addon, signal) => {
    const id = imdbId(item);
    if (!id || !addon) return null;
    const key = `${addon.transportUrl}|${id}`;
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
        base.pathname = base.pathname.slice(0, -'manifest.json'.length) + `meta/movie/${id}.json`;
        const response = await fetch(base, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) return null;
        const { meta } = await response.json();
        if (meta?.id !== id || meta?.type !== 'movie') return null;
        canonicalCache.set(key, { meta, time: Date.now() });
        while (canonicalCache.size > 600) canonicalCache.delete(canonicalCache.keys().next().value);
        return meta;
    } catch (_) { return null; }
    finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
};

const enrichItems = async (items, addon, signal) => {
    const byId = new Map();
    const candidates = [...new Map(items.map((item) => [imdbId(item) || item.id, item])).values()];
    for (const item of items) {
        if (item.aggregateCinemeta) byId.set(imdbId(item) || item.id, { ...item, imdbRating: item.imdbRating ?? item.links?.find((link) => link.category === 'imdb')?.name });
    }
    const budget = new AbortController();
    const abort = () => budget.abort();
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 15000);
    let cursor = 0;
    await Promise.all(Array.from({ length: 6 }, async () => {
        while (cursor < candidates.length && !signal.aborted && !budget.signal.aborted) {
            const item = candidates[cursor++];
            const key = imdbId(item) || item.id;
            if (!byId.has(key)) byId.set(key, await canonicalMetadata(item, addon, budget.signal));
        }
    }));
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    const missing = candidates.some((item) => !byId.get(imdbId(item) || item.id));
    return { items: items.map((item) => normalizeItem(item, byId.get(imdbId(item) || item.id))), missing };
};

const useAggregatedDiscover = (core, raw, urlParams, queryParams) => {
    const profile = useProfile();
    const active = useRouteActive();
    const enabled = !urlParams.type || urlParams.type === 'movie';
    const addonsKey = JSON.stringify(profile.addons || []);
    const addons = React.useMemo(() => JSON.parse(addonsKey), [addonsKey]);
    const kind = urlParams.catalogId === 'latest' || addons.some((addon) => (
        addon.transportUrl === urlParams.transportUrl && addon.manifest.catalogs.some((catalog) => catalog.id === urlParams.catalogId && catalogKind(addon.manifest.id, catalog) === 'latest')
    )) ? 'latest' : 'popular';
    const [revision, refresh] = React.useReducer((value) => value + 1, 0);
    const [result, setResult] = React.useState(null);
    const requestKey = `${addonsKey}|${kind}`;
    const requestedGenre = queryParams.get('genre');
    const genre = /^\d{4}$/.test(requestedGenre || '') && urlParams.transportUrl !== 'unified' ? null : requestedGenre;
    const sources = React.useMemo(() => getSources(addons, kind), [addons, kind]);
    const selected = React.useMemo(() => ({ request: { base: 'unified', path: { resource: 'catalog', type: 'movie', id: kind, extra: genre ? [['genre', genre]] : [] } } }), [kind, genre]);

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
        (async () => {
            try {
                const collected = await collectCatalogs(core, sources, controller.signal);
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
    const movieCatalogs = React.useMemo(() => ['popular', 'latest'].map((id) => ({
        id, name: id === 'popular' ? 'Popular' : 'Latest', type: 'movie',
        addon: { manifest: { id: 'org.stremio.unified', name: '' } },
        selected: id === kind, deepLinks: { discover: href(id) },
    })), [kind]);
    const genres = React.useMemo(() => {
        const declared = addons.find((addon) => addon.manifest.id === 'com.linvo.cinemeta')?.manifest.catalogs.find((catalog) => catalog.type === 'movie' && catalog.id === 'top')?.extra?.find((extra) => extra.name === 'genre')?.options || [];
        return [...new Set([...declared, ...(current?.items || []).flatMap((item) => item.aggregateGenres || [])])].sort();
    }, [addons, current?.items]);
    const extra = React.useMemo(() => [{ name: 'genre', isRequired: false, options: [null, ...genres].map((value) => ({ value, selected: value === genre, deepLinks: { discover: href(kind, value) } })) }], [genres, genre, kind]);
    const visible = React.useMemo(() => (current?.items || []).filter((item) => !genre || item.aggregateGenres?.includes(genre)).map((item) => ({ ...item, released: new Date(item.released || NaN) })), [current?.items, genre]);
    const aggregated = React.useMemo(() => ({
        ...raw,
        selected,
        aggregate: { kind, failed: current?.failed || 0, missing: current?.missing || false, sources: sources.length, retry: refresh },
        selectable: {
            ...raw.selectable,
            types: raw.selectable.types.length ? raw.selectable.types.map((option) => ({ ...option, selected: option.type === 'movie', deepLinks: option.type === 'movie' ? { discover: href(kind) } : option.deepLinks })) : [{ type: 'movie', selected: true, deepLinks: { discover: href(kind) } }],
            catalogs: movieCatalogs, extra, nextPage: false,
        },
        catalog: { installed: true, content: current ? { type: 'Ready', content: visible } : { type: 'Loading' } },
    }), [raw, selected, kind, current, sources.length, movieCatalogs, extra, visible]);
    return enabled ? aggregated : raw;
};

module.exports = useAggregatedDiscover;
