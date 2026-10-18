// Copyright (C) 2017-2026 Smart code 203358507
// Browser preferences use stable keys, independent of the release SHA.
const createSavedBoolean = (key, storage, events, defaultValue = false) => {
    let fallback = defaultValue;
    let volatile = false;
    const listeners = new Set();
    const notify = () => listeners.forEach((listener) => listener());
    const read = () => {
        if (volatile) return fallback;
        try {
            const value = storage()?.getItem(key);
            if (value === 'true' || value === 'false') return value === 'true';
        } catch (_) { /* Blocked storage keeps the preference for this session. */ }
        return fallback;
    };
    const onStorage = (event) => { if (event.key === key || event.key === null) { fallback = defaultValue; volatile = false; notify(); } };
    return {
        getSnapshot: read,
        subscribe: (listener) => {
            if (!listeners.size) events?.addEventListener('storage', onStorage);
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
                if (!listeners.size) events?.removeEventListener('storage', onStorage);
            };
        },
        set: (next) => {
            fallback = typeof next === 'function' ? Boolean(next(read())) : Boolean(next);
            try { storage()?.setItem(key, String(fallback)); volatile = false; } catch (_) { volatile = true; }
            notify();
        },
    };
};
module.exports = { createSavedBoolean };
