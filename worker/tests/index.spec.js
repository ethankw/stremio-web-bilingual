/* global describe, test, expect, jest */

const compiledWorkerPath = ['..', '..', '.worker-tests', 'index.js'].join('/');
const { createWorker } = require(compiledWorkerPath);

jest.setTimeout(2000);

const FIXED_NOW = Date.parse('2026-10-14T00:00:00.000Z');

const jsonResponse = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body), {
    status,
    headers: {
        'content-type': 'application/json; charset=utf-8',
        ...extraHeaders,
    },
});

const requestFor = (path, method = 'GET', headers = {}) => new Request(`https://bilingual.example.test${path}`, {
    method,
    headers,
});

const makeEnv = (overrides = {}) => ({
    BILINGUAL_METADATA_ENABLED: 'true',
    TMDB_READ_TOKEN: 'fake-token',
    ASSETS: {
        fetch: jest.fn(async () => new Response('asset', { status: 200 })),
    },
    ...overrides,
});

const sequenceFetch = (responses) => {
    const pending = [...responses];
    const calls = [];
    const fetch = jest.fn(async (...args) => {
        calls.push(args);
        const response = pending.shift();
        if (typeof response === 'function') {
            return response(...args);
        }
        if (response instanceof Error) {
            throw response;
        }
        return response;
    });
    return { fetch, calls };
};

const movieFind = (id = 603) => jsonResponse({
    movie_results: [{ id }],
    tv_results: [],
});

const tvFind = (id = 1399) => jsonResponse({
    movie_results: [],
    tv_results: [{ id }],
});

const movieDetails = (id = 603, originalLanguage = 'en', originalTitle = 'The Matrix') => jsonResponse({
    id,
    original_language: originalLanguage,
    original_title: originalTitle,
});

const movieTranslations = (overrides = {}) => jsonResponse({
    id: overrides.id ?? 603,
    translations: [
        {
            iso_639_1: 'en',
            iso_3166_1: 'US',
            data: {
                title: 'The Matrix',
                overview: 'An English overview.',
                ...overrides.en,
            },
        },
        {
            iso_639_1: 'zh',
            iso_3166_1: 'CN',
            data: {
                title: '黑客帝国',
                overview: '中文简介。',
                ...overrides.zh,
            },
        },
    ],
});

const episodeDetails = (season = 0, episode = 1) => jsonResponse({
    id: 9001,
    season_number: season,
    episode_number: episode,
    original_language: 'en',
    name: 'Special Episode',
});

const episodeTranslations = () => jsonResponse({
    id: 9001,
    translations: [
        {
            iso_639_1: 'en',
            iso_3166_1: 'US',
            data: {
                name: 'Special Episode',
                overview: 'Episode English overview.',
            },
        },
        {
            iso_639_1: 'zh',
            iso_3166_1: 'CN',
            data: {
                name: '特别篇',
                overview: '单集中文简介。',
            },
        },
    ],
});

const workerWith = (fetch, options = {}) => createWorker({
    fetch,
    clock: () => FIXED_NOW,
    ...options,
});

const bodyOf = async (response) => response.json();

