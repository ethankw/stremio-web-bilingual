const classifyStreamSource = require('./classifyStreamSource');
const streamReleaseTexts = require('./streamReleaseTexts');

const GROUP_ORDER = { digital: 0, camera: 1, unknown: 2 };
const RESOLUTIONS = { '8k': 4320, '4k': 2160, uhd: 2160 };
const RESOLUTION_PATTERN = /(?:^|[^a-z0-9])((?:240|360|480|540|576|720|1080|1440|2160|4320)[pi]|4k|8k|uhd)(?=$|[^a-z0-9])/gi;
const sourceToken = (pattern) => new RegExp(`(?:^|[^a-z0-9])(?:${pattern})(?=$|[^a-z0-9])`, 'i');
const remux = sourceToken('(?:bd[ ._-]?)?remux');
const disc = sourceToken('blu[ ._-]?ray|bdmux|hd[ ._-]?dvd');
const webDownload = sourceToken('web[ ._-]?dl(?:mux)?');
const discOrWebRip = sourceToken('(?:uhd)?bd[ ._-]?rip|br[ ._-]?rip|web[ ._-]?(?:rip|mux)');
const telesync = sourceToken('hd[ ._-]?ts(?:rip)?|tsrip|ts|telesync|telesynch|hdtelesync|pdvd');

const declaredResolution = (texts) => {
    for (const text of texts) {
        const matches = [...text.matchAll(RESOLUTION_PATTERN)].map((match) => {
            const tag = match[1].toLowerCase();
            return RESOLUTIONS[tag] || Number(tag.slice(0, -1));
        });
        // Contradictory claims in the same field: do not reward the higher one.
        if (matches.length > 0) return Math.min(...matches);
    }
    return 0;
};

const sourcePreference = (classification, texts) => {
    if (classification?.kind === 'digital') {
        const source = classification.source;
        if (disc.test(source)) return texts.some((text) => remux.test(text)) ? 5 : 4;
        if (webDownload.test(source)) return 3;
        if (discOrWebRip.test(source) || /web/i.test(source)) return 2;
        return 1;
    }
    // Telesync may have separately sourced audio; HD in HDCAM adds no weight.
    return classification?.kind === 'camera' && telesync.test(classification.source) ? 1 : 0;
};

module.exports = (streams) => streams.map((stream, index) => {
    const classification = classifyStreamSource(stream);
    const texts = classification ? streamReleaseTexts(stream) : [];
    return {
        stream, index,
        group: classification ? GROUP_ORDER[classification.kind] : 3,
        resolution: declaredResolution(texts),
        source: sourcePreference(classification, texts),
    };
}).sort((left, right) => left.group - right.group
    || right.resolution - left.resolution
    || right.source - left.source
    || left.index - right.index)
    .map(({ stream }) => stream);
