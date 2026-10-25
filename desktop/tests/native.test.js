import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createApp } from '../../server/app.js';
import { createPlexFixture } from '../../tests/fixture.js';
import { LocalClient } from '../local-client.js';
import { createNativePlayback } from '../../server/plex.js';

test('desktop streams original MKV/HEVC without asking Plex to transcode or changing stream preferences', async () => {
  const parent = fileURLToPath(new URL('../../test-results/', import.meta.url)); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'native-api-'));
  const fixture = await createPlexFixture({ movieCount: 2 }); let app;
  try {
    const media = fixture.movies[1].Media[0]; media.videoCodec = 'hevc'; media.audioCodec = 'eac3';
    media.Part[0].Stream.push({ streamType: 3, id: '21', index: 3, key: '/library/streams/21.srt', displayTitle: 'Dansk (SRT)', languageCode: 'dan', selected: 1 });
    fixture.controls.remuxOnly = true; fixture.controls.rejectConversion = true;
    app = await createApp({ dataDir: directory, nativePlayback: true }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const client = await new LocalClient(`http://127.0.0.1:${app.server.address().port}`).ready();
    await client.request('/api/connect', { url: fixture.url, token: 'fixture-token-only' });
    const session = await client.request('/api/native/playback', { id: '2' });
    assert.equal(session.mode, 'native');
    assert.ok(session.nativeStreams.find(s => s.external).source.startsWith(`/api/playback/${session.id}/resource/`));
    assert.ok(!JSON.stringify(session).includes('fixture-token-only')); assert.ok(!JSON.stringify(session).includes('secret-storage'));
    const denied = await fetch(client.origin + session.source); assert.equal(denied.status, 401);
    const stream = await fetch(client.origin + session.source, { headers: { Cookie: client.cookie, Range: 'bytes=2-7' } });
    assert.equal(stream.status, 206); assert.equal(await stream.text(), '234567');
    await client.request(`/api/playback/${session.id}/timeline`, { state: 'paused', time: 32100 });
    await client.request(`/api/playback/${session.id}/stop`, { time: 33000 });
    assert.equal(fixture.movies[1].viewOffset, 33000);
    assert.ok(!fixture.requests.some(r => r.path.includes('/transcode/')));
    assert.ok(!fixture.requests.some(r => r.method === 'PUT'));
    assert.equal((await fetch(client.origin + session.source, { headers: { Cookie: client.cookie } })).status, 410);
  } finally { await app?.close(); await fixture.close(); for (const name of ['settings.json', 'settings.tmp']) await unlink(join(directory, name)).catch(() => {}); await rmdir(directory); }
});

test('webapp does not enable native playback endpoints', async () => {
  const parent = fileURLToPath(new URL('../../test-results/', import.meta.url)); const directory = await mkdtemp(join(parent, 'web-native-disabled-'));
  const fixture = await createPlexFixture({ movieCount: 1 }); let app;
  try {
    app = await createApp({ dataDir: directory }); await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const client = await new LocalClient(`http://127.0.0.1:${app.server.address().port}`).ready();
    await client.request('/api/connect', { url: fixture.url, token: 'fixture-token-only' });
    await assert.rejects(client.request('/api/native/playback', { id: '1' }), /findes ikke/);
  } finally { await app?.close(); await fixture.close(); for (const name of ['settings.json', 'settings.tmp']) await unlink(join(directory, name)).catch(() => {}); await rmdir(directory); }
});

test('native sessions reject unavailable versions and multipart films instead of playing a partial film', () => {
  const connection = { url: 'http://127.0.0.1:32400', token: 'test-only' };
  assert.throws(() => createNativePlayback({ Media: [] }, connection, 'client'), /videofil/);
  assert.throws(() => createNativePlayback({ Media: [{ Part: [{ id: 1, key: '/library/parts/1/file.mkv' }, { id: 2, key: '/library/parts/2/file.mkv' }] }] }, connection, 'client'), /flere filer/);
});
