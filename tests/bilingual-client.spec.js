// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.
/* global describe, expect, jest, test */

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const {
    createBilingualClient,
    CLOCK_SKEW_LIMIT,
    getBilingualOverviewEntries,
    getBilingualTitleText,
    getRequestUrl,
    MAX_CACHE_BYTES,
    MAX_TEXT_LENGTH,
    normalizeIdentity,
} = require('../src/common/bilingual/client');

jest.mock('../src/components/BilingualMetadata/styles.less', () => ({
    'bilingual-title': 'bilingual-title',
    compact: 'compact',
    'title-line': 'title-line',
    'title-line-missing': 'title-line-missing',
    'bilingual-overview': 'bilingual-overview',
    'overview-original': 'overview-original',
    'overview-label': 'overview-label',
    'overview-copy': 'overview-copy',
    'overview-entry': 'overview-entry',
    'overview-summary': 'overview-summary',
    'overview-missing': 'overview-missing',
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key, options) => options && options.defaultValue ? options.defaultValue : key,
    }),
}));

const { BilingualOverview, BilingualTitle } = require('../src/components/BilingualMetadata');

const TEST_NOW = Date.now();

const available = (locale, text) => ({
    text,
    requestedLocale: locale,
    effectiveLocale: locale,
    source: 'tmdb',
    status: 'available',
    evidence: 'translation-exact',
});

const missing = (locale) => ({
    text: null,
    requestedLocale: locale,
    effectiveLocale: null,
    source: null,
    status: 'missing',
    evidence: null,
});

const metadataFor = (identity, overrides = {}) => ({
    schemaVersion: 1,
    identity: {
        stremioType: identity.type,
        stremioId: identity.id,
        tmdbId: 123,
    },
    matchStatus: 'matched',
    title: {
        en: available('en-US', 'English title'),
        zh: available('zh-CN', '中文标题'),
    },
    overview: {
        en: available('en-US', 'English overview'),
        zh: available('zh-CN', '中文简介'),
    },
    fetchedAt: new Date(TEST_NOW).toISOString(),
    scope: identity.scope,
    ...overrides,
});

const response = (body, options = {}) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify(body),
    ...options,
});

const healthResponse = (overrides = {}, options = {}) => response({
    schemaVersion: 1,
    configured: true,
    enabled: true,
    ...overrides,
}, options);

const flush = () => new Promise((resolve) => setImmediate(resolve));

const createHookHarness = (client) => {
    const slots = [];
    const effectFunctions = [];
    const effectCleanups = new Map();
    let cursor = 0;
    let output = null;
    let hook;
    const settings = { enabled: true, titleOrder: 'en-first', overviewOrder: 'zh-first' };
    const reactMock = {
        useMemo: (factory) => {
            cursor += 1;
            return factory();
        },
        useRef: (initialValue) => {
            const index = cursor;
            cursor += 1;
            if (!slots[index]) {
                slots[index] = { current: initialValue };
            }

            return slots[index];
        },
        useState: (initialValue) => {
            const index = cursor;
            cursor += 1;
            if (!slots[index]) {
                slots[index] = { value: typeof initialValue === 'function' ? initialValue() : initialValue };
            }

            return [slots[index].value, (nextValue) => {
                slots[index].value = typeof nextValue === 'function' ? nextValue(slots[index].value) : nextValue;
            }];
        },
        useEffect: (effect) => {
            const index = cursor;
            cursor += 1;
            effectFunctions[index] = effect;
        },
        useCallback: (callback) => {
            cursor += 1;
            return callback;
        },
    };

    jest.isolateModules(() => {
        jest.doMock('react', () => reactMock);
        jest.doMock('../src/common/bilingual/settings', () => ({
            useBilingualSettings: () => ({ settings }),
        }));
        jest.doMock('../src/common/bilingual/client', () => {
            const actualClient = jest.requireActual('../src/common/bilingual/client');
            return { ...actualClient, getBilingualClient: () => client };
        });
        hook = require('../src/common/bilingual/useBilingualMetadata');
    });

    return {
        cleanupEffects: () => {
            effectCleanups.forEach((cleanup) => cleanup());
            effectCleanups.clear();
        },
        render: (identity, options) => {
            cursor = 0;
            output = hook(identity, options);
            return output;
        },
        runEffects: () => {
            Object.entries(effectFunctions).forEach(([index, effect]) => {
                const cleanup = effect();
                if (typeof cleanup === 'function') {
                    effectCleanups.set(index, cleanup);
                }
            });
        },
        getOutput: () => output,
    };
};

