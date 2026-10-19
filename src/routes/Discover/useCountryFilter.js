// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const React = require('react');
const { normalizeCountries, matchesCountries, countryIdentity } = require('stremio/common/productionCountries');
const { countryClient } = require('stremio/common/productionCountriesClient');
const STORAGE_KEY = 'stremio-discover-excluded-countries-v1';
const readExcluded = () => {
    try { return normalizeCountries(JSON.parse(window.localStorage.getItem(STORAGE_KEY))); }
    catch (_) { return []; }
};
const useCountryFilter = (items, active) => {
    const [excluded, setExcluded] = React.useState(readExcluded);
    const [resolved, setResolved] = React.useState({});
    const excludedKey = JSON.stringify(excluded);
    const identitiesKey = JSON.stringify([...new Map(items.map((item) => {
        const identity = countryIdentity(item);
        return [`${identity.type}|${identity.id}`, identity];
    })).values()]);
    React.useEffect(() => {
        try { window.localStorage.setItem(STORAGE_KEY, excludedKey); } catch (_) { /* Keep the current session usable if storage is unavailable. */ }
    }, [excludedKey]);
    React.useEffect(() => {
        const onStorage = (event) => { if (event.key === STORAGE_KEY || event.key === null) setExcluded(readExcluded()); };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);
    React.useEffect(() => {
        if (!active || excluded.length === 0) return undefined;
        let cancelled = false;
        let cursor = 0;
        const identities = JSON.parse(identitiesKey);
        const run = async () => {
            while (!cancelled && cursor < identities.length) {
                const identity = identities[cursor++];
                const countries = await countryClient.get(identity);
                if (!cancelled) setResolved((previous) => ({ ...previous, [`${identity.type}|${identity.id}`]: countries }));
            }
        };
        void run();
        void run();
        return () => { cancelled = true; };
    }, [identitiesKey, active, excluded.length]);
    const filtered = React.useMemo(() => items.filter((item) => {
        const identity = countryIdentity(item);
        return matchesCountries(resolved[`${identity.type}|${identity.id}`], excluded);
    }), [items, resolved, excluded]);
    const toggle = React.useCallback((code) => setExcluded((previous) => normalizeCountries(previous.includes(code) ? previous.filter((value) => value !== code) : [...previous, code])), []);
    return { items: filtered, excluded, toggle };
};
module.exports = useCountryFilter;
