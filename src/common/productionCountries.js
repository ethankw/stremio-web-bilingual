// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
// TMDB configuration/countries snapshot, 2026-10-19. Display names use the UI locale.
const countryNames = require('./productionCountryCodes.json');
const COUNTRY_CODES = Object.keys(countryNames);
const codes = new Set(COUNTRY_CODES);
const HIDDEN_COUNTRIES = Object.freeze(['CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'KP', 'IN', 'BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'TL', 'VN']);

const normalizeCountries = (value) => Array.isArray(value)
    ? [...new Set(value.filter((code) => typeof code === 'string' && codes.has(code)))].sort()
    : [];
const historicalChinese = { XC: '捷克斯洛伐克', XG: '东德', XI: '北爱尔兰' };
const countryName = (code, locale = 'en-US') => {
    if (locale.startsWith('zh') && historicalChinese[code]) return historicalChinese[code];
    try {
        const name = new Intl.DisplayNames([locale], { type: 'region', style: locale.startsWith('zh') ? 'short' : 'long' }).of(code);
        return name && name !== code ? name : countryNames[code] || code;
    } catch (_) { return countryNames[code] || code; }
};
// Fail closed while filtering: missing/unresolved data cannot establish that a
// co-production excludes a deselected country. All-selected never needs metadata.
const matchesCountries = (countries, excluded) => excluded.length === 0 || (
    Array.isArray(countries) && countries.length > 0 && countries.every((code) => !excluded.includes(code))
);
const countryIdentity = (item) => ({ type: item.type, id: item.aggregateImdbId || item.id });

module.exports = { COUNTRY_CODES, normalizeCountries, countryName, HIDDEN_COUNTRIES, matchesCountries, countryIdentity };
