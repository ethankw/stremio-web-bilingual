const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = require('lz-string');
const { configurationUrl, readConfiguration, buildConfigurationUrl } = require('../src/routes/Settings/Plugins/configuration');
const torrentio = (config = 'language=english,chinese|qualityfilter=cam,scr|limit=3|privateFuture=unchanged|realdebrid=synthetic-test-value') => ({
    transportUrl: `https://torrentio.strem.fun/${encodeURIComponent(config)}/manifest.json`,
    manifest: { id: 'com.stremio.torrentio.addon', version: '0.0.15' },
});
const tmdb = (values) => ({
    transportUrl: `https://94c8cb9f702d-tmdb-addon.baby-beamup.club/${compressToEncodedURIComponent(JSON.stringify(values))}/manifest.json`,
    manifest: { id: 'tmdb-addon', version: '3.1.7' },
});
test('configuration URL preserves the configuration path, never invents another origin', () => {
    expect(configurationUrl(torrentio().transportUrl)).toBe(torrentio().transportUrl.replace('manifest.json', 'configure'));
});
test.each(['javascript:alert(1)', 'http://untrusted.test/manifest.json', 'https://name:password@host.test/manifest.json', 'invalid', 'https://host.test/other'])(
    'unsafe external configuration address rejected: %s', (url) => expect(configurationUrl(url)).toBeNull());
test('no-op draft is byte-identical to the original URL', () => {
    const addon = torrentio();
    const parsed = readConfiguration(addon);
    expect(buildConfigurationUrl(parsed, {})).toBe(addon.transportUrl);
    expect(buildConfigurationUrl(parsed, { limit: '3' })).toBe(addon.transportUrl);
});
test('editing a public field preserves sensitive and unknown fields, without modifying its input', () => {
    const original = torrentio();
    const snapshot = JSON.stringify(original);
    const parsed = readConfiguration(original);
    expect(parsed.fields.some(({ key }) => key === 'realdebrid')).toBe(false);
    const changed = readConfiguration({ ...original, transportUrl: buildConfigurationUrl(parsed, { limit: '5' }) });
    expect(changed.values).toEqual({ ...parsed.values, limit: '5' });
    expect(JSON.stringify(original)).toBe(snapshot);
});
test.each([{ realdebrid: 'replace-secret' }, { limit: '-1' }, { limit: '1.5' }, { limit: '10001' }, { language: 'english|new=value' }])(
    'invalid/unexposed changes rejected without leaking configuration', (changes) => {
        expect(() => buildConfigurationUrl(readConfiguration(torrentio()), changes)).toThrow('invalid_configuration');
    });
test.each(['lite', 'language=english|language=chinese', 'limit=2=3', '__proto__=unsafe|limit=2'])(
    'unsupported Torrentio configuration falls back safely: %s', (value) => expect(readConfiguration(torrentio(value))).toBeNull());
test('a spoofed domain or unreviewed provider version does not activate an adapter', () => {
    const addon = torrentio();
    expect(readConfiguration({ ...addon, transportUrl: addon.transportUrl.replace('torrentio.strem.fun', 'torrentio.strem.fun.attacker.test') })).toBeNull();
    expect(readConfiguration({ ...addon, manifest: { ...addon.manifest, version: '999.0.0' } })).toBeNull();
});
test('TMDB compression round-trip preserves OAuth state, catalogs and string/boolean types', () => {
    const values = { language: 'en-US', searchEnabled: true, castCount: 10, traktAccessToken: 'synthetic-only', catalogs: [{ id: 'tmdb.top', type: 'movie' }], future: { enabled: true } };
    const addon = tmdb(values);
    const parsed = readConfiguration(addon);
    const url = buildConfigurationUrl(parsed, { language: 'zh-CN', searchEnabled: 'false' });
    const result = JSON.parse(decompressFromEncodedURIComponent(new URL(url).pathname.split('/')[1]));
    expect(result).toEqual({ ...values, language: 'zh-CN', searchEnabled: false });
    expect(parsed.values).toEqual(values);
});
test('a standard SDK schema alone does not enable an unverified external configuration route', () => {
    const values = { language: 'en', token: 'synthetic-only', future: ['preserved'] };
    const addon = { transportUrl: `https://sdk.example/${encodeURIComponent(JSON.stringify(values))}/manifest.json`, manifest: { config: [{ key: 'language', type: 'text', title: 'Language' }, { key: 'token', type: 'password', title: 'Token' }] } };
    expect(readConfiguration(addon)).toBeNull();
});
test('unknown configuration formats and missing optional fields are not rebuilt from defaults', () => {
    expect(readConfiguration({ transportUrl: 'https://sdk.example/opaque/manifest.json', manifest: { config: [{ key: 'language', type: 'text', title: 'Language' }] } })).toBeNull();
    expect(readConfiguration(tmdb({ futureOnly: true }))).toBeNull();
});

test('unknown field types remain preserved and cannot be edited as another type', () => {
    const parsed = readConfiguration(tmdb({ language: 'en-US', castCount: 'Unlimited', searchEnabled: 'maybe' }));
    expect(parsed.fields.map(({ key }) => key)).toEqual(['language']);
    const changed = readConfiguration({ ...tmdb({}), transportUrl: buildConfigurationUrl(parsed, { language: 'zh-CN' }) });
    expect(changed.values.castCount).toBe('Unlimited');
    expect(changed.values.searchEnabled).toBe('maybe');
});
