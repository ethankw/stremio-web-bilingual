// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
// TMDB configuration/countries snapshot, 2026-10-19. Display names use the UI locale.
const countryNames = require('./productionCountryCodes.json');
const COUNTRY_CODES = Object.keys(countryNames);
const codes = new Set(COUNTRY_CODES);
const western = new Set('US CA GB FR DE IT ES PT NL BE LU CH AT IE DK SE NO FI IS GR CY MT AL AD BA BG BY CZ EE FO GG GI HR HU IM JE LI LT LV MC MD ME MK PL RO RS RU SI SJ SK SM UA VA AX XC XG XI XK YU SU AI AG AW BS BB BZ BM BO BQ BR VG KY CL CO CR CU CW DM DO EC SV FK GF GL GD GP GT GY HT HN JM MQ MX MS NI PA PY PE PR BL KN LC MF PM VC SX SR TT TC VI UY VE'.split(' '));
const eastAsian = ['CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'KP'];

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
const countryGroups = (locale) => {
    const compare = (a, b) => countryName(a, locale).localeCompare(countryName(b, locale), locale);
    const prioritized = ['US', 'GB', 'FR', 'DE', 'CA', 'IT', 'ES'];
    const west = COUNTRY_CODES.filter((code) => western.has(code));
    const others = COUNTRY_CODES.filter((code) => !western.has(code) && !eastAsian.includes(code));
    return [
        { id: 'western', codes: [...prioritized.filter((code) => codes.has(code)), ...west.filter((code) => !prioritized.includes(code)).sort(compare)] },
        { id: 'eastAsian', codes: eastAsian.filter((code) => codes.has(code)) },
        { id: 'other', codes: ['IN', ...others.filter((code) => code !== 'IN').sort(compare)] },
    ];
};

// Fail closed while filtering: missing/unresolved data cannot establish that a
// co-production excludes a deselected country. All-selected never needs metadata.
const matchesCountries = (countries, excluded) => excluded.length === 0 || (
    Array.isArray(countries) && countries.length > 0 && countries.every((code) => !excluded.includes(code))
);
const countryIdentity = (item) => ({ type: item.type, id: item.aggregateImdbId || item.id });

module.exports = { COUNTRY_CODES, normalizeCountries, countryName, countryGroups, matchesCountries, countryIdentity };
