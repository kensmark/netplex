import { packager } from '@electron/packager';
import { mkdir, mkdtemp, cp, writeFile, access, readFile, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { runtimeFolder, playerPath } from '../platform.js';
import './icon.mjs';
import '../../scripts/build-ui.mjs';

const desktop = fileURLToPath(new URL('..', import.meta.url)),
  root = resolve(desktop, '..');
const platform = process.platform,
  arch = process.arch,
  mac = platform === 'darwin';
if (!mac && !(platform === 'win32' && arch === 'x64'))
  throw new Error('Build Windows x64 on Windows, or macOS arm64/x64 on its native Mac runner.');
const toolsPackage = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const output = join(root, mac ? 'Mac' : 'Windows'),
  target = join(output, `NetPlex-${mac ? 'darwin' : 'win32'}-${arch}`);
if (!resolve(target).startsWith(root + sep))
  throw new Error('Output must stay inside the project.');
if (!mac) {
  try {
    const executable = await open(join(target, 'NetPlex.exe'), 'r+');
    await executable.close();
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('Luk den byggede NetPlex, før den erstattes.');
  }
}
await access(playerPath(join(desktop, 'vendor')));
await mkdir(join(desktop, '.cache'), { recursive: true });
const stage = await mkdtemp(join(desktop, '.cache/app-'));
for (const folder of ['public', 'server'])
  await cp(join(root, folder), join(stage, folder), {
    recursive: true,
    filter: (source) => source !== join(root, 'server/index.js'),
  });
for (const name of ['ASSETS.md', 'LICENSE']) await cp(join(root, name), join(stage, name));
await mkdir(join(stage, 'desktop/assets'), { recursive: true });
for (const name of [
  'main.js',
  'preload.cjs',
  'local-client.js',
  'controller.js',
  'mpv.js',
  'platform.js',
  'native-video.js',
  'native-video-win32.js',
  'THIRD-PARTY.md',
])
  await cp(join(desktop, name), join(stage, 'desktop', name));
if (!mac) {
  await cp(join(desktop, 'node_modules/koffi'), join(stage, 'node_modules/koffi'), {
    recursive: true,
  });
  await cp(
    join(desktop, 'node_modules/@koromix/koffi-win32-x64'),
    join(stage, 'node_modules/@koromix/koffi-win32-x64'),
    { recursive: true },
  );
}
await cp(join(desktop, 'assets/icon.ico'), join(stage, 'desktop/assets/icon.ico'));
await cp(join(root, 'node_modules/hls.js/dist'), join(stage, 'node_modules/hls.js/dist'), {
  recursive: true,
});
await cp(join(root, 'node_modules/hls.js/LICENSE'), join(stage, 'node_modules/hls.js/LICENSE'));
await writeFile(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'netplex-desktop',
      productName: 'NetPlex',
      version: toolsPackage.version,
      description: 'Dit eget filmunivers med Plex og lokal videoafspilning.',
      main: 'desktop/main.js',
      type: 'module',
      author: 'NetPlex',
      license: 'MIT',
      private: true,
    },
    null,
    2,
  ),
);
let icon = join(desktop, 'assets/icon.ico');
if (mac) {
  await import('./icon-macos.mjs');
  icon = join(desktop, 'assets/icon.icns');
}
const paths = await packager({
  dir: stage,
  out: output,
  name: 'NetPlex',
  executableName: 'NetPlex',
  platform,
  arch,
  electronVersion: toolsPackage.devDependencies.electron,
  overwrite: true,
  asar: true,
  prune: false,
  icon,
  extraResource: [join(desktop, 'vendor', runtimeFolder())],
  appCopyright: 'NetPlex',
  ...(mac
    ? {
        appBundleId: 'dk.netplex.desktop',
        appCategoryType: 'public.app-category.video',
        darwinDarkModeSupport: true,
        extendInfo: { LSMinimumSystemVersion: '14.0', NSHighResolutionCapable: true },
        osxSign: {
          identity: '-',
          identityValidation: false,
          optionsForFile: () => ({
            hardenedRuntime: false,
            entitlements: join(desktop, 'assets/entitlements.mac.plist'),
          }),
        },
      }
    : {
        win32metadata: {
          CompanyName: 'NetPlex',
          FileDescription: 'NetPlex Desktop',
          ProductName: 'NetPlex',
        },
      }),
});
const resources = mac
  ? join(paths[0], 'NetPlex.app/Contents/Resources')
  : join(paths[0], 'resources');
if (mac)
  execFileSync('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    join(paths[0], 'NetPlex.app'),
  ]);
else
  await cp(join(desktop, 'assets/licenses'), join(resources, 'mpv/licenses'), { recursive: true });
for (const name of ['THIRD-PARTY.md', 'README.md'])
  await cp(join(desktop, name), join(paths[0], name));
console.log(`${mac ? 'macOS' : 'Windows'} application ready: ${paths[0]}`);
