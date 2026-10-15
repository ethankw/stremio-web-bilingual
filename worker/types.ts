import type { EnglishArtwork } from './artwork';
export type SupportedType = 'movie' | 'series';

export type MetadataScope = 'meta' | 'episode';

export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous' | 'unsupported';

export type LocalizedTextStatus = 'available' | 'missing';

export type LocalizedTextEvidence = 'translation-exact' | 'original-language';

export type LocalizedText = {
    text: string | null;
    requestedLocale: 'en-US' | 'zh-CN';
    effectiveLocale: string | null;
    source: 'tmdb' | null;
    status: LocalizedTextStatus;
    evidence: LocalizedTextEvidence | null;
};

export type MetadataIdentity = {
    type: SupportedType;
    id: string;
    scope: MetadataScope;
    season?: number;
    episode?: number;
};

export type BilingualMetadata = {
    schemaVersion: 1;
    identity: {
        stremioType: SupportedType;
        stremioId: string;
        tmdbId: number | null;
    };
    matchStatus: MatchStatus;
    title: {
        en: LocalizedText;
        zh: LocalizedText;
    };
    overview: {
        en: LocalizedText;
        zh: LocalizedText;
    };
    artwork?: EnglishArtwork;
    fetchedAt: string;
    scope: MetadataScope;
    season?: number;
    episode?: number;
};

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type WorkerEnv = Omit<CloudflareBindings, 'TMDB_READ_TOKEN' | 'RELEASE_SHA'> & {
    TMDB_READ_TOKEN?: string;
    RELEASE_SHA?: string;
};

export type WorkerDependencies = {
    fetch?: FetchFunction;
    clock?: () => number | Date;
    requestBudgetMs?: number;
    maxResponseBytes?: number;
    setTimeout?: typeof globalThis.setTimeout;
    clearTimeout?: typeof globalThis.clearTimeout;
    sleep?: (milliseconds: number) => Promise<void>;
};

export type PeopleMetadata = {
    schemaVersion: 1;
    identity: BilingualMetadata['identity'];
    matchStatus: MatchStatus;
    source: 'tmdb';
    displayLocale: 'en-US';
    people: { id: number; displayName: string; names: string[]; role: 'cast' | 'director'; image: string | null }[];
};
