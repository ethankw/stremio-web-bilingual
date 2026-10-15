// Configuration URLs may contain credentials. Never include them in errors or telemetry.
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = require('lz-string');
const MAX_CONFIGURATION_LENGTH = 32768;
const safeObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    !Object.keys(value).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key));
const configurationUrl = (transportUrl) => {
    try {
        const url = new URL(transportUrl);
        if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('/manifest.json')) return null;
        url.pathname = url.pathname.slice(0, -'manifest.json'.length) + 'configure';
        return url.href;
    } catch { return null; }
};
const readConfiguration = (addon) => {
    try {
        const url = new URL(addon.transportUrl);
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length !== 2 || parts[1] !== 'manifest.json' || parts[0].length > MAX_CONFIGURATION_LENGTH) return null;
        const encoded = parts[0];
        const token = decodeURIComponent(encoded);
        let kind;
        let values;
        let fields;
        if (url.hostname === 'torrentio.strem.fun' && addon.manifest.id === 'com.stremio.torrentio.addon' && addon.manifest.version === '0.0.15') {
            kind = 'torrentio';
            const pairs = token.split('|').map((part) => part.split('='));
            if (!pairs.length || pairs.some((pair) => pair.length !== 2 || !pair[0]) || new Set(pairs.map(([key]) => key)).size !== pairs.length) return null;
            values = Object.fromEntries(pairs);
            fields = [
                { key: 'language', label: 'SETTINGS_PLUGIN_LANGUAGE', level: 'common', type: 'multi', options: ['english', 'chinese', 'japanese', 'korean', 'french', 'spanish', 'german', 'italian', 'portuguese', 'russian'] },
                { key: 'qualityfilter', label: 'SETTINGS_PLUGIN_QUALITY', level: 'common', type: 'multi', options: ['cam', 'scr', '480p', '720p', '1080p', '4k'] },
                { key: 'limit', label: 'SETTINGS_PLUGIN_LIMIT', level: 'common', type: 'number' },
                { key: 'providers', label: 'SETTINGS_PLUGIN_PROVIDERS', level: 'advanced', type: 'text' },
            ];
        } else if (url.hostname === '94c8cb9f702d-tmdb-addon.baby-beamup.club' && addon.manifest.id === 'tmdb-addon' && addon.manifest.version === '3.1.7') {
            kind = 'tmdb';
            const decoded = decompressFromEncodedURIComponent(encoded);
            if (!decoded || decoded.length > MAX_CONFIGURATION_LENGTH) return null;
            values = JSON.parse(decoded);
            fields = [
                { key: 'language', label: 'SETTINGS_PLUGIN_CATALOG_LANGUAGE', level: 'common', type: 'text' },
                { key: 'searchEnabled', label: 'SETTINGS_PLUGIN_SEARCH', level: 'common', type: 'select', options: ['true', 'false'] },
                { key: 'castCount', label: 'SETTINGS_PLUGIN_CAST_COUNT', level: 'advanced', type: 'number' },
            ];
        } else return null;
        if (!safeObject(values)) return null;
        // Unknown and sensitive keys remain untouched. Never fabricate a missing setting/default.
        fields = fields.filter((field) => Object.prototype.hasOwnProperty.call(values, field.key) &&
            (field.type === 'number' ? /^\d+$/.test(String(values[field.key])) && Number(values[field.key]) <= 10000 :
                field.type === 'select' ? field.options.includes(String(values[field.key])) : typeof values[field.key] === 'string'));
        if (!fields.length) return null;
        return { kind, values, fields, origin: url.origin, originalUrl: addon.transportUrl };
    } catch { return null; }
};
const buildConfigurationUrl = (configuration, changes) => {
    if (!['torrentio', 'tmdb'].includes(configuration.kind)) throw new Error('invalid_configuration');
    const known = new Map(configuration.fields.map((field) => [field.key, field]));
    if (!safeObject(changes)) throw new Error('invalid_configuration');
    const values = { ...configuration.values };
    for (const [key, value] of Object.entries(changes)) {
        const field = known.get(key);
        if (!field || typeof value !== 'string' || value.length > 2048 || /[|=]/.test(value) && configuration.kind === 'torrentio') throw new Error('invalid_configuration');
        if (field.type === 'number' && (!/^\d+$/.test(value) || Number(value) > 10000)) throw new Error('invalid_configuration');
        if (field.options && field.type !== 'multi' && !field.options.includes(value)) throw new Error('invalid_configuration');
        if (field.type === 'multi') {
            const allowed = new Set([...field.options, ...String(configuration.values[key]).split(',')]);
            if (value && value.split(',').some((token) => !allowed.has(token))) throw new Error('invalid_configuration');
        }
        values[key] = typeof configuration.values[key] === 'boolean' ? value === 'true' : typeof configuration.values[key] === 'number' ? Number(value) : value;
    }
    if (!Object.keys(changes).length || Object.keys(changes).every((key) => values[key] === configuration.values[key])) return configuration.originalUrl;
    const encoded = configuration.kind === 'torrentio' ? encodeURIComponent(Object.entries(values).map(([key, value]) => `${key}=${value}`).join('|')) :
        compressToEncodedURIComponent(JSON.stringify(values));
    if (encoded.length > MAX_CONFIGURATION_LENGTH) throw new Error('invalid_configuration');
    return `${configuration.origin}/${encoded}/manifest.json`;
};
module.exports = { configurationUrl, readConfiguration, buildConfigurationUrl };
