import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.js';
import { createPlexFixture } from './fixture.js';
import { identityKeys } from '../server/catalog.js';
async function setup() {
  const a = await createPlexFixture({
      movieCount: 3,
      machineId: 'alpha',
      friendlyName: 'Alpha',
      video: Buffer.from('ALPHA-VIDEO'),
    }),
    b = await createPlexFixture({
      movieCount: 3,
      machineId: 'beta',
      friendlyName: 'Beta',
      video: Buffer.from('BETA-VIDEO'),
    }),
    cloud = await createPlexFixture({ movieCount: 0 });
  a.movies[0].guid = 'plex://movie/first';
  a.movies[0].Guid = [{ id: 'tmdb://123' }];
  b.movies[0].guid = 'plex://movie/second';
  b.movies[0].Guid = [{ id: 'tmdb://123' }];
  a.movies[0].Role = [{ tag: 'Alpha actor' }];
  b.movies[0].Role = [{ tag: 'Beta actor' }];
  a.movies[0].duration = b.movies[0].duration = 3600000;
  a.movies[0].viewOffset = 300000;
  a.movies[0].lastViewedAt = 100;
  b.movies[0].viewOffset = 1200000;
  b.movies[0].lastViewedAt = 200;
  a.movies[2].guid = b.movies[2].guid = 'local://movie/not-global';
  cloud.controls.resources = [
    {
      clientIdentifier: 'alpha',
      name: 'Alpha',
      provides: 'server',
      accessToken: 'fixture-token-only',
      connections: [{ uri: a.url, local: true, protocol: 'http' }],
    },
    {
      clientIdentifier: 'beta',
      name: 'Beta',
      provides: 'server',
      accessToken: 'fixture-second-user',
      connections: [{ uri: b.url, local: true, protocol: 'http' }],
    },
  ];
  const directory = await mkdtemp(join(tmpdir(), 'netplex-multiple-'));
  await writeFile(
    join(directory, 'settings.json'),
    JSON.stringify({
      version: 1,
      clientId: 'legacy-client-id',
      connection: { url: a.url, token: 'fixture-token-only', machineId: 'alpha', name: 'Alpha' },
      account: { id: '42', name: 'Testbruger', token: 'fixture-account-token' },
      lists: { '42:alpha': ['1'] },
    }),
  );
  let app, origin, cookie, csrf;
  const start = async () => {
    app = await createApp({ dataDir: directory, cloudUrl: cloud.url, nativePlayback: true });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    origin = 'http://127.0.0.1:' + app.server.address().port;
    const status = await fetch(origin + '/api/status');
    cookie = status.headers.get('set-cookie').split(';')[0];
    csrf = (await status.json()).csrf;
  };
  await start();
  const call = (path, body, extra = {}) =>
    fetch(origin + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'X-NetPlex-CSRF': csrf,
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const json = async (path, body) => {
    const response = await call(path, body);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  return {
    a,
    b,
    cloud,
    directory,
    call,
    json,
    restart: async () => {
      await app.close();
      await start();
    },
    close: async () => {
      await app.close();
      await Promise.all([a.close(), b.close(), cloud.close()]);
    },
  };
}
test('all accessible servers are discovered and same metadata merges without colliding local IDs', async () => {
  const f = await setup();
  try {
    const library = await f.json('/api/library?type=movie');
    assert.equal(library.total, 5);
    const shared = library.items.find((item) => item.id === '1');
    assert.equal(shared.sources.length, 2);
    assert.deepEqual(
      shared.sources.map((s) => s.name),
      ['Alpha', 'Beta'],
    );
    assert.equal(shared.serverName, 'Beta');
    assert.equal(shared.progress, 1200000);
    assert.equal(
      library.items.filter((item) => item.title === 'Blue Hour').length,
      2,
      'A title/year match alone must not merge different local items',
    );
    const beta = library.items.find((item) => item.id.startsWith('s-') && item.id.endsWith('-2'));
    assert.ok(beta);
    assert.equal((await f.json('/api/items/' + beta.id)).item.serverName, 'Beta');
    const detail = await f.json('/api/items/1');
    assert.equal(detail.activeSourceId, shared.sources[1].id);
    assert.equal((await f.json('/api/items/1?source=1')).item.serverName, 'Alpha');
    assert.equal((await f.call('/api/items/1?source=' + beta.id)).status, 400);
    const facets = await f.json('/api/design/catalog');
    assert.ok(facets.actors.includes('Alpha actor') && facets.actors.includes('Beta actor'));
    const servers = await f.json('/api/servers');
    assert.equal(servers.servers.length, 2);
    assert.ok(servers.servers.every((s) => s.enabled));
    const serialized = JSON.stringify({ library, detail, servers });
    for (const secret of [
      'fixture-account-token',
      'fixture-token-only',
      'fixture-second-user',
      f.a.url,
      f.b.url,
      'secret-storage',
    ])
      assert.ok(
        !serialized.includes(secret),
        'Public catalog must not expose credentials or filesystem paths',
      );
    const stored = JSON.parse(await readFile(join(f.directory, 'settings.json'), 'utf8'));
    assert.equal(stored.clientId, 'legacy-client-id');
    assert.deepEqual(stored.lists['42:alpha'], ['1']);
  } finally {
    await f.close();
  }
});
test('disabled servers remain disabled after restart and duplicates retain legacy favorites', async () => {
  const f = await setup();
  try {
    assert.equal((await f.json('/api/library?saved=1')).total, 1);
    await f.json('/api/servers/toggle', { id: 'alpha', enabled: false });
    const betaOnly = await f.json('/api/library?type=movie');
    assert.equal(betaOnly.total, 3);
    assert.ok(betaOnly.items.every((i) => i.sources.every((s) => s.serverId === 'beta')));
    assert.equal(
      (await f.json('/api/library?saved=1')).total,
      1,
      'Existing favorites must migrate before the original server is disabled',
    );
    // The legacy Alpha favorite is recognized by content identity even with Alpha disabled.
    await f.json('/api/servers/toggle', { id: 'alpha', enabled: true });
    await f.json('/api/items/1/saved', { saved: true });
    await f.json('/api/servers/toggle', { id: 'alpha', enabled: false });
    assert.equal((await f.json('/api/library?saved=1')).total, 1);
    await f.restart();
    const servers = await f.json('/api/servers');
    assert.equal(servers.servers.find((s) => s.id === 'alpha').enabled, false);
    assert.equal((await f.json('/api/library?type=movie')).total, 3);
    await f.json('/api/servers/toggle', { id: 'beta', enabled: false });
    assert.equal((await f.json('/api/library')).total, 0);
    assert.equal((await f.json('/api/status')).connected, true);
    await f.json('/api/servers/toggle', { id: 'alpha', enabled: true });
    assert.equal((await f.json('/api/library?type=movie')).total, 3);
    assert.equal(
      (
        await f.call(
          '/api/servers/toggle',
          { id: 'alpha', enabled: false },
          { 'X-NetPlex-CSRF': 'wrong' },
        )
      ).status,
      403,
    );
    assert.equal(
      (await f.call('/api/servers/toggle', { id: 'unknown', enabled: true })).status,
      404,
    );
  } finally {
    await f.close();
  }
});
test('playback, artwork and history use the chosen source, including colliding media IDs', async () => {
  const f = await setup();
  try {
    const detail = await f.json('/api/items/1'),
      beta = detail.item.sources.find((s) => s.serverId === 'beta');
    for (const route of ['/api/native/playback', '/api/playback']) {
      const session = await f.json(route, {
        id: '1',
        sourceId: beta.id,
        mediaIndex: 0,
        quality: 'original',
        directSupported: true,
        capabilities: {},
      });
      assert.equal(session.server.id, 'beta');
      const resource = await f.call(session.source);
      assert.equal(await resource.text(), 'BETA-VIDEO');
      const before = f.a.requests.filter((r) => r.path === '/:/timeline').length;
      await f.json('/api/playback/' + session.id + '/timeline', { state: 'paused', time: 6000 });
      assert.equal(f.a.requests.filter((r) => r.path === '/:/timeline').length, before);
      assert.equal(
        f.b.requests.filter((r) => r.path === '/:/timeline').at(-1).query.ratingKey,
        '1',
      );
      await f.json('/api/playback/' + session.id + '/stop', {});
    }
    const selected = await f.json('/api/items/1?source=' + beta.id),
      before = f.a.requests.filter((r) => r.path === '/photo/:/transcode').length;
    assert.equal((await f.call(selected.item.thumb)).status, 200);
    assert.equal(f.a.requests.filter((r) => r.path === '/photo/:/transcode').length, before);
    assert.ok(
      f.b.requests.some(
        (r) => r.path === '/photo/:/transcode' && r.token === 'fixture-second-user',
      ),
    );
    await f.json('/api/servers/toggle', { id: 'beta', enabled: false });
    assert.equal((await f.call(selected.item.thumb)).status, 404);
    assert.equal((await f.call('/api/native/playback', { id: beta.id })).status, 404);
  } finally {
    await f.close();
  }
});
test('one offline server does not hide the others and a failed default copy can fall back', async () => {
  const f = await setup();
  try {
    await f.json('/api/library');
    f.b.controls.failMetadata = true;
    assert.equal((await f.json('/api/items/1')).item.serverName, 'Alpha');
    f.b.controls.failMetadata = false;
    f.b.controls.failLibrary = true;
    await f.json('/api/refresh', {});
    const library = await f.json('/api/library?type=movie');
    assert.equal(library.total, 3);
    assert.equal(library.warnings[0].id, 'beta');
    assert.ok(library.items.every((i) => i.serverId === 'alpha'));
  } finally {
    await f.close();
  }
});
test('only global metadata identities are used for matching', () => {
  assert.deepEqual(identityKeys({ type: 'movie', guid: 'local://same' }), []);
  assert.deepEqual(
    identityKeys({ type: 'movie', Guid: [{ id: 'com.plexapp.agents.imdb://tt123?lang=en' }] }),
    ['movie|imdb://tt123'],
  );
  assert.notDeepEqual(
    identityKeys({ type: 'show', guid: 'tmdb://123' }),
    identityKeys({ type: 'movie', guid: 'tmdb://123' }),
  );
});
test('server opt-outs survive logging out and back into the same Plex account', async () => {
  const f = await setup();
  try {
    await f.json('/api/library');
    await f.json('/api/servers/toggle', { id: 'beta', enabled: false });
    await f.json('/api/disconnect', {});
    await f.json('/api/auth/start', {});
    await f.json('/api/auth/123', {});
    const result = await f.json('/api/servers');
    assert.equal(result.servers.find((s) => s.id === 'beta').enabled, false);
    assert.equal((await f.json('/api/library?type=movie')).total, 3);
  } finally {
    await f.close();
  }
});
test('an existing playback keeps its original server snapshot after catalog preferences change', async () => {
  const f = await setup();
  try {
    const detail = await f.json('/api/items/1'),
      beta = detail.item.sources.find((s) => s.serverId === 'beta');
    const session = await f.json('/api/native/playback', { id: '1', sourceId: beta.id });
    await f.json('/api/servers/toggle', { id: 'beta', enabled: false });
    assert.equal(await (await f.call(session.source)).text(), 'BETA-VIDEO');
    await f.json('/api/playback/' + session.id + '/timeline', { state: 'paused', time: 4000 });
    assert.equal(f.b.requests.filter((r) => r.path === '/:/timeline').at(-1).query.ratingKey, '1');
    await f.json('/api/playback/' + session.id + '/stop', {});
  } finally {
    await f.close();
  }
});
test('shared series merge seasons and episodes while preserving a selected server', async () => {
  const f = await setup();
  try {
    f.a.show.guid = f.b.show.guid = 'plex://show/shared';
    const shows = await f.json('/api/library?type=show');
    assert.equal(shows.total, 1);
    const seasons = await f.json('/api/items/10000/children');
    assert.equal(seasons.items.length, 1);
    assert.equal(seasons.items[0].sources.length, 2);
    const episodes = await f.json('/api/items/' + seasons.items[0].id + '/children');
    assert.equal(episodes.items.length, 1);
    assert.equal(episodes.items[0].sources.length, 2);
    const betaShow = shows.items[0].sources.find((s) => s.serverId === 'beta');
    const selected = await f.json('/api/items/10000/children?source=' + betaShow.id);
    assert.equal(selected.items[0].serverId, 'beta');
    const betaEpisodes = await f.json(
      '/api/items/' +
        selected.items[0].id +
        '/children?source=' +
        selected.items[0].preferredSourceId,
    );
    assert.equal(betaEpisodes.items[0].serverId, 'beta');
    assert.equal(betaEpisodes.items[0].sources.length, 2);
  } finally {
    await f.close();
  }
});