const createHookClient = () => {
    const subscriptions = [];
    let availability = 'available';
    return {
        subscriptions,
        getAvailability: () => availability,
        setAvailability: (nextAvailability) => {
            availability = nextAvailability;
        },
        subscribe: (identity, options) => {
            const subscription = {
                canceled: false,
                identity,
                onChange: options.onChange,
                started: false,
                start: () => {
                    subscription.started = true;
                },
                cancel: () => {
                    subscription.canceled = true;
                },
            };
            subscriptions.push(subscription);
            return subscription;
        },
    };
};

describe('bilingual client contract', () => {
    test('validates exact IMDb identities and preserves episode scope', () => {
        const episode = normalizeIdentity({
            type: 'series',
            id: 'tt1234567',
            scope: 'episode',
            season: 0,
            episode: 1,
        });

        expect(episode).toMatchObject({
            valid: true,
            type: 'series',
            id: 'tt1234567',
            scope: 'episode',
            season: 0,
            episode: 1,
        });
        expect(getRequestUrl(episode)).toBe('/api/bilingual/v1/episode?type=series&id=tt1234567&zh=zh-CN&season=0&episode=1');
        expect(normalizeIdentity({ type: 'movie', id: 'tt1234567', scope: 'episode', season: 1, episode: 1 }).valid).toBe(false);
        expect(normalizeIdentity({ type: 'series', id: 'tt1234567', scope: 'episode', season: -1, episode: 1 }).valid).toBe(false);
        expect(normalizeIdentity({ type: 'movie', id: 'tt123456' }).valid).toBe(false);
    });

    test('keeps English original-language titles truthful and does not promote Japanese originals', () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const englishOriginal = metadataFor(identity, {
            title: {
                en: {
                    text: 'English original title',
                    requestedLocale: 'en-US',
                    effectiveLocale: 'en',
                    source: 'tmdb',
                    status: 'available',
                    evidence: 'original-language',
                },
                zh: available('zh-CN', '中文标题'),
            },
        });
        const japaneseOriginal = metadataFor(identity, {
            title: {
                en: {
                    text: '日本語原題',
                    requestedLocale: 'en-US',
                    effectiveLocale: 'ja-JP',
                    source: 'tmdb',
                    status: 'available',
                    evidence: 'original-language',
                },
                zh: available('zh-CN', '中文标题'),
            },
        });
        const overviewWithoutEvidence = metadataFor(identity, {
            overview: {
                en: missing('en-US'),
                zh: available('zh-CN', '中文简介'),
            },
        });
        const client = createBilingualClient({ fetch: jest.fn() });

        expect(client.validateMetadata(englishOriginal, normalizeIdentity(identity))).toBe(true);
        expect(getBilingualTitleText(englishOriginal, '原始片名')).toBe('English original title / 中文标题');
        expect(client.validateMetadata(japaneseOriginal, normalizeIdentity(identity))).toBe(false);
        expect(getBilingualTitleText(japaneseOriginal, '原始片名')).toBe('English title unavailable / 中文标题 / 原始片名');
        expect(getBilingualOverviewEntries(overviewWithoutEvidence, 'Original overview')[0]).toMatchObject({
            language: 'zh',
            available: true,
        });
        expect(getBilingualOverviewEntries(overviewWithoutEvidence, 'Original overview')[1]).toMatchObject({
            language: 'en',
            available: false,
        });
        expect(getBilingualOverviewEntries(overviewWithoutEvidence, 'Original overview')[2]).toMatchObject({
            language: 'original',
            text: 'Original overview',
            available: true,
        });
    });

    test('requires a matched positive safe TMDB id and strictly empty fields for every non-matched result', () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const matchedWithoutId = metadataFor(identity, {
            identity: { stremioType: identity.type, stremioId: identity.id, tmdbId: null },
        });
        const unmatchedWithId = metadataFor(identity, {
            matchStatus: 'unmatched',
            identity: { stremioType: identity.type, stremioId: identity.id, tmdbId: 123 },
        });
        const unmatchedWithAvailableText = metadataFor(identity, {
            matchStatus: 'unmatched',
            identity: { stremioType: identity.type, stremioId: identity.id, tmdbId: null },
        });
        const unsafeId = metadataFor(identity, {
            identity: { stremioType: identity.type, stremioId: identity.id, tmdbId: Number.MAX_SAFE_INTEGER + 1 },
        });

        unmatchedWithAvailableText.title.en = available('en-US', 'must not display');

        const client = createBilingualClient({ fetch: jest.fn() });
        expect(client.validateMetadata(matchedWithoutId, normalizeIdentity(identity))).toBe(false);
        expect(client.validateMetadata(unmatchedWithId, normalizeIdentity(identity))).toBe(false);
        expect(client.validateMetadata(unmatchedWithAvailableText, normalizeIdentity(identity))).toBe(false);
        expect(client.validateMetadata(unsafeId, normalizeIdentity(identity))).toBe(false);
        expect(getBilingualTitleText(unmatchedWithAvailableText, 'Original title')).toBe('Original title');
        expect(getBilingualOverviewEntries(unmatchedWithAvailableText, 'Original overview')[0].language).toBe('original');
    });

    test('rejects successful non-JSON responses and does not cache ambiguous matches', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const ambiguous = metadataFor(identity, { matchStatus: 'ambiguous', identity: { stremioType: 'movie', stremioId: identity.id, tmdbId: null }, title: { en: missing('en-US'), zh: missing('zh-CN') }, overview: { en: missing('en-US'), zh: missing('zh-CN') } });
        const fetch = jest.fn()
            .mockResolvedValueOnce(response(metadataFor(identity), { headers: { get: () => 'text/plain' } }))
            .mockResolvedValueOnce(response(ambiguous))
            .mockResolvedValueOnce(response(metadataFor(identity)));
        const client = createBilingualClient({ fetch });
        expect((await client.request(identity)).status).toBe('error');
        expect((await client.request(identity)).metadata.matchStatus).toBe('ambiguous');
        expect((await client.request(identity)).metadata.matchStatus).toBe('matched');
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('does not request unsupported identities and merges concurrent requests into one task', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const payload = metadataFor(identity);
        let resolveResponse;
        const fetch = jest.fn(() => new Promise((resolve) => {
            resolveResponse = () => resolve(response(payload));
        }));
        const client = createBilingualClient({ fetch });

        const unsupported = await client.request({ type: 'movie', id: 'tt123' });
        expect(unsupported).toEqual({ metadata: null, status: 'unsupported' });
        expect(fetch).not.toHaveBeenCalled();
        const invalidEpisode = await client.request({ type: 'series', id: 'tt1234567', scope: 'episode', season: -1, episode: 1 });
        expect(invalidEpisode).toEqual({ metadata: null, status: 'unsupported' });
        expect(fetch).not.toHaveBeenCalled();

        const first = client.request(identity);
        const second = client.request({ ...identity });
        await flush();
        expect(fetch).toHaveBeenCalledTimes(1);
        resolveResponse();
        await expect(Promise.all([first, second])).resolves.toEqual([
            { metadata: payload, status: 'ready' },
            { metadata: payload, status: 'ready' },
        ]);

        await expect(client.request(identity)).resolves.toEqual({ metadata: payload, status: 'ready' });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    test('rejects Access HTML and malformed identity/scope responses without caching them', async () => {
        const identity = { type: 'series', id: 'tt1234567', scope: 'meta' };
        const malformed = metadataFor(identity, {
            identity: {
                stremioType: 'movie',
                stremioId: identity.id,
                tmdbId: 123,
            },
        });
        const accessFetch = jest.fn()
            .mockResolvedValueOnce(response('<html>Access login</html>', { headers: { get: () => 'text/html' }, text: async () => '<html>Access login</html>' }));
        const accessClient = createBilingualClient({ fetch: accessFetch });

        await expect(accessClient.request(identity)).resolves.toMatchObject({ status: 'access-expired', metadata: null });
        await expect(accessClient.request(identity)).resolves.toMatchObject({ status: 'access-expired', metadata: null });
        expect(accessFetch).toHaveBeenCalledTimes(1);

        const malformedFetch = jest.fn()
            .mockResolvedValueOnce(response(malformed))
            .mockResolvedValueOnce(response(metadataFor(identity, {
                identity: {
                    stremioType: identity.type,
                    stremioId: identity.id,
                    scope: 'episode',
                    tmdbId: 123,
                },
            })));
        const malformedClient = createBilingualClient({ fetch: malformedFetch });

        await expect(malformedClient.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        await expect(malformedClient.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        expect(malformedFetch).toHaveBeenCalledTimes(2);
    });

    test('uses manual same-origin metadata requests and maps opaque redirects to access-expired', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const opaqueRedirect = {
            ok: false,
            status: 0,
            type: 'opaqueredirect',
            redirected: false,
            headers: { get: () => null },
            text: jest.fn(),
        };
        const fetch = jest.fn().mockResolvedValue(opaqueRedirect);
        const client = createBilingualClient({ fetch });

        await expect(client.request(identity)).resolves.toMatchObject({ status: 'access-expired', metadata: null });
        expect(fetch.mock.calls[0][0]).toBe('/api/bilingual/v1/meta?type=movie&id=tt1234567&zh=zh-CN');
        expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({
            credentials: 'same-origin',
            redirect: 'manual',
        }));
        expect(opaqueRedirect.text).not.toHaveBeenCalled();
    });

    test('does not auto-health-check factory clients and validates a strict health response', async () => {
        const fetch = jest.fn().mockResolvedValue(healthResponse({ RELEASE_SHA: 'release-a' }));
        const client = createBilingualClient({ fetch });

        await flush();
        expect(fetch).not.toHaveBeenCalled();
        await expect(client.checkAvailability()).resolves.toEqual({
            status: 'available',
            configured: true,
            enabled: true,
            releaseSha: 'release-a',
        });
        expect(fetch).toHaveBeenCalledWith('/api/health', expect.objectContaining({
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'manual',
            headers: { Accept: 'application/json' },
        }));

        const contradictoryHealth = jest.fn().mockResolvedValue(response({
            schemaVersion: 1,
            configured: true,
            enabled: true,
            private: 'must be rejected',
        }));
        const contradictoryClient = createBilingualClient({ fetch: contradictoryHealth });
        await expect(contradictoryClient.checkAvailability()).resolves.toMatchObject({ status: 'unavailable' });
        expect(contradictoryClient.getAvailability()).toBe('unavailable');
    });

    test('expires an unmatched response after thirty minutes and does not cache timeout failures', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const unmatched = metadataFor(identity, {
            matchStatus: 'unmatched',
            identity: { stremioType: 'movie', stremioId: identity.id, tmdbId: null },
            title: { en: missing('en-US'), zh: missing('zh-CN') },
            overview: { en: missing('en-US'), zh: missing('zh-CN') },
            fetchedAt: new Date(0).toISOString(),
        });
        let now = 0;
        const fetch = jest.fn().mockResolvedValue(response(unmatched));
        const client = createBilingualClient({ fetch, clock: () => now });

        await client.request(identity);
        now = 30 * 60 * 1000 - 1;
        await client.request(identity);
        expect(fetch).toHaveBeenCalledTimes(1);
        now += 2;
        await client.request(identity);
        expect(fetch).toHaveBeenCalledTimes(2);

        const timeoutFetch = jest.fn(() => new Promise(() => undefined));
        const timeoutClient = createBilingualClient({ fetch: timeoutFetch, timeoutMs: 5 });
        await expect(timeoutClient.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        await expect(timeoutClient.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        expect(timeoutFetch).toHaveBeenCalledTimes(2);
    });

    test('anchors matched TTL to fetchedAt and refuses stale or future-skewed timestamps', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        let now = TEST_NOW;
        const nearExpiry = metadataFor(identity, {
            fetchedAt: new Date(now - (24 * 60 * 60 * 1000) + 1000).toISOString(),
        });
        const fetch = jest.fn().mockResolvedValue(response(nearExpiry));
        const client = createBilingualClient({ fetch, clock: () => now });

        await client.request(identity);
        now += 1001;
        await client.request(identity);
        expect(fetch).toHaveBeenCalledTimes(2);

        const oldIdentity = { type: 'movie', id: 'tt1234568', scope: 'meta' };
        const oldFetch = jest.fn().mockResolvedValue(response(metadataFor(oldIdentity, {
            fetchedAt: new Date(now - (24 * 60 * 60 * 1000) - 1).toISOString(),
        })));
        const oldClient = createBilingualClient({ fetch: oldFetch, clock: () => now });
        await oldClient.request(oldIdentity);
        await oldClient.request(oldIdentity);
        expect(oldFetch).toHaveBeenCalledTimes(2);

        const futureIdentity = { type: 'movie', id: 'tt1234569', scope: 'meta' };
        const futureFetch = jest.fn().mockResolvedValue(response(metadataFor(futureIdentity, {
            fetchedAt: new Date(now + CLOCK_SKEW_LIMIT + 1).toISOString(),
        })));
        const futureClient = createBilingualClient({ fetch: futureFetch, clock: () => now });
        await futureClient.request(futureIdentity);
        await futureClient.request(futureIdentity);
        expect(futureFetch).toHaveBeenCalledTimes(2);
    });

    test('keeps the normalized cache within the 512 KiB byte LRU budget', async () => {
        const largeText = 'x'.repeat(MAX_TEXT_LENGTH);
        const identities = Array.from({ length: 12 }, (_, index) => ({
            type: 'movie',
            id: `tt${String(1234567 + index).padStart(7, '0')}`,
            scope: 'meta',
        }));
        const fetch = jest.fn((url) => {
            const id = new URL(`https://example.test${url}`).searchParams.get('id');
            const identity = identities.find((candidate) => candidate.id === id);
            return Promise.resolve(response(metadataFor(identity, {
                title: {
                    en: available('en-US', largeText),
                    zh: available('zh-CN', '中文标题'),
                },
            })));
        });
        const client = createBilingualClient({ fetch, clock: () => TEST_NOW });

        for (const identity of identities) {
            await client.request(identity);
        }

        expect(client.getCacheBytes()).toBeLessThanOrEqual(MAX_CACHE_BYTES);
        expect(client.getCacheSize()).toBeLessThan(identities.length);
        await client.request(identities[0]);
        expect(fetch).toHaveBeenCalledTimes(identities.length + 1);
    });

    test('limits active tasks to four and starts the highest-priority queued task first', async () => {
        const identities = [
            'tt1234567',
            'tt1234568',
            'tt1234569',
            'tt1234570',
            'tt1234571',
            'tt1234572',
        ].map((id) => ({ type: 'movie', id, scope: 'meta' }));
        const pending = new Map();
        const fetch = jest.fn((url) => new Promise((resolve) => pending.set(url, resolve)));
        const client = createBilingualClient({ fetch });
        const requests = identities.slice(0, 4).map((identity) => client.request(identity, { priority: 1 }));

        await flush();
        expect(fetch).toHaveBeenCalledTimes(4);
        const queuedNormal = client.request(identities[4], { priority: 1 });
        const queuedUrgent = client.request(identities[5], { priority: 0 });
        expect(fetch).toHaveBeenCalledTimes(4);

        const firstUrl = getRequestUrl(normalizeIdentity(identities[0]));
        pending.get(firstUrl)(response(metadataFor(identities[0])));
        await flush();
        expect(fetch).toHaveBeenCalledTimes(5);
        expect(fetch.mock.calls[4][0]).toContain('id=tt1234572');

        pending.forEach((resolve, url) => {
            const id = new URL(`https://example.test${url}`).searchParams.get('id');
            const identity = identities.find((candidate) => candidate.id === id);
            if (identity && id !== identities[0].id) {
                resolve(response(metadataFor(identity)));
            }
        });
        await flush();
        const queuedNormalUrl = getRequestUrl(normalizeIdentity(identities[4]));
        pending.get(queuedNormalUrl)(response(metadataFor(identities[4])));
        await expect(Promise.all([...requests, queuedNormal, queuedUrgent])).resolves.toHaveLength(6);
    });
});

