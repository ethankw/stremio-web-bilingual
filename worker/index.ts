import { isSupportedMediaId } from './identity';
import { MetadataCache } from './cache';
import { DEFAULT_REQUEST_BUDGET_MS, MAX_TMDB_RESPONSE_BYTES, TmdbFailure, resolveMetadata, resolvePeople, resolveCountries } from './tmdb';
import type {
    FetchFunction,
    PeopleMetadata,
    CountryMetadata,
    MetadataIdentity,
    WorkerDependencies,
    WorkerEnv,
} from './types';

const SCHEMA_VERSION = 1;
const MATCH_ALGORITHM_VERSION = 'english-presentation-v3';
const DEFAULT_LOCALE = 'zh-CN';
const MAX_RELEASE_SHA_LENGTH = 256;

const API_ERROR_HEADERS = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'private, no-store',
};

const QUERY_VALUE_LIMITS: Record<string, number> = {
    type: 16,
    id: 32,
    zh: 16,
    season: 16,
    episode: 16,
};

const KNOWN_API_ROUTES = new Set([
    '/api/health',
    '/api/bilingual/v1/people',
    '/api/bilingual/v1/countries',
    '/api/bilingual/v1/meta',
    '/api/bilingual/v1/episode',
]);

type WorkerFetch = (request: Request, env: WorkerEnv, context?: ExecutionContext) => Promise<Response>;
export type WorkerHandler = WorkerFetch & { fetch: WorkerFetch };

const isApiPath = (pathname: string): boolean => pathname === '/api' || pathname.startsWith('/api/');

const responseFromJson = (body: unknown, status = 200, headers: Record<string, string> = {}): Response => new Response(JSON.stringify(body), {
    status,
    headers: {
        ...API_ERROR_HEADERS,
        ...headers,
    },
});

const responseFromSerializedJson = (body: string): Response => new Response(body, {
    status: 200,
    headers: API_ERROR_HEADERS,
});

const errorResponse = (status: number, code: string, message: string, retryAfterSeconds?: number): Response => responseFromJson({ code, message }, status, retryAfterSeconds === undefined ? {} : {
    'retry-after': String(retryAfterSeconds),
});

const asClockNumber = (clock: (() => number | Date) | undefined): (() => number) => () => {
    const value = clock ? clock() : Date.now();
    const numberValue = value instanceof Date ? value.getTime() : Number(value);
    return Number.isFinite(numberValue) ? numberValue : Date.now();
};

const readQuery = (url: URL, allowedKeys: ReadonlySet<string>): Map<string, string> | null => {
    const values = new Map<string, string>();
    for (const [key, value] of url.searchParams.entries()) {
        if (!allowedKeys.has(key) || values.has(key)) {
            return null;
        }

        const limit = QUERY_VALUE_LIMITS[key] || 0;
        if (limit === 0 || value.length === 0 || value.length > limit) {
            return null;
        }

        values.set(key, value);
    }

    return values;
};

const requiredQueryValue = (values: Map<string, string>, key: string): string | null => values.get(key) || null;

const parseInteger = (value: string, allowZero: boolean): number | null => {
    const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/;
    if (!pattern.test(value)) {
        return null;
    }

    const numberValue = Number(value);
    return Number.isFinite(numberValue) && Number.isSafeInteger(numberValue) ? numberValue : null;
};

const parseMetadataRequest = (url: URL, scope: MetadataIdentity['scope']): MetadataIdentity | null => {
    const allowedKeys = scope === 'meta' ? new Set(['type', 'id', 'zh']) : new Set(['type', 'id', 'zh', 'season', 'episode']);
    const values = readQuery(url, allowedKeys);
    if (!values) {
        return null;
    }

    const type = requiredQueryValue(values, 'type');
    const id = requiredQueryValue(values, 'id');
    const zh = requiredQueryValue(values, 'zh');
    if ((type !== 'movie' && type !== 'series') || id === null || !isSupportedMediaId(id) || zh !== DEFAULT_LOCALE) {
        return null;
    }

    if (scope === 'meta') {
        return {
            type,
            id,
            scope,
        };
    }

    const seasonValue = requiredQueryValue(values, 'season');
    const episodeValue = requiredQueryValue(values, 'episode');
    const season = seasonValue === null ? null : parseInteger(seasonValue, true);
    const episode = episodeValue === null ? null : parseInteger(episodeValue, false);
    if (type !== 'series' || season === null || episode === null) {
        return null;
    }

    return {
        type,
        id,
        scope,
        season,
        episode,
    };
};

const cacheKey = (identity: MetadataIdentity): string => [
    SCHEMA_VERSION,
    MATCH_ALGORITHM_VERSION,
    identity.type,
    identity.id,
    DEFAULT_LOCALE,
    identity.scope,
    identity.season === undefined ? '' : identity.season,
    identity.episode === undefined ? '' : identity.episode,
].join('|');

const statusForFailure = (failure: TmdbFailure): Response => {
    if (failure.kind === 'rate-limit') {
        return errorResponse(429, 'TMDB_RATE_LIMITED', 'TMDB rate limit reached.', failure.retryAfterSeconds === null ? 30 : failure.retryAfterSeconds);
    }

    if (failure.kind === 'timeout') {
        return errorResponse(504, 'TMDB_TIMEOUT', 'TMDB request timed out.');
    }

    return errorResponse(502, 'TMDB_BAD_RESPONSE', 'TMDB returned an invalid response.');
};

