import { _electron } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPlexFixture } from '../../tests/fixture.js';
import { basicCard, themePackage, layoutPackage } from '../../public/design/core.js';
const root = resolve(import.meta.dirname, '../..'),
  output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(output, 'customization-windows-')),
  fixture = await createPlexFixture({ movieCount: 45 });
const longTitle =
  'En meget lang filmtitel som skal kunne læses i sin helhed, også på et lille bredformatkort';
const summary =
  'Hele denne beskrivelse skal kunne læses uden at blive skåret af af billedets højde. '.repeat(8);
for (const movie of fixture.movies) {
  movie.title = longTitle;
  movie.summary = summary;
  movie.duration = 7200000;
  movie.viewOffset = 1200000;
  movie.viewCount = 0;
  movie.Role = Array.from({ length: 40 }, (_, i) => ({ tag: 'Skuespiller nummer ' + i }));
}
const design = JSON.parse(await readFile(join(root, 'designs/premiere.json'), 'utf8'));
design.cards.shared = basicCard('landscape', 160, [
  'title',
  'year',
  'rating',
  'duration',
  'genres',
  'summary',
]);
design.cards.shared.radius = 32;
design.navigation.items.find((item) => item.route === 'home').label = 'Din biograf';
design.navigation.items.find((item) => item.route === 'saved').label = 'Til en anden aften';
await writeFile(
  join(data, 'design.json'),
  JSON.stringify({ ...design, library: { layout: 'list' } }),
);
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    version: 1,
    clientId: 'customization-test',
    connection: {
      url: fixture.url,
      token: 'fixture-token-only',
      machineId: 'fixture-pms',
      name: 'Test Plex',
      version: '1.43',
    },
    account: null,
    lists: {
      ['manual-' +
      createHash('sha256').update('fixture-token-only').digest('hex').slice(0, 16) +
      ':fixture-pms']: ['1', '2'],
    },
  }),
);
let app;
const errors = [];
try {
  app = await _electron.launch({
    executablePath: join(root, 'desktop/node_modules/electron/dist/electron.exe'),
    args: [join(root, 'desktop/main.js')],
    env: { ...process.env, NETPLEX_DATA_DIR: data, NETPLEX_NO_IMPORT: '1' },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1600, height: 1000 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('[data-module=recent] .film-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const card = page.locator('[data-module=recent] .film-card').first();
  await card.scrollIntoViewIfNeeded();
  await page
    .getByRole('navigation', { name: 'Hovedmenu' })
    .getByRole('button', { name: 'Forside', exact: true })
    .waitFor();
  await page
    .getByRole('navigation', { name: 'Hovedmenu' })
    .getByRole('button', { name: 'Din liste', exact: true })
    .waitFor();
  const beforeHover = await card.boundingBox();
  const beforeHoverScroll = await page.evaluate(() => scrollY);
  await card.hover();
  assert.equal(await page.locator('.np-card-popover').count(), 0);
  assert.equal(await card.locator('.np-card-field').count(), 3);
  assert.equal(await card.locator('.np-field-summary').count(), 0);
  assert.equal(await card.locator('.np-card-save').count(), 1);
  assert.equal(await card.locator('.np-field-rating').isVisible(), true);
  assert.equal(await card.locator('.film-title').textContent(), longTitle);
  const afterHover = await card.boundingBox();
  assert.equal(afterHover.width, beforeHover.width);
  assert.equal(afterHover.height, beforeHover.height);
  assert.ok(
    Math.abs(
      afterHover.y + (await page.evaluate(() => scrollY)) - beforeHover.y - beforeHoverScroll,
    ) < 1,
  );
  const imageBox = await card.locator('.np-card-image').boundingBox(),
    barBox = await card.getByRole('progressbar').boundingBox();
  assert.ok(
    barBox.y >= imageBox.y + imageBox.height + 5,
    'Progress must sit outside the rounded artwork',
  );
  assert.ok(
    Math.abs(barBox.width - imageBox.width) < 1,
    'Progress track must keep the full card width',
  );
  assert.equal(await card.evaluate((el) => getComputedStyle(el).overflow), 'visible');
  assert.equal(
    await card.locator('.np-card-root').evaluate((el) => getComputedStyle(el).borderRadius),
    '32px',
  );
  for (const field of ['.film-title', '.np-field-year', '.np-field-rating']) {
    const box = await card.locator(field).boundingBox();
    assert.ok(
      box.y >= imageBox.y && box.y + box.height <= imageBox.y + imageBox.height + 1,
      'Metadata must fit inside the poster',
    );
  }
  await page.screenshot({ path: join(output, 'netplex-1.3.2-poster.png') });
  await page.mouse.click(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height - 12);
  await page.getByRole('button', { name: 'Luk filmdetaljer', exact: true }).waitFor();
  const more = page.getByRole('button', { name: 'Mere information', exact: true });
  await more.waitFor();
  assert.equal(await more.getAttribute('aria-expanded'), 'false');
  assert.ok([...(await page.locator('#detail-cast-preview').textContent())].length <= 301);
  assert.equal(await page.locator('#detail-cast-full').isVisible(), false);
  await more.click();
  await page.getByRole('button', { name: 'Vis mindre', exact: true }).waitFor();
  assert.equal(await page.locator('#detail-cast-full').isVisible(), true);
  assert.ok(
    (await page.locator('#detail-cast-full').textContent()).includes('Skuespiller nummer 39'),
  );
  await page.getByRole('button', { name: 'Vis mindre', exact: true }).click();
  assert.equal(await page.locator('#detail-cast-full').isVisible(), false);
  await page.screenshot({ path: join(output, 'netplex-1.3.2-cast.png') });
  await page.getByRole('button', { name: 'Luk filmdetaljer', exact: true }).click();
  await page.locator('[data-module=continue] .np-card-image[data-detail="10002"]').click();
  await page.getByRole('button', { name: 'Luk filmdetaljer', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Mere information', exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: 'Luk filmdetaljer', exact: true }).click();
  const arrow = page.getByRole('button', { name: 'Vis næste i Senest tilføjet', exact: true });
  const arrowBox = await arrow.boundingBox(),
    iconBox = await arrow.locator('svg').boundingBox();
  assert.ok(Math.abs(arrowBox.x + arrowBox.width / 2 - iconBox.x - iconBox.width / 2) < 1);
  assert.ok(Math.abs(arrowBox.y + arrowBox.height / 2 - iconBox.y - iconBox.height / 2) < 1);
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  const read = () => page.evaluate(async () => await (await fetch('/api/design')).json());
  await page.getByRole('button', { name: 'Filmkort', exact: true }).click();
  assert.equal(await page.getByText('OPLYSNINGER PÅ KORTET', { exact: true }).count(), 0);
  assert.equal(await page.locator('.studio-metadata').count(), 0);
  await page.getByRole('button', { name: 'Temaer', exact: true }).click();
  await page.getByRole('button', { name: 'Brug temaet Velvet', exact: true }).click();
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('combobox', { name: 'JSON-indhold', exact: true }).selectOption('all');
  const themed = JSON.parse(
    await page.getByRole('textbox', { name: 'Design JSON', exact: true }).inputValue(),
  );
  assert.deepEqual(themed.pages, design.pages);
  assert.deepEqual(themed.library, design.library);
  assert.equal(themed.theme.accent, '#f3b18e');
  await page.getByRole('combobox', { name: 'JSON-indhold', exact: true }).selectOption('theme');
  const theme = JSON.parse(
    await page.getByRole('textbox', { name: 'Tema JSON', exact: true }).inputValue(),
  );
  assert.equal(theme.format, 'netplex.theme');
  assert.ok(!theme.pages && !theme.library && !theme.navigation.items);
  await page.getByRole('combobox', { name: 'JSON-indhold', exact: true }).selectOption('layout');
  const layout = JSON.parse(
    await page.getByRole('textbox', { name: 'Layout JSON', exact: true }).inputValue(),
  );
  assert.equal(layout.format, 'netplex.layout');
  assert.ok(!layout.theme && !layout.cards && !layout.navigation.position);
  layout.pages.home.children.push({
    id: 'my-special',
    type: 'collection',
    title: 'My special category',
    query: { source: 'library', filter: { directors: ['Greta Gerwig'] } },
    layout: 'column',
    empty: 'hide',
  });
  await page
    .getByRole('textbox', { name: 'Layout JSON', exact: true })
    .fill(JSON.stringify(layout));
  await page.getByRole('button', { name: 'Vis JSON i forhåndsvisning', exact: true }).click();
  await page.getByRole('button', { name: 'Temaer', exact: true }).click();
  await page.getByRole('button', { name: 'Brug temaet Obsidian', exact: true }).click();
  await page.getByRole('textbox', { name: 'Temaets navn', exact: true }).fill('Mit Windows-tema');
  await page.getByRole('button', { name: 'Gem som tema', exact: true }).click();
  await page.getByRole('button', { name: 'Brug temaet Mit Windows-tema', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.getByRole('button', { name: '+ Kategori', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Brug færdig kategori', exact: true })
    .selectOption('classics');
  assert.equal(
    await page.getByRole('textbox', { name: 'Kategoriens navn', exact: true }).inputValue(),
    'Film før 1990',
  );
  assert.equal(await page.getByRole('button', { name: '+ Sektion', exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('combobox', { name: 'Tilføj færdig kategori', exact: true }).count(),
    0,
  );
  for (const preset of ['rated', 'short']) {
    await page.getByRole('button', { name: '+ Kategori', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'Brug færdig kategori', exact: true })
      .selectOption(preset);
  }
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  await page.getByRole('combobox', { name: 'JSON-indhold', exact: true }).selectOption('all');
  const result = JSON.parse(
    await page.getByRole('textbox', { name: 'Design JSON', exact: true }).inputValue(),
  );
  assert.ok(result.pages.home.children.some((n) => n.id === 'my-special'));
  assert.equal(
    result.pages.home.children.find((n) => n.title === 'Film før 1990').query.filter.year.lt,
    1990,
  );
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  assert.equal(
    await page
      .getByRole('combobox', { name: 'Bibliotekets visning', exact: true })
      .locator('option[value="list"]')
      .count(),
    0,
  );
  await page
    .getByRole('combobox', { name: 'Bibliotekets visning', exact: true })
    .selectOption('grid');
  const homeSize = await page
    .locator('[data-module=recent] .np-carousel')
    .getAttribute('data-card-size');
  const homeRadius = await page
    .locator('[data-module=recent] .np-card-root')
    .first()
    .evaluate((el) => getComputedStyle(el).borderRadius);
  for (const name of ['Film', 'Serier', 'Din liste']) {
    await page
      .getByRole('navigation', { name: 'Hovedmenu' })
      .getByRole('button', { name, exact: true })
      .click();
    const libraryCard = page.locator('.library-main .np-layout-grid .film-card').first();
    await libraryCard.waitFor();
    const image = await libraryCard.locator('.np-card-image').boundingBox();
    assert.ok(
      Math.abs(image.width / image.height - 16 / 9) < 0.01,
      name + ' must share the landscape format',
    );
    assert.equal(
      await page.locator('.library-main .np-layout-grid').getAttribute('data-card-size'),
      homeSize,
    );
    assert.equal(
      await libraryCard
        .locator('.np-card-root')
        .evaluate((el) => getComputedStyle(el).borderRadius),
      homeRadius,
    );
    assert.equal(
      await libraryCard
        .locator('.np-card-info')
        .evaluate((el) => el.parentElement.matches('.np-card-image')),
      true,
    );
    assert.equal(await page.locator('.np-card-compact').count(), 0);
  }
  await page.getByRole('button', { name: 'Filmkort', exact: true }).click();
  await page.getByRole('button', { name: 'Plakat', exact: true }).click();
  await page.getByRole('slider', { name: 'Kortstørrelse', exact: true }).fill('3');
  await page.getByRole('slider', { name: 'Afrunding', exact: true }).fill('14');
  for (const name of ['Forside', 'Film', 'Serier', 'Din liste']) {
    await page
      .getByRole('navigation', { name: 'Hovedmenu' })
      .getByRole('button', { name, exact: true })
      .click();
    const poster = page.locator('#main-content .np-card-image').first();
    await poster.waitFor();
    const geometry = await poster.boundingBox();
    assert.ok(
      Math.abs(geometry.width / geometry.height - 2 / 3) < 0.01,
      name + ' must share the poster format',
    );
    assert.equal(
      await poster.locator('xpath=ancestor::*[@data-card-size]').getAttribute('data-card-size'),
      '240',
    );
    assert.equal(
      await poster.locator('..').evaluate((el) => getComputedStyle(el).borderRadius),
      '14px',
    );
  }
  await page.getByRole('button', { name: 'Gem design', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Designet er gemt' }).waitFor();
  const saved = await read();
  assert.ok(saved.design.pages.home.children.some((n) => n.id === 'my-special'));
  await page.getByRole('button', { name: 'Temaer', exact: true }).click();
  await page.screenshot({ path: join(output, 'netplex-1.3.2-themes.png') });
  await page.getByRole('button', { name: 'Slet temaet Mit Windows-tema', exact: true }).click();
  await page
    .getByRole('button', { name: 'Brug temaet Mit Windows-tema', exact: true })
    .waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Windows in-poster metadata, unclipped progress, cast disclosure, poster hit area, identical home/movie/show/saved cards, centered SVG arrows, theme gallery, separate JSON scopes, personal themes, category presets and a flat home layout.',
  );
} finally {
  await app?.close();
  await fixture.close();
}
