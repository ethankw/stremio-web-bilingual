// Source labels are hints supplied by addons, not a verification of the video.
const token = (pattern) => new RegExp(`(?:^|[^a-z0-9])(${pattern})(?=$|[^a-z0-9])`, 'i');
const cameraSource = token('(?:hd|hq|new)?[ ._-]?cam(?:[ ._-]?rip)?|hd[ ._-]?ts(?:rip)?|tsrip|telesync|telesynch|hdtelesync|pdvd|ts');
const uncertainSource = token('(?:hd[ ._-]?)?tc|telecine|dvd(?:[ ._-]?(?:rip|scr|screener))?|screener|scr|workprint|wp|sdtv|pdtv|tvrip|dsr|r5');
const digitalSource = token('web[ ._-]?(?:dl(?:mux)?|rip|mux)|blu[ ._-]?ray|(?:uhd)?bd[ ._-]?rip|br[ ._-]?rip|bdmux|hdtv|hd[ ._-]?dvd');
// Bare WEB needs release context: a resolution or codec immediately beside it.
const contextualWeb = /(?:\b(?:720p|1080[pi]|1440p|2160p|4320p|4k|8k)[ ._-]+web\b|\bweb[ ._-]+(?:720p|1080[pi]|1440p|2160p|4320p|4k|8k|[xh][ ._-]?26[45]|avc|hevc)\b)/i;
const lowResolution = token('(?:240|360|480|540|576)[pi]');

const releaseText = (value) => {
    if (typeof value !== 'string') return '';
    // Only release text: ignore peers, tracker names and language metadata below it.
    let text = value.split(/[\r\n]/, 1)[0].normalize('NFKC').slice(0, 4096);
    // Do not interpret a film title such as "Cam.2018" as its release source.
    text = text.replace(/^.*?(?:^|[^\d])(?:19|20)\d{2}(?=[^\d]|$)/, ' ');
    // MPEG transport-stream filenames are not the Telesync release tag.
    return text.replace(/\.ts$/i, '');
};

const classifyStreamSource = (stream = {}) => {
    if (stream.externalUrl || stream.ytId) return null;
    const texts = [stream.behaviorHints?.filename, stream.deepLinks?.externalPlayer?.fileName, stream.description,
        ...(typeof stream.name === 'string' ? stream.name.split(/[\r\n]/) : [])]
        .map(releaseText).filter(Boolean);
    const camera = texts.map((text) => cameraSource.exec(text)?.[1] || (/偷拍|枪版|槍版|抢先版|搶先版/.test(text) ? 'CAM' : null)).find(Boolean);
    if (camera) return { kind: 'camera', source: camera.toUpperCase() };
    if (texts.some((text) => uncertainSource.test(text) || lowResolution.test(text))) {
        return { kind: 'unknown', source: null };
    }
    const digital = texts.map((text) => digitalSource.exec(text)?.[1] || contextualWeb.exec(text)?.[0]).find(Boolean);
    if (digital) return { kind: 'digital', source: digital.toUpperCase() };
    return { kind: 'unknown', source: null };
};

module.exports = classifyStreamSource;
