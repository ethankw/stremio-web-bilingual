// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const { normalizeIdentity } = require('./client');

const canonicalArtwork = (metadata, kind, original, enabled) => {
    if (!enabled) return original;
    const image = metadata?.matchStatus === 'matched' && metadata?.artwork?.policy === 'english-v1' ? metadata.artwork[kind] : null;
    if (!image || image.source !== 'tmdb' || !['en', null].includes(image.language)) return undefined;
    const size = kind === 'background' ? 'w780' : 'w500';
    return typeof image.url === 'string' && new RegExp(`^https://image\\.tmdb\\.org/t/p/${size}/[a-zA-Z0-9_-]+\\.(?:jpg|png|webp)$`).test(image.url) ? image.url : undefined;
};

// The calendar supplies an explicit parent detail route. Never split video IDs.
const identityFromDetailLink = (link) => {
    if (typeof link !== 'string') return undefined;
    const match = /^#?\/detail\/(movie|series)\/([^/?#]+)(?:\/[^?#]*)?(?:\?[^#]*)?$/.exec(link);
    if (!match) return undefined;
    try {
        const identity = { type: match[1], id: decodeURIComponent(match[2]), scope: 'meta' };
        return normalizeIdentity(identity).valid ? identity : undefined;
    } catch (_) { return undefined; }
};

module.exports = { canonicalArtwork, identityFromDetailLink };
