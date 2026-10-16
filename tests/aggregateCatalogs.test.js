const { catalogKind, getSources, imdbId, normalizeItem, mergeItems, collectCatalogs, readCatalog } = require('../src/routes/Discover/aggregateCatalogs');

const movie = (id, name, extra = {}) => ({ id, type: 'movie', name, ...extra });
const addon = (id, catalogs) => ({ transportUrl: `https://${id}.example/manifest.json`, manifest: { id, catalogs } });
const catalog = (id, name, extra = []) => ({ id, name, type: 'movie', extra });
const source = (id, paginated = false) => ({ request: { base: 'https://fixture.example/manifest.json', path: { resource: 'catalog', type: 'movie', id, extra: [] } }, paginated });

const fakeCore = (pages) => {
    const listeners = new Set();
    let state = {};
    let offset = 0;
    const fetchPage = jest.fn(async (request, skip) => {
        const response = pages(request.path.id, skip);
        if (response.type === 'Err') throw new Error('catalog-failed');
        return response.content;
    });
    const core = {
        on: (_, listener) => listeners.add(listener),
        off: (_, listener) => listeners.delete(listener),
        transport: {
            getState: jest.fn(async () => state),
            dispatch: jest.fn(async (action) => {
                const next = action.action === 'CatalogWithFilters';
                const request = next ? state.selected.request : action.args.args.request;
                if (!next) offset = 0;
                const previous = next ? state.catalog.content.content : [];
                // Mirror Core: selected extra never contains skip; while a next
                // page loads, the public content still says Ready(old items).
                state = { selected: { request }, catalog: { content: next ? { type: 'Ready', content: previous } : { type: 'Loading' } }, selectable: { nextPage: false } };
                listeners.forEach((listener) => listener(['discover']));
                setTimeout(() => {
                    const page = pages(request.path.id, offset);
                    offset += page.content?.length || 0;
                    const content = page.type === 'Ready' ? { type: 'Ready', content: [...previous, ...page.content] } : page;
                    state = { selected: { request }, catalog: { content }, selectable: { nextPage: page.type === 'Ready' && page.content.length > 0 } };
                    listeners.forEach((listener) => listener(['discover']));
                }, 1);
            }),
        },
        listeners, fetchPage,
    };
    return core;
};

test('only explicit latest movie catalogs join; no personal lists, years, franchises or trend catalogs', () => {
    expect(catalogKind('com.linvo.cinemeta', catalog('year', 'New'))).toBe('latest');
    expect(catalogKind('tmdb-addon', catalog('tmdb.latest', 'Latest Releases'))).toBe('latest');
    for (const [id, name] of [['history', 'Recently Watched'], ['watchlist', 'Watchlist'], ['tmdb.year', '年份'], ['tmdb.trending', '趋势'], ['collection', 'Collection']]) {
        expect(catalogKind('other', catalog(id, name))).toBeNull();
    }
    expect(catalogKind('other', catalog('custom.latest', '最新'))).toBe('latest');
    expect(catalogKind('other', { ...catalog('new', 'Latest Releases'), type: 'collections' })).toBeNull();
});

test('popular combines the two requested providers, latest discovers all installed latest catalogs and both recent years', () => {
    const addons = [
        addon('com.linvo.cinemeta', [catalog('top', 'Popular'), catalog('year', 'New', [{ name: 'genre', isRequired: true, options: ['2026', '2025', '2024'] }])]),
        addon('tmdb-addon', [catalog('tmdb.top', '热门'), catalog('tmdb.latest', 'Latest Releases')]),
        addon('another', [catalog('newest', 'Newest')]),
    ];
    expect(getSources(addons, 'popular')).toHaveLength(2);
    const latest = getSources(addons, 'latest', new Date('2026-01-03'));
    expect(latest).toHaveLength(4);
    expect(latest[0].request.path.extra).toEqual([['genre', '2026']]);
    expect(latest[1].request.path.extra).toEqual([['genre', '2025']]);
});

test('search-only catalogs are never called with invented missing parameters', () => {
    expect(getSources([addon('other', [catalog('latest', 'Latest', [{ name: 'search', isRequired: true }])])], 'latest')).toEqual([]);
});

test('IMDb links bridge namespaces, validate hosts and never deduplicate by title', () => {
    const a = movie('tt0133093', 'The Matrix', { imdbRating: '8.7' });
    const b = movie('tmdb:603', '黑客帝国', { links: [{ category: 'imdb', url: 'https://www.imdb.com/title/tt0133093/' }], watched: true, inLibrary: true });
    expect(imdbId(b)).toBe(a.id);
    const merged = mergeItems([a, b, movie('tt9999999', 'The Matrix')], 'popular');
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ id: a.id, watched: true, inLibrary: true });
    expect(imdbId({ ...b, links: [{ url: 'https://www.imdb.com.attacker.example/title/tt0133093' }] })).toBeNull();
});

