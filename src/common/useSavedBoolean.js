// Copyright (C) 2017-2026 Smart code 203358507
const React = require('react');
const { createSavedBoolean } = require('./savedBoolean');
const stores = new Map();
const useSavedBoolean = (key, defaultValue = false) => {
    if (!stores.has(key)) stores.set(key, createSavedBoolean(key, () => window.localStorage, window, defaultValue));
    const store = stores.get(key);
    return [React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => defaultValue), store.set];
};

module.exports = useSavedBoolean;
