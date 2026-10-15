// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const normalizeName = (name) => typeof name === 'string' ? name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') : '';

// An exact, unique name within the matched title and role is required.
const personImage = (people, label, category, personId) => {
    const role = category === 'Cast' ? 'cast' : category === 'Directors' ? 'director' : null;
    const name = normalizeName(label);
    if (!role || !name || !Array.isArray(people)) return null;
    const matches = people.filter((person) => person && Number.isSafeInteger(person.id) && person.role === role && Array.isArray(person.names) && (personId === undefined ? person.names.some((value) => normalizeName(value) === name) : person.id === personId));
    if (new Set(matches.map((person) => person.id)).size !== 1) return null;
    const image = matches[0]?.image;
    return typeof image === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/w45\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(image) ? image : null;
};

// Same verified English credit list and ordering, independent of plugin labels.
const canonicalCreditGroups = (original, people, enabled) => {
    if (!enabled) return original;
    const groups = new Map(original);
    for (const [category, role] of [['Cast', 'cast'], ['Directors', 'director']]) {
        groups.delete(category);
        const seen = new Set();
        const links = (Array.isArray(people) ? people : []).filter((person) => {
            if (!person || person.role !== role || !Number.isSafeInteger(person.id) || person.id <= 0 || typeof person.displayName !== 'string' || !person.displayName.trim() || seen.has(person.id)) return false;
            seen.add(person.id);
            return true;
        }).slice(0, 10).map((person) => ({ label: person.displayName, personId: person.id, href: `#/search?search=${encodeURIComponent(person.displayName)}` }));
        if (links.length) groups.set(category, links);
    }
    return groups;
};

module.exports = { personImage, canonicalCreditGroups };
