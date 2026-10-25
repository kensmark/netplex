import { readFile, writeFile, mkdir, readdir, access, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const desktop = fileURLToPath(new URL('..', import.meta.url));
const release = JSON.parse(await readFile(join(desktop, 'player-release.json'), 'utf8'));
const destination = join(desktop, 'vendor', 'mpv');
try { await access(join(destination, 'mpv.exe')); const installed = JSON.parse(await readFile(join(destination, 'netplex-release.json'), 'utf8')); if (installed.sha256 === release.sha256) { console.log('mpv er allerede klar.'); process.exit(0); } } catch { /* First installation. */ }
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Denne build er til Windows x64.');
const cache = join(desktop, '.cache'); await mkdir(cache, { recursive: true });
const archive = join(cache, `mpv-${release.version}.7z`);
let bytes;
try { bytes = await readFile(archive); } catch { /* Download below. */ }
if (!bytes || createHash('sha256').update(bytes).digest('hex') !== release.sha256) {
  console.log('Henter mpv til Windows…');
  const response = await fetch(release.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`mpv-download fejlede (HTTP ${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(bytes).digest('hex') !== release.sha256) throw new Error('mpv-download har et forkert SHA-256-fingeraftryk.');
  await writeFile(archive, bytes);
}
const unpack = join(cache, `unpacked-${release.version}`); await mkdir(unpack, { recursive: true });
const extracted = spawnSync(require('7zip-bin').path7za, ['x', archive, `-o${unpack}`, '-y'], { windowsHide: true, encoding: 'utf8' });
if (extracted.status !== 0) throw new Error(`mpv kunne ikke pakkes ud: ${extracted.stderr}`);
async function findPlayer(directory) {
  try { await access(join(directory, 'mpv.exe')); return directory; } catch { /* Look inside the archive's top-level directory. */ }
  for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isDirectory()) { const found = await findPlayer(join(directory, entry.name)); if (found) return found; }
}
const root = await findPlayer(unpack); if (!root) throw new Error('Arkivet indeholder ikke mpv.exe.');
await mkdir(destination, { recursive: true }); await cp(root, destination, { recursive: true });
await writeFile(join(destination, 'netplex-release.json'), JSON.stringify(release, null, 2));
console.log(`mpv ${release.version} er klar; SHA-256 er kontrolleret.`);
