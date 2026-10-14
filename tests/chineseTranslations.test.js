const fs = require('fs');
const path = require('path');

const EXPECTED_KEY_COUNT = 2076;
const localeDirectory = path.join(__dirname, '..', 'src', 'locales');
const englishPath = path.join(__dirname, '..', 'node_modules', 'stremio-translations', 'en-US.json');
const chinesePath = path.join(localeDirectory, 'zh-CN.json');

const english = JSON.parse(fs.readFileSync(englishPath, 'utf8'));
const chinese = JSON.parse(fs.readFileSync(chinesePath, 'utf8'));
const englishKeys = Object.keys(english);
const chineseKeys = Object.keys(chinese);

const FORMAT_TOKEN = /{{[^}]+}}|\$\{[^}]+\}|#\{[^}]+\}|%s|%d|%n|%\d+|<[^>]+>|&#\d+;|&amp;|&lt;|&gt;|&quot;/g;

function formatTokens(value) {
    return (String(value).match(FORMAT_TOKEN) || []).sort();
}

function lineBreakCount(value) {
    return String(value).match(/\r?\n/g)?.length || 0;
}

const allowedEnglishOnly = new Set([
    'libVLC',
    'TBA',
    '16:9',
    '4:3',
    'Shift',
    'Esc',
    'Ctrl',
    'Backspace',
    'v.{{version}}',
    'Stremio',
    'Stremio OS',
    'addons@stremio.com',
    'Windows',
    'macOS',
    'Linux',
    'Android',
    'iOS',
    'stremio-circle',
    'stremiocircle',
    'URL',
    'MB/s',
    'Facebook',
    'Google Play',
]);

const allowedChineseWithoutHan = new Set([
    ...allowedEnglishOnly,
    'Z-A',
    'DIY',
]);

const untranslated = englishKeys.filter((key) => {
    const value = english[key];
    return value && value === chinese[key] && !allowedEnglishOnly.has(value);
});

const fullEnglishValues = chineseKeys.filter((key) => {
    const value = chinese[key];
    return value
        && !/[\u4e00-\u9fff]/.test(value)
        && /[A-Za-z]/.test(value)
        && !allowedChineseWithoutHan.has(value);
});

describe('zh-CN locale completeness', () => {
    test('contains the complete English key set', () => {
        expect(englishKeys).toHaveLength(EXPECTED_KEY_COUNT);
        expect(chineseKeys).toHaveLength(EXPECTED_KEY_COUNT);
        expect(chineseKeys).toEqual(expect.arrayContaining(englishKeys));
        expect(englishKeys).toEqual(expect.arrayContaining(chineseKeys));
    });

    test('does not leave ordinary English source values untranslated', () => {
        expect(untranslated).toEqual([]);
    });

    test('does not leave full English descriptions in the Chinese locale', () => {
        expect(fullEnglishValues).toEqual([]);
    });

    test('preserves interpolation, plural, HTML, entity, and shortcut tokens', () => {
        const mismatches = englishKeys.filter((key) => (
            JSON.stringify(formatTokens(english[key])) !== JSON.stringify(formatTokens(chinese[key]))
            || lineBreakCount(english[key]) !== lineBreakCount(chinese[key])
        ));

        expect(mismatches).toEqual([]);
    });

    test('keeps the shared Chinese terminology and complete genre chip labels', () => {
        expect(chinese.TYPE_ALL).toBe('全部');
        expect(chinese.Discover).toBe('发现');
        expect(chinese.Library).toBe('片库');
        expect(chinese.ADDON).toBe('插件');
        expect(chinese.CATALOG).toBe('目录');
        expect(chinese.GENRE).toBe('类型');
        expect(chinese.GENRE_ALL).toBe('所有类型');

        const genreKeys = [
            'Action', 'Comedy', 'War', 'Family', 'Animation', 'Adventure', 'Fantasy',
            'Crime', 'Mystery', 'Romance', 'Drama', 'Horror', 'Thriller', 'Sci-Fi',
            'Music', 'Biography', 'Documentary', 'Sport', 'Musical', 'Western',
            'Film-Noir', 'News', 'History', 'Game-Show', 'Reality-TV', 'Talk-Show',
        ];

        for (const key of genreKeys) {
            expect(chinese[key]).toMatch(/[\u4e00-\u9fff]/);
        }
    });

    test('regresses search, seek, authorization, filters, logout, and clipboard semantics', () => {
        expect(chinese.SEARCH_ANYTHING).toBe('搜索影片、演员或链接…');
        expect(chinese.SEEK_TIME_DURATION).toBe('进度跳转时长');
        expect(chinese.SETTINGS_SHORTCUT_SEEK_FORWARD).toBe('向前快进');
        expect(chinese.SETTINGS_SHORTCUT_SEEK_BACKWARD).toBe('向后快退');
        expect(chinese.SETTINGS_SHORTCUT_SEEK_NEXT).toBe('跳转到下一个');
        expect(chinese.SETTINGS_SHORTCUT_SEEK_PREV).toBe('跳转到上一个');
        expect(chinese.GAMEPAD_ACTION_SEEK_FWD).toBe('向前快进');
        expect(chinese.GAMEPAD_ACTION_SEEK_BACK).toBe('向后快退');

        expect(chinese.SETTINGS_TRAKT_AUTHENTICATE).toBe('授权');
        expect(chinese.AUTHENTICATE).toBe('授权');
        expect(chinese.AUTHENTICATING).toBe('正在授权…');
        expect(chinese.FILTERS).toBe('筛选');
        expect(chinese.LOGOUT).toBe('退出登录');

        expect(chinese.ERR_CLIPBOARD).toBe('无法从剪贴板播放');
        expect(chinese.ERR_CLIPBOARD_READ).toBe('无法在此平台读取剪贴板');
        expect(chinese.ERR_CLIPBOARD_GENERIC).toBe(
            '剪贴板中未找到可播放的链接。请复制视频链接（例如磁力链接）到剪贴板。'
        );
        expect(chinese.ERR_CLIPBOARD_GENERIC).not.toContain('复制到视频');

        expect(chinese.STREMIO_TV_LOGIN_TITLE).toBe('关联账户');
        expect(chinese.STREMIO_TV_LOGIN_EXPIRES_IN).toBe('剩余有效期');
    });
});

