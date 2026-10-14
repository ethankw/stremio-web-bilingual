// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.
/* global describe, expect, jest, test */

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const {
    createBilingualClient,
    getBilingualOverviewEntries,
    getBilingualTitleText,
    getRequestUrl,
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
    fetchedAt: '2026-10-14T00:00:00.000Z',
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
    return {
        subscriptions,
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
        expect(getBilingualTitleText(japaneseOriginal, '原始片名')).toBe('English title unavailable / 中文标题');
        expect(getBilingualOverviewEntries(overviewWithoutEvidence, 'Original overview')[0]).toMatchObject({
            language: 'zh',
            available: true,
        });
        expect(getBilingualOverviewEntries(overviewWithoutEvidence, 'Original overview')[1]).toMatchObject({
            language: 'en',
            available: false,
        });
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
        const fetch = jest.fn()
            .mockResolvedValueOnce(response('<html>Access login</html>', { headers: { get: () => 'text/html' }, text: async () => '<html>Access login</html>' }))
            .mockResolvedValueOnce(response(malformed))
            .mockResolvedValueOnce(response(metadataFor(identity, {
                identity: {
                    stremioType: identity.type,
                    stremioId: identity.id,
                    scope: 'episode',
                    tmdbId: 123,
                },
            })));
        const client = createBilingualClient({ fetch });

        await expect(client.request(identity)).resolves.toMatchObject({ status: 'access-expired', metadata: null });
        await expect(client.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        await expect(client.request(identity)).resolves.toMatchObject({ status: 'error', metadata: null });
        expect(fetch).toHaveBeenCalledTimes(3);
    });

    test('expires an unmatched response after thirty minutes and does not cache timeout failures', async () => {
        const identity = { type: 'movie', id: 'tt1234567', scope: 'meta' };
        const unmatched = metadataFor(identity, {
            matchStatus: 'unmatched',
            identity: { stremioType: 'movie', stremioId: identity.id, tmdbId: null },
            title: { en: missing('en-US'), zh: missing('zh-CN') },
            overview: { en: missing('en-US'), zh: missing('zh-CN') },
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
});
