import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseDesign,
  validateDesign,
  resolveCollections,
  queryItems,
  catalogFacets,
  CARD_SIZES,
  cardSizeIndex,
  fitCardColumns,
} from '../public/design/core.js';
import { openDesignStore } from '../server/design-store.js';
import { createApp } from '../server/app.js';
import { createPlexFixture } from './fixture.js';
const preset = async (name) =>
  parseDesign(await readFile(new URL(`../designs/${name}.json`, import.meta.url), 'utf8'));

test('card size steps fit whole columns and accept existing pixel preferences', () => {
  assert.equal(CARD_SIZES[cardSizeIndex(175)].width, 180);
  assert.equal(CARD_SIZES[cardSizeIndex(100)].width, 100);
  assert.equal(CARD_SIZES[cardSizeIndex(520)].width, 520);
  assert.equal(fitCardColumns(0, 24, 180), 1);
  assert.equal(fitCardColumns(80, 24, 520), 1);
  assert.equal(fitCardColumns(1200, 24, 175), 6);
  assert.equal(fitCardColumns(1200, 24, 520), 2);
  for (const available of [300, 850, 1200, 1800])
    for (const { width } of CARD_SIZES) {
      const columns = fitCardColumns(available, 24, width);
      const actual = (available - (columns - 1) * 24) / columns;
      assert.ok(actual > 0);
      assert.ok(Math.abs(actual * columns + (columns - 1) * 24 - available) < 0.001);
    }
});

