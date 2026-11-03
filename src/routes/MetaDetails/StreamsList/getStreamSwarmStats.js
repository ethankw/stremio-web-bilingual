// Counts supplied by an addon are snapshots, not measurements of this client's swarm.
const COUNT = '(\\d{1,3}(?:,\\d{3})+|\\d+)(?![\\p{L}\\p{N}.,+\\-])';

const uniqueCount = (text, prefix) => {
    const values = Array.from(text.matchAll(new RegExp(prefix + COUNT, 'giu')),
        (match) => Number(match[1].replace(/,/g, '')));
    return values.length > 0 && values.every((value) => Number.isSafeInteger(value) && value === values[0])
        ? values[0] : null;
};

module.exports = (stream, addonName = '') => {
    if (!stream || stream.externalUrl || stream.ytId) return null;
    const hasTorrentHash = typeof stream.infoHash === 'string' && /^[a-f\d]{40}$/i.test(stream.infoHash);
    const hasTorrentMagnet = typeof stream.deepLinks?.externalPlayer?.magnet === 'string'
        && /^magnet:\?xt=urn:btih:/i.test(stream.deepLinks.externalPlayer.magnet);
    if (!hasTorrentHash && !hasTorrentMagnet) return null;

    // Do not mistake a release filename (e.g. Seeders.2026.mkv) for metadata.
    const description = typeof stream.description === 'string' ? stream.description.slice(0, 16384).normalize('NFKC') : '';
    const lines = description.split(/\r?\n/);
    const metadata = lines.length > 1 ? lines.slice(1).join('\n') :
        /^(?:👤\uFE0F?\s|seeders?\s*[:=：]|seeds\s*[:=：]|leechers?\s*[:=：]|做种\s*[:=：]|下载中\s*[:=：])/iu.test(description.trim()) ? description : '';
    const seederLabel = '(?:^|[\\s|·])(?:seeders?|seeds|做种|做種)\\s*[:=：]\\s*';
    const leechers = uniqueCount(metadata, '(?:^|[\\s|·])(?:leechers?|下载中|下載中)\\s*[:=：]\\s*');
    // Torrentio's source explicitly maps 👤 to torrent.seeders. Generic peers ≠ leechers.
    const isTorrentio = typeof addonName === 'string' && /^Torrentio(?:$|[\s[(])/i.test(addonName);
    return {
        seeders: uniqueCount(metadata, isTorrentio ? `(?:${seederLabel}|👤\\uFE0F?\\s*)` : seederLabel),
        leechers
    };
};
