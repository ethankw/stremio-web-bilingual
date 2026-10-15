import type { BilingualMetadata } from './types';

export const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const UNMATCHED_CACHE_TTL_MS = 30 * 60 * 1000;
export const MAX_CACHE_ENTRIES = 256;
export const MAX_CACHE_BYTES = 512 * 1024;

type CacheEntry = {
    body: string;
    bytes: number;
    expiresAt: number;
};

export class MetadataCache<T extends { matchStatus: string } = BilingualMetadata> {
    private readonly entries = new Map<string, CacheEntry>();
    private totalBytes = 0;

    public constructor(
        private readonly now: () => number,
        private readonly maxEntries = MAX_CACHE_ENTRIES,
        private readonly maxBytes = MAX_CACHE_BYTES,
    ) {}

    public get(key: string): string | null {
        const entry = this.entries.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt <= this.now()) {
            this.remove(key, entry);
            return null;
        }

        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.body;
    }

    public set(key: string, metadata: T): void {
        if (metadata.matchStatus !== 'matched' && metadata.matchStatus !== 'unmatched') {
            return;
        }

        const body = JSON.stringify(metadata);
        const bytes = new TextEncoder().encode(body).byteLength;
        if (bytes > this.maxBytes) {
            return;
        }

        const previous = this.entries.get(key);
        if (previous) {
            this.remove(key, previous);
        }

        const ttl = metadata.matchStatus === 'unmatched' ? UNMATCHED_CACHE_TTL_MS : SUCCESS_CACHE_TTL_MS;
        this.entries.set(key, {
            body,
            bytes,
            expiresAt: this.now() + ttl,
        });
        this.totalBytes += bytes;

        while (this.entries.size > this.maxEntries || this.totalBytes > this.maxBytes) {
            const oldest = this.entries.entries().next().value as [string, CacheEntry] | undefined;
            if (!oldest) {
                break;
            }

            this.remove(oldest[0], oldest[1]);
        }
    }

    public get size(): number {
        return this.entries.size;
    }

    private remove(key: string, entry: CacheEntry): void {
        this.entries.delete(key);
        this.totalBytes -= entry.bytes;
    }
}
