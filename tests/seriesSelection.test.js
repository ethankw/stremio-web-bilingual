const { defaultSeason, episodeCoordinates } = require('../src/routes/MetaDetails/seriesSelection');
const videos = [{ id: 'tt1234567:0:1', season: 0 }, { id: 'tt1234567:1:1', season: 1 }, { id: 'tt1234567:2:1', season: 2 }];
test('new series prefer normal episodes, while explicit specials and resume remain valid', () => {
    expect(defaultSeason([1, 2, 0], videos, null, null)).toBe(1);
    expect(defaultSeason([1, 2, 0], videos, 0, null)).toBe(0);
    expect(defaultSeason([1, 2, 0], videos, null, 'tt1234567:2:1')).toBe(2);
    expect(defaultSeason([1, 2, 0], videos, null, 'tt1234567:0:1')).toBe(0);
    expect(defaultSeason([3, 0], [], null, null)).toBe(3);
    expect(defaultSeason([0], videos, null, null)).toBe(0);
    expect(defaultSeason([], [], null, null)).toBeNull();
});
test('episode search defaults to season one, preserves explicit season zero and parses namespaced IDs', () => {
    expect(episodeCoordinates('tt1234567')).toEqual({ season: 1, episode: 1 });
    expect(episodeCoordinates('tt1234567:0:4')).toEqual({ season: 0, episode: 4 });
    expect(episodeCoordinates('tmdb:12345:2:3')).toEqual({ season: 2, episode: 3 });
    expect(episodeCoordinates(null)).toEqual({ season: 1, episode: 1 });
});
