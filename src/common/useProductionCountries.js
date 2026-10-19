// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const React = require('react');
const { countryClient } = require('./productionCountriesClient');
const { normalizeCountries } = require('./productionCountries');

const useProductionCountries = (identity, metadata, waitForMetadata = false) => {
    const type = identity?.type;
    const id = identity?.id;
    const key = `${type}|${id}`;
    const [result, setResult] = React.useState({ key: null, countries: null });
    const supplied = metadata?.productionCountries;
    React.useEffect(() => {
        let active = true;
        const requestIdentity = { type, id };
        if (Array.isArray(supplied)) countryClient.seed(requestIdentity, supplied);
        else if (waitForMetadata) return undefined;
        countryClient.get(requestIdentity).then((countries) => {
            if (active) setResult({ key, countries });
        });
        return () => { active = false; };
    }, [type, id, key, supplied, waitForMetadata]);
    return Array.isArray(supplied) ? normalizeCountries(supplied) : result.key === key ? result.countries : null;
};
module.exports = useProductionCountries;
