const stats = require('../src/routes/MetaDetails/StreamsList/getStreamSwarmStats');
const torrent = (description) => ({ infoHash: 'a'.repeat(40), description });

test('extracts Torrentio seeders without pretending the unreported leecher count is zero', () => {
    // Torrentio's stream_info.rs maps torrent.seeders to this emoji.
    expect(stats(torrent('Movie.2020.1080p.BluRay.x264-GRP\n👤 12 💾 1.5 GB ⚙️ ThePirateBay'), 'Torrentio'))
        .toEqual({ seeders: 12, leechers: null });
});

test('accepts explicitly labelled counts including zero and thousands separators', () => {
    expect(stats(torrent('Film.mkv\nSeeders: 1,234 | Leechers: 0'))).toEqual({ seeders: 1234, leechers: 0 });
    expect(stats(torrent('Film.mkv\n做种：0 · 下载中：12'))).toEqual({ seeders: 0, leechers: 12 });
    expect(stats(torrent('Seeders: 8 | Leechers: 3'))).toEqual({ seeders: 8, leechers: 3 });
});

test('does not interpret another add-on user emoji or generic peers as seeders/leechers', () => {
    expect(stats(torrent('Film.mkv\n👤 45 Peers: 71'), 'Other addon')).toEqual({ seeders: null, leechers: null });
    expect(stats(torrent('Film.mkv\n👤 45 Peers: 71'), 'Torrentio')).toEqual({ seeders: 45, leechers: null });
});

test.each(['-1', '1.5', '1.2K', '12K', '1,23', '12.000', '9007199254740992', '4e3'])('never converts unsupported count %s into a plausible integer', (count) => {
    expect(stats(torrent(`Film.mkv\nSeeders: ${count} | Leechers: ${count}`))).toEqual({ seeders: null, leechers: null });
});

test('conflicting reports stay unknown rather than selecting the most optimistic value', () => {
    expect(stats(torrent('Film.mkv\nSeeders: 4 | Seeders: 8'))).toEqual({ seeders: null, leechers: null });
    expect(stats(torrent('Film.mkv\nSeeders: 4 👤 8'), 'Torrentio')).toEqual({ seeders: null, leechers: null });
    expect(stats(torrent('Film.mkv\n👤 4 👤 8'), 'Torrentio')).toEqual({ seeders: null, leechers: null });
});

test('filename numbers, languages, file sizes and tracker names do not become counts', () => {
    expect(stats(torrent('Film.Seeders: 1080.mkv\n💾 1.5 GB ⚙️ 1337x 🇬🇧'), 'Torrentio')).toEqual({ seeders: null, leechers: null });
});

test('HTTP/NAS streams, external utilities and YouTube do not get torrent availability badges', () => {
    const description = 'Film.mkv\nSeeders: 50';
    expect(stats({ url: 'http://nas.test/file.mp4', description }, 'Plexio')).toBeNull();
    expect(stats({ ...torrent(description), externalUrl: 'https://example.test' })).toBeNull();
    expect(stats({ ...torrent(description), ytId: 'video' })).toBeNull();
});

test('uses core magnet fallback without changing links, stream references or callbacks', () => {
    const onClick = jest.fn();
    const stream = Object.freeze({ description: 'Film.mkv\nSeeders: 3', deepLinks: Object.freeze({ externalPlayer: Object.freeze({ magnet: `magnet:?xt=urn:btih:${'b'.repeat(40)}` }) }), onClick });
    expect(stats(stream)).toEqual({ seeders: 3, leechers: null });
    expect(onClick).not.toHaveBeenCalled();
    expect(stream.deepLinks.externalPlayer.magnet).toContain('b'.repeat(40));
});

test('malformed and unavailable metadata is unknown, not zero', () => {
    expect(stats(null)).toBeNull();
    expect(stats({ infoHash: 'not a hash' })).toBeNull();
    expect(stats(torrent(null))).toEqual({ seeders: null, leechers: null });
});