describe('bilingual Worker routing and health', () => {
    test('health exposes only safe status and uses strict flag parsing', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const env = makeEnv({ RELEASE_SHA: 'abc123' });

        const response = await worker.fetch(requestFor('/api/health'), env);

        expect(response.status).toBe(200);
        expect(await bodyOf(response)).toEqual({
            schemaVersion: 1,
            configured: true,
            enabled: true,
            RELEASE_SHA: 'abc123',
        });
        expect(response.headers.get('cache-control')).toBe('private, no-store');
    });

    test('false-like flag values remain disabled and do not call TMDB', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const env = makeEnv({ BILINGUAL_METADATA_ENABLED: 'TRUE' });

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);

        expect(response.status).toBe(503);
        expect(await bodyOf(response)).toEqual({
            code: 'METADATA_DISABLED',
            message: 'Bilingual metadata is disabled.',
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    test('disabled service does not require a token or fetch upstream', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const env = makeEnv({
            BILINGUAL_METADATA_ENABLED: 'false',
            TMDB_READ_TOKEN: undefined,
        });

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);

        expect(response.status).toBe(503);
        expect((await bodyOf(response)).code).toBe('METADATA_DISABLED');
        expect(fetch).not.toHaveBeenCalled();
    });

    test('enabled service without a token returns a fixed 503 error', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const env = makeEnv({ TMDB_READ_TOKEN: '   ' });

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);

        expect(response.status).toBe(503);
        expect(await bodyOf(response)).toEqual({
            code: 'TMDB_NOT_CONFIGURED',
            message: 'TMDB is not configured.',
        });
        expect(fetch).not.toHaveBeenCalled();
    });

    test('unknown API routes and unsupported methods are JSON responses', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const env = makeEnv();

        const unknown = await worker.fetch(requestFor('/api/unknown'), env);
        const method = await worker.fetch(requestFor('/api/health', 'POST'), env);

        expect(unknown.status).toBe(404);
        expect(await bodyOf(unknown)).toEqual({ code: 'NOT_FOUND', message: 'Not found.' });
        expect(method.status).toBe(405);
        expect(await bodyOf(method)).toEqual({ code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' });
    });

    test('non-API requests pass the original request to ASSETS and missing assets remain 404', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const assetRequest = requestFor('/missing.js');
        const assetFetch = jest.fn(async (request) => {
            expect(request).toBe(assetRequest);
            return new Response(null, { status: 404 });
        });
        const env = makeEnv({ ASSETS: { fetch: assetFetch } });

        const response = await worker.fetch(assetRequest, env);

        expect(response.status).toBe(404);
        expect(assetFetch).toHaveBeenCalledTimes(1);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe('bilingual metadata matching and protocol', () => {
    test('matches a movie through movie_results, validates details, and reads exact translations', async () => {
        const upstream = sequenceFetch([
            movieFind(),
            movieDetails(),
            movieTranslations(),
        ]);
        const worker = workerWith(upstream.fetch);
        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN', 'GET', {
            Cookie: 'private-cookie',
            Authorization: 'private-client-token',
            'x-core-auth': 'private-core-token',
        }), makeEnv());
        const metadata = await bodyOf(response);

        expect(response.status).toBe(200);
        expect(metadata).toEqual({
            schemaVersion: 1,
            identity: {
                stremioType: 'movie',
                stremioId: 'tt0133093',
                tmdbId: 603,
            },
            matchStatus: 'matched',
            title: {
                en: {
                    text: 'The Matrix',
                    requestedLocale: 'en-US',
                    effectiveLocale: 'en-US',
                    source: 'tmdb',
                    status: 'available',
                    evidence: 'translation-exact',
                },
                zh: {
                    text: '黑客帝国',
                    requestedLocale: 'zh-CN',
                    effectiveLocale: 'zh-CN',
                    source: 'tmdb',
                    status: 'available',
                    evidence: 'translation-exact',
                },
            },
            overview: {
                en: expect.objectContaining({ text: 'An English overview.', evidence: 'translation-exact' }),
                zh: expect.objectContaining({ text: '中文简介。', evidence: 'translation-exact' }),
            },
            fetchedAt: '2026-10-14T00:00:00.000Z',
            scope: 'meta',
        });
        expect(upstream.calls).toHaveLength(3);
        expect(upstream.calls[0][0]).toBe('https://api.themoviedb.org/3/find/tt0133093?external_source=imdb_id');
        expect(upstream.calls[1][0]).toBe('https://api.themoviedb.org/3/movie/603');
        expect(upstream.calls[2][0]).toBe('https://api.themoviedb.org/3/movie/603/translations');
        for (const [, init] of upstream.calls) {
            expect(init).toEqual(expect.objectContaining({
                method: 'GET',
                redirect: 'manual',
                headers: {
                    Accept: 'application/json',
                    Authorization: 'Bearer fake-token',
                },
            }));
            expect(init.headers.Cookie).toBeUndefined();
            expect(init.headers['x-core-auth']).toBeUndefined();
        }
    });

    test('keeps movie and series matching isolated when find returns both types', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ movie_results: [{ id: 101 }], tv_results: [{ id: 202 }] }),
            movieDetails(101),
            movieTranslations({ id: 101 }),
        ]);
        const worker = workerWith(upstream.fetch);

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect((await bodyOf(response)).identity.tmdbId).toBe(101);
        expect(upstream.calls[1][0]).toBe('https://api.themoviedb.org/3/movie/101');
    });

    test('does not label a non-English original title as English', async () => {
        const upstream = sequenceFetch([
            movieFind(),
            movieDetails(603, 'ja', 'マトリックス'),
            jsonResponse({
                id: 603,
                translations: [{
                    iso_639_1: 'zh',
                    iso_3166_1: 'CN',
                    data: { title: '黑客帝国', overview: '中文简介。' },
                }],
            }),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv()));

        expect(metadata.title.en).toEqual({
            text: null,
            requestedLocale: 'en-US',
            effectiveLocale: null,
            source: null,
            status: 'missing',
            evidence: null,
        });
        expect(metadata.title.zh.text).toBe('黑客帝国');
        expect(metadata.overview.en.status).toBe('missing');
    });

    test('returns ambiguous without choosing the first candidate or fetching details', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ movie_results: [{ id: 1 }, { id: 2 }], tv_results: [] }),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv()));

        expect(metadata.matchStatus).toBe('ambiguous');
        expect(metadata.identity.tmdbId).toBeNull();
        expect(metadata.title.en.text).toBeNull();
        expect(upstream.fetch).toHaveBeenCalledTimes(1);
    });

    test('returns unmatched for zero valid candidates and caches only that result', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ movie_results: [{ id: '603' }], tv_results: [] }),
        ]);
        const worker = workerWith(upstream.fetch);
        const env = makeEnv();

        const first = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);
        const second = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);

        expect((await bodyOf(first)).matchStatus).toBe('unmatched');
        expect((await bodyOf(second)).matchStatus).toBe('unmatched');
        expect(upstream.fetch).toHaveBeenCalledTimes(1);
    });

    test('expires unmatched entries after thirty minutes', async () => {
        let now = FIXED_NOW;
        const upstream = sequenceFetch([
            jsonResponse({ movie_results: [], tv_results: [] }),
            jsonResponse({ movie_results: [], tv_results: [] }),
        ]);
        const worker = createWorker({ fetch: upstream.fetch, clock: () => now });
        const env = makeEnv();
        const path = '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN';

        await worker.fetch(requestFor(path), env);
        now += 30 * 60 * 1000 + 1;
        await worker.fetch(requestFor(path), env);

        expect(upstream.fetch).toHaveBeenCalledTimes(2);
    });

    test('keeps missing translation fields missing and uses English original only for a title', async () => {
        const upstream = sequenceFetch([
            movieFind(),
            movieDetails(),
            jsonResponse({ id: 603, translations: [{
                iso_639_1: 'en',
                iso_3166_1: 'US',
                data: { title: '', overview: '' },
            }] }),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv()));

        expect(metadata.matchStatus).toBe('matched');
        expect(metadata.title.en).toEqual(expect.objectContaining({
            text: 'The Matrix',
            effectiveLocale: 'en',
            evidence: 'original-language',
        }));
        expect(metadata.title.zh.status).toBe('missing');
        expect(metadata.overview.en.status).toBe('missing');
        expect(metadata.overview.zh.status).toBe('missing');
    });

    test('a matched item with empty translations keeps the matched identity and empty fields', async () => {
        const upstream = sequenceFetch([
            movieFind(),
            movieDetails(),
            jsonResponse({ id: 603, translations: [] }),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv()));

        expect(metadata.matchStatus).toBe('matched');
        expect(metadata.identity.tmdbId).toBe(603);
        expect(metadata.title.en.status).toBe('available');
        expect(metadata.title.en.evidence).toBe('original-language');
        expect(metadata.title.zh.status).toBe('missing');
    });
});

