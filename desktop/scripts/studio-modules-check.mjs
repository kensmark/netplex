import electronExecutable from 'electron';
import { _electron } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createPlexFixture } from '../../tests/fixture.js';
const root = resolve(import.meta.dirname, '../..'),
  output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(output, 'studio-modules-windows-'));
const fixture = await createPlexFixture({ movieCount: 30 });
const design = JSON.parse(await readFile(join(root, 'designs/premiere.json'), 'utf8'));
const [hero, continuing, recent, series, saved] = design.pages.home.children;
design.pages.home.children = [
  hero,
  continuing,
  {
    id: 'legacy-section',
    type: 'container',
    layout: 'columns',
    columns: 2,
    ratio: 'wide-left',
    surface: 'panel',
    children: [
      recent,
      { id: 'legacy-inner', type: 'container', layout: 'masonry', columns: 2, children: [series] },
    ],
  },
  saved,
];
const original = JSON.stringify(design);
await writeFile(join(data, 'design.json'), original);
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    version: 1,
    clientId: 'modules-ui',
    connection: {
      url: fixture.url,
      token: 'fixture-token-only',
      machineId: 'fixture-pms',
      name: 'Test Plex',
    },
    account: null,
    lists: {},
  }),
);
let app;
try {
  app = await _electron.launch({
    executablePath: electronExecutable,
    args: [join(root, 'desktop/main.js')],
    env: { ...process.env, NETPLEX_DATA_DIR: data, NETPLEX_NO_IMPORT: '1' },
    timeout: 30000,
  });
  const page = await app.firstWindow(),
    errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-module=recent] .film-card').first().waitFor();
  assert.equal(
    await readFile(join(data, 'design.json'), 'utf8'),
    original,
    'Loading a legacy layout must not overwrite its saved file',
  );
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  const studio = page.getByRole('complementary', { name: 'Designstudio', exact: true });
  const row = (id) => studio.locator(`[data-tree-id="${id}"]`);
  const ids = () =>
    studio
      .locator('[data-tree-id]')
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.treeId));
  assert.deepEqual(
    await ids(),
    ['home', 'spotlight', 'continue', 'recent', 'series', 'saved'],
    'Legacy sections must flatten without losing or reordering their contents',
  );
  assert.equal(
    await studio.getByRole('combobox', { name: 'Tilføj færdig kategori', exact: true }).count(),
    0,
  );
  assert.equal(await studio.getByRole('button', { name: '+ Sektion', exact: true }).count(), 0);
  assert.equal(
    await studio.getByRole('combobox', { name: 'Sektionens opbygning', exact: true }).count(),
    0,
  );
  assert.equal(
    await studio.getByRole('combobox', { name: 'Brug færdig kategori', exact: true }).isVisible(),
    false,
  );
  assert.equal(
    await studio.locator('.studio-tree-delete').count(),
    0,
    'The home root cannot be deleted',
  );
  await row('recent').locator('.studio-tree-label').click();
  assert.equal(
    await row('recent')
      .getByRole('button', { name: 'Slet modulet: Senest tilføjet', exact: true })
      .count(),
    1,
  );
  assert.equal(
    await studio.locator('.studio-tree-delete').count(),
    1,
    'Only the selected module has a trash icon',
  );
  await studio.getByRole('combobox', { name: 'Brug færdig kategori', exact: true }).waitFor();
  await row('recent').scrollIntoViewIfNeeded();
  await page.screenshot({ path: join(output, 'netplex-1.4.2-studio-modules.png') });
  const deleteRecent = () =>
    row('recent')
      .getByRole('button', { name: 'Slet modulet: Senest tilføjet', exact: true })
      .click();
  await deleteRecent();
  await row('recent').waitFor({ state: 'detached' });
  assert.equal(
    await page.locator('[data-module=recent]').count(),
    0,
    'Deletion must update the live home screen',
  );
  assert.equal(
    await row('home')
      .getAttribute('class')
      .then((value) => value.includes('selected')),
    true,
  );
  await studio.getByRole('button', { name: /Fortryd ændring/ }).click();
  await row('recent').waitFor();
  await studio.getByRole('button', { name: /Gentag/ }).click();
  await row('recent').waitFor({ state: 'detached' });
  await studio.getByRole('button', { name: /Fortryd ændring/ }).click();
  for (const button of ['+ Kategori', '+ Tekst', '+ Afstand']) {
    await studio.getByRole('button', { name: button, exact: true }).click();
    const selected = studio.locator('.studio-tree-row.selected');
    const added = await selected.getAttribute('data-tree-id');
    if (button === '+ Kategori') {
      await studio
        .getByRole('combobox', { name: 'Brug færdig kategori', exact: true })
        .selectOption('classics');
      assert.equal(
        await studio.getByRole('textbox', { name: 'Kategoriens navn', exact: true }).inputValue(),
        'Film før 1990',
      );
    }
    const trash = selected.locator('.studio-tree-delete');
    await trash.focus();
    await trash.press('Enter');
    await row(added).waitFor({ state: 'detached' });
  }
  await row('spotlight').locator('.studio-tree-label').click();
  await row('spotlight').locator('.studio-tree-delete').click();
  assert.equal(await page.locator('.hero').count(), 0, 'Hero modules can be deleted too');
  await studio.getByRole('button', { name: /Fortryd ændring/ }).click();
  await row('recent').locator('.studio-tree-label').click();
  await deleteRecent();
  await studio.getByRole('button', { name: 'Gem design', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Designet er gemt' }).waitFor();
  const persisted = JSON.parse(await readFile(join(data, 'design.json'), 'utf8'));
  assert.deepEqual(
    persisted.pages.home.children,
    [hero, continuing, series, saved],
    'Saving preserves unrelated modules and filters while removing the chosen module and old grouping',
  );
  assert.equal(persisted.pages.home.layout, 'stack');
  await page.reload();
  await page.locator('.hero h1').waitFor();
  assert.equal(
    await page.locator('[data-module=recent]').count(),
    0,
    'Deletion must survive reopening the app',
  );
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  await row('series').locator('.studio-tree-label').click();
  await row('series').locator('.studio-tree-delete').click();
  await studio.getByRole('button', { name: 'Annullér', exact: true }).click();
  await page.locator('[data-module=series]').waitFor();
  assert.deepEqual(
    JSON.parse(await readFile(join(data, 'design.json'), 'utf8')),
    persisted,
    'Cancel must preserve the last saved layout',
  );
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Desktop selected-row trash icon, protected home root, live deletion, keyboard action, undo/redo/save/cancel, contextual category presets and legacy section flattening without lost categories.',
  );
} finally {
  await app?.close();
  await fixture.close();
}