test('all supplied designs follow the published schema and have unique module IDs', async () => {
  for (const name of ['premiere', 'obsidian', 'archive'])
    assert.equal((await preset(name)).formatVersion, 2);
});
test('v1 designs upgrade to shared cards without losing layout or category rules', async () => {
  const old = JSON.parse(
    await readFile(new URL('./fixtures/design-v1.json', import.meta.url), 'utf8'),
  );
  old.pages.home.children[1].card = structuredClone(old.cards.continuing);
  const upgraded = validateDesign(old);
  assert.equal(upgraded.formatVersion, 2);
  assert.deepEqual(Object.keys(upgraded.cards), ['shared']);
  assert.equal(upgraded.cards.shared.presentation, 'overlay');
  assert.ok(!('radius' in upgraded.theme));
  assert.ok(!('contentWidth' in upgraded.theme));
  assert.deepEqual(
    upgraded.pages.home.children.map((node) => node.id),
    old.pages.home.children.map((node) => node.id),
  );
  assert.deepEqual(upgraded.pages.home.children[0].query.filter.types, ['movie']);
  assert.ok(!('card' in upgraded.pages.home.children[1]));
  assert.throws(() => validateDesign({ ...old, script: 'forbidden' }), /Ugyldigt/);
});
test('metadata choices come from the catalog and multi-select rules use OR within each list', () => {
  const rows = [
    {
      id: '1',
      type: 'movie',
      title: 'One',
      genres: ['Drama'],
      directors: ['Greta Gerwig'],
      cast: [{ name: 'Florence Pugh' }],
      year: 2020,
      summary: '',
      addedAt: 1,
      rating: 8,
      duration: 5000000,
      resolution: '1080',
    },
    {
      id: '2',
      type: 'movie',
      title: 'Two',
      genres: ['Science fiction'],
      directors: ['Denis Villeneuve'],
      cast: [{ name: 'Oscar Isaac' }],
      year: 2021,
      summary: '',
      addedAt: 2,
      rating: 8,
      duration: 5000000,
      resolution: '1080',
    },
    {
      id: '3',
      type: 'show',
      title: 'Three',
      genres: ['Drama'],
      directors: ['Greta Gerwig'],
      cast: [{ name: 'Oscar Isaac' }],
      year: 2022,
      summary: '',
      addedAt: 3,
      rating: 8,
      duration: 0,
      resolution: '1080',
    },
  ];
  const facets = catalogFacets(rows);
  assert.deepEqual(facets.directors, ['Denis Villeneuve', 'Greta Gerwig']);
  assert.ok(!facets.directors.includes('Quentin Tarantino'));
  assert.deepEqual(
    queryItems(rows, {
      source: 'library',
      filter: {
        types: ['movie'],
        genres: ['Drama', 'Science fiction'],
        directors: ['Greta Gerwig', 'Denis Villeneuve'],
        actors: ['Florence Pugh', 'Oscar Isaac'],
      },
    }).items.map((item) => item.id),
    ['1', '2'],
  );
  assert.deepEqual(
    queryItems(rows, {
      source: 'library',
      filter: {
        genres: ['Drama', 'Science fiction'],
        directors: ['Greta Gerwig'],
        actors: ['Florence Pugh'],
      },
    }).items.map((item) => item.id),
    ['1'],
  );
});
test('design import rejects executable fields, external styles, credentials and unsupported versions', async () => {
  const original = await preset('premiere');
  for (const extra of [
    { connection: { token: 'must-not-share' } },
    { css: 'body {display:none}' },
    { script: 'alert(1)' },
    { formatVersion: 99 },
  ])
    assert.throws(() => validateDesign({ ...structuredClone(original), ...extra }));
  const duplicate = structuredClone(original);
  duplicate.pages.home.children[1].id = duplicate.pages.home.children[0].id;
  assert.throws(() => validateDesign(duplicate), /unikt/);
  const unknown = structuredClone(original);
  unknown.cards.shared.template.children.push({ type: 'html', html: '<script>alert(1)</script>' });
  assert.throws(() => validateDesign(unknown), /Ugyldigt/);
  assert.throws(() => parseDesign('{oops'), /syntaks/);
  assert.throws(() => parseDesign(' '.repeat(65537)), /64 KB/);
  const deep = structuredClone(original);
  let current = deep.pages.home;
  for (let i = 0; i < 30; i++) {
    const child = { id: `deep-${i}`, type: 'container', layout: 'stack', children: [] };
    current.children = [child];
    current = child;
  }
  assert.throws(() => validateDesign(deep), /komplekst|niveauer/);
});
test('portable categories combine metadata filters and exclude missing years from classics', async () => {
  const rows = [
    {
      id: '1',
      type: 'movie',
      title: 'A',
      year: 1984,
      rating: 8.2,
      genres: ['Drama'],
      watched: false,
      duration: 5400000,
      resolution: '4k',
      addedAt: 3,
      summary: '',
    },
    {
      id: '2',
      type: 'movie',
      title: 'B',
      year: 1990,
      rating: 8.8,
      genres: ['Drama'],
      watched: false,
      duration: 8000000,
      resolution: '1080',
      addedAt: 2,
      summary: '',
    },
    {
      id: '3',
      type: 'movie',
      title: 'C',
      year: 0,
      rating: 9,
      genres: ['Drama'],
      watched: false,
      duration: 5000000,
      resolution: '4k',
      addedAt: 1,
      summary: '',
    },
  ];
  assert.deepEqual(
    queryItems(rows, {
      source: 'library',
      filter: { year: { lt: 1990 }, genres: ['drama'], unwatched: true, ratingMin: 8 },
      sort: 'rating',
    }).items.map((item) => item.id),
    ['1'],
  );
  assert.equal(queryItems(rows, { source: 'saved' }, ['2']).items[0].id, '2');
  const design = await preset('archive');
  const result = resolveCollections(design, { items: rows, continuing: [rows[1]], saved: ['2'] });
  assert.equal(result.classics.total, 1);
  assert.equal(result.classics.items[0].id, '1');
});
test('design persistence is separate from Plex credentials, atomic and recoverable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'netplex-design-')),
    store = await openDesignStore(directory);
  const settings = '{"connection":{"token":"fixture-private-token"}}';
  await writeFile(join(directory, 'settings.json'), settings);
  assert.equal((await store.read()).design.name, 'Premiere');
  await store.save(await preset('obsidian'));
  await store.save(await preset('archive'));
  assert.equal((await store.read()).design.name, 'Archive');
  assert.equal(
    JSON.parse(await readFile(join(directory, 'design.backup.json'), 'utf8')).name,
    'Obsidian',
  );
  await assert.rejects(store.save({ ...(await preset('premiere')), formatVersion: 100 }));
  assert.equal((await store.read()).design.name, 'Archive');
  await writeFile(join(directory, 'design.json'), 'broken');
  assert.equal((await store.read()).design.name, 'Premiere');
  assert.ok((await store.read()).recovery);
  assert.equal(await readFile(join(directory, 'settings.json'), 'utf8'), settings);
  assert.equal(await readFile(join(directory, 'design.json'), 'utf8'), 'broken');
});
test('design APIs validate imports, preserve local auth, and resolve categories across every Plex page', async () => {
  const fixture = await createPlexFixture();
  fixture.movies[204].year = 1984;
  fixture.movies[204].Director = [{ tag: 'Director from page two' }];
  fixture.movies[204].Role = Array.from({ length: 12 }, (_, index) => ({
    tag: `Late actor ${index}`,
  }));
  const directory = await mkdtemp(join(tmpdir(), 'netplex-design-api-')),
    app = await createApp({ dataDir: directory });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    let response = await fetch(origin + '/api/status');
    const cookie = response.headers.get('set-cookie').split(';')[0],
      csrf = (await response.json()).csrf;
    const call = (path, body, headers = {}) =>
      fetch(origin + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'X-NetPlex-CSRF': csrf,
          ...headers,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    assert.equal((await fetch(origin + '/api/design')).status, 401);
    assert.equal((await (await call('/api/design')).json()).design.name, 'Premiere');
    assert.equal(
      (await call('/api/design', { design: await preset('archive') }, { 'X-NetPlex-CSRF': 'bad' }))
        .status,
      403,
    );
    assert.equal(
      (await call('/api/design', { design: { ...(await preset('archive')), script: 'forbidden' } }))
        .status,
      400,
    );
    assert.equal((await call('/api/design', { design: await preset('archive') })).status, 200);
    assert.equal((await (await call('/api/design')).json()).design.name, 'Archive');
    assert.ok(
      !(await readdir(directory)).includes('settings.json'),
      'Saving a design must not write Plex account settings',
    );
    await call('/api/connect', { url: fixture.url, token: 'fixture-token-only' });
    const facets = await (await call('/api/design/catalog')).json();
    assert.ok(facets.directors.includes('Director from page two'));
    assert.ok(facets.actors.includes('Late actor 11'));
    assert.ok(!facets.directors.includes('Quentin Tarantino'));
    const filtered = await (
      await call(
        '/api/library?genreAny=Drama&genreAny=Science%20fiction&director=Director%20from%20page%20two&actor=Late%20actor%2011',
      )
    ).json();
    assert.equal(filtered.total, 1);
    assert.equal(filtered.items[0].id, '205');
    const result = await (
      await call('/api/design/collections', { design: await preset('archive') })
    ).json();
    assert.equal(result.collections.classics.total, 1);
    assert.equal(result.collections.classics.items[0].id, '205');
    assert.ok(!JSON.stringify(result).includes('fixture-token-only'));
    assert.equal(
      (
        await call('/api/design/collections', {
          design: { ...(await preset('archive')), formatVersion: 999 },
        })
      ).status,
      400,
    );
  } finally {
    await app.close();
    await fixture.close();
  }
});
