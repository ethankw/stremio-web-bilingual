const getCardMetadata = require('../src/components/MetaItem/getCardMetadata');
const imdbLink = (name, url = 'https://imdb.com/title/tt1234567') => ({ category: 'imdb', name, url });

test('uses the original IMDb score and premiere year without replacing it with other ratings', () => {
    expect(getCardMetadata({ type: 'movie', releaseInfo: '2026', links: [imdbLink('8.0')] })).toBe('2026 / 8.0');
    expect(getCardMetadata({ type: 'series', releaseInfo: '2020–2023', links: [imdbLink('8.7')] })).toBe('2020 / 8.7');
    expect(getCardMetadata({ type: 'movie', released: '2020-01-01T00:00:00Z', imdbRating: '8' })).toBe('2020 / 8.0');
});

test('omits unavailable or invalid fields without invented scores or dangling separators', () => {
    expect(getCardMetadata({ type: 'movie', releaseInfo: '2026', links: [imdbLink('N/A')] })).toBe('2026');
    expect(getCardMetadata({ type: 'movie', released: 'not-a-date', imdbRating: '8.2' })).toBe('8.2');
    expect(getCardMetadata({ type: 'movie', links: [imdbLink('8.2', 'https://imdb.com.evil.example/title/tt1234567')] })).toBe('');
    expect(getCardMetadata({ type: 'movie', imdbRating: 0 })).toBe('');
    expect(getCardMetadata({ type: 'movie', imdbRating: 11 })).toBe('');
    expect(getCardMetadata({ type: 'tv', releaseInfo: '2026', imdbRating: 8 })).toBe('');
});