test('IMDb score descending, then English alphabetical order; unknown ratings last', () => {
    const items = [movie('tt0000001', 'Zebra', { imdbRating: 8 }), movie('tt0000002', 'alpha', { imdbRating: '8.0' }), movie('tt0000003', 'Best', { imdbRating: 9 }), movie('tt0000004', 'Unknown'), movie('tt0000005', 'Invalid', { imdbRating: 12 })];
    expect(mergeItems(items, 'popular').map((item) => item.name)).toEqual(['Best', 'alpha', 'Zebra', 'Invalid', 'Unknown']);
});

test('never trust a TMDB plugin vote masquerading as IMDb; canonical IMDb enrichment wins', () => {
    const raw = movie('tmdb:603', '中文', { imdbRating: '9.9', links: [{ category: 'imdb', name: '9.9', url: 'https://imdb.com/title/tt0133093/' }] });
    expect(normalizeItem(raw, null).imdbRating).toBeNull();
    expect(normalizeItem(raw, null).links).toEqual([]);
    expect(normalizeItem(raw, { name: 'The Matrix', imdbRating: '8.7' })).toMatchObject({ name: 'The Matrix', imdbRating: '8.7' });
    expect(normalizeItem({ ...raw, aggregateCinemeta: true }, null).imdbRating).toBe('9.9');
});

test('latest orders complete dates, omits future movies and sorts unknown dates last without fabricating dates from years', () => {
    const items = [movie('tt0000001', 'Older', { released: '2026-01-01' }), movie('tt0000002', 'Newer', { released: '2026-10-12T00:00:00Z' }), movie('tt0000003', 'Future', { released: '2027-01-01' }), movie('tt0000004', 'Year only', { released: '2026' }), movie('tt0000005', 'Same date alphabetically first', { released: '2026-01-01' })];
    expect(mergeItems(items, 'latest', Date.parse('2026-10-16')).map((item) => item.name)).toEqual(['Newer', 'Older', 'Same date alphabetically first', 'Year only']);
});

test('collects pagination before sorting, isolates source failures, preserves watched flags and stops repeated pages', async () => {
    const core = fakeCore((id, offset) => id === 'bad' ? { type: 'Err', content: 'Unavailable' } : { type: 'Ready', content: offset < 40 ? Array.from({ length: 20 }, (_, i) => movie(`tt${String(offset + i).padStart(7, '0')}`, `Movie ${offset + i}`, { watched: i === 0 })) : [] });
    const result = await collectCatalogs(core, [source('good', true), source('bad')], new AbortController().signal, core.fetchPage);
    expect(result.items).toHaveLength(40);
    expect(result.failed).toBe(1);
    expect(result.items[0].watched).toBe(true);
    expect(core.transport.dispatch.mock.calls[1][0]).toEqual({ action: 'CatalogWithFilters', args: { action: 'LoadNextPage' } });
    expect(core.fetchPage.mock.calls[1][1]).toBe(20);
    expect(core.listeners.size).toBe(0);
    const repeating = fakeCore(() => ({ type: 'Ready', content: [movie('tt0000001', 'Repeated')] }));
    expect((await collectCatalogs(repeating, [source('repeat', true)], new AbortController().signal, repeating.fetchPage)).items).toHaveLength(1);
    expect(repeating.transport.dispatch).toHaveBeenCalledTimes(1);
});

test('cancelled route switches remove pending listeners and cannot publish stale results', async () => {
    const core = { on: jest.fn(), off: jest.fn(), transport: { dispatch: () => new Promise(() => {}), getState: jest.fn() } };
    const controller = new AbortController();
    const pending = readCatalog(core, source('slow').request, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(core.off).toHaveBeenCalledTimes(1);
});

test('pagination inspection encodes extras like Core and preserves a configured query without exporting it', async () => {
    const { fetchCatalogPage } = require('../src/routes/Discover/aggregateCatalogs');
    const original = global.fetch;
    global.fetch = jest.fn(async () => ({ ok: true, text: async () => JSON.stringify({ metas: [movie('tt0000001', 'Movie')] }) }));
    try {
        const request = { base: 'https://fixture.example/config/manifest.json?fixture=yes', path: { id: 'new releases', extra: [['genre', 'Science Fiction']] } };
        expect(await fetchCatalogPage(request, 20, new AbortController().signal)).toHaveLength(1);
        const url = global.fetch.mock.calls[0][0];
        expect(url.pathname).toBe('/config/catalog/movie/new%20releases/genre=Science%20Fiction&skip=20.json');
        expect(url.search).toBe('?fixture=yes');
    } finally { global.fetch = original; }
});

test('provider placeholder errors are failures and no-result placeholders are not movies', async () => {
    const { fetchCatalogPage } = require('../src/routes/Discover/aggregateCatalogs');
    const original = global.fetch;
    const request = source('latest').request;
    try {
        global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ metas: [{ id: 'tmdb:no-content', genres: ['Error'] }] }) });
        await expect(fetchCatalogPage(request, 0, new AbortController().signal)).rejects.toThrow('catalog-failed');
        global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ metas: [{ id: 'tmdb:no-content', genres: ['No Results'] }] }) });
        await expect(fetchCatalogPage(request, 0, new AbortController().signal)).resolves.toEqual([]);
    } finally { global.fetch = original; }
});
