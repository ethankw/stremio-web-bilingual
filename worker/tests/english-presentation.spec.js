const { englishArtwork } = require('../../.worker-tests/artwork.js');
const { createWorker } = require('../../.worker-tests/index.js');
const { canonicalArtwork, identityFromDetailLink } = require('../../src/common/bilingual/presentation');
const { canonicalCreditGroups, personImage } = require('../../src/components/MetaPreview/MetaLinks/people');
const json = (x) => new Response(JSON.stringify(x), { headers: { 'content-type': 'application/json' } });
const image = (path, lang, votes = 1) => ({ file_path: path, iso_639_1: lang, vote_count: votes, vote_average: 9, width: 1000 });
const pictures = { posters: [image('/chinese.jpg', 'zh', 999), image('/neutral.jpg', null, 999), image('/english.jpg', 'en', 2), image('/english2.jpg', 'en', 1)], logos: [image('/logo.png', 'en')], backdrops: [image('/background.jpg', null)] };

test('English has priority over Chinese or neutral artwork, with deterministic ranking', () => {
    const result = englishArtwork(pictures);
    expect(result.poster.url).toBe('https://image.tmdb.org/t/p/w500/english.jpg');
    expect(result.poster.language).toBe('en');
    expect(result.logo.url).toContain('/logo.png');
    expect(result.background.language).toBeNull();
    expect(englishArtwork({ posters: [...pictures.posters].reverse() })).toEqual({ ...result, logo: null, background: null });
    expect(englishArtwork({ posters: [image('/cn.jpg', 'zh'), image('/safe.jpg', null)] }).poster.url).toContain('/safe.jpg');
    expect(englishArtwork({ posters: [image('/cn.jpg', 'zh')] }).poster).toBeNull();
    expect(englishArtwork({ posters: [image('/../bad.jpg', 'en')] }).poster).toBeNull();
});

test('all UI callers use one guarded artwork selector and unsupported identities retain originals', () => {
    const metadata = { matchStatus: 'matched', artwork: englishArtwork(pictures) };
    expect(canonicalArtwork(metadata, 'poster', '/localized.jpg', true)).toContain('/english.jpg');
    expect(canonicalArtwork(metadata, 'poster', '/localized.jpg', false)).toBe('/localized.jpg');
    expect(canonicalArtwork(null, 'poster', '/localized.jpg', true)).toBeUndefined();
    expect(canonicalArtwork({ ...metadata, artwork: { ...metadata.artwork, poster: { source: 'tmdb', language: 'zh', url: metadata.artwork.poster.url } } }, 'poster', '/localized.jpg', true)).toBeUndefined();
    expect(canonicalArtwork({ ...metadata, artwork: { ...metadata.artwork, poster: { source: 'tmdb', language: 'en', url: 'https://evil.test/p.jpg' } } }, 'poster', '/localized.jpg', true)).toBeUndefined();
});

test('English credit IDs and names replace plugin-specific Chinese/English groups consistently', () => {
    const people = [{ id: 1, displayName: 'Keanu Reeves', names: ['Keanu Reeves'], role: 'cast', image: 'https://image.tmdb.org/t/p/w45/actor.jpg' }, { id: 2, displayName: 'Lana Wachowski', names: ['Lana Wachowski'], role: 'director', image: null }];
    const chinese = new Map([['Cast', [{ label: '基努·里维斯', href: '#/search?search=基努' }]], ['Directors', [{ label: '莉娜·沃卓斯基' }]], ['Genres', [{ label: 'Action', href: '/action' }]]]);
    const english = new Map([['Cast', [{ label: 'Different plugin cast' }]], ['Genres', chinese.get('Genres')]]);
    const a = canonicalCreditGroups(chinese, people, true);
    const b = canonicalCreditGroups(english, people, true);
    expect(a.get('Cast')).toEqual(b.get('Cast'));
    expect(a.get('Directors')).toEqual(b.get('Directors'));
    expect(a.get('Cast')[0]).toEqual({ label: 'Keanu Reeves', personId: 1, href: '#/search?search=Keanu%20Reeves' });
    expect(personImage(people, 'Keanu Reeves', 'Cast', 1)).toContain('/actor.jpg');
    expect(a.get('Genres')).toBe(chinese.get('Genres'));
    expect(chinese.get('Cast')[0].label).toBe('基努·里维斯');
    expect(canonicalCreditGroups(chinese, [], true).has('Cast')).toBe(false);
    expect(canonicalCreditGroups(chinese, people, false)).toBe(chinese);
});

test('calendar reads parent identity from explicit detail path, never guesses from video ID', () => {
    expect(identityFromDetailLink('#/detail/series/tmdb%3A1399/tmdb%3A1399%3A1%3A1')).toEqual({ type: 'series', id: 'tmdb:1399', scope: 'meta' });
    expect(identityFromDetailLink('#/detail/series/tt0944947/tt0944947:1:1').id).toBe('tt0944947');
    expect(identityFromDetailLink('tt0944947:1:1')).toBeUndefined();
    expect(identityFromDetailLink('https://evil.test/detail/movie/tt0133093')).toBeUndefined();
    expect(identityFromDetailLink('#/detail/movie/603')).toBeUndefined();
});

test('IMDb and TMDB catalog identities resolve identical verified artwork and English people', async () => {
    const fetch = jest.fn(async (input) => {
        const url = new URL(input);
        if (url.pathname.includes('/find/')) return json({ movie_results: [{ id: 603 }] });
        if (url.pathname.endsWith('/translations')) return json({ id: 603, translations: [] });
        if (url.pathname.endsWith('/credits')) {
            expect(url.searchParams.get('language')).toBe('en-US');
            return json({ id: 603, cast: [{ id: 1, name: 'Keanu Reeves', profile_path: '/actor.jpg' }], crew: [{ id: 2, name: 'Lana Wachowski', job: 'Director' }] });
        }
        expect(url.searchParams.get('append_to_response')).toBe('images');
        expect(url.searchParams.get('language')).toBe('en-US');
        return json({ id: 603, original_language: 'en', original_title: 'The Matrix', images: pictures });
    });
    const worker = createWorker({ fetch });
    const env = { BILINGUAL_METADATA_ENABLED: 'true', TMDB_READ_TOKEN: 'fake' };
    const get = async (id, endpoint) => (await worker(new Request(`https://test/api/bilingual/v1/${endpoint}?type=movie&id=${encodeURIComponent(id)}&zh=zh-CN`), env)).json();
    expect((await get('tt0133093', 'meta')).artwork).toEqual((await get('tmdb:603', 'meta')).artwork);
    const imdb = await get('tt0133093', 'people');
    const tmdb = await get('tmdb:603', 'people');
    expect(imdb.displayLocale).toBe('en-US');
    expect(imdb.people).toEqual(tmdb.people);
    expect(tmdb.people[0].displayName).toBe('Keanu Reeves');
});
