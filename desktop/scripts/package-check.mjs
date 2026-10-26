import { _electron } from '../../node_modules/playwright/index.mjs';
import { listPackage, extractFile } from '@electron/asar';
import { readFile, mkdir, mkdtemp, access } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { playerPath } from '../platform.js';
const root = resolve(import.meta.dirname, '../..'),
  mac = process.platform === 'darwin';
const directory = join(
  root,
  mac ? `Mac/NetPlex-darwin-${process.arch}/NetPlex.app` : 'Windows/NetPlex-win32-x64',
);
const resources = join(directory, mac ? 'Contents/Resources' : 'resources'),
  archive = join(resources, 'app.asar');
const names = listPackage(archive).map((name) => name.replaceAll('\\', '/'));
assert.ok(
  !names.some((name) =>
    /(?:^|\/)(?:settings\.json|design\.json|themes\.json|\.netplex|\.data|\.env|tests|test-results)(?:\/|$)/.test(
      name,
    ),
  ),
);
assert.ok(!names.some((name) => /hero-dark-fantasy|docs\/images/.test(name)));
const expected = JSON.parse(await readFile(join(root, 'desktop/package.json'), 'utf8')).version;
assert.equal(JSON.parse(extractFile(archive, 'package.json')).version, expected);
assert.ok(extractFile(archive, 'LICENSE').toString().startsWith('MIT License'));
for (const name of [
  'public/app.js',
  'public/design/ui.js',
  'public/design/ui.css',
  'desktop/platform.js',
])
  assert.deepEqual(
    extractFile(archive, name.replaceAll('/', sep)),
    await readFile(join(root, name)),
  );
const player = playerPath(resources);
await access(player);
const version = execFileSync(player, ['--no-config', '--version'], {
  encoding: 'utf8',
  windowsHide: true,
});
assert.match(version, /mpv/i);
if (mac) {
  const otool = execFileSync('/usr/bin/otool', ['-L', player], { encoding: 'utf8' });
  assert.ok(
    !/\/opt\/homebrew|\/usr\/local/.test(otool),
    'The player must not depend on Homebrew paths.',
  );
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', directory]);
}
await mkdir(join(root, 'test-results'), { recursive: true });
const profile = await mkdtemp(join(root, 'test-results/packaged-profile-'));
const executable = join(directory, mac ? 'Contents/MacOS/NetPlex' : 'NetPlex.exe');
let app;
const errors = [];
try {
  app = await _electron.launch({
    executablePath: executable,
    args: ['--profile-dir=' + profile],
    timeout: 45000,
  });
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await page
    .getByRole('button', { name: 'Log ind med Plex', exact: true })
    .waitFor({ timeout: 30000 });
  const status = await page.evaluate(async () => await (await fetch('/api/status')).json());
  assert.equal(status.connected, false);
  assert.ok(!status.account);
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), expected);
  assert.equal(await page.evaluate(() => window.netplexDesktop.platform), process.platform);
  await page.waitForFunction(() => {
    const posters = [...document.querySelectorAll('.welcome-poster > img')];
    return posters.length === 3 && posters.every(image => image.complete && image.naturalWidth > 0);
  });
  assert.deepEqual(await page.locator('.welcome-poster > img').evaluateAll(images => images.map(image => image.getAttribute('src'))), ['/assets/login/akira.jpg', '/assets/login/dune.jpg', '/assets/login/godzilla.jpg']);
  await page.screenshot({path: join(root, `test-results/login-${process.platform}-${process.arch}.png`)});
  await page.getByRole('button', { name: /Udforsk en demo/ }).click();
  await page.locator('.hero h1').waitFor();
  await page.getByRole('button', { name: 'Tilpas design', exact: true }).click();
  await page.locator('[data-tree-id=recent] .studio-tree-label').click();
  assert.equal(await page.locator('[data-tree-id=recent] .studio-tree-delete').count(), 1);
  assert.equal(await page.getByRole('button', { name: '+ Sektion', exact: true }).count(), 0);
  assert.equal(
    await page.getByRole('combobox', { name: 'Tilføj færdig kategori', exact: true }).count(),
    0,
  );
  assert.deepEqual(errors, []);
} finally {
  await app?.close();
}
console.log(
  `PASS: packaged ${process.platform}/${process.arch} launches with a clean profile, bundles its player and licence, opens Studio and contains no account files or placeholder images.`,
);
