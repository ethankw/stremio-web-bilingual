// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const { normalizeIdentity } = require('./bilingual/client');
const { normalizeCountries } = require('./productionCountries');

// Independent of translation preferences. Small responses, bounded cache and two
// background lookups at a time keep the catalog and visible title queue responsive.
const createCountryClient = (fetcher = (...args) => fetch(...args), clock = Date.now) => {
    const cache = new Map();
    const pending = new Map();
    const keyFor = (identity) => `${identity.type}|${identity.id}`;
    const seed = (identity, countries, ttl = 24 * 60 * 60 * 1000) => {
        if (!normalizeIdentity(identity).valid || !Array.isArray(countries)) return;
        const value = normalizeCountries(countries);
        cache.delete(keyFor(identity));
        cache.set(keyFor(identity), { value, expires: clock() + ttl });
        while (cache.size > 600) cache.delete(cache.keys().next().value);
    };
    const get = async (identity) => {
        if (!normalizeIdentity(identity).valid) return null;
        const key = keyFor(identity);
        const cached = cache.get(key);
        if (cached && cached.expires > clock()) return cached.value;
        if (pending.has(key)) return pending.get(key);
        const request = (async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 10000);
            try {
                const query = new URLSearchParams({ type: identity.type, id: identity.id, zh: 'zh-CN' });
                const response = await fetcher(`/api/bilingual/v1/countries?${query}`, { signal: controller.signal, credentials: 'same-origin', redirect: 'error' });
                if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
                const text = await response.text();
                if (text.length > 8192) return null;
                const result = JSON.parse(text);
                if (result.schemaVersion !== 1 || result.identity?.stremioType !== identity.type || result.identity?.stremioId !== identity.id || !['matched', 'unmatched', 'ambiguous', 'unsupported'].includes(result.matchStatus) || !Array.isArray(result.productionCountries) || result.productionCountries.length > 50 || result.productionCountries.some((code) => typeof code !== 'string' || !/^[A-Z]{2}$/.test(code))) return null;
                const matched = result.matchStatus === 'matched';
                if (matched ? !Number.isSafeInteger(result.identity.tmdbId) || result.identity.tmdbId <= 0 : result.identity.tmdbId !== null || result.productionCountries.length !== 0) return null;
                if (identity.id.startsWith('tmdb:') && result.identity.tmdbId !== null && result.identity.tmdbId !== Number(identity.id.slice(5))) return null;
                const value = normalizeCountries(result.productionCountries);
                seed(identity, value, matched ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000);
                return value;
            } catch (_) { return null; }
            finally { clearTimeout(timer); pending.delete(key); }
        })();
        pending.set(key, request);
        return request;
    };
    return { get, seed };
};
const countryClient = createCountryClient();
module.exports = { createCountryClient, countryClient };
