// Copyright (C) 2017-2026 Smart code 203358507
// Legacy links must not keep the removed watched-only Core sorts active.
const normalizeLibrarySort = (sort) => ['watched', 'notwatched'].includes(sort) ? undefined : sort || undefined;
const visibleLibrarySorts = (sorts) => sorts.filter(({ sort }) => !['watched', 'notwatched'].includes(sort));
module.exports = { normalizeLibrarySort, visibleLibrarySorts };
