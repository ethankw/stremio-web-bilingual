// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const React = require('react');
const { useNavigate } = require('react-router');
const { STORAGE_KEY, TYPES, normalizeFilters, readFilters, locationFilters, filterHref } = require('./discoverFilters');
const readSaved = () => {
    try { return readFilters(window.localStorage); } catch (_) { return normalizeFilters(null); }
};
const useDiscoverFilters = (url, query) => {
    const navigate = useNavigate();
    const unified = !url.type || TYPES.includes(url.type);
    const queryKey = query.toString();
    const [filters, setFilters] = React.useState(() => unified ? locationFilters(url, query, readSaved()) : readSaved());
    React.useEffect(() => {
        if (!unified) return;
        setFilters((previous) => {
            const next = locationFilters({ type: url.type, transportUrl: url.transportUrl, catalogId: url.catalogId }, new URLSearchParams(queryKey), previous);
            return JSON.stringify(next) === JSON.stringify(previous) ? previous : next;
        });
    }, [url.type, url.transportUrl, url.catalogId, queryKey, unified]);
    React.useEffect(() => {
        if (!unified) return;
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filters)); } catch (_) { /* Preserve session state if storage is blocked. */ }
    }, [filters, unified]);
    const update = React.useCallback((patch) => {
        const next = normalizeFilters({ ...filters, ...patch }, filters);
        setFilters(next);
        navigate(filterHref(next).slice(1), { replace: true });
    }, [filters, navigate]);
    return { ...filters, update };
};
module.exports = useDiscoverFilters;
