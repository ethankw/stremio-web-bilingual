const filterWatchedLibrary = require('../src/routes/Library/filterWatchedLibrary');
const item = (id, watched, type = 'movie', progress = 0) => Object.freeze({ _id: id, watched, type, progress, deepLinks: { metaDetailsVideos: `#/detail/${type}/${id}` } });
const state = (sort, catalog, nextPage = false) => Object.freeze({
    selected: Object.freeze({ request: Object.freeze({ sort, type: null, page: 1 }) }),
    catalog: Object.freeze(catalog),
    selectable: Object.freeze({ nextPage, sorts: [], types: [] }),
});

test.each(['watched', 'notwatched'])('%s is an exclusive filter and keeps the original item identities', (sort) => {
    const entries = [item('finished', true), item('manual', true, 'movie', 15), item('fresh', false), item('partial', false, 'series', 70)];
    const input = state(sort, entries);
    const actual = filterWatchedLibrary(input, 'library');
    const expected = sort === 'watched' ? entries.slice(0, 2) : entries.slice(2);
    expect(actual.catalog).toEqual(expected);
    actual.catalog.forEach((entry, i) => expect(entry).toBe(expected[i]));
    expect(actual.selected).toBe(input.selected);
    expect(input.catalog).toHaveLength(4);
});

test('does not infer completion from playback progress or coerce missing flags', () => {
    const input = [item('partial', false, 'movie', 90), item('manual', true, 'movie', 0), item('unknown', undefined), item('bad-string', 'false')];
    expect(filterWatchedLibrary(state('watched', input), 'library').catalog.map(x => x._id)).toEqual(['manual']);
    expect(filterWatchedLibrary(state('notwatched', input), 'library').catalog.map(x => x._id)).toEqual(['partial']);
});

test.each(['lastwatched', 'name', 'namereverse', 'timeswatched'])('preserves the %s sort', (sort) => {
    const input = state(sort, [item('watched', true), item('unwatched', false)], true);
    expect(filterWatchedLibrary(input, 'library')).toBe(input);
});

test('does not filter Continue Watching or an unloaded model', () => {
    const input = state('watched', [item('watched', true), item('partial', false)], true);
    expect(filterWatchedLibrary(input, 'continue_watching')).toBe(input);
    const unloaded = { selected: null, catalog: [], selectable: { nextPage: false } };
    expect(filterWatchedLibrary(unloaded, 'library')).toBe(unloaded);
});

test.each(['watched', 'notwatched'])('%s keeps pagination until the matching sorted prefix ends', (sort) => {
    const watched = sort === 'watched';
    const matches = Array.from({ length: 130 }, (_, i) => item(`match-${i}`, watched));
    const others = Array.from({ length: 20 }, (_, i) => item(`other-${i}`, !watched));
    expect(filterWatchedLibrary(state(sort, matches.slice(0, 100), true), 'library').selectable.nextPage).toBe(true);
    const last = filterWatchedLibrary(state(sort, [...matches, ...others], true), 'library');
    expect(last.catalog).toHaveLength(130);
    expect(last.selectable.nextPage).toBe(false);
});

test.each(['watched', 'notwatched'])('%s returns a genuine empty result without scanning opposite-only pages', (sort) => {
    const actual = filterWatchedLibrary(state(sort, Array.from({ length: 100 }, (_, i) => item(`opposite-${i}`, sort !== 'watched')), true), 'library');
    expect(actual.catalog).toEqual([]);
    expect(actual.selectable.nextPage).toBe(false);
});

test('recomputes the result after core updates a watched flag', () => {
    expect(filterWatchedLibrary(state('notwatched', [item('movie', false)]), 'library').catalog).toHaveLength(1);
    expect(filterWatchedLibrary(state('notwatched', [item('movie', true)]), 'library').catalog).toHaveLength(0);
    expect(filterWatchedLibrary(state('watched', [item('movie', true)]), 'library').catalog).toHaveLength(1);
});