const assetResponse = (request: Request, env: WorkerEnv): Promise<Response> => {
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
        return Promise.resolve(new Response(null, { status: 404 }));
    }

    return env.ASSETS.fetch(request);
};

const configuredToken = (env: WorkerEnv): string | null => {
    const token = typeof env.TMDB_READ_TOKEN === 'string' ? env.TMDB_READ_TOKEN.trim() : '';
    return token.length > 0 ? token : null;
};

const healthResponse = (url: URL, env: WorkerEnv): Response => {
    const values = readQuery(url, new Set());
    if (!values) {
        return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
    }

    const body: Record<string, unknown> = {
        schemaVersion: SCHEMA_VERSION,
        configured: configuredToken(env) !== null,
        enabled: env.BILINGUAL_METADATA_ENABLED === 'true',
    };
    if (typeof env.RELEASE_SHA === 'string' && env.RELEASE_SHA.length > 0 && env.RELEASE_SHA.length <= MAX_RELEASE_SHA_LENGTH) {
        body.RELEASE_SHA = env.RELEASE_SHA;
    }

    return responseFromJson(body);
};

const handleMetadata = async (
    env: WorkerEnv,
    identity: MetadataIdentity,
    upstreamFetch: FetchFunction,
    cache: MetadataCache,
    now: () => number,
    dependencies: WorkerDependencies,
    people = false,
    peopleCache?: MetadataCache<PeopleMetadata>,
    countries = false,
    countryCache?: MetadataCache<CountryMetadata>,
): Promise<Response> => {
    if (env.BILINGUAL_METADATA_ENABLED !== 'true') {
        return errorResponse(503, 'METADATA_DISABLED', 'Bilingual metadata is disabled.');
    }

    const token = configuredToken(env);
    if (token === null) {
        return errorResponse(503, 'TMDB_NOT_CONFIGURED', 'TMDB is not configured.');
    }

    const key = cacheKey(identity);
    const resourceCache = countries ? countryCache : people ? peopleCache : cache;
    const cached = resourceCache?.get(key) ?? null;
    if (cached !== null) {
        return responseFromSerializedJson(cached);
    }

    try {
        const resolverDependencies = {
            fetch: upstreamFetch,
            now,
            requestBudgetMs: dependencies.requestBudgetMs || DEFAULT_REQUEST_BUDGET_MS,
            maxResponseBytes: dependencies.maxResponseBytes || MAX_TMDB_RESPONSE_BYTES,
            sleep: dependencies.sleep,
            setTimeout: dependencies.setTimeout,
            clearTimeout: dependencies.clearTimeout,
        };
        if (countries && countryCache) {
            const result = await resolveCountries(identity, token, resolverDependencies);
            countryCache.set(key, result);
            return responseFromJson(result);
        }
        if (people && peopleCache) {
            const credits = await resolvePeople(identity, token, resolverDependencies);
            peopleCache.set(key, credits);
            return responseFromJson(credits);
        }
        const metadata = await resolveMetadata(identity, token, resolverDependencies);
        cache.set(key, metadata);
        if (countryCache && Array.isArray(metadata.productionCountries)) {
            countryCache.set(key, { schemaVersion: 1, identity: metadata.identity, matchStatus: metadata.matchStatus, productionCountries: metadata.productionCountries });
        }
        return responseFromJson(metadata);
    } catch (error) {
        if (error instanceof TmdbFailure) {
            return statusForFailure(error);
        }

        return errorResponse(502, 'TMDB_BAD_RESPONSE', 'TMDB returned an invalid response.');
    }
};

export const createWorker = (dependencies: WorkerDependencies = {}): WorkerHandler => {
    const upstreamFetch: FetchFunction = dependencies.fetch || globalThis.fetch.bind(globalThis);
    const now = asClockNumber(dependencies.clock);
    const cache = new MetadataCache(now);
    const countryCache = new MetadataCache<CountryMetadata>(now, 600, 256 * 1024);
    const peopleCache = new MetadataCache<PeopleMetadata>(now, 64, 128 * 1024);

    const handler: WorkerFetch = async (request, env) => {
        const url = new URL(request.url);
        if (!isApiPath(url.pathname)) {
            return assetResponse(request, env);
        }

        const isKnownRoute = KNOWN_API_ROUTES.has(url.pathname);
        if (request.method !== 'GET') {
            return isKnownRoute ? errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.') : errorResponse(404, 'NOT_FOUND', 'Not found.');
        }

        if (url.pathname === '/api/health') {
            return healthResponse(url, env);
        }

        if (url.pathname !== '/api/bilingual/v1/meta' && url.pathname !== '/api/bilingual/v1/episode' && url.pathname !== '/api/bilingual/v1/people' && url.pathname !== '/api/bilingual/v1/countries') {
            return errorResponse(404, 'NOT_FOUND', 'Not found.');
        }

        const scope = url.pathname.endsWith('/episode') ? 'episode' : 'meta';
        const identity = parseMetadataRequest(url, scope);
        if (identity === null) {
            return errorResponse(400, 'INVALID_REQUEST', 'Invalid request.');
        }

        return handleMetadata(env, identity, upstreamFetch, cache, now, dependencies, url.pathname.endsWith('/people'), peopleCache, url.pathname.endsWith('/countries'), countryCache);
    };

    return Object.assign(handler, { fetch: handler });
};

const defaultWorker = createWorker();
export const fetch = defaultWorker.fetch;
export default { fetch };
