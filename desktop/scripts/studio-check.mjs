import electronExecutable from 'electron';
import { _electron } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createPlexFixture } from '../../tests/fixture.js';
const root = resolve(import.meta.dirname, '../..');
const output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(output, 'studio-windows-'));
const fixture = await createPlexFixture({ movieCount: 45 });
fixture.movies[0].Director = [{ tag: 'Greta Gerwig' }];
fixture.movies[0].Role = [
  { tag: 'Florence Pugh' },
  ...Array.from({ length: 10 }, (_, i) => ({ tag: `Supporting actor ${i}` })),
];
fixture.movies[1].Director = [{ tag: 'Denis Villeneuve' }];
fixture.movies[1].Role = [{ tag: 'Oscar Isaac' }];
fixture.movies[2].Director = [{ tag: 'Greta Gerwig' }];
fixture.movies[2].Role = [{ tag: 'Oscar Isaac' }];
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    version: 1,
    clientId: 'studio-windows-test',
    connection: {
      url: fixture.url,
      token: 'fixture-token-only',
      machineId: 'fixture-pms',
      name: 'Test Plex',
      version: '1.43',
    },
    account: null,
    lists: {},
  }),
);
let app;
const errors = [];
try {
  app = await _electron.launch({
    executablePath: electronExecutable,
    args: [join(root, 'desktop/main.js')],
    env: { ...process.env, NETPLEX_DATA_DIR: data, NETPLEX_NO_IMPORT: '1' },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on('pageerror', (error) => errors.push(error.message));
  let queries = 0;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/design/collections')) queries++;
  });
  await page.locator('.hero h1').waitFor();
  await page.waitForTimeout(250);
  const header = await page.locator('.site-header').boundingBox();
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  assert.ok(
    Math.abs(header.x) < 1 && Math.abs(header.width - clientWidth) < 2,
    'Top menu must cover the full client width',
  );
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  await page.getByRole('button', { name: 'Tilpas', exact: true }).click();
  assert.equal(await page.getByText('START MED ET DESIGN', { exact: true }).count(), 0);
  assert.equal(await page.getByText(/Maksimal indholdsbredde/).count(), 0);
  assert.equal(await page.getByRole('slider', { name: 'Afrunding', exact: true }).count(), 0);
  await page.getByLabel('Navigation', { exact: true }).selectOption('left');
  await page.waitForFunction(() => document.body.dataset.navigation === 'left');
  await page.getByLabel('Navigation', { exact: true }).selectOption('top');
  await page.waitForFunction(() => document.body.dataset.navigation === 'top');
  await page.evaluate(() => window.scrollTo(0, 650));
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => scrollY);
  assert.ok(before > 200);
  const image = await page.locator('[data-module=recent] .np-card-image').first().elementHandle();
  const queryBefore = queries;
  await page.getByLabel('Accentfarve', { exact: true }).fill('#a4d6ce');
  await page.waitForTimeout(400);
  assert.ok(
    Math.abs((await page.evaluate(() => scrollY)) - before) < 2,
    'Color preview must preserve scroll position',
  );
  assert.equal(queries, queryBefore, 'Visual changes must not refetch collections');
  assert.ok(
    await image.evaluate((element) => element.isConnected),
    'Preview must preserve existing card/image DOM',
  );
  await page.getByRole('button', { name: 'Filmkort', exact: true }).click();
  assert.equal(await page.getByRole('slider', { name: 'Kortstørrelse', exact: true }).count(), 1);
  assert.equal(await page.getByRole('slider', { name: 'Afrunding', exact: true }).count(), 1);
  await page.getByRole('slider', { name: 'Afrunding', exact: true }).fill('18');
  await page.getByRole('slider', { name: 'Kortstørrelse', exact: true }).fill('3');
  await page.waitForTimeout(250);
  const radii = await page
    .locator('#main-content .np-film-card')
    .evaluateAll((elements) => [
      ...new Set(elements.map((element) => getComputedStyle(element).borderRadius)),
    ]);
  assert.deepEqual(radii, ['18px']);
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.locator('[data-tree-id=recent] .studio-tree-label').click();
  assert.equal(await page.getByText(/Egen kortstørrelse/).count(), 0);
  await page.getByRole('button', { name: 'Medietype', exact: true }).click();
  await page.getByRole('option', { name: 'Film', exact: true }).waitFor();
  await page.getByRole('option', { name: 'Serier', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Medietype', exact: true }).click();
  const pick = async (label, values) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    for (const value of values)
      await page
        .getByRole('listbox', { name: label, exact: true })
        .getByRole('option', { name: value, exact: true })
        .click();
    await page.getByRole('button', { name: label, exact: true }).click();
  };
  await pick('Genrer', ['Drama', 'Science fiction']);
  await pick('Instruktører', ['Greta Gerwig']);
  await pick('Medvirkende', ['Florence Pugh']);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-module=recent] .film-card').length === 1,
  );
  assert.equal(
    await page.locator('[data-module=recent] .film-title').textContent(),
    'Night Signal',
  );
  await page.getByRole('button', { name: 'Instruktører', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Søg i instruktører', exact: true })
    .fill('Quentin Tarantino');
  assert.equal(
    await page
      .getByRole('listbox', { name: 'Instruktører', exact: true })
      .getByRole('option')
      .count(),
    0,
  );
  await page.getByRole('button', { name: 'Instruktører', exact: true }).click();
  await page.getByRole('button', { name: 'Medvirkende', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Søg i medvirkende', exact: true })
    .fill('Supporting actor 9');
  await page.getByRole('option', { name: 'Supporting actor 9', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Medvirkende', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('combobox', { name: 'JSON-indhold', exact: true }).selectOption('all');
  await page.waitForFunction(() => {
    try {
      return (
        JSON.parse(document.querySelector('[aria-label="Design JSON"]')?.value || '{}').format ===
        'netplex.design'
      );
    } catch {
      return false;
    }
  });
  const design = JSON.parse(
    await page.getByRole('textbox', { name: 'Design JSON', exact: true }).inputValue(),
  );
  assert.equal(design.formatVersion, 2);
  assert.deepEqual(Object.keys(design.cards), ['shared']);
  const recent = design.pages.home.children.find((node) => node.id === 'recent');
  recent.query.filter = { types: ['movie'] };
  recent.query.limit = 18;
  await page
    .getByRole('textbox', { name: 'Design JSON', exact: true })
    .fill(JSON.stringify(design));
  await page.getByRole('button', { name: 'Vis JSON i forhåndsvisning', exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector('[data-module=recent] .np-carousel')?.dataset.carouselPages) >
      1,
  );
  const carousel = page.locator('[data-module=recent] .np-carousel');
  const firstId = await carousel.locator('.np-card-image').first().getAttribute('data-detail');
  const pages = Number(await carousel.getAttribute('data-carousel-pages'));
  for (let i = 0; i < pages; i++)
    await carousel
      .getByRole('button', { name: 'Vis næste i Senest tilføjet', exact: true })
      .click();
  assert.equal(await carousel.getAttribute('data-carousel-page'), '0');
  assert.equal(
    await carousel.locator('.np-card-image').first().getAttribute('data-detail'),
    firstId,
  );
  await carousel
    .getByRole('button', { name: 'Vis forrige i Senest tilføjet', exact: true })
    .click();
  assert.equal(await carousel.getAttribute('data-carousel-page'), String(pages - 1));
  await carousel.getByRole('button', { name: 'Vis næste i Senest tilføjet', exact: true }).click();
  const trackOverflow = await carousel
    .locator('.np-carousel-track')
    .evaluate((element) => getComputedStyle(element).overflowX);
  assert.equal(trackOverflow, 'hidden');
  const card = carousel.locator('.film-card').first();
  await card.scrollIntoViewIfNeeded();
  await page.mouse.move(2, 2);
  assert.equal(await card.locator('.np-field-summary').isVisible(), false);
  await card.hover();
  assert.equal(await page.locator('.np-card-popover').count(), 0);
  assert.equal(await card.locator('.np-field-rating').isVisible(), true);
  const cardSize = await card.locator('.np-card-root').boundingBox(),
    imageSize = await card.locator('.np-card-image').boundingBox();
  assert.ok(Math.abs(cardSize.height - imageSize.height) < 2, 'Poster should fill the card');
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.locator('.studio-body').evaluate((element) => (element.scrollTop = 0));
  await page.evaluate(() => {
    globalThis.__dragData = new DataTransfer();
    document
      .querySelector('[data-tree-id=recent]')
      .dispatchEvent(
        new DragEvent('dragstart', { bubbles: true, dataTransfer: globalThis.__dragData }),
      );
  });
  await page.locator('[data-tree-id=recent].dragging').waitFor();
  await page.locator('[data-tree-id=continue]').dispatchEvent('dragover', {
    clientY: (await page.locator('[data-tree-id=continue]').boundingBox()).y + 2,
    dataTransfer: await page.evaluateHandle(() => globalThis.__dragData),
  });
  await page.locator('[data-tree-id=continue].drop-before').waitFor();
  assert.ok(
    (await page.locator('[data-tree-id=continue]').getAttribute('class')).includes('drop-before'),
  );
  assert.ok(
    (await page.locator('[data-tree-id=recent]').getAttribute('class')).includes('dragging'),
  );
  await page.screenshot({ path: join(output, 'netplex-studio-drag-feedback.png') });
  await page.locator('[data-tree-id=continue]').dispatchEvent('drop', {
    dataTransfer: await page.evaluateHandle(() => globalThis.__dragData),
  });
  await page.waitForFunction(() => {
    const ids = [...document.querySelectorAll('.studio-tree-row')].map(element => element.dataset.treeId);
    return ids.indexOf('recent') < ids.indexOf('continue');
  });
  const order = await page
    .locator('.studio-tree-row')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-tree-id')));
  assert.ok(order.indexOf('recent') < order.indexOf('continue'));
  await page.getByRole('button', { name: 'Filmkort', exact: true }).click();
  await page.screenshot({ path: join(output, 'netplex-studio-simplified.png') });
  await page.getByRole('button', { name: 'Gem design', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Designet er gemt' }).waitFor();
  const saved = JSON.parse(await readFile(join(data, 'design.json'), 'utf8'));
  assert.equal(saved.cards.shared.radius, 18);
  assert.equal(saved.formatVersion, 2);
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Desktop Studio simplification, library-only multi-select metadata, shared poster cards, hover details, circular carousels, drag feedback, stable live preview, full-width header and saving.',
  );
} finally {
  await app?.close();
  await fixture.close();
}
