// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const React = require('react');
const { HIDDEN_COUNTRIES, matchesCountries, countryIdentity } = require('stremio/common/productionCountries');
const { countryClient } = require('stremio/common/productionCountriesClient');
const useSavedBoolean = require('stremio/common/useSavedBoolean');
const NO_EXCLUSIONS = [];
const useCountryFilter = (items, active) => {
    const [enabled, setEnabled] = useSavedBoolean('stremio-discover-hide-east-asian-indian-v1');
    const excluded = enabled ? HIDDEN_COUNTRIES : NO_EXCLUSIONS;
    const [resolved, setResolved] = React.useState({});
    const identitiesKey = JSON.stringify([...new Map(items.map((item) => {
        const identity = countryIdentity(item);
        return [`${identity.type}|${identity.id}`, identity];
    })).values()]);
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
    const toggle = React.useCallback(() => setEnabled((previous) => !previous), [setEnabled]);
    return { items: filtered, enabled, toggle };
};
module.exports = useCountryFilter;
