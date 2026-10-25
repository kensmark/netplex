import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parseDesign,
  themePackage,
  layoutPackage,
  applyDesignFile,
  validateDesignFile,
  parseDesignFile,
} from '../public/design/core.js';
import { openThemeStore } from '../server/theme-store.js';
import { createApp } from '../server/app.js';
const preset = async (name) =>
  parseDesign(await readFile(new URL(`../designs/${name}.json`, import.meta.url), 'utf8'));
test('theme and layout files apply independently without replacing lists, filters or appearance', async () => {
  const current = await preset('premiere'),
    other = await preset('obsidian');
  current.pages.home.children.push({
    id: 'personal',
    type: 'collection',
    title: 'My director',
    layout: 'row',
    empty: 'hide',
    query: { source: 'library', filter: { directors: ['Only my director'] } },
  });
  const theme = themePackage(other),
    layout = layoutPackage(other);
  const themed = applyDesignFile(current, theme);
  assert.deepEqual(themed.pages, current.pages);
  assert.deepEqual(themed.library, current.library);
  assert.deepEqual(themed.navigation.items, current.navigation.items);
  assert.deepEqual(themed.cards, other.cards);
  assert.deepEqual(themed.theme, other.theme);
  assert.equal(themed.navigation.position, 'left');
  const arranged = applyDesignFile(current, layout);
  assert.deepEqual(arranged.theme, current.theme);
  assert.deepEqual(arranged.cards, current.cards);
  assert.equal(arranged.navigation.position, current.navigation.position);
  assert.deepEqual(arranged.pages, other.pages);
  assert.equal(parseDesignFile(JSON.stringify(theme)).format, 'netplex.theme');
  assert.throws(() => validateDesignFile({ ...theme, pages: current.pages }), /temafil/);
  assert.throws(() => validateDesignFile({ ...layout, theme: current.theme }), /layoutfil/);
  assert.throws(() => validateDesignFile({ ...theme, token: 'secret' }), /temafil/);
  assert.throws(() => parseDesignFile(' '.repeat(65537)), /64 KB/);
  layout.pages.home.children.push(structuredClone(layout.pages.home.children[0]));
  assert.throws(() => validateDesignFile(layout), /unikt/);
});
test('sections support asymmetry, independent vertical flow and poster columns', async () => {
  const design = await preset('obsidian');
  const section = design.pages.home.children.find((n) => n.type === 'container');
  section.layout = 'masonry';
  section.surface = 'panel';
  section.ratio = 'wide-right';
  section.children[0].layout = 'column';
  assert.equal(
    parseDesignFile(JSON.stringify(design)).pages.home.children.find((n) => n.type === 'container')
      .layout,
    'masonry',
  );
  section.ratio = 'arbitrary-css';
  assert.throws(() => validateDesignFile(design), /Ugyldigt/);
});
test('personal theme library persists separately, serializes changes and preserves corrupt files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'netplex-themes-')),
    store = openThemeStore(directory),
    theme = themePackage(await preset('premiere'));
  await writeFile(join(directory, 'settings.json'), 'private fixture settings');
  await writeFile(join(directory, 'design.json'), 'existing user design');
  const entries = await Promise.all([store.save(theme), store.save({ ...theme, name: 'Second' })]);
  assert.equal((await openThemeStore(directory).read()).length, 2);
  await store.remove(entries[0].id);
  assert.equal((await store.read())[0].theme.name, 'Second');
  assert.equal(await readFile(join(directory, 'design.json'), 'utf8'), 'existing user design');
  assert.equal(
    await readFile(join(directory, 'settings.json'), 'utf8'),
    'private fixture settings',
  );
  await assert.rejects(store.save({ ...theme, pages: {} }));
  await writeFile(join(directory, 'themes.json'), 'broken');
  await assert.rejects(store.save(theme));
  assert.equal(await readFile(join(directory, 'themes.json'), 'utf8'), 'broken');
});
test('theme API enforces local session, CSRF and schema without modifying the active design', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'netplex-themes-api-')),
    app = await createApp({ dataDir: directory });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  try {
    assert.equal((await fetch(origin + '/api/themes')).status, 401);
    const status = await fetch(origin + '/api/status'),
      cookie = status.headers.get('set-cookie').split(';')[0],
      csrf = (await status.json()).csrf;
    const call = (path, method = 'GET', body, token = csrf) =>
      fetch(origin + path, {
        method,
        headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-NetPlex-CSRF': token },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const theme = themePackage(await preset('obsidian'));
    assert.equal((await call('/api/themes', 'POST', { theme }, 'bad')).status, 403);
    assert.equal(
      (await call('/api/themes', 'POST', { theme: { ...theme, css: 'bad' } })).status,
      400,
    );
    const entry = await (await call('/api/themes', 'POST', { theme })).json();
    assert.ok(entry.id);
    assert.equal((await (await call('/api/themes')).json()).themes.length, 1);
    assert.equal((await (await call('/api/design')).json()).design.name, 'Premiere');
    assert.equal((await call(`/api/themes/${entry.id}`, 'DELETE')).status, 200);
    assert.equal((await (await call('/api/themes')).json()).themes.length, 0);
  } finally {
    await app.close();
  }
});