describe('episode matching, validation, and cache keys', () => {
    test.each(['movie', 'series', 'episode'])('rejects missing or mismatched translation IDs for %s without caching', async (kind) => {
        for (const id of [undefined, 99999]) {
            const episodeScope = kind === 'episode';
            const series = kind !== 'movie';
            const responses = () => [
                series ? tvFind() : movieFind(),
                episodeScope ? episodeDetails() : series ? jsonResponse({ id: 1399, original_language: 'en', original_name: 'Series' }) : movieDetails(),
                jsonResponse({ id, translations: [] }),
            ];
            const upstream = sequenceFetch([...responses(), ...responses()]);
            const worker = workerWith(upstream.fetch);
            const path = episodeScope ? '/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1' : `/api/bilingual/v1/meta?type=${kind}&id=tt0133093&zh=zh-CN`;
            expect((await worker.fetch(requestFor(path), makeEnv())).status).toBe(502);
            expect((await worker.fetch(requestFor(path), makeEnv())).status).toBe(502);
            expect(upstream.fetch).toHaveBeenCalledTimes(6);
        }
    });

    test('requires a positive episode detail ID before requesting translations', async () => {
        const upstream = sequenceFetch([tvFind(), jsonResponse({ season_number: 0, episode_number: 1 })]);
        const worker = workerWith(upstream.fetch);
        expect((await worker.fetch(requestFor('/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1'), makeEnv())).status).toBe(502);
        expect(upstream.fetch).toHaveBeenCalledTimes(2);
    });

    test('keeps a verified identity when translations are absent with HTTP 404', async () => {
        const upstream = sequenceFetch([movieFind(), movieDetails(), jsonResponse({}, 404)]);
        const worker = workerWith(upstream.fetch);
        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv()));
        expect(metadata.matchStatus).toBe('matched');
        expect(metadata.identity.tmdbId).toBe(603);
        expect(metadata.title.en.evidence).toBe('original-language');
        expect(metadata.title.zh.status).toBe('missing');
        expect(metadata.overview.en.status).toBe('missing');
    });

    test('matches season zero as an episode and never uses the series overview', async () => {
        const upstream = sequenceFetch([
            tvFind(1399),
            episodeDetails(0, 1),
            episodeTranslations(),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1'), makeEnv()));

        expect(metadata.scope).toBe('episode');
        expect(metadata.season).toBe(0);
        expect(metadata.episode).toBe(1);
        expect(metadata.identity.tmdbId).toBe(1399);
        expect(metadata.overview.en.text).toBe('Episode English overview.');
        expect(metadata.overview.en.text).not.toBe('A series overview.');
        expect(upstream.calls[1][0]).toBe('https://api.themoviedb.org/3/tv/1399/season/0/episode/1');
        expect(upstream.calls[2][0]).toBe('https://api.themoviedb.org/3/tv/1399/season/0/episode/1/translations');
    });

    test('returns unmatched when the episode response numbering does not match', async () => {
        const upstream = sequenceFetch([
            tvFind(),
            episodeDetails(1, 1),
        ]);
        const worker = workerWith(upstream.fetch);

        const metadata = await bodyOf(await worker.fetch(requestFor('/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1'), makeEnv()));

        expect(metadata.matchStatus).toBe('unmatched');
        expect(metadata.identity.tmdbId).toBeNull();
        expect(upstream.fetch).toHaveBeenCalledTimes(2);
    });

    test('keeps episode and meta cache entries separate', async () => {
        const upstream = sequenceFetch([
            movieFind(),
            movieDetails(),
            movieTranslations(),
            tvFind(),
            episodeDetails(0, 1),
            episodeTranslations(),
        ]);
        const worker = workerWith(upstream.fetch);
        const env = makeEnv();

        await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);
        await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), env);
        await worker.fetch(requestFor('/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1'), env);
        await worker.fetch(requestFor('/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&episode=1'), env);

        expect(upstream.fetch).toHaveBeenCalledTimes(6);
    });
});

