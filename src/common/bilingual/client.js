// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const DEFAULT_LOCALE = 'zh-CN';
const ENGLISH_LOCALE = 'en-US';
const CACHE_SCHEMA_VERSION = 1;
const MATCH_ALGORITHM_VERSION = 'production-countries-v4';
const SUCCESS_TTL = 24 * 60 * 60 * 1000;
const UNMATCHED_TTL = 30 * 60 * 1000;
const MAX_CACHE_ENTRIES = 512;
const MAX_CACHE_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 50_000;
const CLOCK_SKEW_LIMIT = 60 * 1000;
const MAX_CONCURRENT_REQUESTS = 4;
const REQUEST_TIMEOUT = 10 * 1000;
const HEALTH_POLL_INTERVAL = 30 * 1000;
const HEALTH_URL = '/api/health';
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

// Keep namespace validation aligned with worker/identity.ts.
const tmdbIdFrom = (id) => {
    if (typeof id !== 'string' || !/^tmdb:[1-9]\d{0,15}$/.test(id)) return null;
    const value = Number(id.slice(5));
    return Number.isSafeInteger(value) ? value : null;
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

    if (!SUPPORTED_TYPES.has(type) || typeof id !== 'string' || (!/^tt\d{7,10}$/.test(id) && tmdbIdFrom(id) === null) || !SUPPORTED_SCOPES.has(scope)) {
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

    if (type !== 'series' || !Number.isSafeInteger(identity.season) || identity.season < 0 || !Number.isSafeInteger(identity.episode) || identity.episode < 1) {
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

    if (typeof value.text !== 'string' || value.text.length > MAX_TEXT_LENGTH || value.text.trim().length === 0 || value.source !== 'tmdb' || !SUPPORTED_EVIDENCE.has(value.evidence)) {
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

    return value.status === 'missing' && value.text === null && value.effectiveLocale === null && value.source === null && value.evidence === null;
};

const validateMetadata = (metadata, identity) => {
    if (!isRecord(metadata) || metadata.schemaVersion !== 1 || !isRecord(metadata.identity) || metadata.identity.stremioType !== identity.type || metadata.identity.stremioId !== identity.id || (metadata.identity.scope !== undefined && metadata.identity.scope !== identity.scope) || !SUPPORTED_MATCH_STATUSES.has(metadata.matchStatus) || !isRecord(metadata.title) || !isRecord(metadata.overview) || !validateLocalizedText(metadata.title.en, ENGLISH_LOCALE, { allowEnglishOriginal: true }) || !validateLocalizedText(metadata.title.zh, DEFAULT_LOCALE) || !validateLocalizedText(metadata.overview.en, ENGLISH_LOCALE) || !validateLocalizedText(metadata.overview.zh, DEFAULT_LOCALE) || typeof metadata.fetchedAt !== 'string' || !Number.isFinite(Date.parse(metadata.fetchedAt)) || metadata.scope !== identity.scope) {
        return false;
    }

    if (metadata.productionCountries !== undefined && (!Array.isArray(metadata.productionCountries) || metadata.productionCountries.length > 50 || metadata.productionCountries.some((code) => typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)))) return false;

    const tmdbId = metadata.identity.tmdbId;
    const hasValidTmdbId = typeof tmdbId === 'number' && Number.isSafeInteger(tmdbId) && tmdbId > 0;
    const fieldsAreMissing = [metadata.title.en, metadata.title.zh, metadata.overview.en, metadata.overview.zh].every((value) => value.status === 'missing' && value.text === null && value.effectiveLocale === null && value.source === null && value.evidence === null);

    if (metadata.matchStatus === 'matched' && (!hasValidTmdbId || (tmdbIdFrom(identity.id) !== null && tmdbIdFrom(identity.id) !== tmdbId))) {
        return false;
    }

    if (metadata.matchStatus !== 'matched' && (tmdbId !== null || !fieldsAreMissing)) {
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

const isAccessResponse = (response, contentType = readHeader(response, 'content-type')) => {
    return response.redirected === true || response.type === 'opaque' || response.type === 'opaqueredirect' || response.status === 401 || response.status === 403 || (typeof contentType === 'string' && contentType.toLowerCase().includes('text/html')) || isAccessUrl(response.url);
};

const getUtf8ByteLength = (value) => {
    if (typeof TextEncoder === 'function') {
        return new TextEncoder().encode(value).byteLength;
    }

    return value.length;
};

const getFetchedAt = (metadata) => {
    const fetchedAt = Date.parse(metadata.fetchedAt);
    return Number.isFinite(fetchedAt) ? fetchedAt : null;
};

const parseHealthResponse = async (response) => {
    if (!isRecord(response)) {
        throw createError('health-invalid');
    }

    const contentType = readHeader(response, 'content-type');
    if (isAccessResponse(response, contentType)) {
        throw createError('access-expired');
    }

    const isOk = response.status >= 200 && response.status < 300 && response.ok !== false;
    if (!isOk) {
        throw createError('health-http');
    }

    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
        throw createError('health-invalid');
    }

    const body = await readResponseBody(response);
    if (!isRecord(body)) {
        throw createError('health-invalid');
    }

    const allowedKeys = new Set(['schemaVersion', 'configured', 'enabled', 'RELEASE_SHA']);
    if (Object.keys(body).some((key) => !allowedKeys.has(key)) || body.schemaVersion !== 1 || typeof body.configured !== 'boolean' || typeof body.enabled !== 'boolean') {
        throw createError('health-invalid');
    }

    if (hasOwn(body, 'RELEASE_SHA') && (typeof body.RELEASE_SHA !== 'string' || body.RELEASE_SHA.length === 0 || body.RELEASE_SHA.length > 256)) {
        throw createError('health-invalid');
    }

    return {
        configured: body.configured,
        enabled: body.enabled,
        releaseSha: hasOwn(body, 'RELEASE_SHA') ? body.RELEASE_SHA : null,
    };
};

const parseResponse = async (response, identity) => {
    if (!isRecord(response)) {
        throw createError('invalid-response');
    }

    const contentType = readHeader(response, 'content-type');
    if (isAccessResponse(response, contentType)) {
        throw createError('access-expired');
    }

    if (response.status === 429 || response.status >= 500) {
        throw createError(`http-${response.status}`);
    }

    const isOk = response.status >= 200 && response.status < 300 && response.ok !== false;
    if (!isOk) {
        throw createError(`http-${response.status}`);
    }

    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) {
        throw createError('invalid-response');
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
    const matched = isRecord(metadata) && metadata.matchStatus === 'matched' && isRecord(metadata.identity) && typeof metadata.identity.tmdbId === 'number' && Number.isSafeInteger(metadata.identity.tmdbId) && metadata.identity.tmdbId > 0;
    const enText = matched && isUsableLocalizedText(metadata.title?.en, ENGLISH_LOCALE, { allowEnglishOriginal: true }) ? metadata.title.en.text : null;
    const zhText = matched && isUsableLocalizedText(metadata.title?.zh, DEFAULT_LOCALE) ? metadata.title.zh.text : null;

    if (enText === null && zhText === null) {
        return [{ language: 'original', text: safeOriginalName }];
    }

    if (enText !== null && zhText !== null && enText === zhText) {
        return [{ language: 'shared', text: enText }];
    }

    const locales = order === 'zh-first' ? ['zh', 'en'] : ['en', 'zh'];
    const lines = locales.map((locale) => ({
        language: locale,
        text: locale === 'en' ? enText || getLabel(labels, 'englishMissing', DEFAULT_TITLE_LABELS) : zhText || getLabel(labels, 'chineseMissing', DEFAULT_TITLE_LABELS),
        missing: locale === 'en' ? enText === null : zhText === null,
    }));
    if ((enText === null || zhText === null) && safeOriginalName !== enText && safeOriginalName !== zhText) {
        lines.push({ language: 'original', text: safeOriginalName });
    }
    return lines;
};

const getBilingualTitleText = (metadata, originalName, order = 'en-first', labels = DEFAULT_TITLE_LABELS) => {
    return getBilingualTitleLines(metadata, originalName, order, labels).map(({ text }) => text).join(' / ');
};

const getBilingualOverviewEntries = (metadata, originalDescription, order = 'zh-first', labels = DEFAULT_OVERVIEW_LABELS) => {
    const safeOriginalDescription = typeof originalDescription === 'string' ? originalDescription : '';
    const matched = isRecord(metadata) && metadata.matchStatus === 'matched' && isRecord(metadata.identity) && typeof metadata.identity.tmdbId === 'number' && Number.isSafeInteger(metadata.identity.tmdbId) && metadata.identity.tmdbId > 0;
    const enText = matched && isUsableLocalizedText(metadata?.overview?.en, ENGLISH_LOCALE) ? metadata.overview.en.text : null;
    const zhText = matched && isUsableLocalizedText(metadata?.overview?.zh, DEFAULT_LOCALE) ? metadata.overview.zh.text : null;

    if (enText === null && zhText === null) {
        return [{ language: 'original', label: getLabel(labels, 'original', DEFAULT_OVERVIEW_LABELS), text: safeOriginalDescription || getLabel(labels, 'empty', DEFAULT_OVERVIEW_LABELS), available: safeOriginalDescription.length > 0 }];
    }

    const locales = order === 'en-first' ? ['en', 'zh'] : ['zh', 'en'];
    const entries = locales.map((locale) => {
        const text = locale === 'en' ? enText : zhText;
        return {
            language: locale,
            label: locale === 'en' ? getLabel(labels, 'english', DEFAULT_OVERVIEW_LABELS) : getLabel(labels, 'chinese', DEFAULT_OVERVIEW_LABELS),
            text: text || (locale === 'en' ? getLabel(labels, 'englishMissing', DEFAULT_OVERVIEW_LABELS) : getLabel(labels, 'chineseMissing', DEFAULT_OVERVIEW_LABELS)),
            available: text !== null,
        };
    });
    if ((enText === null || zhText === null) && safeOriginalDescription && safeOriginalDescription !== enText && safeOriginalDescription !== zhText) {
        entries.push({ language: 'original', label: getLabel(labels, 'original', DEFAULT_OVERVIEW_LABELS), text: safeOriginalDescription, available: true });
    }
    return entries;
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
    const setIntervalImpl = typeof dependencies.setInterval === 'function' ? dependencies.setInterval : setInterval;
    const clearIntervalImpl = typeof dependencies.clearInterval === 'function' ? dependencies.clearInterval : clearInterval;
    const AbortControllerImpl = dependencies.AbortController || globalThis.AbortController;
    const timeout = Number.isFinite(dependencies.timeoutMs) ? dependencies.timeoutMs : REQUEST_TIMEOUT;
    const healthTimeout = Number.isFinite(dependencies.healthTimeoutMs) ? dependencies.healthTimeoutMs : REQUEST_TIMEOUT;
    const browserWindow = dependencies.window || (typeof window === 'object' && window !== null ? window : null);
    const browserDocument = dependencies.document || (typeof document === 'object' && document !== null ? document : null);
    const monitorAvailability = dependencies.monitorAvailability === true;
    const cache = new Map();
    const tasks = new Map();
    const subscriptions = new Set();
    const queue = [];
    let activeCount = 0;
    let sequence = 0;
    let stopped = false;
    let serverAvailability = monitorAvailability ? 'checking' : 'available';
    let serverAvailabilityReason = null;
    let observedGeneration = null;
    let hasHealthSnapshot = false;
    let availabilityTask = null;
    let availabilityMonitorStarted = false;
    let availabilityInterval = null;
    let cacheBytes = 0;

    const safeNow = () => {
        const value = getClockValue(clock);
        return Number.isFinite(value) ? value : Date.now();
    };

    const removeCacheEntry = (key, entry = cache.get(key)) => {
        if (!entry) {
            return;
        }

        cache.delete(key);
        cacheBytes -= entry.bytes;
    };

    const readCache = (key) => {
        const entry = cache.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= safeNow()) {
            removeCacheEntry(key, entry);
            return null;
        }

        cache.delete(key);
        cache.set(key, entry);
        return {
            metadata: entry.metadata,
            expiresAt: entry.expiresAt,
        };
    };

    const writeCache = (key, metadata) => {
        if (metadata.matchStatus !== 'matched' && metadata.matchStatus !== 'unmatched') {
            return null;
        }

        const fetchedAt = getFetchedAt(metadata);
        const now = safeNow();
        if (fetchedAt === null || fetchedAt > now + CLOCK_SKEW_LIMIT) {
            return null;
        }

        const ttl = metadata.matchStatus === 'unmatched' ? UNMATCHED_TTL : SUCCESS_TTL;
        const expiresAt = fetchedAt + ttl;
        if (expiresAt <= now) {
            return null;
        }

        let serialized;
        try {
            serialized = JSON.stringify(metadata);
        } catch {
            return null;
        }

        const bytes = getUtf8ByteLength(serialized);
        if (bytes > MAX_CACHE_BYTES) {
            return null;
        }

        removeCacheEntry(key);
        cache.set(key, {
            metadata: JSON.parse(serialized),
            bytes,
            expiresAt,
        });
        cacheBytes += bytes;

        while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) {
            const oldestKey = cache.keys().next().value;
            if (oldestKey === undefined) {
                break;
            }

            removeCacheEntry(oldestKey);
        }

        return expiresAt;
    };

    const notify = (subscription, result, expiresAt = null) => {
        if (!subscription.active) {
            return;
        }

        subscription.readyExpiresAt = result.status === 'ready' && Number.isFinite(expiresAt) ? expiresAt : null;
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
        if (tasks.get(task.key) === task) {
            tasks.delete(task.key);
        }
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

    const availabilityResult = (reason = serverAvailabilityReason) => ({
        metadata: null,
        status: serverAvailability === 'access-expired' ? 'access-expired' : 'unavailable',
        error: reason || 'availability-unavailable',
    });

    const serverIsAvailable = () => serverAvailability === 'available';

    const invalidateTask = (task, result) => {
        task.invalidated = true;
        task.invalidatedResult = result;
        task.refreshAfterFinish = false;
        removeFromQueue(task);
        if (tasks.get(task.key) === task) {
            tasks.delete(task.key);
        }
        task.listeners.forEach((subscription) => {
            if (subscription.task === task) {
                subscription.task = null;
            }
        });
        task.listeners.clear();
        if (task.controller) {
            task.controller.abort();
        }
        task.resolve(result);
    };

    const invalidateSubscriptions = (result) => {
        Array.from(tasks.values()).forEach((task) => invalidateTask(task, result));
        queue.splice(0);
        Array.from(subscriptions).forEach((subscription) => {
            if (subscription.active) {
                subscription.task = null;
                notify(subscription, result);
            }
        });
    };

    const clearStoredCache = () => {
        cache.clear();
        cacheBytes = 0;
    };

    const blockAvailability = (nextAvailability, reason) => {
        const changed = serverAvailability !== nextAvailability || serverAvailabilityReason !== reason;
        serverAvailability = nextAvailability;
        serverAvailabilityReason = reason;
        if (changed) {
            clearStoredCache();
            invalidateSubscriptions(availabilityResult(reason));
        }
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
            credentials: 'same-origin',
            redirect: 'manual',
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

    const executeHealthFetch = async () => {
        const controller = typeof AbortControllerImpl === 'function' ? new AbortControllerImpl() : null;
        let timeoutId = null;
        let timedOut = false;
        const fetchOptions = {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'manual',
        };

        if (controller) {
            fetchOptions.signal = controller.signal;
        }

        const fetchPromise = Promise.resolve()
            .then(() => fetchImpl(HEALTH_URL, fetchOptions))
            .then(parseHealthResponse);
        const timeoutPromise = new Promise((resolve, reject) => {
            timeoutId = setTimer(() => {
                timedOut = true;
                if (controller) {
                    controller.abort();
                }
                reject(createError('health-timeout'));
            }, healthTimeout);
        });

        try {
            return await Promise.race([fetchPromise, timeoutPromise]);
        } catch (error) {
            if (timedOut) {
                throw createError('health-timeout');
            }

            throw error;
        } finally {
            if (timeoutId !== null) {
                clearTimer(timeoutId);
            }
        }
    };

    const toResult = (metadata) => ({ metadata, status: 'ready' });

    const errorResult = (error) => {
        const code = error && typeof error.code === 'string' && /^(?:access-expired|cancelled|disabled|fetch-unavailable|invalid-response|request-failed|timeout|http-\d{3})$/.test(error.code) ? error.code : 'request-failed';
        return {
            metadata: null,
            status: code === 'access-expired' ? 'access-expired' : 'error',
            error: code,
        };
    };

    const runTask = async (task) => {
        let result;
        let resultExpiresAt = null;

        try {
            const metadata = await executeFetch(task.identity, (controller) => {
                task.controller = controller;
            });
            if (task.invalidated) {
                task.controller = null;
                return;
            }

            if (stopped) {
                result = errorResult(createError('disabled'));
            } else if (!serverIsAvailable()) {
                result = availabilityResult();
            } else {
                resultExpiresAt = writeCache(task.key, metadata);
                result = toResult(metadata);
            }
        } catch (error) {
            if (task.invalidated) {
                task.controller = null;
                return;
            }

            if (error && error.code === 'access-expired') {
                blockAvailability('access-expired', 'access-expired');
                task.controller = null;
                return;
            }

            result = errorResult(error);
        }

        task.controller = null;

        if (task.invalidated) {
            task.controller = null;
            return;
        }

        if (task.refreshAfterFinish && !stopped && serverIsAvailable() && task.listeners.size > 0) {
            task.refreshAfterFinish = false;
            enqueue(task);
            return;
        }

        task.resolve(result);
        Array.from(task.listeners).forEach((subscription) => notify(subscription, result, resultExpiresAt));
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
                const result = task.invalidated ? task.invalidatedResult : errorResult(error);
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
            invalidated: false,
            invalidatedResult: null,
            promise: new Promise((promiseResolve) => {
                resolve = promiseResolve;
            }),
            resolve: (result) => resolve(result),
        };
        tasks.set(key, task);
        return task;
    };

    const hasExpiredReadySubscription = (key) => {
        const now = safeNow();
        return Array.from(subscriptions).some((subscription) => subscription.active && subscription.started && subscription.key === key && subscription.task === null && Number.isFinite(subscription.readyExpiresAt) && subscription.readyExpiresAt <= now);
    };

    const addSubscriptionToTask = (subscription, task) => {
        if (subscription.task === task) {
            return;
        }

        task.listeners.add(subscription);
        subscription.task = task;
        notify(subscription, { metadata: null, status: 'loading' });
    };

    const startSubscription = (subscription, force = false) => {
        if (!subscription.active || !subscription.identity.valid) {
            return;
        }

        subscription.started = true;

        if (stopped) {
            notify(subscription, errorResult(createError('disabled')));
            return;
        }

        if (!serverIsAvailable()) {
            notify(subscription, availabilityResult());
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

        const hasExpiredReady = hasExpiredReadySubscription(subscription.key);
        if (!force && !hasExpiredReady) {
            const cached = readCache(subscription.key);
            if (cached) {
                notify(subscription, toResult(cached.metadata), cached.expiresAt);
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

        addSubscriptionToTask(subscription, task);
        if (hasExpiredReady) {
            const now = safeNow();
            Array.from(subscriptions).forEach((otherSubscription) => {
                if (otherSubscription !== subscription && otherSubscription.active && otherSubscription.started && otherSubscription.key === subscription.key && otherSubscription.task === null && Number.isFinite(otherSubscription.readyExpiresAt) && otherSubscription.readyExpiresAt <= now) {
                    addSubscriptionToTask(otherSubscription, task);
                }
            });
        }
        if (createNewTask) {
            enqueue(task);
        }
    };

    const subscribe = (identity, options = {}) => {
        const normalized = identity && identity.valid === true ? identity : normalizeIdentity(identity);
        const priority = Number.isFinite(options.priority) ? options.priority : 1;
        const subscription = {
            active: true,
            started: false,
            identity: normalized,
            key: normalized.valid ? getRequestKey(normalized) : null,
            priority,
            readyExpiresAt: null,
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

    const restartStartedSubscriptions = () => {
        if (stopped || !serverIsAvailable()) {
            return;
        }

        Array.from(subscriptions).forEach((subscription) => {
            if (subscription.active && subscription.started) {
                startSubscription(subscription, true);
            }
        });
    };

    const restartExpiredSubscriptions = () => {
        if (stopped || !serverIsAvailable()) {
            return;
        }

        const now = safeNow();
        Array.from(subscriptions).forEach((subscription) => {
            if (subscription.active && subscription.started && subscription.task === null && Number.isFinite(subscription.readyExpiresAt) && subscription.readyExpiresAt <= now) {
                startSubscription(subscription, true);
            }
        });
    };

    const applyHealth = (health) => {
        const hadHealthSnapshot = hasHealthSnapshot;
        const generationChanged = hadHealthSnapshot && observedGeneration !== health.releaseSha;
        observedGeneration = health.releaseSha;
        hasHealthSnapshot = true;

        if (!health.enabled) {
            blockAvailability('disabled', 'server-disabled');
            return { status: 'unavailable', configured: health.configured, enabled: false, releaseSha: health.releaseSha };
        }

        if (!health.configured) {
            blockAvailability('not-configured', 'server-not-configured');
            return { status: 'unavailable', configured: false, enabled: true, releaseSha: health.releaseSha };
        }

        if (generationChanged) {
            blockAvailability('checking', 'generation-changed');
        }

        const wasAvailable = serverIsAvailable();
        serverAvailability = 'available';
        serverAvailabilityReason = null;
        if (!wasAvailable || generationChanged) {
            restartStartedSubscriptions();
        } else if (hadHealthSnapshot && !generationChanged) {
            restartExpiredSubscriptions();
        }

        return { status: 'available', configured: true, enabled: true, releaseSha: health.releaseSha };
    };

    const applyHealthError = (error) => {
        if (error && error.code === 'access-expired') {
            blockAvailability('access-expired', 'access-expired');
            return { status: 'access-expired', configured: false, enabled: false };
        }

        blockAvailability('unavailable', 'health-check-failed');
        return { status: 'unavailable', configured: false, enabled: false };
    };

    const checkAvailability = () => {
        if (availabilityTask !== null) {
            return availabilityTask;
        }

        availabilityTask = executeHealthFetch()
            .then(applyHealth)
            .catch(applyHealthError)
            .finally(() => {
                availabilityTask = null;
            });

        return availabilityTask;
    };

    const onFocus = () => {
        checkAvailability();
    };

    const onPageShow = () => {
        checkAvailability();
    };

    const onVisibilityChange = () => {
        if (!browserDocument || browserDocument.visibilityState === 'visible') {
            checkAvailability();
        }
    };

    const startAvailabilityMonitoring = () => {
        if (availabilityMonitorStarted) {
            return availabilityTask || Promise.resolve({ status: serverAvailability });
        }

        availabilityMonitorStarted = true;
        blockAvailability('checking', 'health-check');
        if (browserWindow && typeof browserWindow.addEventListener === 'function') {
            browserWindow.addEventListener('focus', onFocus);
            browserWindow.addEventListener('pageshow', onPageShow);
        }
        if (browserDocument && typeof browserDocument.addEventListener === 'function') {
            browserDocument.addEventListener('visibilitychange', onVisibilityChange);
        }
        availabilityInterval = setIntervalImpl(() => {
            if (!browserDocument || browserDocument.visibilityState !== 'hidden') {
                checkAvailability();
            }
        }, HEALTH_POLL_INTERVAL);

        return checkAvailability();
    };

    const stopAvailabilityMonitoring = () => {
        if (!availabilityMonitorStarted) {
            return;
        }

        availabilityMonitorStarted = false;
        if (browserWindow && typeof browserWindow.removeEventListener === 'function') {
            browserWindow.removeEventListener('focus', onFocus);
            browserWindow.removeEventListener('pageshow', onPageShow);
        }
        if (browserDocument && typeof browserDocument.removeEventListener === 'function') {
            browserDocument.removeEventListener('visibilitychange', onVisibilityChange);
        }
        if (availabilityInterval !== null) {
            clearIntervalImpl(availabilityInterval);
            availabilityInterval = null;
        }
    };

    const clearCache = () => {
        clearStoredCache();
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
        invalidateSubscriptions(errorResult(createError('disabled')));
    };

    const resumeRequests = () => {
        const wasStopped = stopped;
        stopped = false;
        if (wasStopped && serverIsAvailable()) {
            restartStartedSubscriptions();
        }
    };

    return {
        checkAvailability,
        clearCache,
        getAvailability: () => serverAvailability,
        getCacheBytes: () => cacheBytes,
        getCacheSize: () => cache.size,
        request,
        resumeRequests,
        stopRequests,
        startAvailabilityMonitoring,
        stopAvailabilityMonitoring,
        subscribe,
        validateMetadata,
    };
};

let defaultClient = null;

const getBilingualClient = () => {
    if (defaultClient === null) {
        defaultClient = createBilingualClient({ monitorAvailability: true });
    }

    return defaultClient;
};

module.exports = {
    CACHE_SCHEMA_VERSION,
    CLOCK_SKEW_LIMIT,
    DEFAULT_LOCALE,
    ENGLISH_LOCALE,
    MAX_CACHE_BYTES,
    MAX_TEXT_LENGTH,
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
