const { createDiscoverItemState } = require('../src/routes/Discover/discoverItemState');
const film = { id: 'tt10638522', type: 'movie', name: 'Talk to Me', inLibrary: false, watched: false };

test('Core success receipts immediately patch add/remove and watched/unwatched independently', () => {
    const state = createDiscoverItemState();
    expect(state.receive('LibraryItemAdded', { id: film.id })).toBe(true);
    expect(state.apply(film)).toMatchObject({ inLibrary: true, watched: false });
    state.receive('LibraryItemMarkedAsWatched', { id: film.id, is_watched: true });
    state.receive('LibraryItemRemoved', { id: film.id });
    expect(state.apply(film)).toMatchObject({ inLibrary: false, watched: true });
    state.receive('LibraryItemMarkedAsWatched', { id: film.id, is_watched: false });
    expect(state.apply(film)).toMatchObject({ inLibrary: false, watched: false });
    expect(film).toMatchObject({ inLibrary: false, watched: false });
});

test('a slow catalog page cannot undo a newer receipt, and unrelated cards keep their identity', () => {
    const state = createDiscoverItemState();
    const other = { ...film, id: 'tt0133093' };
    state.receive('LibraryItemAdded', { id: film.id });
    state.receive('LibraryItemMarkedAsWatched', { id: film.id, is_watched: true });
    const latePage = [{ ...film }, other].map(state.apply);
    expect(latePage[0]).toMatchObject({ inLibrary: true, watched: true });
    expect(latePage[1]).toBe(other);
    expect(latePage.filter((item) => !item.watched)).toEqual([other]);
});

test('IMDb identities patch both IMDb and mapped TMDB cards without guessing by name', () => {
    const state = createDiscoverItemState();
    state.receive('LibraryItemAdded', { id: film.id });
    expect(state.apply({ ...film, id: 'tmdb:1008042', aggregateImdbId: film.id }).inLibrary).toBe(true);
    expect(state.apply({ ...film, id: 'tmdb:1008042', links: [{ url: `https://imdb.com/title/${film.id}/` }] }).inLibrary).toBe(true);
    expect(state.apply({ ...film, id: 'tt9999999' }).inLibrary).toBe(false);
});

test('unrelated context/settings events, failed actions and malformed receipts never change flags', () => {
    const state = createDiscoverItemState();
    for (const [event, args] of [['ctx', {}], ['SettingsUpdated', {}], ['Error', { id: film.id }], ['LibraryItemAdded', {}], ['LibraryItemMarkedAsWatched', { id: film.id, is_watched: 'false' }]]) {
        expect(state.receive(event, args)).toBe(false);
    }
    expect(state.apply(film)).toBe(film);
    state.receive('LibraryItemAdded', { id: film.id });
    // Hook recreates the controller when account or active-route changes.
    expect(createDiscoverItemState().apply(film)).toBe(film);
});

test('actions using the TMDB ID also update mapped cards and the latest alias receipt wins per field', () => {
    const state = createDiscoverItemState();
    const mapped = { ...film, id: 'tmdb:1008042', aggregateImdbId: film.id };
    state.receive('LibraryItemAdded', { id: film.id });
    state.receive('LibraryItemRemoved', { id: mapped.id });
    state.receive('LibraryItemMarkedAsWatched', { id: film.id, is_watched: true });
    expect(state.apply(mapped)).toMatchObject({ inLibrary: false, watched: true });
    state.receive('LibraryItemAdded', { id: mapped.id });
    expect(state.apply(mapped)).toMatchObject({ inLibrary: true, watched: true });
});
