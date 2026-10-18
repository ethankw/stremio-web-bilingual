// Copyright (C) 2017-2026 Smart code 203358507
// Keep a settings-only recovery copy, independent of build paths and Core schema.
// Never copy profile auth, addons, configured server URLs or other credentials.
const SETTINGS_KEY = 'stremio-user-settings-v1';
const FIELDS = new Set([
    'interfaceLanguage', 'interfaceScale', 'hideSpoilers', 'gamepadSupport',
    'playerType', 'bingeWatching', 'playInBackground', 'hardwareDecoding',
    'gpuVideoProcessing', 'videoMode', 'frameRateMatchingStrategy',
    'nextVideoNotificationDuration', 'audioPassthrough', 'audioLanguage',
    'secondaryAudioLanguage', 'subtitlesLanguage', 'secondarySubtitlesLanguage',
    'subtitlesAutoSelect', 'subtitlesSize', 'subtitlesFont', 'subtitlesBold',
    'subtitlesOffset', 'subtitlesTextColor', 'subtitlesBackgroundColor',
    'subtitlesOutlineColor', 'subtitlesOpacity', 'assSubtitlesStyling',
    'escExitFullscreen', 'seekTimeDuration', 'seekShortTimeDuration',
    'pauseOnMinimize', 'quitOnClose', 'surroundSound', 'serverInForeground',
    'sendCrashReports', 'discordRpcEnabled',
]);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const owner = (profile) => profile.auth?.user?._id || 'anonymous';
const pickSettings = (settings, current = settings) => Object.fromEntries(
    Object.entries(settings || {}).filter(([key, value]) => {
        if (!FIELDS.has(key) || !Object.prototype.hasOwnProperty.call(current, key)) return false;
        if (value === null) return current[key] === null || ['playerType', 'videoMode', 'secondaryAudioLanguage', 'subtitlesLanguage', 'secondarySubtitlesLanguage'].includes(key);
        return typeof value === typeof current[key] && (
            typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string' && value.length <= 256
        ) || current[key] === null && typeof value === 'string' && value.length <= 256;
    }),
);

const createSettingsPersistence = ({ storage, getState, dispatch }) => {
    const keyFor = (profile) => `${SETTINGS_KEY}:${encodeURIComponent(owner(profile))}`;
    const saveProfile = (profile) => {
        try {
            storage()?.setItem(keyFor(profile), JSON.stringify({ schemaVersion: 1, settings: pickSettings(profile.settings) }));
        } catch (_) { /* Core's normal profile storage remains the primary store. */ }
    };
    const save = async () => {
        const { profile } = await getState('ctx');
        if (profile && record(profile.settings)) saveProfile(profile);
    };
    const restore = async () => {
        const { profile } = await getState('ctx');
        if (!profile || !record(profile.settings)) return;
        let saved;
        try {
            const text = storage()?.getItem(keyFor(profile));
            if (text && text.length < 20000) saved = JSON.parse(text);
        } catch (_) { /* Invalid or blocked recovery storage does not block startup. */ }
        if (saved?.schemaVersion === 1 && record(saved.settings)) {
            const settings = { ...profile.settings, ...pickSettings(saved.settings, profile.settings) };
            if (Object.keys(settings).some((key) => settings[key] !== profile.settings[key])) {
                await dispatch({ action: 'Ctx', args: { action: 'UpdateSettings', args: settings } });
            }
        }
        await save();
    };
    return { restore, save };
};
module.exports = { SETTINGS_KEY, FIELDS, pickSettings, createSettingsPersistence };