describe('bilingual availability gate', () => {
    test('installs one production monitor with focus, pageshow, visibility, and thirty-second polling triggers', async () => {
        const windowListeners = new Map();
        const documentListeners = new Map();
        const browserWindow = {
            addEventListener: jest.fn((event, listener) => windowListeners.set(event, listener)),
            removeEventListener: jest.fn((event) => windowListeners.delete(event)),
        };
        const browserDocument = {
            visibilityState: 'visible',
            addEventListener: jest.fn((event, listener) => documentListeners.set(event, listener)),
            removeEventListener: jest.fn((event) => documentListeners.delete(event)),
        };
        let intervalCallback;
        const setInterval = jest.fn((callback, milliseconds) => {
            intervalCallback = callback;
            expect(milliseconds).toBe(30 * 1000);
            return 1;
        });
        const clearInterval = jest.fn();
        const fetch = jest.fn().mockResolvedValue(healthResponse());
        const client = createBilingualClient({
            fetch,
            monitorAvailability: true,
            window: browserWindow,
            document: browserDocument,
            setInterval,
            clearInterval,
        });

        await client.startAvailabilityMonitoring();
        await client.startAvailabilityMonitoring();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(setInterval).toHaveBeenCalledTimes(1);
        expect(browserWindow.addEventListener).toHaveBeenCalledTimes(2);
        expect(browserDocument.addEventListener).toHaveBeenCalledTimes(1);

        windowListeners.get('focus')();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(2);

        browserDocument.visibilityState = 'hidden';
        documentListeners.get('visibilitychange')();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(2);

        browserDocument.visibilityState = 'visible';
        documentListeners.get('visibilitychange')();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(3);

        intervalCallback();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(4);
        client.stopAvailabilityMonitoring();
        expect(clearInterval).toHaveBeenCalledWith(1);
        expect(browserWindow.removeEventListener).toHaveBeenCalledTimes(2);
        expect(browserDocument.removeEventListener).toHaveBeenCalledTimes(1);
    });

    test('refreshes subscribed matched and unmatched results only after their own TTL', async () => {
        let now = TEST_NOW;
        const matchedIdentity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const matchedV1 = metadataFor(matchedIdentity);
        const matchedV2 = metadataFor(matchedIdentity, { fetchedAt: new Date(TEST_NOW + 1000).toISOString() });
        const matchedFetch = jest.fn()
            .mockResolvedValueOnce(response(matchedV1))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'matched-release' }))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'matched-release' }))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'matched-release' }))
            .mockResolvedValueOnce(response(matchedV2));
        const matchedClient = createBilingualClient({ fetch: matchedFetch, clock: () => now });
        const matchedChanges = [];
        const matchedSubscription = matchedClient.subscribe(matchedIdentity, { onChange: (result) => matchedChanges.push(result) });

        await flush();
        await flush();
        expect(matchedChanges.at(-1)).toMatchObject({ status: 'ready', metadata: matchedV1 });
        await matchedClient.checkAvailability();
        now = TEST_NOW + (24 * 60 * 60 * 1000) - 1;
        await matchedClient.checkAvailability();
        expect(matchedFetch).toHaveBeenCalledTimes(3);
        now += 1;
        await matchedClient.checkAvailability();
        await flush();
        await flush();
        expect(matchedFetch).toHaveBeenCalledTimes(5);
        expect(matchedChanges.at(-1)).toMatchObject({ status: 'ready', metadata: matchedV2 });
        matchedSubscription.cancel();

        now = TEST_NOW;
        const unmatchedIdentity = { type: 'movie', id: 'tt1234568', scope: 'meta' };
        const unmatchedV1 = metadataFor(unmatchedIdentity, {
            matchStatus: 'unmatched',
            identity: { stremioType: unmatchedIdentity.type, stremioId: unmatchedIdentity.id, tmdbId: null },
            title: { en: missing('en-US'), zh: missing('zh-CN') },
            overview: { en: missing('en-US'), zh: missing('zh-CN') },
        });
        const unmatchedV2 = { ...unmatchedV1, fetchedAt: new Date(TEST_NOW + 1000).toISOString() };
        const unmatchedFetch = jest.fn()
            .mockResolvedValueOnce(response(unmatchedV1))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'unmatched-release' }))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'unmatched-release' }))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'unmatched-release' }))
            .mockResolvedValueOnce(response(unmatchedV2));
        const unmatchedClient = createBilingualClient({ fetch: unmatchedFetch, clock: () => now });
        const unmatchedChanges = [];
        const unmatchedSubscription = unmatchedClient.subscribe(unmatchedIdentity, { onChange: (result) => unmatchedChanges.push(result) });

        await flush();
        await flush();
        expect(unmatchedChanges.at(-1)).toMatchObject({ status: 'ready', metadata: unmatchedV1 });
        await unmatchedClient.checkAvailability();
        now = TEST_NOW + (30 * 60 * 1000) - 1;
        await unmatchedClient.checkAvailability();
        expect(unmatchedFetch).toHaveBeenCalledTimes(3);
        now += 1;
        await unmatchedClient.checkAvailability();
        await flush();
        await flush();
        expect(unmatchedFetch).toHaveBeenCalledTimes(5);
        expect(unmatchedChanges.at(-1)).toMatchObject({ status: 'ready', metadata: unmatchedV2 });
        unmatchedSubscription.cancel();
    });

    test('converges multiple expired same-key subscriptions and a new request into one refresh', async () => {
        let now = TEST_NOW;
        const identity = { type: 'series', id: 'tt1234567', scope: 'meta' };
        const first = metadataFor(identity);
        const second = metadataFor(identity, { fetchedAt: new Date(TEST_NOW + 1000).toISOString() });
        let resolveRefresh;
        const fetch = jest.fn()
            .mockResolvedValueOnce(response(first))
            .mockImplementationOnce(() => new Promise((resolve) => {
                resolveRefresh = resolve;
            }));
        const client = createBilingualClient({ fetch, clock: () => now });
        const firstChanges = [];
        const secondChanges = [];
        const firstSubscription = client.subscribe(identity, { onChange: (result) => firstChanges.push(result) });
        const secondSubscription = client.subscribe(identity, { onChange: (result) => secondChanges.push(result) });

        await flush();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(firstChanges.at(-1)).toMatchObject({ status: 'ready', metadata: first });
        expect(secondChanges.at(-1)).toMatchObject({ status: 'ready', metadata: first });

        now = TEST_NOW + (24 * 60 * 60 * 1000);
        const refreshedRequest = client.request(identity);
        await flush();
        expect(fetch).toHaveBeenCalledTimes(2);
        resolveRefresh(response(second));
        await expect(refreshedRequest).resolves.toEqual({ metadata: second, status: 'ready' });
        await flush();
        expect(firstChanges.at(-1)).toMatchObject({ status: 'ready', metadata: second });
        expect(secondChanges.at(-1)).toMatchObject({ status: 'ready', metadata: second });
        firstSubscription.cancel();
        secondSubscription.cancel();
    });

    test('does not health-retry results without an actual cache expiry', async () => {
        const cases = [
            {
                id: 'tt1234567',
                response: response({ error: 'temporary' }, { status: 503 }),
            },
            {
                id: 'tt1234568',
                response: response(metadataFor({ type: 'movie', id: 'tt1234568', scope: 'meta' }, {
                    matchStatus: 'ambiguous',
                    identity: { stremioType: 'movie', stremioId: 'tt1234568', tmdbId: null },
                    title: { en: missing('en-US'), zh: missing('zh-CN') },
                    overview: { en: missing('en-US'), zh: missing('zh-CN') },
                })),
            },
            {
                id: 'tt1234569',
                response: response(metadataFor({ type: 'movie', id: 'tt1234569', scope: 'meta' }, {
                    fetchedAt: new Date(TEST_NOW + CLOCK_SKEW_LIMIT + 1).toISOString(),
                })),
            },
            {
                id: 'tt1234570',
                response: response(metadataFor({ type: 'movie', id: 'tt1234570', scope: 'meta' }, {
                    title: {
                        en: available('en-US', '中'.repeat(MAX_TEXT_LENGTH)),
                        zh: available('zh-CN', '中'.repeat(MAX_TEXT_LENGTH)),
                    },
                    overview: {
                        en: available('en-US', '中'.repeat(MAX_TEXT_LENGTH)),
                        zh: available('zh-CN', '中'.repeat(MAX_TEXT_LENGTH)),
                    },
                })),
            },
        ];

        for (const entry of cases) {
            const identity = { type: 'movie', id: entry.id, scope: 'meta' };
            const fetch = jest.fn()
                .mockResolvedValueOnce(entry.response)
                .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'stable-release' }))
                .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'stable-release' }))
                .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'stable-release' }));
            const client = createBilingualClient({ fetch, clock: () => TEST_NOW });
            const subscription = client.subscribe(identity);

            await flush();
            await flush();
            await client.checkAvailability();
            await client.checkAvailability();
            await client.checkAvailability();
            expect(fetch).toHaveBeenCalledTimes(4);
            subscription.cancel();
        }
    });

    test('revokes a cached ready result when health disables the server and refetches after recovery', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const payload = metadataFor(identity);
        const fetch = jest.fn()
            .mockResolvedValueOnce(response(payload))
            .mockResolvedValueOnce(healthResponse({ enabled: false }))
            .mockResolvedValueOnce(healthResponse())
            .mockResolvedValueOnce(response(payload));
        const client = createBilingualClient({ fetch, clock: () => TEST_NOW });
        const changes = [];
        const subscription = client.subscribe(identity, {
            autoStart: false,
            onChange: (result) => changes.push(result),
        });

        subscription.start();
        await flush();
        await flush();
        expect(changes.at(-1)).toMatchObject({ status: 'ready', metadata: payload });

        await client.checkAvailability();
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(changes.at(-1)).toMatchObject({ status: 'unavailable', metadata: null });
        expect(client.getAvailability()).toBe('disabled');

        await client.checkAvailability();
        await flush();
        await flush();
        expect(fetch).toHaveBeenCalledTimes(4);
        expect(changes.at(-1)).toMatchObject({ status: 'ready', metadata: payload });
        subscription.cancel();
    });

    test('clears ready results and refetches when RELEASE_SHA changes', async () => {
        const identity = { type: 'series', id: 'tt1234567', scope: 'meta' };
        const first = metadataFor(identity);
        const second = metadataFor(identity, { fetchedAt: new Date(TEST_NOW + 1000).toISOString() });
        const fetch = jest.fn()
            .mockResolvedValueOnce(response(first))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'release-a' }))
            .mockResolvedValueOnce(healthResponse({ RELEASE_SHA: 'release-b' }))
            .mockResolvedValueOnce(response(second));
        const client = createBilingualClient({ fetch, clock: () => TEST_NOW });
        const changes = [];
        const subscription = client.subscribe(identity, { onChange: (result) => changes.push(result) });

        await flush();
        await flush();
        expect(changes.at(-1)).toMatchObject({ status: 'ready', metadata: first });
        await client.checkAvailability();
        await client.checkAvailability();
        await flush();
        await flush();

        expect(changes.some((result) => result.metadata === null && result.status === 'unavailable')).toBe(true);
        expect(changes.at(-1)).toMatchObject({ status: 'ready', metadata: second });
        expect(fetch).toHaveBeenCalledTimes(4);
        subscription.cancel();
    });

    test('health failures revoke old data without long caching and recover through the same subscription', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const payload = metadataFor(identity);
        const fetch = jest.fn()
            .mockResolvedValueOnce(response(payload))
            .mockResolvedValueOnce(response({ error: 'temporary' }, { status: 503 }))
            .mockResolvedValueOnce(healthResponse())
            .mockResolvedValueOnce(response(payload));
        const client = createBilingualClient({ fetch, clock: () => TEST_NOW });
        const changes = [];
        const subscription = client.subscribe(identity, { onChange: (result) => changes.push(result) });

        await flush();
        await flush();
        await client.checkAvailability();
        expect(changes.at(-1)).toMatchObject({ status: 'unavailable', metadata: null });
        expect(client.getCacheSize()).toBe(0);
        await client.checkAvailability();
        await flush();
        await flush();
        expect(changes.at(-1)).toMatchObject({ status: 'ready', metadata: payload });
        expect(fetch).toHaveBeenCalledTimes(4);
        subscription.cancel();
    });
});

