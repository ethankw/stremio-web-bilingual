import type {
    BilingualMetadata,
    FetchFunction,
    LocalizedText,
    MetadataIdentity,
    SupportedType,
} from './types';

export const TMDB_ORIGIN = 'https://api.themoviedb.org';
const TMDB_API_BASE = `${TMDB_ORIGIN}/3`;
export const DEFAULT_REQUEST_BUDGET_MS = 7800;
const MAX_REQUEST_BUDGET_MS = 8000;
export const MAX_TMDB_RESPONSE_BYTES = 1024 * 1024;

const RETRY_DELAY_MS = 50;
const MAX_RETRY_AFTER_SECONDS = 60;
const MAX_TEXT_LENGTH = 50_000;

type TmdbFailureKind = 'timeout' | 'rate-limit' | 'not-found' | 'bad-response' | 'network';

export class TmdbFailure extends Error {
    public readonly kind: TmdbFailureKind;
    public readonly retryAfterSeconds: number | null;

    public constructor(kind: TmdbFailureKind, retryAfterSeconds: number | null = null) {
        super(kind);
        this.name = 'TmdbFailure';
        this.kind = kind;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

type TmdbOptions = {
    fetch: FetchFunction;
    token: string;
    maxResponseBytes: number;
    sleep: (milliseconds: number) => Promise<void>;
    setTimeout: typeof globalThis.setTimeout;
    clearTimeout: typeof globalThis.clearTimeout;
    now: () => number;
};

type TmdbRecord = Record<string, unknown>;

type TranslationFields = {
    titleEn: LocalizedText;
    titleZh: LocalizedText;
    overviewEn: LocalizedText;
    overviewZh: LocalizedText;
};

type RequestOutcome = {
    retryable: boolean;
    body?: unknown;
};

const isRecord = (value: unknown): value is TmdbRecord => value !== null && typeof value === 'object' && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const getHeader = (response: Response, name: string): string | null => response.headers && typeof response.headers.get === 'function' ? response.headers.get(name) || null : null;

const getText = (value: unknown): string | null => {
    if (typeof value !== 'string') {
        return null;
    }

    const text = value.trim();
    return text.length > 0 && text.length <= MAX_TEXT_LENGTH ? text : null;
};

const missingText = (requestedLocale: 'en-US' | 'zh-CN'): LocalizedText => ({
    text: null,
    requestedLocale,
    effectiveLocale: null,
    source: null,
    status: 'missing',
    evidence: null,
});

const translatedText = (requestedLocale: 'en-US' | 'zh-CN', text: string | null): LocalizedText => text === null ? missingText(requestedLocale) : ({
    text,
    requestedLocale,
    effectiveLocale: requestedLocale,
    source: 'tmdb',
    status: 'available',
    evidence: 'translation-exact',
});

const originalLanguageText = (text: string | null): LocalizedText => text === null ? missingText('en-US') : ({
    text,
    requestedLocale: 'en-US',
    effectiveLocale: 'en',
    source: 'tmdb',
    status: 'available',
    evidence: 'original-language',
});

const nowAsIso = (now: () => number): string => {
    const value = now();
    return new Date(Number.isFinite(value) ? value : Date.now()).toISOString();
};

const createMetadata = (
    identity: MetadataIdentity,
    matchStatus: BilingualMetadata['matchStatus'],
    tmdbId: number | null,
    fetchedAt: string,
    fields?: TranslationFields,
): BilingualMetadata => {
    const metadata: BilingualMetadata = {
        schemaVersion: 1,
        identity: {
            stremioType: identity.type,
            stremioId: identity.id,
            tmdbId,
        },
        matchStatus,
        title: fields ? {
            en: fields.titleEn,
            zh: fields.titleZh,
        } : {
            en: missingText('en-US'),
            zh: missingText('zh-CN'),
        },
        overview: fields ? {
            en: fields.overviewEn,
            zh: fields.overviewZh,
        } : {
            en: missingText('en-US'),
            zh: missingText('zh-CN'),
        },
        fetchedAt,
        scope: identity.scope,
    };

    if (identity.scope === 'episode') {
        metadata.season = identity.season;
        metadata.episode = identity.episode;
    }

    return metadata;
};

const findUrl = (imdbId: string): string => {
    const url = new URL(`${TMDB_API_BASE}/find/${encodeURIComponent(imdbId)}`);
    url.searchParams.set('external_source', 'imdb_id');
    return url.toString();
};

const movieDetailsUrl = (tmdbId: number): string => `${TMDB_API_BASE}/movie/${tmdbId}`;
const movieTranslationsUrl = (tmdbId: number): string => `${TMDB_API_BASE}/movie/${tmdbId}/translations`;
const tvDetailsUrl = (tmdbId: number): string => `${TMDB_API_BASE}/tv/${tmdbId}`;
const tvTranslationsUrl = (tmdbId: number): string => `${TMDB_API_BASE}/tv/${tmdbId}/translations`;
const episodeDetailsUrl = (tmdbId: number, season: number, episode: number): string => `${TMDB_API_BASE}/tv/${tmdbId}/season/${season}/episode/${episode}`;
const episodeTranslationsUrl = (tmdbId: number, season: number, episode: number): string => `${TMDB_API_BASE}/tv/${tmdbId}/season/${season}/episode/${episode}/translations`;

const retryAfterSeconds = (header: string | null, now: number): number => {
    if (header !== null && /^\d+$/.test(header.trim())) {
        const seconds = Number(header.trim());
        if (Number.isSafeInteger(seconds)) {
            return Math.max(1, Math.min(MAX_RETRY_AFTER_SECONDS, seconds));
        }
    }

    if (header !== null) {
        const timestamp = Date.parse(header);
        if (Number.isFinite(timestamp)) {
            const seconds = Math.ceil((timestamp - now) / 1000);
            return Math.max(1, Math.min(MAX_RETRY_AFTER_SECONDS, seconds));
        }
    }

    return 30;
};

const discardBody = async (response: Response): Promise<void> => {
    if (response.body && typeof response.body.cancel === 'function') {
        try {
            await response.body.cancel();
        } catch {
            // There is no safe response body to report or log.
        }
    }
};

const readJsonBody = async (response: Response, maxBytes: number): Promise<unknown> => {
    const contentLength = getHeader(response, 'content-length');
    if (contentLength !== null) {
        if (!/^\d+$/.test(contentLength.trim())) {
            throw new TmdbFailure('bad-response');
        }

        const declaredBytes = Number(contentLength.trim());
        if (!Number.isSafeInteger(declaredBytes) || declaredBytes > maxBytes) {
            throw new TmdbFailure('bad-response');
        }
    }

    const contentType = getHeader(response, 'content-type');
    if (contentType !== null && !contentType.toLowerCase().includes('json')) {
        throw new TmdbFailure('bad-response');
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
        throw new TmdbFailure('bad-response');
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
        while (true) {
            const result = await reader.read();
            if (result.done) {
                break;
            }

            const chunk = result.value instanceof Uint8Array ? result.value : new Uint8Array(result.value);
            totalBytes += chunk.byteLength;
            if (totalBytes > maxBytes) {
                await reader.cancel();
                throw new TmdbFailure('bad-response');
            }

            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock();
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }

    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        throw new TmdbFailure('bad-response');
    }
};

const requestWithTimeout = async <T>(
    url: string,
    options: TmdbOptions,
    deadline: number,
    onResponse: (response: Response) => Promise<T>,
): Promise<T> => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new TmdbFailure('timeout');
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
        timeoutId = options.setTimeout(() => {
            controller.abort();
            reject(new TmdbFailure('timeout'));
        }, Math.max(1, remaining));
    });
    const operationPromise = Promise.resolve().then(() => options.fetch(url, {
        method: 'GET',
        headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${options.token}`,
        },
        // workerd accepts manual/follow only. Reject every 3xx below without forwarding credentials.
        redirect: 'manual',
        signal: controller.signal,
    })).then(onResponse);

    try {
        return await Promise.race([operationPromise, timeoutPromise]);
    } catch (error) {
        if (error instanceof TmdbFailure) {
            throw error;
        }

        if (controller.signal.aborted) {
            throw new TmdbFailure('timeout');
        }

        throw new TmdbFailure('network');
    } finally {
        if (timeoutId !== undefined) {
            options.clearTimeout(timeoutId);
        }
    }
};

const responseHasUnsafeRedirect = (response: Response): boolean => {
    if (response.redirected === true || response.type === 'opaqueredirect') {
        return true;
    }

    if (!response.url) {
        return false;
    }

    try {
        return new URL(response.url).origin !== TMDB_ORIGIN;
    } catch {
        return true;
    }
};

const requestJson = async (url: string, options: TmdbOptions, deadline: number): Promise<unknown> => {
    let attempt = 0;

    while (true) {
        const outcome = await requestWithTimeout(url, options, deadline, async (response): Promise<RequestOutcome> => {
            if (responseHasUnsafeRedirect(response)) {
                await discardBody(response);
                throw new TmdbFailure('bad-response');
            }

            const status = response.status;
            if (status === 429) {
                const retryAfter = retryAfterSeconds(getHeader(response, 'retry-after'), Date.now());
                await discardBody(response);
                throw new TmdbFailure('rate-limit', retryAfter);
            }

            if (status === 404) {
                await discardBody(response);
                throw new TmdbFailure('not-found');
            }

            if (status >= 500 && status <= 599) {
                await discardBody(response);
                return { retryable: true };
            }

            if (status < 200 || status >= 300) {
                await discardBody(response);
                throw new TmdbFailure('bad-response');
            }

            return {
                retryable: false,
                body: await readJsonBody(response, options.maxResponseBytes),
            };
        });

        if (!outcome.retryable) {
            return outcome.body;
        }

        if (attempt === 0 && deadline - Date.now() > RETRY_DELAY_MS + 1) {
            attempt += 1;
            await options.sleep(RETRY_DELAY_MS);
            continue;
        }

        throw new TmdbFailure('bad-response');
    }
};

const candidateId = (payload: unknown, type: SupportedType): number[] => {
    if (!isRecord(payload)) {
        throw new TmdbFailure('bad-response');
    }

    const results = payload[type === 'movie' ? 'movie_results' : 'tv_results'];
    if (!Array.isArray(results)) {
        throw new TmdbFailure('bad-response');
    }

    const ids = new Set<number>();
    for (const result of results) {
        if (isRecord(result) && isPositiveInteger(result.id)) {
            ids.add(result.id);
        }
    }

    return Array.from(ids);
};

const validateDetails = (payload: unknown, tmdbId: number): TmdbRecord | null => {
    if (!isRecord(payload)) {
        throw new TmdbFailure('bad-response');
    }

    if (payload.id !== tmdbId) {
        return null;
    }

    if (typeof payload.original_language !== 'string' || payload.original_language.length === 0) {
        throw new TmdbFailure('bad-response');
    }

    return payload;
};

const validateEpisodeDetails = (payload: unknown, season: number, episode: number): TmdbRecord | null => {
    if (!isRecord(payload) || payload.season_number !== season || payload.episode_number !== episode) {
        return null;
    }

    if (!isPositiveInteger(payload.id)) {
        throw new TmdbFailure('bad-response');
    }

    if (payload.original_language !== undefined && (typeof payload.original_language !== 'string' || payload.original_language.length === 0)) {
        throw new TmdbFailure('bad-response');
    }

    return payload;
};

const translationData = (payload: unknown, language: string, country: string): TmdbRecord | null => {
    if (payload === null) return null;
    if (!isRecord(payload) || !Array.isArray(payload.translations)) {
        throw new TmdbFailure('bad-response');
    }

    const matches = payload.translations.filter((translation): translation is TmdbRecord => isRecord(translation) && translation.iso_639_1 === language && translation.iso_3166_1 === country);
    if (matches.length > 1) {
        throw new TmdbFailure('bad-response');
    }

    if (matches.length === 0 || !isRecord(matches[0].data)) {
        return null;
    }

    return matches[0].data;
};

const buildFields = (identity: MetadataIdentity, details: TmdbRecord, translations: unknown): TranslationFields => {
    const titleField = identity.scope === 'episode' || identity.type === 'series' ? 'name' : 'title';
    const originalTitleField = identity.scope === 'episode' ? 'name' : identity.type === 'series' ? 'original_name' : 'original_title';
    const englishData = translationData(translations, 'en', 'US');
    const chineseData = translationData(translations, 'zh', 'CN');
    const englishTitle = getText(englishData?.[titleField]);
    const englishOriginalTitle = details.original_language === 'en' ? getText(details[originalTitleField]) : null;

    return {
        titleEn: englishTitle === null ? originalLanguageText(englishOriginalTitle) : translatedText('en-US', englishTitle),
        titleZh: translatedText('zh-CN', getText(chineseData?.[titleField])),
        overviewEn: translatedText('en-US', getText(englishData?.overview)),
        overviewZh: translatedText('zh-CN', getText(chineseData?.overview)),
    };
};

const translationsOrEmpty = async (url: string, expectedId: number, options: TmdbOptions, deadline: number): Promise<unknown> => {
    try {
        const payload = await requestJson(url, options, deadline);
        if (!isRecord(payload) || payload.id !== expectedId || !Array.isArray(payload.translations)) {
            throw new TmdbFailure('bad-response');
        }
        return payload;
    } catch (error) {
        if (error instanceof TmdbFailure && error.kind === 'not-found') {
            return null;
        }

        throw error;
    }
};

const resolveMovieOrSeries = async (
    identity: MetadataIdentity,
    tmdbId: number,
    options: TmdbOptions,
    deadline: number,
): Promise<BilingualMetadata> => {
    const detailsUrl = identity.type === 'movie' ? movieDetailsUrl(tmdbId) : tvDetailsUrl(tmdbId);
    const translationsUrl = identity.type === 'movie' ? movieTranslationsUrl(tmdbId) : tvTranslationsUrl(tmdbId);
    let details: TmdbRecord | null;
    try {
        details = validateDetails(await requestJson(detailsUrl, options, deadline), tmdbId);
    } catch (error) {
        if (error instanceof TmdbFailure && error.kind === 'not-found') {
            return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
        }

        throw error;
    }

    if (details === null) {
        return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
    }

    const translations = await translationsOrEmpty(translationsUrl, tmdbId, options, deadline);
    return createMetadata(identity, 'matched', tmdbId, nowAsIso(options.now), buildFields(identity, details, translations));
};

const resolveEpisode = async (
    identity: MetadataIdentity,
    tmdbId: number,
    options: TmdbOptions,
    deadline: number,
): Promise<BilingualMetadata> => {
    const season = identity.season as number;
    const episode = identity.episode as number;
    let details: TmdbRecord | null;
    try {
        details = validateEpisodeDetails(await requestJson(episodeDetailsUrl(tmdbId, season, episode), options, deadline), season, episode);
    } catch (error) {
        if (error instanceof TmdbFailure && error.kind === 'not-found') {
            return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
        }

        throw error;
    }

    if (details === null) {
        return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
    }

    const translations = await translationsOrEmpty(episodeTranslationsUrl(tmdbId, season, episode), details.id as number, options, deadline);
    return createMetadata(identity, 'matched', tmdbId, nowAsIso(options.now), buildFields(identity, details, translations));
};

export const resolveMetadata = async (
    identity: MetadataIdentity,
    token: string,
    dependencies: {
        fetch: FetchFunction;
        now: () => number;
        requestBudgetMs?: number;
        maxResponseBytes?: number;
        sleep?: (milliseconds: number) => Promise<void>;
        setTimeout?: typeof globalThis.setTimeout;
        clearTimeout?: typeof globalThis.clearTimeout;
    },
): Promise<BilingualMetadata> => {
    const requestBudgetMs = Number.isFinite(dependencies.requestBudgetMs) && (dependencies.requestBudgetMs as number) > 0 ? Math.min(MAX_REQUEST_BUDGET_MS, dependencies.requestBudgetMs as number) : DEFAULT_REQUEST_BUDGET_MS;
    const maxResponseBytes = Number.isSafeInteger(dependencies.maxResponseBytes) && (dependencies.maxResponseBytes as number) > 0 ? Math.min(MAX_TMDB_RESPONSE_BYTES, dependencies.maxResponseBytes as number) : MAX_TMDB_RESPONSE_BYTES;
    const setTimer = dependencies.setTimeout || globalThis.setTimeout.bind(globalThis);
    const clearTimer = dependencies.clearTimeout || globalThis.clearTimeout.bind(globalThis);
    const sleep = dependencies.sleep || ((milliseconds: number) => new Promise<void>((resolve) => setTimer(resolve, milliseconds)));
    const options: TmdbOptions = {
        fetch: dependencies.fetch,
        token,
        maxResponseBytes,
        sleep,
        setTimeout: setTimer,
        clearTimeout: clearTimer,
        now: dependencies.now,
    };
    const deadline = Date.now() + requestBudgetMs;
    let findPayload: unknown;
    try {
        findPayload = await requestJson(findUrl(identity.id), options, deadline);
    } catch (error) {
        if (error instanceof TmdbFailure && error.kind === 'not-found') {
            return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
        }

        throw error;
    }
    const candidates = candidateId(findPayload, identity.type);

    if (candidates.length === 0) {
        return createMetadata(identity, 'unmatched', null, nowAsIso(options.now));
    }

    if (candidates.length > 1) {
        return createMetadata(identity, 'ambiguous', null, nowAsIso(options.now));
    }

    if (identity.scope === 'episode') {
        return resolveEpisode(identity, candidates[0], options, deadline);
    }

    return resolveMovieOrSeries(identity, candidates[0], options, deadline);
};
