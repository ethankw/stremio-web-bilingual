export type ArtworkImage = { url: string; language: 'en' | null; source: 'tmdb' };
export type EnglishArtwork = { policy: 'english-v1'; poster: ArtworkImage | null; logo: ArtworkImage | null; background: ArtworkImage | null };
type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value);

// Language comes from each image record, never inferred from details.poster_path.
const choose = (images: unknown, size: string): ArtworkImage | null => {
    if (!Array.isArray(images)) return null;
    const candidates = images.filter((image): image is RecordValue => record(image) &&
        (image.iso_639_1 === 'en' || image.iso_639_1 === null) && typeof image.file_path === 'string' &&
        /^\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(image.file_path));
    const score = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    candidates.sort((a, b) => Number(b.iso_639_1 === 'en') - Number(a.iso_639_1 === 'en') ||
        score(b.vote_count) - score(a.vote_count) || score(b.vote_average) - score(a.vote_average) ||
        score(b.width) - score(a.width) || String(a.file_path).localeCompare(String(b.file_path)));
    const image = candidates[0];
    return image ? { url: `https://image.tmdb.org/t/p/${size}${image.file_path}`, language: image.iso_639_1 as 'en' | null, source: 'tmdb' } : null;
};

export const englishArtwork = (payload: unknown): EnglishArtwork => {
    const images = record(payload) ? payload : {};
    return { policy: 'english-v1', poster: choose(images.posters, 'w500'), logo: choose(images.logos, 'w500'), background: choose(images.backdrops, 'w780') };
};