describe('bilingual presentation contract', () => {
    test('uses the same ordered full text for title lines and accessibility text', () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const metadata = metadataFor(identity);
        const title = ReactDOMServer.renderToStaticMarkup(React.createElement(BilingualTitle, {
            metadata,
            originalName: 'Original name',
        }));

        expect(getBilingualTitleText(metadata, 'Original name')).toBe('English title / 中文标题');
        expect(title).toContain('aria-label="English title / 中文标题"');
        expect(title.indexOf('English title')).toBeLessThan(title.indexOf('中文标题'));
        expect(title).not.toContain('Original name');
    });

    test('keeps an untranslated original visible and renders overview text as escaped details', () => {
        const originalDescription = '<script>should stay text</script>';
        const title = ReactDOMServer.renderToStaticMarkup(React.createElement(BilingualTitle, {
            metadata: null,
            originalName: 'Original name',
        }));
        const overview = ReactDOMServer.renderToStaticMarkup(React.createElement(BilingualOverview, {
            metadata: null,
            originalDescription,
        }));

        expect(title).toContain('Original name');
        expect(title).not.toContain('English');
        expect(overview).toContain('原始简介');
        expect(overview).toContain('&lt;script&gt;should stay text&lt;/script&gt;');
        expect(overview).not.toContain('<script>should stay text</script>');
    });
});

