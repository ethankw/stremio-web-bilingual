// Keep configured addon URLs in memory, never in navigation history or query strings.
let requestedAddon = null;
const openAddonSettings = (transportUrl) => {
    if (typeof window !== 'object' || !window.location) return false;
    try {
        const url = new URL(transportUrl);
        if (url.protocol !== 'https:' || url.username || url.password || !url.pathname.endsWith('/manifest.json')) return false;
        requestedAddon = transportUrl;
        window.location.hash = '/settings';
        return true;
    } catch { return false; }
};
const getRequestedAddonSettings = () => requestedAddon;
const clearRequestedAddonSettings = (transportUrl) => {
    if (requestedAddon === transportUrl) requestedAddon = null;
};
module.exports = { openAddonSettings, getRequestedAddonSettings, clearRequestedAddonSettings };
