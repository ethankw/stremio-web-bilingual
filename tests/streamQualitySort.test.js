const sort = require('../src/routes/MetaDetails/StreamsList/sortStreamsByQuality');
const stream = (id, release, extra = {}) => Object.freeze({ id, description: `Example.2026.${release}.mkv`, ...extra });
const ids = (streams) => sort(streams).map((item) => item.id);

test('groups HD before CAM before Unknown regardless of claimed resolution; external links last', () => {
    expect(ids([stream('unknown-8k', '8K'), stream('cam-4k', '2160p.HDCAM'), stream('web-720', '720p.WEB-DL'), stream('link', '8K.BluRay', { externalUrl: 'https://example.test' })]))
        .toEqual(['web-720', 'cam-4k', 'unknown-8k', 'link']);
});

test('sorts digital sources by declared resolution first, including 4K/8K aliases', () => {
    expect(ids([stream('720', '720p.BluRay'), stream('1080', '1080p.WEB-DL'), stream('4k', '4K.WEBRip'), stream('8k', '8K.HDTV'), stream('none', 'BluRay'), stream('1440', '1440p.WEB-DL')]))
        .toEqual(['8k', '4k', '1440', '1080', '720', 'none']);
});

test('ties at the same resolution use source provenance, not codecs or HDR', () => {
    expect(ids([stream('hdtv', '1080p.HDTV.HDR.x265'), stream('rip', '1080p.WEBRip'), stream('web', '1080p.WEB-DL.x264'), stream('disc', '1080p.BluRay'), stream('remux', '1080p.BluRay.REMUX')]))
        .toEqual(['remux', 'disc', 'web', 'rip', 'hdtv']);
});

test('REMUX does not upgrade WEB-DL or a reencoded BDRip to disc original quality', () => {
    expect(ids([stream('web-remux', '1080p.WEB-DL.REMUX'), stream('disc', '1080p.BluRay'), stream('bdrip-remux', '1080p.BDRip.REMUX')]))
        .toEqual(['disc', 'web-remux', 'bdrip-remux']);
});

test('filename resolution and source override broad addon quality claims', () => {
    expect(ids([stream('actual720', '1080p.BluRay', { behaviorHints: { filename: 'Example.2026.720p.WEB-DL.mkv' }, name: 'Addon\n4K' }), stream('actual1080', '1080p.WEB-DL')]))
        .toEqual(['actual1080', 'actual720']);
    expect(ids([stream('actualweb', '1080p.BluRay', { behaviorHints: { filename: 'Example.2026.1080p.WEB-DL.mkv' } }), stream('disc', '1080p.BluRay')]))
        .toEqual(['disc', 'actualweb']);
});

test('contradictory resolutions within one field conservatively use the lower claim', () => {
    expect(ids([stream('conflict', '2160p.720p.WEB-DL'), stream('1080', '1080p.WEB-DL')])).toEqual(['1080', 'conflict']);
});

test('Telesync is only a same-resolution camera tiebreak; the HD prefix adds no weight', () => {
    expect(ids([stream('cam', '1080p.HDCAM'), stream('ts', '1080p.TS'), stream('cam4k', '2160p.CAM'), stream('hdts', '1080p.HDTS')]))
        .toEqual(['cam4k', 'ts', 'hdts', 'cam']);
});

test('unknown rows use declared resolution without becoming HD', () => {
    expect(ids([stream('dvd', '480p.DVDRip'), stream('unknown1080', '1080p'), stream('missing', 'Unknown')])).toEqual(['unknown1080', 'dvd', 'missing']);
});

test('codec, HDR, file size, peers and metadata do not change ties', () => {
    expect(ids([stream('first', '1080p.WEB-DL.x264'), stream('second', '1080p.WEB-DL.x265.HDR\n2160p 100 GB 999 peers')])).toEqual(['first', 'second']);
});

test('preserves stream identities, links, callbacks, progress and the original array', () => {
    const callback = jest.fn();
    const a = stream('cam', '1080p.CAM', { onClick: callback, deepLinks: Object.freeze({ player: '#/player/original' }), progress: 35 });
    const b = stream('web', '1080p.WEB-DL');
    const original = Object.freeze([a, b]);
    const result = sort(original);
    expect(result).toEqual([b, a]);
    expect(result[1]).toBe(a);
    expect(original).toEqual([a, b]);
    expect(callback).not.toHaveBeenCalled();
});

test('stable ties and external utility links keep addon order', () => {
    const input = [stream('first', '1080p.WEB-DL'), stream('second', '1080p.WEB-DL'), stream('discussion', '4K', { externalUrl: 'https://example.test' }), stream('analysis', '8K', { externalUrl: 'https://example.test/analysis' })];
    expect(ids(input)).toEqual(['first', 'second', 'discussion', 'analysis']);
    expect(ids(sort(input))).toEqual(ids(input));
    expect(sort([])).toEqual([]);
});
