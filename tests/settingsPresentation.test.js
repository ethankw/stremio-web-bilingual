const fs = require('fs');
const path = require('path');
const { SETTINGS_CATALOG, matchesSetting } = require('../src/routes/Settings/catalog');
const english = require('../src/locales/settings-en.json');
const chinese = require('../src/locales/zh-CN-extra.json');
const translate = (key) => chinese[key] || key;

test('every catalog entry is unique and has a valid destination', () => {
    expect(new Set(SETTINGS_CATALOG.map(({ id }) => id)).size).toBe(SETTINGS_CATALOG.length);
    expect(SETTINGS_CATALOG.every(({ level }) => ['common', 'advanced', 'account', 'about', 'shortcuts'].includes(level))).toBe(true);
});
test.each(['SETTINGS_UI_LANGUAGE', 'SETTINGS_UI_ZOOM', 'BILINGUAL_ENABLED', 'SETTINGS_SUBTITLES_LANGUAGE', 'SETTINGS_SUBTITLES_SIZE', 'SETTINGS_DEFAULT_AUDIO_TRACK', 'AUTO_PLAY', 'SETTINGS_MY_ADDONS', 'SETTINGS_SERVICE_STATUS', 'SETTINGS_PLAY_IN_EXTERNAL_PLAYER'])(
    '%s remains discoverable in Common', (key) => expect(matchesSetting(SETTINGS_CATALOG.find(({ id }) => id === key), 'common', '')).toBe(true));
test.each(['SETTINGS_HWDEC', 'SETTINGS_GPU_VIDEO_PROCESSING', 'SETTINGS_HTTPS_ENDPOINT', 'SETTINGS_SERVER_TORRENT_PROFILE', 'BILINGUAL_CACHE', 'SETTINGS_ASS_SUBTITLES_STYLING'])(
    '%s is not mixed into Common', (key) => {
        const entry = SETTINGS_CATALOG.find(({ id }) => id === key);
        expect(matchesSetting(entry, 'common', '')).toBe(false);
        expect(matchesSetting(entry, 'advanced', '')).toBe(true);
    });
test('search reaches Advanced and account security without changing the selected tab', () => {
    const cache = SETTINGS_CATALOG.find(({ id }) => id === 'BILINGUAL_CACHE');
    expect(matchesSetting(cache, 'common', '缓存', translate)).toBe(true);
    expect(matchesSetting(cache, 'common', ' CACHE clear ', translate)).toBe(true);
    expect(matchesSetting(cache, 'common', 'cache unknown', translate)).toBe(false);
    expect(matchesSetting(SETTINGS_CATALOG.find(({ id }) => id === 'SETTINGS_ACCOUNT_SECURITY'), 'common', '密码', translate)).toBe(true);
});
test('new settings copy is complete in English and Chinese with the same interpolation tokens', () => {
    for (const key of Object.keys(english)) {
        expect(typeof chinese[key]).toBe('string');
        expect(chinese[key].match(/{{[^}]+}}/g) || []).toEqual(english[key].match(/{{[^}]+}}/g) || []);
    }
});
test('every visible settings Option has a catalog destination', () => {
    for (const group of ['Interface', 'Player', 'Streaming', 'General']) {
        const source = fs.readFileSync(path.join(__dirname, `../src/routes/Settings/${group}/${group}.tsx`), 'utf8');
        const labels = [...source.matchAll(/<Option\b[^>]*label=\{'([^']+)'\}/g)].map((match) => match[1]);
        for (const label of labels) expect(SETTINGS_CATALOG.some(({ id }) => id === label)).toBe(true);
    }
});

test('all registered settings labels have English fallback copy', () => {
    const upstream = require('../node_modules/stremio-translations/en-US.json');
    for (const { id } of SETTINGS_CATALOG) expect(typeof (english[id] || upstream[id])).toBe('string');
});
