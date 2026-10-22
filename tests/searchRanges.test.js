const searchRanges = require('../src/routes/Search/searchRanges');
test('movies and series are requested together even below unrelated or offscreen rows', () => {
    expect(searchRanges(['movie', 'series', 'channel', 'channel', 'movie', 'series', 'collections'].map(type => ({ type })))).toEqual([{ start: 0, end: 1 }, { start: 4, end: 5 }]);
});
test('empty catalogs and unrelated types do not issue speculative searches', () => {
    expect(searchRanges([])).toEqual([]);
    expect(searchRanges([{ type: 'channel' }, { type: 'collections' }])).toEqual([]);
    expect(searchRanges([{ type: 'series' }])).toEqual([{ start: 0, end: 0 }]);
});
