// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const { imdbId } = require('./aggregateCatalogs');

// Core's success events update user flags independently of catalog snapshots.
// Keep receipts across pages so a slow, older page cannot undo a recent action.
const createDiscoverItemState = () => {
    const patches = new Map();
    let sequence = 0;
    const receive = (event, args) => {
        if (typeof args?.id !== 'string' || !args.id) return false;
        let patch;
        if (event === 'LibraryItemAdded') patch = { inLibrary: true };
        else if (event === 'LibraryItemRemoved') patch = { inLibrary: false };
        else if (event === 'LibraryItemMarkedAsWatched' && typeof args.is_watched === 'boolean') patch = { watched: args.is_watched };
        else return false;
        const previous = patches.get(args.id) || {};
        const revision = ++sequence;
        patches.set(args.id, { ...previous, ...Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, { value, revision }])) });
        return true;
    };
    const apply = (item) => {
        const receipts = [patches.get(item.id), patches.get(item.aggregateImdbId || imdbId(item))].filter(Boolean);
        if (!receipts.length) return item;
        const patch = {};
        for (const field of ['inLibrary', 'watched']) {
            const latest = receipts.map((receipt) => receipt[field]).filter(Boolean).sort((a, b) => b.revision - a.revision)[0];
            if (latest) patch[field] = latest.value;
        }
        return { ...item, ...patch };
    };
    return { receive, apply };
};
module.exports = { createDiscoverItemState };
