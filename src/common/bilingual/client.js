// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const DEFAULT_LOCALE = 'zh-CN';
const ENGLISH_LOCALE = 'en-US';
const CACHE_SCHEMA_VERSION = 1;
const MATCH_ALGORITHM_VERSION = 'imdb-exact-v1';
const SUCCESS_TTL = 24 * 60 * 60 * 1000;
const UNMATCHED_TTL = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 512;
const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_TIMEOUT = 10 * 1000;
const SUPPORTED_TYPES = new Set(['movie', 'series']);
const SUPPORTED_SCOPES = new Set(['meta', 'episode']);
const SUPPORTED_MATCH_STATUSES = new Set(['matched', 'unmatched', 'ambiguous', 'unsupported']);
const SUPPORTED_EVIDENCE = new Set(['translation-exact', 'original-language']);

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const createError = (code) => {
    const error = new Error(code);
    error.code = code;
    return error;
};

const getClockValue = (clock) => {
    const value = clock();
    return value instanceof Date ? value.getTime() : Number(value);
};

const normalizeIdentity = (identity) => {
    if (!isRecord(identity)) {
        return { valid: false, reason: 'identity' };
    }

    if ((identity.type !== undefined && typeof identity.type !== 'string') || (identity.stremioType !== undefined && typeof identity.stremioType !== 'string') || (identity.id !== undefined && typeof identity.id !== 'string') || (identity.stremioId !== undefined && typeof identity.stremioId !== 'string') || (identity.type !== undefined && identity.stremioType !== undefined && identity.type !== identity.stremioType) || (identity.id !== undefined && identity.stremioId !== undefined && identity.id !== identity.stremioId)) {
        return { valid: false, reason: 'identity' };
    }

    const type = identity.type === undefined ? identity.stremioType : identity.type;
    const id = identity.id === undefined ? identity.stremioId : identity.id;
    const scope = identity.scope === undefined ?
        (identity.season !== undefined || identity.episode !== undefined ? 'episode' : 'meta')
        :
        identity.scope;

    if (!SUPPORTED_TYPES.has(type) || typeof id !== 'string' || !/^tt\d{7,10}$/.test(id) || !SUPPORTED_SCOPES.has(scope)) {
        return { valid: false, reason: 'identity' };
    }

    if (scope === 'meta') {
        if (identity.season !== undefined || identity.episode !== undefined) {
            return { valid: false, reason: 'scope' };
        }

        return {
            valid: true,
            type,
            id,
            scope,
            season: undefined,
            episode: undefined,
        };
    }

    if (type !== 'series' || !Number.isInteger(identity.season) || identity.season < 0 || !Number.isInteger(identity.episode) || identity.episode < 1) {
        return { valid: false, reason: 'episode' };
    }

    return {
        valid: true,
        type,
        id,
        scope,
        season: identity.season,
        episode: identity.episode,
    };
};

const getRequestKey = (identity) => {
    return [
        CACHE_SCHEMA_VERSION,
        MATCH_ALGORITHM_VERSION,
        identity.type,
        identity.id,
        DEFAULT_LOCALE,
        identity.scope,
        identity.season === undefined ? '' : identity.season,
        identity.episode === undefined ? '' : identity.episode,
    ].join('|');
};

const getRequestUrl = (identity) => {
    const params = new URLSearchParams({
        type: identity.type,
        id: identity.id,
        zh: DEFAULT_LOCALE,
    });

    if (identity.scope === 'episode') {
        params.set('season', String(identity.season));
        params.set('episode', String(identity.episode));
    }

    return `/api/bilingual/v1/${identity.scope === 'episode' ? 'episode' : 'meta'}?${params.toString()}`;
};

const isUsableLocalizedText = (value, expectedLocale, options = {}) => {
    if (!isRecord(value) || value.requestedLocale !== expectedLocale) {
        return false;
    }

    if (value.status !== 'available') {
        return false;
    }

    if (typeof value.text !== 'string' || value.text.trim().length === 0 || value.source !== 'tmdb' || !SUPPORTED_EVIDENCE.has(value.evidence)) {
        return false;
    }

    if (value.evidence === 'translation-exact') {
        return value.effectiveLocale === expectedLocale;
    }

    return options.allowEnglishOriginal === true && expectedLocale === ENGLISH_LOCALE && value.effectiveLocale === 'en';
};

