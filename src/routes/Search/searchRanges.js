// Copyright (C) 2026 Ethan. GPL-2.0 license retained.
const searchRanges = (catalogs) => {
    const ranges = [];
    catalogs.forEach((catalog, index) => {
        if (!['movie', 'series'].includes(catalog.type)) return;
        const previous = ranges[ranges.length - 1];
        if (previous && previous.end === index - 1) previous.end = index;
        else ranges.push({ start: index, end: index });
    });
    return ranges;
};
module.exports = searchRanges;
