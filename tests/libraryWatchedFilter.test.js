const { normalizeLibrarySort, visibleLibrarySorts } = require('../src/routes/Library/filterWatchedLibrary');
test.each(['watched', 'notwatched'])('legacy %s links return to the normal library order', (sort) => {
    expect(normalizeLibrarySort(sort)).toBeUndefined();
});
test('removes only watched sorts without mutating other options or their routes', () => {
    const options = ['lastwatched', 'name', 'namereverse', 'timeswatched', 'watched', 'notwatched'].map((sort) => Object.freeze({ sort, deepLinks: { library: `#/library?sort=${sort}` } }));
    expect(visibleLibrarySorts(options)).toEqual(options.slice(0, 4));
    expect(options).toHaveLength(6);
    options.slice(0, 4).forEach(({ sort }) => expect(normalizeLibrarySort(sort)).toBe(sort));
    expect(normalizeLibrarySort(null)).toBeUndefined();
});
