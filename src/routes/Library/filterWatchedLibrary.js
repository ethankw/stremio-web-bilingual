// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

// Core serializes the same watched boolean used by the card checkmark and actions.
// These two core sorts place the requested watched group first, before pagination.
// Keep that ordering, but present the chips as actual filters in the Library only.
const filterWatchedLibrary = (library, model) => {
    const sort = library?.selected?.request?.sort;
    if (model !== 'library' || !['watched', 'notwatched'].includes(sort)) return library;

    const expectedWatched = sort === 'watched';
    const catalog = library.catalog.filter((item) => item.watched === expectedWatched);
    const reachedOtherGroup = library.catalog.some((item) => item.watched === !expectedWatched);
    return {
        ...library,
        catalog,
        selectable: {
            ...library.selectable,
            // Matching items form a contiguous prefix in the pinned core's sort.
            // Once the other group appears, later pages cannot add any matches.
            nextPage: library.selectable.nextPage && !reachedOtherGroup,
        },
    };
};

module.exports = filterWatchedLibrary;