const validateLocalizedText = (value, expectedLocale, options = {}) => {
    if (!isRecord(value) || value.requestedLocale !== expectedLocale) {
        return false;
    }

    if (value.status === 'available') {
        return isUsableLocalizedText(value, expectedLocale, options);
    }

    return value.status === 'missing' && value.text === null && (value.effectiveLocale === null || typeof value.effectiveLocale === 'string') && (value.source === null || value.source === 'tmdb') && value.evidence === null;
};

const validateMetadata = (metadata, identity) => {
    if (!isRecord(metadata) || metadata.schemaVersion !== 1 || !isRecord(metadata.identity) || metadata.identity.stremioType !== identity.type || metadata.identity.stremioId !== identity.id || (metadata.identity.scope !== undefined && metadata.identity.scope !== identity.scope) || !(metadata.identity.tmdbId === null || (typeof metadata.identity.tmdbId === 'number' && Number.isInteger(metadata.identity.tmdbId) && metadata.identity.tmdbId > 0)) || !SUPPORTED_MATCH_STATUSES.has(metadata.matchStatus) || !isRecord(metadata.title) || !isRecord(metadata.overview) || !validateLocalizedText(metadata.title.en, ENGLISH_LOCALE, { allowEnglishOriginal: true }) || !validateLocalizedText(metadata.title.zh, DEFAULT_LOCALE) || !validateLocalizedText(metadata.overview.en, ENGLISH_LOCALE) || !validateLocalizedText(metadata.overview.zh, DEFAULT_LOCALE) || typeof metadata.fetchedAt !== 'string' || !Number.isFinite(Date.parse(metadata.fetchedAt)) || metadata.scope !== identity.scope) {
        return false;
    }

    if (identity.scope === 'episode') {
        return metadata.season === identity.season && metadata.episode === identity.episode;
    }

    return !hasOwn(metadata, 'season') && !hasOwn(metadata, 'episode');
};

const readResponseBody = async (response) => {
    if (typeof response.text === 'function') {
        const text = await response.text();
        if (typeof text !== 'string') {
            return text;
        }

        if (/^\s*<(?:!doctype\s+html|html\b)/i.test(text)) {
            throw createError('access-expired');
        }

        try {
            return JSON.parse(text);
        } catch {
            throw createError('invalid-response');
        }
    }

    if (typeof response.json === 'function') {
        try {
            return await response.json();
        } catch {
            throw createError('invalid-response');
        }
    }

    throw createError('invalid-response');
};

const readHeader = (response, name) => {
    return response.headers && typeof response.headers.get === 'function' ? response.headers.get(name) : null;
};