describe('bilingual metadata hook contract', () => {
    test('does not expose a previous identity result during a fast switch', () => {
        const client = createHookClient();
        const harness = createHookHarness(client);
        const firstIdentity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const secondIdentity = { type: 'movie', id: 'tt1234568', scope: 'meta' };
        const firstMetadata = { identity: { stremioId: firstIdentity.id } };
        const secondMetadata = { identity: { stremioId: secondIdentity.id } };

        harness.render(firstIdentity, { lazy: false });
        harness.runEffects();
        expect(client.subscriptions).toHaveLength(1);
        client.subscriptions[0].onChange({ metadata: firstMetadata, status: 'ready' });
        expect(harness.render(firstIdentity, { lazy: false })).toMatchObject({ metadata: firstMetadata, status: 'ready' });

        harness.cleanupEffects();
        const switched = harness.render(secondIdentity, { lazy: false });
        expect(switched).toMatchObject({ metadata: null, status: 'idle' });

        client.subscriptions[0].onChange({ metadata: firstMetadata, status: 'ready' });
        expect(harness.render(secondIdentity, { lazy: false })).toMatchObject({ metadata: null, status: 'idle' });

        harness.runEffects();
        expect(client.subscriptions).toHaveLength(2);
        client.subscriptions[1].onChange({ metadata: secondMetadata, status: 'ready' });
        expect(harness.render(secondIdentity, { lazy: false })).toMatchObject({ metadata: secondMetadata, status: 'ready' });
    });

    test('starts a lazy subscription when visibility arrives before the subscription effect', () => {
        const previousIntersectionObserver = global.IntersectionObserver;
        const observers = [];
        global.IntersectionObserver = class TestIntersectionObserver {
            constructor(callback) {
                this.callback = callback;
                this.disconnected = false;
                observers.push(this);
            }

            disconnect() {
                this.disconnected = true;
            }

            observe(node) {
                this.node = node;
            }
        };

        try {
            const client = createHookClient();
            const harness = createHookHarness(client);
            const identity = { type: 'series', id: 'tt1234567', scope: 'meta' };
            const output = harness.render(identity, { lazy: true });

            output.ref({ nodeName: 'DIV' });
            observers[0].callback([{ isIntersecting: true, intersectionRatio: 1 }]);
            expect(client.subscriptions).toHaveLength(0);

            harness.runEffects();
            expect(client.subscriptions).toHaveLength(1);
            expect(client.subscriptions[0].started).toBe(true);
        } finally {
            if (previousIntersectionObserver === undefined) {
                delete global.IntersectionObserver;
            } else {
                global.IntersectionObserver = previousIntersectionObserver;
            }
        }
    });

    test('hides a ready result while the client availability gate is closed', () => {
        const client = createHookClient();
        const harness = createHookHarness(client);
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const metadata = metadataFor(identity);

        harness.render(identity, { lazy: false });
        harness.runEffects();
        client.subscriptions[0].onChange({ metadata, status: 'ready' });
        expect(harness.render(identity, { lazy: false })).toMatchObject({ metadata, status: 'ready' });

        client.setAvailability('disabled');
        expect(harness.render(identity, { lazy: false })).toMatchObject({ metadata: null, status: 'unavailable' });
        client.subscriptions[0].onChange({ metadata: null, status: 'unavailable' });
        expect(harness.render(identity, { lazy: false })).toMatchObject({ metadata: null, status: 'unavailable' });

        client.setAvailability('available');
        client.subscriptions[0].onChange({ metadata, status: 'ready' });
        expect(harness.render(identity, { lazy: false })).toMatchObject({ metadata, status: 'ready' });
    });
});