describe('input and upstream safety', () => {
    test.each([
        '/api/bilingual/v1/meta?type=movie&type=series&id=tt0133093&zh=zh-CN',
        '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN&url=https%3A%2F%2Fevil.test',
        '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN&host=evil.test',
        '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN&season=0',
        '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN&zh=zh-CN',
        '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-TW',
        '/api/bilingual/v1/meta?type=movie&id=tt123&zh=zh-CN',
        '/api/bilingual/v1/episode?type=movie&id=tt0133093&zh=zh-CN&season=0&episode=1',
        '/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=-1&episode=1',
        '/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=2026&episode=0',
        '/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=0&season=0&episode=1',
        `/api/bilingual/v1/episode?type=series&id=tt0944947&zh=zh-CN&season=${'9'.repeat(17)}&episode=1`,
    ])('rejects strict invalid query %s', async (path) => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);

        const response = await worker.fetch(requestFor(path), makeEnv());

        expect(response.status).toBe(400);
        expect(await bodyOf(response)).toEqual({ code: 'INVALID_REQUEST', message: 'Invalid request.' });
        expect(fetch).not.toHaveBeenCalled();
    });

    test('rejects query values that are too long before checking configuration', async () => {
        const { fetch } = sequenceFetch([]);
        const worker = workerWith(fetch);
        const longId = `tt${'1'.repeat(31)}`;

        const response = await worker.fetch(requestFor(`/api/bilingual/v1/meta?type=movie&id=${longId}&zh=zh-CN`), makeEnv({ BILINGUAL_METADATA_ENABLED: 'false' }));

        expect(response.status).toBe(400);
        expect(fetch).not.toHaveBeenCalled();
    });

    test('does not retry 429 and normalizes Retry-After', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ message: 'fake-token should not leak' }, 429, { 'retry-after': '999999' }),
        ]);
        const worker = workerWith(upstream.fetch);

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect(response.status).toBe(429);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await bodyOf(response)).toEqual({
            code: 'TMDB_RATE_LIMITED',
            message: 'TMDB rate limit reached.',
        });
        expect(upstream.fetch).toHaveBeenCalledTimes(1);
    });

    test('enforces the one MiB limit while accumulating a streamed body', async () => {
        const oversizedBody = new Uint8Array(1024 * 1024 + 1);
        const oversizedResponse = new Response(new ReadableStream({
            start(controller) {
                controller.enqueue(oversizedBody);
                controller.close();
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
        const upstream = sequenceFetch([oversizedResponse]);
        const worker = workerWith(upstream.fetch);

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect(response.status).toBe(502);
        expect(await bodyOf(response)).toEqual({ code: 'TMDB_BAD_RESPONSE', message: 'TMDB returned an invalid response.' });
    });

    test('retries one 5xx response within the request budget', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ error: 'temporary' }, 503),
            movieFind(),
            movieDetails(),
            movieTranslations(),
        ]);
        const worker = workerWith(upstream.fetch, { requestBudgetMs: 500 });

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect(response.status).toBe(200);
        expect((await bodyOf(response)).matchStatus).toBe('matched');
        expect(upstream.fetch).toHaveBeenCalledTimes(4);
    });

    test('does not cache a failed 5xx result', async () => {
        const upstream = sequenceFetch([
            jsonResponse({ error: 'temporary' }, 500),
            jsonResponse({ error: 'still temporary' }, 500),
            jsonResponse({ error: 'temporary again' }, 500),
            jsonResponse({ error: 'still temporary again' }, 500),
        ]);
        const worker = workerWith(upstream.fetch, {
            requestBudgetMs: 500,
            sleep: async () => undefined,
        });
        const env = makeEnv();
        const path = '/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN';

        expect((await worker.fetch(requestFor(path), env)).status).toBe(502);
        expect((await worker.fetch(requestFor(path), env)).status).toBe(502);
        expect(upstream.fetch).toHaveBeenCalledTimes(4);
    });

    test('maps timeout to 504, aborts the upstream signal, and exposes no secret', async () => {
        let receivedSignal;
        const upstreamFetch = jest.fn(async (_url, init) => {
            receivedSignal = init.signal;
            return new Promise(() => undefined);
        });
        const worker = workerWith(upstreamFetch, { requestBudgetMs: 15 });

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect(response.status).toBe(504);
        expect(await bodyOf(response)).toEqual({
            code: 'TMDB_TIMEOUT',
            message: 'TMDB request timed out.',
        });
        expect(receivedSignal.aborted).toBe(true);
    });

    test('maps network exceptions without exposing their message or token', async () => {
        const upstream = sequenceFetch([new Error('fake-token and private headers')]);
        const worker = workerWith(upstream.fetch);

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());
        const text = await response.text();

        expect(response.status).toBe(502);
        expect(text).toBe(JSON.stringify({ code: 'TMDB_BAD_RESPONSE', message: 'TMDB returned an invalid response.' }));
        expect(text).not.toContain('fake-token');
    });

    test.each([
        () => ({ redirected: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: null }),
        () => ({ url: 'https://evil.example.test/redirect', status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: null }),
        () => new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
        () => new Response(JSON.stringify({ movie_results: [] }), { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(1024 * 1024 + 1) } }),
    ])('rejects unsafe, non-JSON, redirected, or oversized upstream responses', async (makeResponse) => {
        const upstream = sequenceFetch([makeResponse()]);
        const worker = workerWith(upstream.fetch);

        const response = await worker.fetch(requestFor('/api/bilingual/v1/meta?type=movie&id=tt0133093&zh=zh-CN'), makeEnv());

        expect(response.status).toBe(502);
        expect(await bodyOf(response)).toEqual({ code: 'TMDB_BAD_RESPONSE', message: 'TMDB returned an invalid response.' });
    });
});
