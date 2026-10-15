const { createWorker } = require('../../.worker-tests/index.js');
const { personImage } = require('../../src/components/MetaPreview/MetaLinks/people');
const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const identity = { movie_results: [{ id: 603 }], tv_results: [] };
const credits = { id: 603, cast: [{ id: 1, name: 'Keanu Reeves', original_name: 'Keanu Reeves', profile_path: '/actor.jpg' }], crew: [{ id: 2, name: 'Lana Wachowski', job: 'Director', profile_path: '/director.jpg' }, { id: 3, name: 'Writer', job: 'Writer', profile_path: '/writer.jpg' }] };
const env = { BILINGUAL_METADATA_ENABLED: 'true', TMDB_READ_TOKEN: 'fake' };
const request = (query = 'type=movie&id=tt0133093&zh=zh-CN') => new Request(`https://test/api/bilingual/v1/people?${query}`);

test('credits are title scoped, sanitized, cached and retain role distinctions', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json(credits));
    const worker = createWorker({ fetch });
    const response = await worker(request(), env);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.people).toHaveLength(2);
    expect(personImage(result.people, ' Keanu  Reeves ', 'Cast')).toBe('https://image.tmdb.org/t/p/w45/actor.jpg');
    expect(personImage(result.people, 'Keanu Reeves', 'Directors')).toBeNull();
    expect(personImage(result.people, 'Lana Wachowski', 'Directors')).toContain('/director.jpg');
    expect(fetch.mock.calls[1][0]).toContain('/movie/603/credits');
    expect((await worker(request(), env)).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('fake');
});

test('ambiguous titles do not request or expose people', async () => {
    const fetch = jest.fn().mockResolvedValue(json({ movie_results: [{ id: 1 }, { id: 2 }] }));
    const result = await (await createWorker({ fetch })(request(), env)).json();
    expect(result.matchStatus).toBe('ambiguous');
    expect(result.people).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
});

test('invalid query, disabled feature and missing secret fail before any upstream fetch', async () => {
    const fetch = jest.fn();
    const worker = createWorker({ fetch });
    expect((await worker(request('type=movie&id=../x&zh=zh-CN'), env)).status).toBe(400);
    expect((await worker(request(), { ...env, TMDB_READ_TOKEN: '' })).status).toBe(503);
    expect((await worker(request(), { ...env, BILINGUAL_METADATA_ENABLED: 'false' })).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
});

test('wrong title identity is rejected and unsafe image paths never leave server', async () => {
    let fetch = jest.fn().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({ ...credits, id: 999 }));
    expect((await createWorker({ fetch })(request(), env)).status).toBe(502);
    fetch = jest.fn().mockResolvedValueOnce(json(identity)).mockResolvedValueOnce(json({ ...credits, cast: [{ id: 1, name: 'Actor', profile_path: '/../secret.jpg' }] }));
    const result = await (await createWorker({ fetch })(request(), env)).json();
    expect(result.people[0].image).toBeNull();
});

test('ambiguous names, missing photos, arbitrary hosts and unrelated people never match', () => {
    const people = [{ id: 1, role: 'cast', names: ['Name'], image: 'https://image.tmdb.org/t/p/w45/a.jpg' }];
    expect(personImage([...people, { ...people[0], id: 2 }], 'Name', 'Cast')).toBeNull();
    expect(personImage(people, 'Other', 'Cast')).toBeNull();
    expect(personImage([{ ...people[0], image: 'https://evil.test/a.jpg' }], 'Name', 'Cast')).toBeNull();
    expect(personImage([{ ...people[0], image: null }], 'Name', 'Cast')).toBeNull();
});