const isAccessUrl = (url) => typeof url === 'string' && /(?:^|[/?#])(access|login|authorize)(?:[/?#]|$)/i.test(url);

const parseResponse = async (response, identity) => {
    if (!isRecord(response)) {
        throw createError('invalid-response');
    }

    const contentType = readHeader(response, 'content-type');
    if (response.redirected === true || response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 || (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) || isAccessUrl(response.url)) {
        throw createError('access-expired');
    }

    if (response.status === 429 || response.status >= 500) {
        throw createError(`http-${response.status}`);
    }

    const isOk = response.ok === undefined ? response.status >= 200 && response.status < 300 : response.ok;
    if (!isOk) {
        throw createError(`http-${response.status}`);
    }

    const body = await readResponseBody(response);
    if (!validateMetadata(body, identity)) {
        throw createError('invalid-response');
    }

    return body;
};

const DEFAULT_TITLE_LABELS = Object.freeze({
    originalMissing: 'Untitled',
    englishMissing: 'English title unavailable',
    chineseMissing: '中文标题暂缺',
});

const DEFAULT_OVERVIEW_LABELS = Object.freeze({
    original: '原始简介',
    english: 'English overview',
    chinese: '中文简介',
    englishMissing: 'English overview unavailable',
    chineseMissing: '中文简介暂缺',
    empty: '暂无简介',
});

const getLabel = (labels, key, defaults) => typeof labels?.[key] === 'string' ? labels[key] : defaults[key];

const getBilingualTitleLines = (metadata, originalName, order = 'en-first', labels = DEFAULT_TITLE_LABELS) => {
    const safeOriginalName = typeof originalName === 'string' && originalName.length > 0 ? originalName : getLabel(labels, 'originalMissing', DEFAULT_TITLE_LABELS);
    const enText = isUsableLocalizedText(metadata?.title?.en, ENGLISH_LOCALE, { allowEnglishOriginal: true }) ? metadata.title.en.text : null;
    const zhText = isUsableLocalizedText(metadata?.title?.zh, DEFAULT_LOCALE) ? metadata.title.zh.text : null;

    if (enText === null && zhText === null) {
        return [{ language: 'original', text: safeOriginalName }];
    }

    if (enText !== null && zhText !== null && enText === zhText) {
        return [{ language: 'shared', text: enText }];
    }

    const locales = order === 'zh-first' ? ['zh', 'en'] : ['en', 'zh'];
    return locales.map((locale) => ({
        language: locale,
        text: locale === 'en' ? enText || getLabel(labels, 'englishMissing', DEFAULT_TITLE_LABELS) : zhText || getLabel(labels, 'chineseMissing', DEFAULT_TITLE_LABELS),
        missing: locale === 'en' ? enText === null : zhText === null,
    }));
};

const getBilingualTitleText = (metadata, originalName, order = 'en-first', labels = DEFAULT_TITLE_LABELS) => {
    return getBilingualTitleLines(metadata, originalName, order, labels).map(({ text }) => text).join(' / ');
};

const getBilingualOverviewEntries = (metadata, originalDescription, order = 'zh-first', labels = DEFAULT_OVERVIEW_LABELS) => {
    const safeOriginalDescription = typeof originalDescription === 'string' ? originalDescription : '';
    const enText = isUsableLocalizedText(metadata?.overview?.en, ENGLISH_LOCALE) ? metadata.overview.en.text : null;
    const zhText = isUsableLocalizedText(metadata?.overview?.zh, DEFAULT_LOCALE) ? metadata.overview.zh.text : null;

    if (enText === null && zhText === null) {
        return [{ language: 'original', label: getLabel(labels, 'original', DEFAULT_OVERVIEW_LABELS), text: safeOriginalDescription || getLabel(labels, 'empty', DEFAULT_OVERVIEW_LABELS), available: safeOriginalDescription.length > 0 }];
    }

    const locales = order === 'en-first' ? ['en', 'zh'] : ['zh', 'en'];
    return locales.map((locale) => {
        const text = locale === 'en' ? enText : zhText;
        return {
            language: locale,
            label: locale === 'en' ? getLabel(labels, 'english', DEFAULT_OVERVIEW_LABELS) : getLabel(labels, 'chinese', DEFAULT_OVERVIEW_LABELS),
            text: text || (locale === 'en' ? getLabel(labels, 'englishMissing', DEFAULT_OVERVIEW_LABELS) : getLabel(labels, 'chineseMissing', DEFAULT_OVERVIEW_LABELS)),
            available: text !== null,
        };
    });
};

const createBilingualClient = (dependencies = {}) => {
    const clock = typeof dependencies.clock === 'function' ? dependencies.clock : typeof dependencies.now === 'function' ? dependencies.now : () => Date.now();
    const fetchImpl = typeof dependencies.fetch === 'function' ? dependencies.fetch : (...args) => {
        if (typeof globalThis.fetch !== 'function') {
            return Promise.reject(createError('fetch-unavailable'));
        }

        return globalThis.fetch(...args);
    };
    const setTimer = typeof dependencies.setTimeout === 'function' ? dependencies.setTimeout : setTimeout;
    const clearTimer = typeof dependencies.clearTimeout === 'function' ? dependencies.clearTimeout : clearTimeout;
    const AbortControllerImpl = dependencies.AbortController || globalThis.AbortController;
    const timeout = Number.isFinite(dependencies.timeoutMs) ? dependencies.timeoutMs : REQUEST_TIMEOUT;
    const cache = new Map();
    const tasks = new Map();
    const subscriptions = new Set();
    const queue = [];
    let activeCount = 0;
    let sequence = 0;
    let stopped = false;

    const safeNow = () => {
        const value = getClockValue(clock);
        return Number.isFinite(value) ? value : Date.now();
    };

    const readCache = (key) => {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= safeNow()) {
            cache.delete(key);
            return null;
        }

        cache.delete(key);
        cache.set(key, entry);
        return entry.metadata;
    };

    const writeCache = (key, metadata) => {
        if (metadata.matchStatus === 'unsupported') {
            return;
        }

        const ttl = metadata.matchStatus === 'unmatched' ? UNMATCHED_TTL : SUCCESS_TTL;
        cache.delete(key);
        cache.set(key, {
            metadata,
            expiresAt: safeNow() + ttl,
        });

        while (cache.size > MAX_CACHE_ENTRIES) {
            cache.delete(cache.keys().next().value);
        }
    };

    const notify = (subscription, result) => {
        if (!subscription.active) {
            return;
        }

        try {
            subscription.onChange(result);
        } catch {
            // A subscriber must not break the shared queue.
        }
    };

    const removeFromQueue = (task) => {
        const index = queue.indexOf(task);
        if (index >= 0) {
            queue.splice(index, 1);
        }
    };

    const detachTask = (task) => {
        tasks.delete(task.key);
        task.listeners.forEach((subscription) => {
            if (subscription.task === task) {
                subscription.task = null;
            }
        });
        task.listeners.clear();
    };

    const sortQueue = () => {
        queue.sort((first, second) => first.priority - second.priority || first.sequence - second.sequence);
    };

    const enqueue = (task) => {
        if (task.state !== 'queued') {
            task.state = 'queued';
        }

        if (!queue.includes(task)) {
            queue.push(task);
        }

        sortQueue();
        pump();
    };

    const executeFetch = async (identity, onController) => {
        const controller = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
        onController(controller);
        let timeoutId = null;
        let timedOut = false;
        const fetchOptions = {
            method: 'GET',
            headers: { Accept: 'application/json' },
            redirect: 'error',
        };

        if (controller) {
            fetchOptions.signal = controller.signal;
        }

        const fetchPromise = Promise.resolve()
            .then(() => fetchImpl(getRequestUrl(identity), fetchOptions))
            .then((response) => parseResponse(response, identity));
        const timeoutPromise = new Promise((resolve, reject) => {
            timeoutId = setTimer(() => {
                timedOut = true;
                if (controller) {
                    controller.abort();
                }
                reject(createError('timeout'));
            }, timeout);
        });

        try {
            return await Promise.race([fetchPromise, timeoutPromise]);
        } catch (error) {
            if (timedOut) {
                throw createError('timeout');
            }

            throw error;
        } finally {
            if (timeoutId !== null) {
                clearTimer(timeoutId);
            }
            onController(null);
        }
    };

    const toResult = (metadata) => ({ metadata, status: 'ready' });

    const errorResult = (error) => ({
        metadata: null,
        status: error && (error.code === 'access-expired' || (typeof error.message === 'string' && /(?:redirect|opaqueredirect|access|login|html)/i.test(error.message))) ? 'access-expired' : 'error',
        error: error && typeof error.code === 'string' ? error.code : 'request-failed',
    });

    const runTask = async (task) => {
        let result;

        try {
            const metadata = await executeFetch(task.identity, (controller) => {
                task.controller = controller;
            });
            if (stopped) {
                result = errorResult(createError('disabled'));
            } else {
                writeCache(task.key, metadata);
                result = toResult(metadata);
            }
        } catch (error) {
            result = errorResult(error);
        }

        task.controller = null;

        if (task.refreshAfterFinish && !stopped && task.listeners.size > 0) {
            task.refreshAfterFinish = false;
            enqueue(task);
            return;
        }

        task.resolve(result);
        Array.from(task.listeners).forEach((subscription) => notify(subscription, result));
        detachTask(task);
    };

    const pump = () => {
        while (!stopped && activeCount < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
            const task = queue.shift();
            if (!task || task.state !== 'queued' || task.listeners.size === 0) {
                continue;
            }

            task.state = 'active';
            activeCount += 1;
            runTask(task).then(() => {
                activeCount -= 1;
                pump();
            }, (error) => {
                activeCount -= 1;
                const result = errorResult(error);
                task.resolve(result);
                Array.from(task.listeners).forEach((subscription) => notify(subscription, result));
                detachTask(task);
                pump();
            });
        }
    };

    const createTask = (identity, key, priority) => {
        let resolve;
        const task = {
            key,
            identity,
            priority,
            sequence: sequence++,
            state: 'queued',
            listeners: new Set(),
            controller: null,
            refreshAfterFinish: false,
            promise: new Promise((promiseResolve) => {
                resolve = promiseResolve;
            }),
            resolve: (result) => resolve(result),
        };
        tasks.set(key, task);
        return task;
    };

    const startSubscription = (subscription, force = false) => {
        if (!subscription.active || !subscription.identity.valid) {
            return;
        }

        if (stopped) {
            notify(subscription, errorResult(createError('disabled')));
            return;
        }

        const existingTask = subscription.task;
        if (existingTask && existingTask.state === 'active') {
            if (force) {
                existingTask.refreshAfterFinish = true;
                if (existingTask.controller) {
                    existingTask.controller.abort();
                }
            }
            return;
        }

        if (existingTask && existingTask.state === 'queued') {
            if (force) {
                existingTask.refreshAfterFinish = false;
            }
            return;
        }

        if (!force) {
            const cached = readCache(subscription.key);
            if (cached) {
                notify(subscription, toResult(cached));
                return;
            }
        }

        let task = tasks.get(subscription.key);
        const createNewTask = !task;
        if (!task) {
            task = createTask(subscription.identity, subscription.key, subscription.priority);
        } else {
            task.priority = Math.min(task.priority, subscription.priority);
            if (task.state === 'queued') {
                sortQueue();
            }
        }

        task.listeners.add(subscription);
        subscription.task = task;
        notify(subscription, { metadata: null, status: 'loading' });
        if (createNewTask) {
            enqueue(task);
        }
    };

    const subscribe = (identity, options = {}) => {
        const normalized = identity && identity.valid === true ? identity : normalizeIdentity(identity);
        const priority = Number.isFinite(options.priority) ? options.priority : 1;
        const subscription = {
            active: true,
            identity: normalized,
            key: normalized.valid ? getRequestKey(normalized) : null,
            priority,
            task: null,
            onChange: typeof options.onChange === 'function' ? options.onChange : () => undefined,
        };

        subscriptions.add(subscription);
        const handle = {
            start: () => startSubscription(subscription),
            restart: () => startSubscription(subscription, true),
            cancel: () => {
                if (!subscription.active) {
                    return;
                }

                subscription.active = false;
                subscriptions.delete(subscription);
                if (subscription.task) {
                    const task = subscription.task;
                    task.listeners.delete(subscription);
                    subscription.task = null;
                    if (task.listeners.size === 0) {
                        if (task.state === 'queued') {
                            removeFromQueue(task);
                            tasks.delete(task.key);
                            task.resolve(errorResult(createError('cancelled')));
                        } else if (task.controller) {
                            task.controller.abort();
                        }
                    }
                }
            },
        };

        if (options.autoStart !== false) {
            handle.start();
        }

        return handle;
    };

    const request = (identity, options = {}) => {
        const normalized = normalizeIdentity(identity);
        if (!normalized.valid) {
            return Promise.resolve({ metadata: null, status: 'unsupported' });
        }

        return new Promise((resolve) => {
            let handle;
            handle = subscribe(normalized, {
                priority: options.priority,
                autoStart: false,
                onChange: (result) => {
                    if (result.status !== 'loading') {
                        handle.cancel();
                        resolve(result);
                    }
                },
            });
            handle.start();
        });
    };

    const clearCache = () => {
        cache.clear();
        Array.from(subscriptions).forEach((subscription) => {
            if (subscription.active) {
                if (subscription.task && subscription.task.state === 'active') {
                    subscription.task.refreshAfterFinish = true;
                    if (subscription.task.controller) {
                        subscription.task.controller.abort();
                    }
                } else {
                    startSubscription(subscription, true);
                }
            }
        });
    };

    const stopRequests = () => {
        stopped = true;
        queue.splice(0).forEach((task) => {
            const result = errorResult(createError('disabled'));
            tasks.delete(task.key);
            task.resolve(result);
            Array.from(task.listeners).forEach((subscription) => notify(subscription, result));
            detachTask(task);
        });
        tasks.forEach((task) => {
            if (task.state === 'active') {
                task.refreshAfterFinish = task.listeners.size > 0;
                if (task.controller) {
                    task.controller.abort();
                }
            }
        });
    };

    const resumeRequests = () => {
        stopped = false;
        pump();
    };

    return {
        clearCache,
        getCacheSize: () => cache.size,
        request,
        resumeRequests,
        stopRequests,
        subscribe,
        validateMetadata,
    };
};

let defaultClient = null;

const getBilingualClient = () => {
    if (defaultClient === null) {
        defaultClient = createBilingualClient();
    }

    return defaultClient;
};

module.exports = {
    CACHE_SCHEMA_VERSION,
    DEFAULT_LOCALE,
    ENGLISH_LOCALE,
    createBilingualClient,
    getBilingualClient,
    getBilingualOverviewEntries,
    getBilingualTitleLines,
    getBilingualTitleText,
    getRequestKey,
    getRequestUrl,
    isUsableLocalizedText,
    normalizeIdentity,
    validateMetadata,
};
