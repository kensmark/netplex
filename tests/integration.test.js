import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, unlink, rmdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createApp } from '../server/app.js';
import { createPlexFixture } from './fixture.js';
import { createPlayback, rewritePlaylist, serverUrl } from '../server/plex.js';
import { request as httpRequest } from 'node:http';

let app, plex, origin, cookie, csrf, dataDir;
before(async () => {
  const testRoot = resolve('test-results'); await mkdir(testRoot, { recursive: true });
  dataDir = await mkdtemp(join(testRoot, 'integration-'));
  plex = await createPlexFixture();
  app = await createApp({ dataDir, cloudUrl: plex.url });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(`${origin}/api/status`); cookie = response.headers.get('set-cookie').split(';')[0]; csrf = (await response.json()).csrf;
});
after(async () => { await app?.close(); await plex?.close(); if (dataDir) { for (const name of ['settings.json', 'settings.tmp']) await unlink(join(dataDir, name)).catch(() => {}); await rmdir(dataDir); } });
async function request(path, { body, headers = {}, ...options } = {}) {
  return fetch(origin + path, { ...options, headers: { Cookie: cookie, ...(body !== undefined ? { 'Content-Type': 'application/json', 'X-NetPlex-CSRF': csrf } : {}), ...headers }, ...(body !== undefined ? { method: 'POST', body: JSON.stringify(body) } : {}) });
}
const json = async (path, options) => { const res = await request(path, options); assert.equal(res.status, 200, await res.clone().text()); return res.json(); };
// Fetch supplies its own Sec-Fetch-Mode. Raw HTTP lets the regression test send
// the exact navigation headers that a real browser returns from Plex with.
function navigationRequest(path, { headers, method = 'GET', body } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(new URL(path, origin), { method, headers }, res => {
      let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
}

test('requires a connection and rejects requests from another website', async () => {
  assert.equal((await request('/api/home')).status, 409);
  assert.equal((await request('/api/status', { headers: { Origin: 'https://unrelated.example' } })).status, 403);
  assert.equal((await request('/api/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' } })).status, 403);
  assert.equal((await fetch(origin + '/api/library')).status, 401);
  assert.throws(() => serverUrl('file:///etc/passwd'));
  assert.throws(() => serverUrl('https://user:pass@example.com'));
});
test('allows the Plex return document while protecting APIs and embedded requests', async () => {
  const navigation = { 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  // A top-level redirect may arrive without the SameSite=Strict session cookie.
  const callback = await navigationRequest('/?plex=return', { headers: navigation });
  assert.equal(callback.status, 200);
  assert.match(callback.headers['content-type'], /text\/html/);
  assert.match(callback.text, /NetPlex/);
  const navigationWithOrigin = await navigationRequest('/?plex=return', { headers: { ...navigation, Origin: 'https://app.plex.tv' } });
  assert.equal(navigationWithOrigin.status, 200);
  assert.equal((await navigationRequest('/api/status', { headers: { ...navigation, Cookie: cookie } })).status, 403);
  const mutation = { method: 'POST', body: '{}', headers: { ...navigation, Cookie: cookie, 'X-NetPlex-CSRF': csrf, 'Content-Type': 'application/json' } };
  assert.equal((await navigationRequest('/api/auth/start', mutation)).status, 403);
  assert.equal((await navigationRequest('/?plex=return', mutation)).status, 403);
  assert.equal((await navigationRequest('/?plex=return', { headers: { ...navigation, 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Dest': 'empty' } })).status, 403);
  assert.equal((await navigationRequest('/?plex=return', { headers: { ...navigation, 'Sec-Fetch-Dest': 'iframe' } })).status, 403);
});
test('connects only after validating the token and returns no credentials', async () => {
  assert.equal((await request('/api/connect', { body: { url: plex.url, token: 'invalid' } })).status, 403);
  const result = await json('/api/connect', { body: { url: plex.url, token: 'fixture-token-only' } });
  assert.equal(result.name, 'Test Plex');
  const status = await json('/api/status'); assert.equal(status.connected, true);
  assert.ok(!JSON.stringify(status).includes('fixture-token-only'));
  assert.ok((await readFile(join(dataDir, 'settings.json'), 'utf8')).includes('fixture-token-only'));
});
test('loads every page, filters and searches Plex metadata without leaking paths', async () => {
  const first = await json('/api/library?type=movie&size=60'); assert.equal(first.total, 205); assert.equal(first.items.length, 60);
  const last = await json('/api/library?type=movie&start=200'); assert.equal(last.items.length, 5);
  assert.ok(plex.requests.some(r => r.path === '/library/sections/1/all' && r.query['X-Plex-Container-Start'] === '200'));
  assert.ok(!JSON.stringify(first).includes('secret-storage'));
  assert.ok(!JSON.stringify(first).includes('fixture-token-only'));
  const search = await json('/api/library?type=movie&q=Testinstrukt%C3%B8r'); assert.equal(search.total, 205);
  const filtered = await json('/api/library?type=movie&genre=Drama&resolution=4k'); assert.ok(filtered.items.every(i => i.genres.includes('Drama') && i.resolution === '4k'));
  const shows = await json('/api/library?type=show'); assert.equal(shows.items[0].title, 'Signal Station');
});
test('loads continue watching, seasons, episodes and sanitized stream choices', async () => {
  const home = await json('/api/home'); assert.equal(home.continuing.length, 2); assert.equal(home.featured.id, '1');
  const detail = await json('/api/items/1'); assert.equal(detail.media[0].audio.length, 2); assert.equal(detail.media[0].subtitles[0].id, '20');
  const seasons = await json('/api/items/10000/children'); assert.equal(seasons.items[0].id, '10001');
  const episodes = await json('/api/items/10001/children'); assert.equal(episodes.items[0].type, 'episode');
});
test('persists a server-specific list and sends watched state to Plex', async () => {
  await json('/api/items/1/saved', { body: { saved: true } });
  const saved = await json('/api/library?saved=1'); assert.equal(saved.total, 1); assert.equal(saved.items[0].id, '1');
  const disk = JSON.parse(await readFile(join(dataDir, 'settings.json'), 'utf8')); assert.deepEqual(Object.values(disk.lists), [['1']]);
  await json('/api/items/1/watched', { body: { watched: true } });
  assert.ok(plex.requests.some(r => r.path === '/:/scrobble' && r.query.key === '1'));
  assert.equal((await json('/api/items/1')).item.watched, true);
  await json('/api/items/1/watched', { body: { watched: false } });
});
test('streams direct video with byte ranges and reports/stops playback', async () => {
  const playback = await json('/api/playback', { body: { id: '1', quality: 'original', directSupported: true, subtitle: '0' } });
  assert.equal(playback.mode, 'direct'); assert.ok(!playback.source.includes('Token'));
  const video = await request(playback.source, { headers: { Range: 'bytes=2-7' } });
  assert.equal(video.status, 206); assert.equal(await video.text(), '234567'); assert.ok(video.headers.get('content-range').startsWith('bytes 2-7/'));
  await json(`/api/playback/${playback.id}/timeline`, { body: { state: 'paused', time: 2200 } });
  const timeline = plex.requests.findLast(r => r.path === '/:/timeline'); assert.equal(timeline.query.time, '2200'); assert.equal(timeline.query.duration, '5000');
  await json(`/api/playback/${playback.id}/stop`, { body: { time: 2500 } });
  assert.equal(plex.requests.findLast(r => r.path === '/:/timeline').query.time, '2500');
  assert.equal((await request(playback.source)).status, 410);
});
test('keeps manual users lists separate on the same Plex server', async () => {
  await json('/api/connect', { body: { url: plex.url, token: 'fixture-second-user' } });
  assert.equal((await json('/api/library?saved=1')).total, 0);
  await json('/api/connect', { body: { url: plex.url, token: 'fixture-token-only' } });
  assert.equal((await json('/api/library?saved=1')).total, 1);
});
test('rewrites nested HLS playlists, keys and segments without exposing tokens', async () => {
  const playback = await json('/api/playback', { body: { id: '2', quality: '720', subtitle: '20', audio: '12' } });
  assert.equal(playback.mode, 'hls');
  const master = await (await request(playback.source)).text(); assert.ok(!master.includes('Token')); assert.ok(!master.includes('http:'));
  const child = master.split('\n').find(line => line.startsWith('/api/'));
  const playlist = await (await request(child)).text(); assert.ok(!playlist.includes('secret')); assert.ok(!playlist.includes('Token'));
  const segment = playlist.split('\n').find(line => line.startsWith('/api/'));
  assert.equal(await (await request(segment)).text(), 'fixture-segment');
  const key = playlist.match(/URI="([^"]+)"/)[1]; assert.equal(await (await request(key)).text(), 'fixture-segment');
  assert.ok(plex.requests.some(r => r.method === 'PUT' && r.query.subtitleStreamID === '20' && r.query.audioStreamID === '12'));
  await json(`/api/playback/${playback.id}/stop`, { body: {} });
  assert.ok(plex.requests.some(r => r.path.endsWith('/stop') && r.query.session === playback.id));
});
test('rejects foreign streaming destinations and invalid stream IDs', () => {
  const session = createPlayback(plex.movies[0], { url: plex.url, token: 'fixture-token-only' }, 'test-client', { quality: 'auto' });
  assert.throws(() => rewritePlaylist('#EXTM3U\nhttps://foreign.example/steal.ts', session, plex.url));
  assert.throws(() => rewritePlaylist('#EXTM3U\n/file-outside-streaming', session, plex.url));
  assert.throws(() => createPlayback(plex.movies[0], { url: plex.url, token: 'fixture-token-only' }, 'test', { subtitle: '999' }));
});
test('preserves HEVC Main 10 video on a remux-only server when the browser supports it', async () => {
  const original = structuredClone(plex.movies[1]);
  try {
    const media = plex.movies[1].Media[0];
    Object.assign(media, { videoCodec: 'hevc', videoProfile: 'main 10', audioCodec: 'eac3', videoResolution: '4k', bitrate: 25000, requiredBandwidths: '70000,65000' });
    media.Part[0].Stream.unshift({ id: '10', streamType: 1, codec: 'hevc', bitDepth: 10 });
    plex.controls.remuxOnly = true;
    const playback = await json('/api/playback', { body: { id: '2', quality: 'original', subtitle: '0', capabilities: { hevc: true, hevcMain10: true, eac3: false } } });
    assert.equal(playback.videoDecision, 'copy');
    const decision = plex.requests.findLast(r => r.path.endsWith('/decision'));
    assert.equal(decision.query.directStream, '1'); assert.equal(decision.query.container, 'mp4');
    assert.ok(Number(decision.query.maxVideoBitrate) >= 70000);
    assert.ok(decision.query['X-Plex-Client-Profile-Extra'].includes('videoCodec=h264,hevc'));
    assert.ok(!decision.query['X-Plex-Client-Profile-Extra'].includes('audioCodec=aac,eac3'));
    await json(`/api/playback/${playback.id}/stop`, { body: {} });
    const automatic = await json('/api/playback', { body: { id: '2', quality: 'auto', subtitle: '0', capabilities: { hevcMain10: true } } });
    assert.equal(automatic.videoDecision, 'copy');
    const autoDecision = plex.requests.findLast(r => r.path.endsWith('/decision'));
    assert.ok(Number(autoDecision.query.maxVideoBitrate) >= 70000);
    assert.equal(autoDecision.query.videoResolution, '4096x2160');
    await json(`/api/playback/${automatic.id}/stop`, { body: {} });
    const manual = await request('/api/playback', { body: { id: '2', quality: '720', subtitle: '0', capabilities: { hevcMain10: true } } });
    assert.equal(manual.status, 409, 'An explicit quality limit still requires conversion');
    const manifestCount = plex.requests.filter(r => r.path.endsWith('/start.m3u8')).length;
    const unsupported = await request('/api/playback', { body: { id: '2', quality: 'original', subtitle: '0', capabilities: { hevc: false, hevcMain10: false } } });
    assert.equal(unsupported.status, 409);
    const error = await unsupported.json(); assert.equal(error.code, 'PLEX_VIDEO_CONVERSION_UNAVAILABLE');
    assert.match(error.error, /slået fra/); assert.match(error.error, /HEVC/);
    assert.equal(plex.requests.filter(r => r.path.endsWith('/start.m3u8')).length, manifestCount);
  } finally { Object.assign(plex.movies[1], original); plex.controls.remuxOnly = false; }
});

test('automatic prefers direct play and a failed direct file can be remuxed without lowering quality', async () => {
  const automatic = await json('/api/playback', { body: { id: '1', quality: 'auto', directSupported: true, subtitle: '0' } });
  assert.equal(automatic.mode, 'direct');
  await json(`/api/playback/${automatic.id}/stop`, { body: {} });
  const fallback = await json('/api/playback', { body: { id: '1', quality: 'original', directSupported: true, forceRemux: true, subtitle: '0' } });
  assert.equal(fallback.mode, 'hls');
  assert.equal(fallback.videoDecision, 'copy');
  const decision = plex.requests.findLast(r => r.path.endsWith('/decision'));
  assert.equal(decision.query.videoResolution, '4096x2160');
  assert.ok(Number(decision.query.maxVideoBitrate) >= 1000000);
  await json(`/api/playback/${fallback.id}/stop`, { body: {} });
});
test('retains upstream streaming failures so the player can show the real HTTP error', async () => {
  const playback = await json('/api/playback', { body: { id: '2', quality: '720', subtitle: '0' } });
  try {
    plex.controls.manifestStatus = 400;
    const response = await request(playback.source); assert.equal(response.status, 502);
    const status = await json(`/api/playback/${playback.id}/status`);
    assert.match(status.error, /HTTP 400/); assert.ok(!status.error.includes('fixture-token-only'));
  } finally { plex.controls.manifestStatus = 200; await json(`/api/playback/${playback.id}/stop`, { body: {} }); }
});
test('completes Plex PIN login, discovers a shared server and clears stored tokens on disconnect', async () => {
  const pin = await json('/api/auth/start', { body: {} }); assert.equal(pin.id, '123'); assert.ok(pin.url.startsWith('https://app.plex.tv/auth#?'));
  const result = await json(`/api/auth/${pin.id}`, { body: {} }); assert.equal(result.pending, false);
  const servers = await json('/api/servers'); assert.equal(servers.servers[0].owned, false); assert.ok(!JSON.stringify(servers).includes('accessToken'));
  await json('/api/servers/select', { body: { id: 'fixture-pms' } });
  assert.equal((await json('/api/status')).account.name, 'Testbruger');
  await json('/api/disconnect', { body: {} });
  const disk = await readFile(join(dataDir, 'settings.json'), 'utf8'); assert.ok(!disk.includes('fixture-token-only')); assert.ok(!disk.includes('fixture-account-token'));
  assert.equal((await json('/api/status')).connected, false);
});
