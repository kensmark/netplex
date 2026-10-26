import { readFile, writeFile, mkdir, access, cp, readdir, chmod } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeFolder, playerPath } from '../platform.js';

export async function setupMacPlayer() {
  if (process.platform !== 'darwin' || !['arm64', 'x64'].includes(process.arch))
    throw new Error('Build macOS packages on a native Mac runner.');
  const desktop = fileURLToPath(new URL('..', import.meta.url));
  const manifest = JSON.parse(await readFile(join(desktop, 'player-release.macos.json'), 'utf8')),
    release = manifest[process.arch];
  const destination = join(desktop, 'vendor', runtimeFolder()),
    marker = join(destination, 'netplex-release.json');
  try {
    await access(playerPath(join(desktop, 'vendor')));
    const installed = JSON.parse(await readFile(marker, 'utf8'));
    if (installed.sha256 === release.sha256 && installed.bundleId === 'dk.netplex.player') {
      console.log('macOS mpv runtime already verified.');
      return;
    }
  } catch {}
  const cache = join(desktop, '.cache');
  await mkdir(cache, { recursive: true });
  const archive = join(cache, `mpv-macos-${process.arch}-${release.version}.tar.gz`);
  let bytes = await readFile(archive).catch(() => null);
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== release.sha256) {
    const response = await fetch(release.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('macOS player download failed: ' + response.status);
    bytes = Buffer.from(await response.arrayBuffer());
    if (createHash('sha256').update(bytes).digest('hex') !== release.sha256)
      throw new Error('macOS player SHA-256 mismatch.');
    await writeFile(archive, bytes);
  }
  const unpack = join(cache, `mpv-macos-${process.arch}-${release.version}`);
  await mkdir(unpack, { recursive: true });
  execFileSync('/usr/bin/tar', ['-xzf', archive, '-C', unpack]);
  async function findBundle(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name === 'mpv.app') return path;
      const nested = await findBundle(path);
      if (nested) return nested;
    }
  }
  const source = await findBundle(unpack);
  if (!source) throw new Error('Player archive has no mpv.app.');
  await mkdir(destination, { recursive: true });
  await cp(source, join(destination, 'mpv.app'), { recursive: true, dereference: false });
  await chmod(playerPath(join(desktop, 'vendor')), 0o755);
  const plist = join(destination, 'mpv.app/Contents/Info.plist');
  for (const [key, value] of [
    ['CFBundleIdentifier', 'dk.netplex.player'],
    ['CFBundleName', 'NetPlex Player'],
    ['CFBundleDisplayName', 'NetPlex Player'],
  ])
    execFileSync('/usr/bin/plutil', ['-replace', key, '-string', value, plist]);
  const bundledDocs = join(dirname(source), 'documentation');
  try {
    await access(bundledDocs);
    await cp(bundledDocs, join(destination, 'documentation'), { recursive: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  await cp(join(desktop, 'assets/licenses'), join(destination, 'licenses'), { recursive: true });
  for (const [name, path] of [
    ['mpv-Copyright.txt', 'Copyright'],
    ['mpv-GPL.txt', 'LICENSE.GPL'],
  ]) {
    const response = await fetch(
      `https://raw.githubusercontent.com/mpv-player/mpv/v${release.version}/${path}`,
    );
    if (!response.ok) throw new Error('Player licence download failed.');
    await writeFile(join(destination, 'licenses', name), await response.text());
  }
  execFileSync(
    '/usr/bin/codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', join(destination, 'mpv.app')],
    { stdio: 'inherit' },
  );
  execFileSync('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    join(destination, 'mpv.app'),
  ]);
  await writeFile(
    marker,
    JSON.stringify(
      {
        ...release,
        arch: process.arch,
        bundleId: 'dk.netplex.player',
        minimumSystemVersion: manifest.minimumSystemVersion,
      },
      null,
      2,
    ),
  );
  console.log(
    `macOS ${process.arch} mpv ${release.version} is bundled, SHA-256 verified and ad-hoc signed.`,
  );
}
