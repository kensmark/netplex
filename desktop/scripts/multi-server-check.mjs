import electronExecutable from 'electron';
import { _electron } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createPlexFixture } from '../../tests/fixture.js';
const root = resolve(import.meta.dirname, '../..'),
  output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(output, 'multi-server-windows-'));
const a = await createPlexFixture({ movieCount: 13, machineId: 'alpha', friendlyName: 'Alpha' }),
  b = await createPlexFixture({ movieCount: 13, machineId: 'beta', friendlyName: 'Beta' });
a.movies[0].guid = b.movies[0].guid = 'plex://movie/shared';
b.movies.at(-1).viewOffset = 1200000;
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    version: 1,
    clientId: 'multi-ui',
    connection: { url: a.url, token: 'fixture-token-only', machineId: 'alpha', name: 'Alpha' },
    servers: [
      { url: a.url, token: 'fixture-token-only', machineId: 'alpha', name: 'Alpha', enabled: true },
      { url: b.url, token: 'fixture-second-user', machineId: 'beta', name: 'Beta', enabled: true },
    ],
    account: null,
    lists: {},
  }),
);
const design = JSON.parse(await readFile(join(root, 'designs/premiere.json'), 'utf8'));
design.cards.shared.width = 175;
design.pages.home.children.find((node) => node.id === 'recent').query.limit = 60;
await writeFile(join(data, 'design.json'), JSON.stringify(design));
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
  page.on('pageerror', (e) => errors.push(e.message));
  await page.locator('[data-module=recent] .film-card').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.route(
    '**/api/status',
    async (route) => {
      const response = await route.fetch();
      const status = await response.json();
      await route.fulfill({
        response,
        json: { ...status, connected: false, account: { name: 'Testbruger' } },
      });
    },
    { times: 1 },
  );
  await page.reload();
  await page.getByRole('checkbox', { name: /Alpha/ }).waitFor();
  await page.getByRole('checkbox', { name: /Beta/ }).waitFor();
  await page.getByRole('button', { name: 'Åbn biblioteket', exact: true }).click();
  await page.locator('[data-module=recent] .film-card').first().waitFor();
  const shared = page.locator('[data-module=recent] .np-card-image[data-detail="1"]');
  await shared.scrollIntoViewIfNeeded();
  const card = shared.locator('..').locator('..'),
    save = card.getByRole('button', { name: 'Gem på din liste', exact: true });
  await page.mouse.move(1, 1);
  await page.waitForTimeout(180);
  assert.equal(await save.evaluate((el) => getComputedStyle(el).opacity), '0');
  await shared.hover();
  await page.waitForTimeout(260);
  assert.equal(await save.evaluate((el) => getComputedStyle(el).opacity), '1');
  assert.equal(await shared.locator('.np-card-visual .np-card-shade').count(), 1);
  assert.ok(
    await shared.evaluate((button) => {
      const image = button.getBoundingClientRect(),
        shade = button.querySelector('.np-card-shade').getBoundingClientRect();
      return (
        shade.left <= image.left &&
        shade.right >= image.right &&
        shade.top <= image.top &&
        shade.bottom >= image.bottom
      );
    }),
  );
  assert.equal(
    await shared.locator('.np-card-artwork img').evaluate((el) => getComputedStyle(el).transform),
    'none',
  );
  await save.click();
  await card.getByRole('button', { name: 'Fjern fra din liste', exact: true }).waitFor();
  assert.equal(
    await page.locator('#detail-dialog').evaluate((el) => el.open),
    false,
    'Save must not open film details',
  );
  await shared.click();
  const dialog = page.locator('#detail-dialog');
  await dialog.getByRole('combobox', { name: 'Afspil fra', exact: true }).waitFor();
  await dialog
    .getByRole('region', { name: 'Servere med denne titel', exact: true })
    .getByText('Alpha', { exact: true })
    .waitFor();
  await dialog
    .getByRole('region', { name: 'Servere med denne titel', exact: true })
    .getByText('Beta', { exact: true })
    .waitFor();
  const betaId = await dialog
    .locator('#detail-source option')
    .filter({ hasText: 'Beta' })
    .getAttribute('value');
  await dialog.getByRole('combobox', { name: 'Afspil fra', exact: true }).selectOption(betaId);
  await page.waitForFunction(
    (id) => document.querySelector('#detail-dialog [data-play]')?.dataset.sourceId === id,
    betaId,
  );
  await page.screenshot({ path: join(output, 'netplex-1.4-server-details.png') });
  await dialog.getByRole('button', { name: 'Luk filmdetaljer', exact: true }).click();
  await page.getByRole('button', { name: 'Indstillinger', exact: true }).click();
  const settings = page.locator('#settings-dialog');
  await settings.getByRole('checkbox', { name: /Beta/ }).waitFor();
  await settings.getByRole('checkbox', { name: /Beta/ }).uncheck();
  await page.waitForFunction(async () => {
    const data = await (await fetch('/api/library?type=movie')).json();
    return data.total === 13;
  });
  let stored = JSON.parse(await readFile(join(data, 'settings.json'), 'utf8'));
  assert.equal(stored.serverPreferences.beta, false);
  await settings.getByRole('checkbox', { name: /Beta/ }).check();
  await page.waitForFunction(async () => {
    const data = await (await fetch('/api/library?type=movie')).json();
    return data.total === 25;
  });
  await page.screenshot({ path: join(output, 'netplex-1.4-server-settings.png') });
  await settings.getByRole('button', { name: 'Luk indstillinger', exact: true }).click();
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  await page.getByRole('button', { name: 'Filmkort', exact: true }).click();
  const carousel = page.locator('[data-module=recent] .np-carousel');
  const settle = async () => {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
  };
  const verify = async () => {
    await carousel.scrollIntoViewIfNeeded();
    await settle();
    const geometry = await carousel.evaluate((row) => {
      const shell = row.parentElement.getBoundingClientRect(),
        bounds = row.getBoundingClientRect(),
        cards = [...row.querySelectorAll('.np-card-root')].map((e) => e.getBoundingClientRect()),
        prev = row.querySelector('.np-carousel-prev').getBoundingClientRect(),
        next = row.querySelector('.np-carousel-next').getBoundingClientRect();
      return {
        left: bounds.left - shell.left,
        width: bounds.width - shell.width,
        first: cards[0].left - bounds.left,
        last: cards.at(-1).right - bounds.right,
        leftArrow: prev.x + prev.width / 2 - bounds.left,
        rightArrow: next.x + next.width / 2 - bounds.right,
        columns: getComputedStyle(row.querySelector('.np-carousel-track'))
          .gridTemplateColumns.split(' ')
          .map(parseFloat),
        posterWidth: cards[0].width,
        height: bounds.height,
        prevY: prev.y + scrollY,
        nextY: next.y + scrollY,
        following:
          document.querySelector('[data-module=series]').getBoundingClientRect().top + scrollY,
        hasProgress: !!row.querySelector('[role=progressbar]'),
      };
    });
    assert.ok(
      Math.abs(geometry.left) < 1 && Math.abs(geometry.width) < 1 && Math.abs(geometry.first) < 1,
      'Rows must fill the module and start at its left edge',
    );
    assert.ok(
      Math.abs(geometry.leftArrow) < 1 && Math.abs(geometry.rightArrow) < 1,
      'Arrows must stay on module edges across all pages',
    );
    assert.ok(
      geometry.columns.every((width) => Math.abs(width - geometry.posterWidth) < 1),
      'Cards must divide the entire row into equal columns',
    );
    return geometry;
  };
  for (const viewport of [1600, 1250]) {
    await page.setViewportSize({ width: viewport, height: 1000 });
    for (const size of [0, 2, 4, 6]) {
      await page.getByRole('slider', { name: 'Kortstørrelse', exact: true }).fill(String(size));
      await settle();
      const before = await verify();
      const pages = Number(await carousel.getAttribute('data-carousel-pages'));
      const progressStates = new Set([before.hasProgress]);
      for (let pageIndex = 1; pageIndex < pages; pageIndex++) {
        await carousel
          .getByRole('button', { name: 'Vis næste i Senest tilføjet', exact: true })
          .click();
        await settle();
        const after = await verify();
        progressStates.add(after.hasProgress);
        for (const property of ['height', 'prevY', 'nextY', 'following', 'posterWidth'])
          assert.ok(
            Math.abs(after[property] - before[property]) < 1,
            'Paging must preserve ' + property,
          );
        assert.equal(
          after.columns.length,
          before.columns.length,
          'All pages must keep the same number of columns',
        );
        assert.ok(
          after.columns.every((width, index) => Math.abs(width - before.columns[index]) < 0.1),
          'Partial pages must keep the same widths, allowing subpixel rounding',
        );
      }
      assert.equal(progressStates.size, 2, 'Exercise both pages with and without progress bars');
      await carousel
        .getByRole('button', { name: 'Vis næste i Senest tilføjet', exact: true })
        .click();
      assert.equal(await carousel.getAttribute('data-carousel-page'), '0');
    }
  }
  await page.screenshot({ path: join(output, 'netplex-1.4.1-carousel.png') });
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Desktop multiple-server settings, source choice, hover gradient, save icon, discrete card sizes filling the full module, and stable rows/arrows/following modules across eight viewport/size combinations and partial pages with progress.',
  );
} finally {
  await app?.close();
  await Promise.all([a.close(), b.close()]);
}
