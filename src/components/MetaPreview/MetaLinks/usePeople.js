// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const cache = new Map();
const EMPTY = [];
const MAX_ENTRIES = 64;

const usePeople = (identity, enabled) => {
    const type = identity?.type || identity?.stremioType;
    const id = identity?.id || identity?.stremioId;
    const valid = enabled && (type === 'movie' || type === 'series') && /^tt\d{7,10}$/.test(id || '');
    const key = valid ? `${type}:${id}` : '';
    const [state, setState] = React.useState({ key: '', people: EMPTY });
    React.useEffect(() => {
        if (!key) return undefined;
        const cached = cache.get(key);
        if (cached && cached.expires > Date.now()) {
            setState({ key, people: cached.people });
            return undefined;
        }
        const controller = new AbortController();
        let cancelled = false;
        const timer = setTimeout(() => controller.abort(), 8500);
        fetch(`/api/bilingual/v1/people?type=${type}&id=${id}&zh=zh-CN`, {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
        }).then(async (response) => {
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable credits');
            const text = await response.text();
            if (text.length > 65536) throw new Error('Invalid credits');
            const result = JSON.parse(text);
            if (result.schemaVersion !== 1 || result.source !== 'tmdb' || result.identity?.stremioId !== id || result.identity?.stremioType !== type || !Array.isArray(result.people)) throw new Error('Invalid credits');
            const people = result.matchStatus === 'matched' ? result.people.slice(0, 120) : EMPTY;
            if (!cancelled) {
                cache.delete(key);
                cache.set(key, { people, expires: Date.now() + 24 * 60 * 60 * 1000 });
                while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
                setState({ key, people });
            }
        }).catch(() => {
            if (!cancelled) setState({ key, people: EMPTY });
        }).finally(() => clearTimeout(timer));
        return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
    }, [key, type, id]);
    return valid && state.key === key ? state.people : EMPTY;
};

module.exports = usePeople;
