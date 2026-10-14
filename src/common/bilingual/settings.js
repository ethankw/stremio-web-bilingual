// Copyright (C) 2017-2026 Smart code 203358507
// Modified by Ethan for this Stremio Web Bilingual project; GPL-2.0 license retained.

const React = require('react');
const { getBilingualClient } = require('./client');

const SETTINGS_STORAGE_KEY = 'stremio-bilingual-settings-v1';
const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    titleOrder: 'en-first',
    overviewOrder: 'zh-first',
});

let settings = DEFAULT_SETTINGS;
const listeners = new Set();
let storageListenerInstalled = false;

const getWindow = () => typeof window === 'object' && window !== null ? window : null;

const getStorage = () => {
    const currentWindow = getWindow();
    if (!currentWindow) {
        return null;
    }

    try {
        return currentWindow.localStorage;
    } catch {
        return null;
    }
};

const parseSettings = (value) => {
    if (typeof value !== 'string') {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        if (parsed === null || typeof parsed !== 'object' || typeof parsed.enabled !== 'boolean' || !['en-first', 'zh-first'].includes(parsed.titleOrder) || !['en-first', 'zh-first'].includes(parsed.overviewOrder)) {
            return null;
        }

        return {
            enabled: parsed.enabled,
            titleOrder: parsed.titleOrder,
            overviewOrder: parsed.overviewOrder,
        };
    } catch {
        return null;
    }
};

const loadSettings = () => {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    try {
        const stored = parseSettings(storage.getItem(SETTINGS_STORAGE_KEY));
        if (stored !== null) {
            settings = Object.freeze(stored);
        }
    } catch {
        // A blocked storage implementation falls back to the in-memory defaults.
    }
};

const notify = () => {
    listeners.forEach((listener) => listener());
};

const installStorageListener = () => {
    if (storageListenerInstalled) {
        return;
    }

    const currentWindow = getWindow();
    if (!currentWindow || typeof currentWindow.addEventListener !== 'function') {
        return;
    }

    currentWindow.addEventListener('storage', (event) => {
        if (event.key !== SETTINGS_STORAGE_KEY && event.key !== null) {
            return;
        }

        const previousEnabled = settings.enabled;
        const nextSettings = parseSettings(event.newValue);
        settings = Object.freeze(nextSettings || { ...DEFAULT_SETTINGS });
        const client = getBilingualClient();
        if (previousEnabled && !settings.enabled) {
            client.stopRequests();
            if (typeof client.stopAvailabilityMonitoring === 'function') {
                client.stopAvailabilityMonitoring();
            }
        } else if (!previousEnabled && settings.enabled) {
            if (typeof client.startAvailabilityMonitoring === 'function') {
                client.startAvailabilityMonitoring();
            }
            client.resumeRequests();
        }
        notify();
    });
    storageListenerInstalled = true;
};

const subscribe = (listener) => {
    installStorageListener();
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => {
    installStorageListener();
    return settings;
};

const writeSettings = () => {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    try {
        storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
        // Keep the updated value in memory when browser storage is unavailable.
    }
};

const updateSettings = (patch) => {
    const nextSettings = { ...settings };
    if (patch !== null && typeof patch === 'object') {
        if (typeof patch.enabled === 'boolean') {
            nextSettings.enabled = patch.enabled;
        }
        if (patch.titleOrder === 'en-first' || patch.titleOrder === 'zh-first') {
            nextSettings.titleOrder = patch.titleOrder;
        }
        if (patch.overviewOrder === 'en-first' || patch.overviewOrder === 'zh-first') {
            nextSettings.overviewOrder = patch.overviewOrder;
        }
    }

    const changed = nextSettings.enabled !== settings.enabled || nextSettings.titleOrder !== settings.titleOrder || nextSettings.overviewOrder !== settings.overviewOrder;
    if (!changed) {
        return settings;
    }

    const previousEnabled = settings.enabled;
    settings = Object.freeze(nextSettings);
    writeSettings();
    const client = getBilingualClient();
    if (previousEnabled && !settings.enabled) {
        client.stopRequests();
        if (typeof client.stopAvailabilityMonitoring === 'function') {
            client.stopAvailabilityMonitoring();
        }
    } else if (!previousEnabled && settings.enabled) {
        if (typeof client.startAvailabilityMonitoring === 'function') {
            client.startAvailabilityMonitoring();
        }
        client.resumeRequests();
    }
    notify();
    return settings;
};

loadSettings();

const useBilingualSettings = () => {
    const snapshot = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const update = React.useCallback((patch) => updateSettings(patch), []);
    const clearCache = React.useCallback(() => getBilingualClient().clearCache(), []);

    return {
        settings: snapshot,
        updateSettings: update,
        clearCache,
    };
};

module.exports = {
    DEFAULT_SETTINGS,
    SETTINGS_STORAGE_KEY,
    getSnapshot,
    parseSettings,
    updateSettings,
    useBilingualSettings,
};
