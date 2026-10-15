const { openAddonSettings, getRequestedAddonSettings, clearRequestedAddonSettings } = require('../src/common/addonSettingsNavigation');
afterEach(() => { clearRequestedAddonSettings(getRequestedAddonSettings()); delete global.window; });
test('opening an installed addon does not put its configuration or credentials into the route', () => {
    global.window = { location: { hash: '/addons' } };
    const url = 'https://example.test/synthetic-private-configuration/manifest.json';
    expect(openAddonSettings(url)).toBe(true);
    expect(global.window.location.hash).toBe('/settings');
    expect(getRequestedAddonSettings()).toBe(url);
    clearRequestedAddonSettings('different-instance');
    expect(getRequestedAddonSettings()).toBe(url);
    clearRequestedAddonSettings(url);
    expect(getRequestedAddonSettings()).toBeNull();
});
test('invalid configuration routes cannot redirect the application', () => {
    global.window = { location: { hash: '/addons' } };
    expect(openAddonSettings('javascript:alert(1)')).toBe(false);
    expect(openAddonSettings('https://user:pass@example.test/manifest.json')).toBe(false);
    expect(global.window.location.hash).toBe('/addons');
});
