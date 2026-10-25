import { _electron } from '../../node_modules/playwright/index.mjs';
import { readFile, writeFile, mkdtemp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { createPlexFixture } from '../../tests/fixture.js';
const root = resolve(import.meta.dirname, '../..'),
  output = join(root, 'test-results');
await mkdir(output, { recursive: true });
const data = await mkdtemp(join(output, 'search-windows-'));
const fixture = await createPlexFixture({ movieCount: 25 });
await writeFile(
  join(data, 'settings.json'),
  JSON.stringify({
    version: 1,
    clientId: 'search-ui',
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
const errors = [];
try {
  app = await _electron.launch({
    executablePath: join(root, 'desktop/node_modules/electron/dist/electron.exe'),
    args: [join(root, 'desktop/main.js')],
    env: { ...process.env, NETPLEX_DATA_DIR: data, NETPLEX_NO_IMPORT: '1' },
    timeout: 30000,
  });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 1000 });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.locator('.hero h1').waitFor();
  const search = page.getByRole('searchbox', { name: 'Søg i alle titler', exact: true });
  const start = page.url();
  await search.click();
  await page.waitForTimeout(350);
  assert.equal(page.url(), start, 'Focusing global search must keep the current page');
  await search.press('Enter');
  assert.equal(page.url(), start, 'Submitting an empty search must keep the current page');
  await search.fill('Signal');
  await page.waitForURL('**/#/search?q=Signal');
  await page.locator('.library-main .np-card-image').nth(1).waitFor();
  assert.deepEqual((await page.locator('.library-main .film-title').allTextContents()).sort(), [
    'Night Signal',
    'Signal Station',
  ]);
  assert.equal(
    await page.locator('#library-query').count(),
    0,
    'Global results need only one search field',
  );
  assert.equal(await search.evaluate((el) => document.activeElement === el), true);
  await search.fill('Blue Hour');
  await search.press('Enter');
  await page.waitForURL('**/#/search?q=Blue+Hour');
  await page.waitForFunction(
    () => document.querySelector('.library-main .film-title')?.textContent === 'Blue Hour',
  );
  await search.fill('Signal');
  await search.press('Enter');
  await page.waitForFunction(
    () => document.querySelectorAll('.library-main .film-title').length === 2,
  );
  await page.screenshot({ path: join(output, 'netplex-1.4.1-global-search.png') });
  await page.goBack();
  await page.locator('.hero h1').waitFor();
  assert.equal(await search.inputValue(), '', 'Back must restore header text to the current route');
  const nav = page.getByRole('navigation', { name: 'Hovedmenu' });
  await nav.getByRole('button', { name: 'Film', exact: true }).click();
  const local = page.getByRole('searchbox', { name: 'Søg i biblioteket', exact: true });
  await local.waitFor();
  const moviesURL = page.url();
  await page.keyboard.press('Control+k');
  assert.equal(page.url(), moviesURL, 'Ctrl+K must focus the header without navigating');
  assert.equal(await search.evaluate((el) => document.activeElement === el), true);
  await local.fill('Signal');
  await page.waitForFunction(
    () => document.querySelectorAll('.library-main .film-title').length === 1,
  );
  assert.equal(await page.locator('.library-main .film-title').textContent(), 'Night Signal');
  assert.equal(page.url(), moviesURL, 'Local movie search must stay inside Film');
  const focus = await local.evaluate((el) => ({
    outline: getComputedStyle(el).outlineStyle,
    border: getComputedStyle(el).borderWidth,
    radius: getComputedStyle(el).borderRadius,
    wrapper: el.parentElement.matches(':focus-within'),
  }));
  assert.equal(focus.outline, 'none');
  assert.equal(focus.border, '0px');
  assert.equal(focus.radius, '0px');
  assert.equal(focus.wrapper, true);
  await page.screenshot({ path: join(output, 'netplex-1.4.1-local-search.png') });
  await nav.getByRole('button', { name: 'Serier', exact: true }).click();
  await local.fill('Signal');
  await page.waitForFunction(
    () => document.querySelector('.library-main .film-title')?.textContent === 'Signal Station',
  );
  assert.ok(page.url().endsWith('#/shows'));
  await search.fill('No title matches this');
  await search.press('Enter');
  await page.getByRole('heading', { name: 'Ingen titler fundet', exact: true }).waitFor();
  await search.fill('');
  await page.locator('.hero h1').waitFor();
  // Sidebar themes expose the same usable input and restore correctly on reload.
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  await page.setViewportSize({width:1250,height:1000});
  const headerFits=await page.locator('.site-header').evaluate(header=>{
    const bounds=header.getBoundingClientRect();
    return [...header.querySelectorAll('.header-tools > *, nav button')].every(child=>child.getBoundingClientRect().right<=bounds.right-10);
  });
  assert.equal(headerFits,true,'Search must leave room for menu controls while Studio is open');
  await page.screenshot({path:join(output,'netplex-1.4.1-studio-search.png')});
  await page.getByRole('button', { name: 'Tilpas', exact: true }).click();
  await page.getByLabel('Navigation', { exact: true }).selectOption('left');
  await page.getByRole('button', { name: 'Gem design', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Designet er gemt' }).waitFor();
  await page.getByRole('button', { name: 'Luk designstudio', exact: true }).click();
  await search.fill('Night');
  await search.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('.library-main .film-title')?.textContent === 'Night Signal',
  );
  await page.reload();
  await page.locator('.library-main .film-title').waitFor();
  assert.equal(await search.inputValue(), 'Night');
  assert.deepEqual(errors, []);
  console.log(
    'PASS: Windows real header search, focus without navigation, keyboard shortcut, live cross-library results, Enter, Back, clearing, reload, sidebar navigation and single-outline local film/show search.',
  );
} finally {
  await app?.close();
  await fixture.close();
}
