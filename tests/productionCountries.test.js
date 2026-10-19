const { COUNTRY_CODES, countryGroups, countryName, normalizeCountries, matchesCountries, countryIdentity } = require('../src/common/productionCountries');
const { createCountryClient } = require('../src/common/productionCountriesClient');

const identity = { type: 'movie', id: 'tt0133093' };
const payload = (countries = ['US', 'AU']) => ({ schemaVersion: 1, identity: { stremioType: identity.type, stremioId: identity.id, tmdbId: 603 }, matchStatus: 'matched', productionCountries: countries });
const response = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });

test('country snapshot is complete, unique, and partitioned exactly once into the requested three sections', () => {
    expect(COUNTRY_CODES.length).toBeGreaterThan(240);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    const groups = countryGroups('zh-CN');
    expect(groups.map((group) => group.id)).toEqual(['western', 'eastAsian', 'other']);
    expect(groups.flatMap((group) => group.codes).sort()).toEqual([...COUNTRY_CODES].sort());
    expect(groups[0].codes.slice(0, 2)).toEqual(['US', 'GB']);
    expect(groups[1].codes).toEqual(expect.arrayContaining(['CN', 'HK', 'MO', 'TW', 'JP', 'KR']));
    expect(groups[2].codes[0]).toBe('IN');
    expect(countryName('US', 'zh-CN')).toBe('美国');
    expect(countryName('JP', 'en-US')).toBe('Japan');
    expect(countryName('US', 'en-US')).toBe('United States');
    expect(countryName('XC', 'zh-CN')).toBe('捷克斯洛伐克');
});

test('all-selected preserves unknowns; active exclusions reject any co-production containing an excluded country', () => {
    expect(matchesCountries(null, [])).toBe(true);
    expect(matchesCountries(['US', 'GB'], [])).toBe(true);
    expect(matchesCountries(['US', 'GB'], ['US'])).toBe(false);
    expect(matchesCountries(['US', 'GB'], ['GB'])).toBe(false);
    expect(matchesCountries(['GB', 'FR'], ['US'])).toBe(true);
    expect(matchesCountries([], ['US'])).toBe(false);
    expect(matchesCountries(null, ['US'])).toBe(false);
    expect(matchesCountries(['JP'], COUNTRY_CODES)).toBe(false);
    expect(normalizeCountries(['US', 'GB', 'US', 'ZZ', null, '<script>'])).toEqual(['GB', 'US']);
});

test('country identity bridges IMDb and TMDB sources without inferring by title', () => {
    expect(countryIdentity({ type: 'movie', id: 'tmdb:603', aggregateImdbId: 'tt0133093' })).toEqual(identity);
    expect(countryIdentity({ type: 'movie', id: 'tmdb:603', name: 'The Matrix' })).toEqual({ type: 'movie', id: 'tmdb:603' });
});

test('small country lookups deduplicate simultaneous requests, expire and share metadata seeds', async () => {
    let now = 0;
    const fetcher = jest.fn(async () => response(payload()));
    const client = createCountryClient(fetcher, () => now);
    expect(await Promise.all([client.get(identity), client.get(identity)])).toEqual([['AU', 'US'], ['AU', 'US']]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toContain('/countries?type=movie&id=tt0133093&zh=zh-CN');
    expect(await client.get(identity)).toEqual(['AU', 'US']);
    now += 86400001;
    await client.get(identity);
    expect(fetcher).toHaveBeenCalledTimes(2);
    client.seed(identity, ['FR', 'GB', 'FR']);
    expect(await client.get(identity)).toEqual(['FR', 'GB']);
    expect(fetcher).toHaveBeenCalledTimes(2);
});

test.each([
    { ...payload(), identity: { stremioType: 'movie', stremioId: 'tt9999999' } },
    { ...payload(), productionCountries: ['US', '<img>'] },
    { ...payload(), schemaVersion: 9 },
])('untrusted or wrong-film country results never enter the cache: %j', async (body) => {
    const client = createCountryClient(async () => response(body));
    expect(await client.get(identity)).toBeNull();
});

test('Access expiry, unknown IDs and transient errors do not fabricate a country; a later retry can recover', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } }))
        .mockRejectedValueOnce(new Error('offline')).mockImplementation(async () => response(payload(['JP'])));
    const client = createCountryClient(fetcher);
    expect(await client.get({ type: 'movie', id: '603' })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await client.get(identity)).toBeNull();
    expect(await client.get(identity)).toBeNull();
    expect(await client.get(identity)).toEqual(['JP']);
});
