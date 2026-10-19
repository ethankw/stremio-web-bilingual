const { DEFAULT_FILTERS, normalizeFilters, readFilters, locationFilters, filterHref, STORAGE_KEY } = require('../src/routes/Discover/discoverFilters');

test('new defaults are movie and all, and each patch preserves every other selection', () => {
    expect(DEFAULT_FILTERS).toEqual({ types: ['movie'], kind: 'all', genre: null });
    const initial = { types: ['movie', 'series'], kind: 'latest', genre: 'Drama' };
    expect(normalizeFilters({ ...initial, kind: 'popular' })).toEqual({ ...initial, kind: 'popular' });
    expect(normalizeFilters({ ...initial, types: ['series'] })).toEqual({ ...initial, types: ['series'] });
    expect(normalizeFilters({ ...initial, genre: null })).toEqual({ ...initial, genre: null });
    expect(normalizeFilters({ ...initial, types: [] })).toEqual({ ...initial, types: [] });
});

test('URL round trips multiple types, all three catalog choices and a selected or cleared genre', () => {
    for (const kind of ['all', 'popular', 'latest']) {
        for (const genre of ['Action', '科幻 & Fantasy', null]) {
            const value = { types: ['movie', 'series'], kind, genre };
            const query = new URLSearchParams(filterHref(value).split('?')[1]);
            expect(locationFilters({}, query, DEFAULT_FILTERS)).toEqual(value);
        }
    }
});

test('a partial deep link changes only its explicit fields; empty genre intentionally clears it', () => {
    const saved = { types: ['movie', 'series'], kind: 'latest', genre: 'Drama' };
    expect(locationFilters({}, new URLSearchParams('genre=Action'), saved)).toEqual({ ...saved, genre: 'Action' });
    expect(locationFilters({}, new URLSearchParams(), saved)).toEqual(saved);
    expect(locationFilters({}, new URLSearchParams('genre='), saved)).toEqual({ ...saved, genre: null });
    expect(locationFilters({ type: 'series', transportUrl: 'https://fixture.example/manifest.json', catalogId: 'year' }, new URLSearchParams('genre=2026'), saved)).toEqual({ types: ['series'], kind: 'latest', genre: null });
    expect(locationFilters({ type: 'movie', transportUrl: 'unified', catalogId: 'popular' }, new URLSearchParams('types=movie,series&catalog=all&genre=Drama'), saved)).toEqual({ ...saved, kind: 'all' });
});

test('preferences survive reloads, reject malformed data and do not depend on working storage', () => {
    const saved = { types: ['series', 'movie', 'series'], kind: 'latest', genre: 'Crime' };
    const storage = { getItem: jest.fn(() => JSON.stringify(saved)) };
    expect(readFilters(storage)).toEqual({ ...saved, types: ['movie', 'series'] });
    expect(storage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(readFilters({ getItem: () => { throw new Error('blocked'); } })).toEqual(DEFAULT_FILTERS);
    expect(readFilters({ getItem: () => '{oops' })).toEqual(DEFAULT_FILTERS);
    expect(normalizeFilters({ types: ['channel'], kind: 'invalid', genre: {} })).toEqual(DEFAULT_FILTERS);
});
