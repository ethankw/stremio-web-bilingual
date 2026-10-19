// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const STORAGE_KEY = 'stremio-discover-filters-v1';
const TYPES = ['movie', 'series'];
const KINDS = ['all', 'popular', 'latest'];
const DEFAULT_FILTERS = { types: ['movie'], kind: 'all', genre: null };
const normalizeFilters = (value, fallback = DEFAULT_FILTERS) => ({
    types: Array.isArray(value?.types) && value.types.every((type) => TYPES.includes(type)) ? TYPES.filter((type) => value.types.includes(type)) : fallback.types,
    kind: KINDS.includes(value?.kind) ? value.kind : fallback.kind,
    genre: value?.genre === null || (typeof value?.genre === 'string' && value.genre.length <= 100) ? value.genre || null : fallback.genre,
});
const readFilters = (storage) => {
    try { return normalizeFilters(JSON.parse(storage.getItem(STORAGE_KEY))); }
    catch (_) { return normalizeFilters(null); }
};
const locationFilters = (url, query, saved) => {
    const patch = {};
    if (query.has('types')) patch.types = query.get('types') ? query.get('types').split(',') : [];
    else if (url.transportUrl !== 'unified' && TYPES.includes(url.type)) patch.types = [url.type];
    if (query.has('catalog')) patch.kind = query.get('catalog');
    else if (KINDS.includes(url.catalogId)) patch.kind = url.catalogId;
    else if (['year', 'tmdb.latest'].includes(url.catalogId)) patch.kind = 'latest';
    else if (['top', 'tmdb.top'].includes(url.catalogId)) patch.kind = 'popular';
    if (query.has('genre')) {
        const value = query.get('genre');
        // Old Cinemeta year links used the genre extra for a release year.
        patch.genre = url.transportUrl !== 'unified' && /^\d{4}$/.test(value) ? null : value;
    }
    return normalizeFilters({ ...saved, ...patch }, saved);
};
const filterHref = ({ types, kind, genre }) => {
    const query = new URLSearchParams({ types: types.join(','), catalog: kind, genre: genre || '' });
    return `#/discover?${query}`;
};
module.exports = { STORAGE_KEY, TYPES, KINDS, DEFAULT_FILTERS, normalizeFilters, readFilters, locationFilters, filterHref };
