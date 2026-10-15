const { createWorker } = require('../../.worker-tests/index.js');
const { isSupportedMediaId } = require('../../.worker-tests/identity.js');
const { normalizeIdentity, createBilingualClient, getBilingualTitleLines, validateMetadata } = require('../../src/common/bilingual/client');
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const env = { BILINGUAL_METADATA_ENABLED: 'true', TMDB_READ_TOKEN: 'fake' };
const request = (type, id, scope = 'meta', extra = '') => new Request(`https://test/api/bilingual/v1/${scope}?type=${type}&id=${encodeURIComponent(id)}&zh=zh-CN${extra}`);
const details = (id, type) => ({ id, original_language: 'en', [type === 'movie' ? 'original_title' : 'original_name']: 'English title' });
const translations = (id) => ({ id, translations: [{ iso_639_1: 'en', iso_3166_1: 'US', data: { title: 'English title', name: 'English title', overview: 'English overview' } }, { iso_639_1: 'zh', iso_3166_1: 'CN', data: { title: '中文标题', name: '中文标题', overview: '中文简介' } }] });

test.each(['movie', 'series'])('direct TMDB %s identity reaches bilingual display through client and Worker', async (type) => {
    const upstream = jest.fn().mockResolvedValueOnce(json(details(603, type))).mockResolvedValueOnce(json(translations(603)));
    const worker = createWorker({ fetch: upstream });
    const client = createBilingualClient({ fetch: (url) => worker(new Request('https://test' + url), env) });
    const identity = { type, id: 'tmdb:603', scope: 'meta' };
    const result = await client.request(identity);
    expect(result.status).toBe('ready');
    expect(result.metadata.identity).toEqual({ stremioType: type, stremioId: 'tmdb:603', tmdbId: 603 });
    expect(getBilingualTitleLines(result.metadata, '原始中文名称').map(x => x.text)).toEqual(['English title', '中文标题']);
    expect(result.metadata.overview.en.text).toBe('English overview');
    expect(result.metadata.overview.zh.text).toBe('中文简介');
    expect(upstream.mock.calls.map(x => x[0])).toEqual([`https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/603`, `https://api.themoviedb.org/3/${type === 'movie' ? 'movie' : 'tv'}/603/translations`]);
    expect(validateMetadata({ ...result.metadata, identity: { ...result.metadata.identity, tmdbId: 999 } }, normalizeIdentity(identity))).toBe(false);
    await client.request(identity);
    expect(upstream).toHaveBeenCalledTimes(2);
});

test('TMDB episode verifies parent and exact season/episode without IMDb lookup', async () => {
    const upstream = jest.fn().mockResolvedValueOnce(json(details(1399, 'series')))
        .mockResolvedValueOnce(json({ id: 9001, season_number: 0, episode_number: 1, name: 'Special', original_language: 'en' }))
        .mockResolvedValueOnce(json(translations(9001)));
    const response = await createWorker({ fetch: upstream })(request('series', 'tmdb:1399', 'episode', '&season=0&episode=1'), env);
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.matchStatus).toBe('matched');
    expect(result.identity.stremioId).toBe('tmdb:1399');
    expect(result.season).toBe(0);
    expect(result.episode).toBe(1);
    expect(upstream.mock.calls[1][0]).toContain('/tv/1399/season/0/episode/1');
});

test('same numeric ID in movie and series uses separate endpoints and cache entries', async () => {
    const upstream = jest.fn(async (url) => json(url.endsWith('/translations') ? translations(603) : details(603, url.includes('/movie/') ? 'movie' : 'series')));
    const worker = createWorker({ fetch: upstream });
    for (const type of ['movie', 'series']) {
        const result = await (await worker(request(type, 'tmdb:603'), env)).json();
        expect(result.identity.stremioType).toBe(type);
    }
    expect(upstream).toHaveBeenCalledTimes(4);
});

test.each(['603', 'tmdb:0', 'tmdb:-1', 'tmdb:01', 'tmdb:1.5', 'tmdb:1e3', 'TMDB:603', 'tmdb:9007199254740992', 'tmdb:603/../1', 'tmdb:no-content', ' tmdb:603', 'tmdb:603:1:2'])('client and Worker both reject unsafe or ambiguous ID %s', async (id) => {
    expect(normalizeIdentity({ type: 'movie', id }).valid).toBe(false);
    expect(isSupportedMediaId(id)).toBe(false);
    const fetch = jest.fn();
    const response = await createWorker({ fetch })(request('movie', id), env);
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
});

test.each(['tmdb:1', 'tmdb:9007199254740991', 'tt0133093'])('validators agree on canonical supported ID %s', (id) => {
    expect(isSupportedMediaId(id)).toBe(true);
    expect(normalizeIdentity({ type: 'movie', id }).valid).toBe(true);
});

test.each([json({ id: 999, original_language: 'en' }), json({}, 404)])('missing or mismatched direct title does not create a false match', async (response) => {
    const fetch = jest.fn().mockResolvedValueOnce(response);
    const result = await (await createWorker({ fetch })(request('movie', 'tmdb:603'), env)).json();
    expect(result.matchStatus).toBe('unmatched');
    expect(result.identity.tmdbId).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('TMDB people use the typed title, preserve source ID, and reject the wrong credits identity', async () => {
    const payload = { id: 603, cast: [{ id: 1, name: 'Actor', profile_path: '/actor.jpg' }], crew: [] };
    const fetch = jest.fn().mockResolvedValueOnce(json(payload)).mockResolvedValueOnce(json({ ...payload, id: 999 }));
    const worker = createWorker({ fetch });
    const result = await (await worker(request('movie', 'tmdb:603', 'people'), env)).json();
    expect(result.identity.stremioId).toBe('tmdb:603');
    expect(result.people[0].image).toContain('/actor.jpg');
    expect(fetch.mock.calls[0][0]).toContain('/movie/603/credits');
    expect((await worker(request('series', 'tmdb:603', 'people'), env)).status).toBe(502);
});

test.each(['parent', 'episode'])('direct episode never accepts a mismatched %s', async (mismatch) => {
    const fetch = jest.fn().mockResolvedValueOnce(json(details(mismatch === 'parent' ? 999 : 1399, 'series')))
        .mockResolvedValueOnce(json({ id: 9001, season_number: 2, episode_number: 1 }));
    const result = await (await createWorker({ fetch })(request('series', 'tmdb:1399', 'episode', '&season=0&episode=1'), env)).json();
    expect(result.matchStatus).toBe('unmatched');
    expect(fetch).toHaveBeenCalledTimes(mismatch === 'parent' ? 1 : 2);
});
