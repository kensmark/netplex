import { packager } from '@electron/packager';
import { mkdir, mkdtemp, cp, writeFile, access, readFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import './icon.mjs';
import '../../scripts/build-ui.mjs';
const desktop = fileURLToPath(new URL('..', import.meta.url)), root = resolve(desktop, '..');
const toolsPackage = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
// Check before packager starts replacing files, so a running build stays intact.
try { const executable=await open(join(root,'Windows/NetPlex-win32-x64/NetPlex.exe'),'r+');await executable.close(); }
catch(error) { if(error.code!=='ENOENT')throw new Error('Luk NetPlex, før Windows-programmet bygges igen.'); }
await access(join(desktop, 'vendor/mpv/mpv.exe'));
await mkdir(join(desktop, '.cache'), { recursive: true });
const stage = await mkdtemp(join(desktop, '.cache/app-'));
for (const folder of ['public', 'server']) await cp(join(root, folder), join(stage, folder), { recursive: true });
await cp(join(root, 'ASSETS.md'), join(stage, 'ASSETS.md'));
await cp(join(root, 'LICENSE'), join(stage, 'LICENSE'));
await mkdir(join(stage, 'desktop/assets'), { recursive: true });
for (const name of ['main.js', 'preload.cjs', 'local-client.js', 'controller.js', 'mpv.js', 'native-video.js', 'THIRD-PARTY.md']) await cp(join(desktop, name), join(stage, 'desktop', name));
await cp(join(desktop, 'node_modules/koffi'), join(stage, 'node_modules/koffi'), { recursive: true });
await cp(join(desktop, 'node_modules/@koromix/koffi-win32-x64'), join(stage, 'node_modules/@koromix/koffi-win32-x64'), { recursive: true });
await cp(join(desktop, 'assets/icon.ico'), join(stage, 'desktop/assets/icon.ico'));
await cp(join(root, 'node_modules/hls.js/dist'), join(stage, 'node_modules/hls.js/dist'), { recursive: true });
await cp(join(root, 'node_modules/hls.js/LICENSE'), join(stage, 'node_modules/hls.js/LICENSE'));
await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'netplex-desktop', productName: 'NetPlex', version: toolsPackage.version, description: 'Dit eget filmunivers med Plex og lokal videoafspilning.', main: 'desktop/main.js', type: 'module', author: 'NetPlex', private: true }, null, 2));
const output = join(root, 'Windows'), target = resolve(output, 'NetPlex-win32-x64');
// packager may replace an earlier build. Verify the exact managed output first.
if (!target.startsWith(root + sep) || target !== join(root, 'Windows', 'NetPlex-win32-x64')) throw new Error('Ugyldig outputmappe.');
const paths = await packager({ dir: stage, out: output, name: 'NetPlex', executableName: 'NetPlex', platform: 'win32', arch: 'x64', electronVersion: toolsPackage.devDependencies.electron, overwrite: true, asar: true, prune: false, icon: join(desktop, 'assets/icon.ico'), extraResource: [join(desktop, 'vendor/mpv')], appCopyright: 'NetPlex', win32metadata: { CompanyName: 'NetPlex', FileDescription: 'NetPlex Desktop', ProductName: 'NetPlex' } });
await cp(join(desktop, 'assets/licenses'), join(paths[0], 'resources/mpv/licenses'), { recursive: true });
await cp(join(desktop, 'THIRD-PARTY.md'), join(paths[0], 'THIRD-PARTY.md'));
await cp(join(desktop, 'README.md'), join(paths[0], 'LÆS MIG.md'));
console.log(`Windows-program klar: ${join(paths[0], 'NetPlex.exe')}`);
