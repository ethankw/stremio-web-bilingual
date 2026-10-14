// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const getCardMetadata = ({ type, releaseInfo, released, links, imdbRating }) => {
    if (type !== 'movie' && type !== 'series') return '';
    const yearMatch = typeof releaseInfo === 'string' && releaseInfo.match(/^\s*(\d{4})(?:\s*[-–].*)?\s*$/);
    const date = released instanceof Date ? released : typeof released === 'string' ? new Date(released) : null;
    const year = yearMatch ? yearMatch[1] : date && !isNaN(date.getTime()) ? String(date.getUTCFullYear()) : '';
    const imdbLink = Array.isArray(links) && links.find((link) => {
        if (link?.category !== 'imdb' || typeof link.url !== 'string') return false;
        try {
            const url = new URL(link.url);
            return ['http:', 'https:'].includes(url.protocol) && ['imdb.com', 'www.imdb.com'].includes(url.hostname);
        } catch (_) {
            return false;
        }
    });
    const rawRating = imdbLink ? imdbLink.name : imdbRating;
    const numericRating = typeof rawRating === 'number' || typeof rawRating === 'string' && /^\d+(?:\.\d+)?$/.test(rawRating.trim()) ? Number(rawRating) : NaN;
    const rating = numericRating > 0 && numericRating <= 10 ? numericRating.toFixed(1) : '';
    return [year, rating].filter(Boolean).join(' / ');
};

module.exports = getCardMetadata;
