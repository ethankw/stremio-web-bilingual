// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const normalizeName = (name) => typeof name === 'string' ? name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') : '';

// An exact, unique name within the matched title and role is required.
const personImage = (people, label, category) => {
    const role = category === 'Cast' ? 'cast' : category === 'Directors' ? 'director' : null;
    const name = normalizeName(label);
    if (!role || !name || !Array.isArray(people)) return null;
    const matches = people.filter((person) => person && Number.isSafeInteger(person.id) && person.role === role && Array.isArray(person.names) && person.names.some((value) => normalizeName(value) === name));
    if (new Set(matches.map((person) => person.id)).size !== 1) return null;
    const image = matches[0]?.image;
    return typeof image === 'string' && /^https:\/\/image\.tmdb\.org\/t\/p\/w45\/[a-zA-Z0-9_-]+\.(?:jpg|png|webp)$/.test(image) ? image : null;
};

module.exports = { personImage };
