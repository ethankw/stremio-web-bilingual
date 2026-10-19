const { createWorker } = require('../../.worker-tests/index.js');
const { productionCountries } = require('../../.worker-tests/tmdb.js');
const env = { BILINGUAL_METADATA_ENABLED: 'true', TMDB_READ_TOKEN: 'fake-token', ASSETS: { fetch: jest.fn() } };
const json = (body) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
const request = (suffix = 'countries', query = 'type=movie&id=tt0133093&zh=zh-CN') => new Request(`https://example.test/api/bilingual/v1/${suffix}?${query}`);
const details = { id: 603, original_language: 'en', original_title: 'The Matrix', production_countries: [{ iso_3166_1: 'US' }, { iso_3166_1: 'AU' }, { iso_3166_1: 'US' }] };

test('all production countries are preserved and malformed codes discarded, never inferred from language', () => {
    expect(productionCountries(details.production_countries)).toEqual(['US', 'AU']);
    expect(productionCountries([{ iso_3166_1: 'en' }, { iso_3166_1: 'USA' }, null, { iso_3166_1: '<script>' }])).toEqual([]);
    expect(productionCountries(undefined)).toEqual([]);
});

test('country-only requests skip translations and artwork, are private, and use the metadata cache', async () => {
    const fetch = jest.fn(async (url) => json(String(url).includes('/find/') ? { movie_results: [{ id: 603 }], tv_results: [] } : details));
    const worker = createWorker({ fetch });
    const first = await worker.fetch(request(), env);
    expect(first.headers.get('cache-control')).toBe('private, no-store');
    expect(await first.json()).toMatchObject({ productionCountries: ['US', 'AU'], matchStatus: 'matched' });
    await worker.fetch(request(), env);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.every(([url]) => !String(url).includes('translations') && !String(url).includes('images'))).toBe(true);
});

test('detail metadata seeds country-only endpoint without another upstream call', async () => {
    const fetch = jest.fn(async (url) => json(String(url).includes('/find/') ? { movie_results: [{ id: 603 }], tv_results: [] }
        : String(url).includes('/translations') ? { id: 603, translations: [] } : details));
    const worker = createWorker({ fetch });
    expect(await (await worker.fetch(request('meta'), env)).json()).toMatchObject({ productionCountries: ['US', 'AU'] });
    const before = fetch.mock.calls.length;
    expect(await (await worker.fetch(request(), env)).json()).toMatchObject({ productionCountries: ['US', 'AU'] });
    expect(fetch).toHaveBeenCalledTimes(before);
});

test('country endpoint respects identity, feature, credentials and HTTP method boundaries', async () => {
    const fetch = jest.fn();
    const worker = createWorker({ fetch });
    expect((await worker.fetch(request('countries', 'type=movie&id=603&zh=zh-CN'), env)).status).toBe(400);
    expect((await worker.fetch(request('countries', 'type=movie&id=tt0133093&zh=zh-CN&url=https://evil.test'), env)).status).toBe(400);
    expect((await worker.fetch(new Request(request(), { method: 'POST' }), env)).status).toBe(405);
    expect((await worker.fetch(request(), { ...env, TMDB_READ_TOKEN: undefined })).status).toBe(503);
    expect((await worker.fetch(request(), { ...env, BILINGUAL_METADATA_ENABLED: 'false' })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
});

test('ambiguous and wrong-ID matches remain unknown instead of hiding unrelated countries', async () => {
    const ambiguous = createWorker({ fetch: async () => json({ movie_results: [{ id: 603 }, { id: 604 }], tv_results: [] }) });
    expect(await (await ambiguous.fetch(request(), env)).json()).toMatchObject({ matchStatus: 'ambiguous', productionCountries: [] });
    const wrong = createWorker({ fetch: async () => json({ ...details, id: 604 }) });
    expect(await (await wrong.fetch(request('countries', 'type=movie&id=tmdb:603&zh=zh-CN'), env)).json()).toMatchObject({ matchStatus: 'unmatched', productionCountries: [] });
});
