const { createSavedBoolean } = require('../src/common/savedBoolean');
const { createSettingsPersistence, SETTINGS_KEY } = require('../src/core/settingsPersistence');
const storage = () => {
    const values = new Map();
    return { values, getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('both watched toggles start off and survive independent store/release instances', () => {
    const local = storage();
    const make = (page) => createSavedBoolean(`stremio-${page}-hide-watched-v1`, () => local);
    expect(make('library').getSnapshot()).toBe(false);
    expect(make('discover').getSnapshot()).toBe(false);
    make('library').set(true);
    expect(make('library').getSnapshot()).toBe(true);
    expect(make('discover').getSnapshot()).toBe(false);
    make('library').set(false);
    expect(make('library').getSnapshot()).toBe(false);
});

test('subtitle enabled preference can default on and explicitly remembers off', () => {
    const local = storage();
    const make = () => createSavedBoolean('subtitles-enabled', () => local, undefined, true);
    expect(make().getSnapshot()).toBe(true);
    make().set(false);
    expect(make().getSnapshot()).toBe(false);
    make().set(true);
    expect(make().getSnapshot()).toBe(true);
});

test('blocked/quota storage remains usable without hiding a newly chosen session state', () => {
    const local = { getItem: () => 'false', setItem: () => { throw new Error('quota'); } };
    const pref = createSavedBoolean('test', () => local);
    pref.set(true);
    expect(pref.getSnapshot()).toBe(true);
    pref.set((value) => !value);
    expect(pref.getSnapshot()).toBe(false);
    const blocked = createSavedBoolean('test', () => { throw new Error('blocked'); });
    blocked.set(true);
    expect(blocked.getSnapshot()).toBe(true);
});

const setup = (local, uid = 'user1') => {
    const ctx = { profile: { auth: { key: 'test-secret-never-copy', user: { _id: uid } }, addons: [{ transportUrl: 'https://configured.example/private/' }], settings: { subtitlesLanguage: 'eng', subtitlesSize: 100, bingeWatching: true, streamingServerUrl: 'https://private-server.example/', remoteHttps: 'private', secondarySubtitlesLanguage: null } } };
    const dispatch = jest.fn(async (action) => { ctx.profile.settings = action.args.args; });
    const api = createSettingsPersistence({ storage: () => local, getState: async () => ctx, dispatch });
    return { ctx, dispatch, api };
};

test('settings-only recovery survives an upgrade resetting Core defaults and preserves new Core fields', async () => {
    const local = storage();
    const old = setup(local);
    old.ctx.profile.settings.subtitlesLanguage = 'chi';
    old.ctx.profile.settings.subtitlesSize = 125;
    old.ctx.profile.settings.bingeWatching = false;
    await old.api.save();
    const next = setup(local);
    next.ctx.profile.settings.newCoreField = 'new-default';
    await next.api.restore();
    expect(next.ctx.profile.settings).toMatchObject({ subtitlesLanguage: 'chi', subtitlesSize: 125, bingeWatching: false, newCoreField: 'new-default' });
    expect(next.dispatch).toHaveBeenCalledTimes(1);
    const saved = [...local.values.values()].join('');
    for (const privateValue of ['test-secret', 'configured.example', 'private-server', 'remoteHttps', 'addons', 'auth']) expect(saved).not.toContain(privateValue);
});

test('recovery is scoped by account, validates values, and ignores malformed storage', async () => {
    const local = storage();
    local.setItem(`${SETTINGS_KEY}:user1`, JSON.stringify({ schemaVersion: 1, settings: { subtitlesLanguage: 'chi', subtitlesSize: 'bad', auth: { key: 'bad' }, streamingServerUrl: 'https://bad.example/' } }));
    const other = setup(local, 'user2');
    await other.api.restore();
    expect(other.ctx.profile.settings.subtitlesLanguage).toBe('eng');
    const first = setup(local);
    await first.api.restore();
    expect(first.ctx.profile.settings.subtitlesLanguage).toBe('chi');
    expect(first.ctx.profile.settings.subtitlesSize).toBe(100);
    expect(first.ctx.profile.settings.streamingServerUrl).toBe('https://private-server.example/');
    local.setItem(`${SETTINGS_KEY}:user1`, '{broken');
    await expect(first.api.restore()).resolves.toBeUndefined();
});
