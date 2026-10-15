const classify = require('../src/routes/MetaDetails/StreamsList/classifyStreamSource');

test.each(['CAM', 'CAMRip', 'HDCAM', 'HD-CAM', 'HQCAM', 'NEWCAM', 'HDTS', 'HD-TS', 'TS', 'TSRip', 'HDTSRip', 'TELESYNC', 'TELESYNCH', 'PDVD', '偷拍版', '枪版', '槍版'])('%s identifies camera source even with HD claims', (tag) => {
    expect(classify({ description: `Example.2026.2160p.${tag}.HEVC.mkv` }).kind).toBe('camera');
});

test.each(['WEB-DL', 'WEB_DL', 'WEBDL', 'WEBRip', 'WEB-Rip', 'WEBMux', 'BluRay', 'Blu-Ray', 'BDRip', 'BRRip', 'HDTV', 'WEB'])('%s identifies a digital source', (tag) => {
    expect(classify({ description: `Example.2026.1080p.${tag}.x265.mkv` }).kind).toBe('digital');
});

test.each(['1080p', '2160p.x265.HDR', '4K.REMUX', 'HD', 'DVD', 'DVDRip', 'DVDSCR', 'TC', 'HDTC', 'TELECINE', 'R5', 'WORKPRINT', 'SDTV', 'WEB-DL.480p', 'BluRay.576p'])('%s does not establish an HD digital or camera source', (tag) => {
    expect(classify({ description: `Example.2026.${tag}.mkv` }).kind).toBe('unknown');
});

test('camera and uncertain source claims take precedence over digital claims', () => {
    expect(classify({ name: 'WEB-DL 1080p', behaviorHints: { filename: 'Example.2026.HDCAM.mkv' } }).kind).toBe('camera');
    expect(classify({ name: 'BluRay', description: 'Example.2026.TC.mkv' }).kind).toBe('unknown');
});

test('reads serialized filename and multiline addon quality without mutating input', () => {
    const stream = Object.freeze({ behaviorHints: Object.freeze({ filename: 'Example.2026.BDRip.mkv' }), deepLinks: Object.freeze({ player: '#/player/unchanged' }) });
    expect(classify(stream).kind).toBe('digital');
    expect(stream.deepLinks.player).toBe('#/player/unchanged');
    expect(classify({ name: 'Addon\nHDTS', description: 'Example' }).kind).toBe('camera');
    expect(classify({ deepLinks: { externalPlayer: { fileName: 'Example.2026.WEB-DL.mkv' } } }).kind).toBe('digital');
});

test.each(['Cam.2018.1080p.mkv', 'The.Web.2026.1080p.mkv', 'Scam.2026.1080p.mkv', 'Example.2026.1080p.ts', 'Example.2026.1080p.m2ts'])('does not mistake titles, substrings or transport-stream extensions for a source: %s', (description) => {
    expect(classify({ description }).kind).toBe('unknown');
});

test('ignores tracker and language metadata after the release line', () => {
    expect(classify({ description: 'Example.2026.WEB-DL.1080p\nTracker CAM / TS' }).kind).toBe('digital');
});

test('external analysis/discussion links and YouTube are not classified as film sources', () => {
    expect(classify({ externalUrl: 'https://example.test/discussion', description: 'HDCAM WEB-DL' })).toBeNull();
    expect(classify({ ytId: 'test', name: 'WEB-DL' })).toBeNull();
});

test.each([{}, { name: null, description: 42 }, { behaviorHints: { filename: null } }])('handles absent and malformed addon fields: %j', (stream) => {
    expect(classify(stream)).toEqual({ kind: 'unknown', source: null });
});
