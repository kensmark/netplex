import { build, Platform, Arch } from 'electron-builder';
import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
if (process.platform !== 'darwin') throw new Error('Create macOS disk images on a Mac runner.');
const desktop = fileURLToPath(new URL('..', import.meta.url)),
  root = resolve(desktop, '..');
const pkg = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const application = join(root, `Mac/NetPlex-darwin-${process.arch}/NetPlex.app`),
  output = join(root, 'Mac/Installers');
await access(join(application, 'Contents/Resources/app.asar'));
const artifacts = await build({
  projectDir: desktop,
  prepackaged: application,
  targets: Platform.MAC.createTarget(['dmg'], process.arch === 'arm64' ? Arch.arm64 : Arch.x64),
  publish: 'never',
  config: {
    appId: 'dk.netplex.desktop',
    productName: 'NetPlex',
    electronVersion: pkg.devDependencies.electron,
    directories: { output, buildResources: join(desktop, 'assets') },
    npmRebuild: false,
    mac: {
      identity: null,
      category: 'public.app-category.video',
      icon: join(desktop, 'assets/icon.icns'),
      minimumSystemVersion: '14.0',
      artifactName: 'NetPlex-${version}-macOS-${arch}.${ext}',
    },
    dmg: {
      sign: false,
      format: 'UDZO',
      contents: [
        { x: 150, y: 180, type: 'file', path: application },
        { x: 440, y: 180, type: 'link', path: '/Applications' },
      ],
      window: { width: 600, height: 380 },
    },
  },
});
const file = artifacts.find((path) => path.endsWith('.dmg'));
if (!file) throw new Error('No macOS installer created.');
await writeFile(
  join(output, `SHA256-${process.arch}.txt`),
  createHash('sha256')
    .update(await readFile(file))
    .digest('hex') +
    '  ' +
    file.split('/').at(-1) +
    '\n',
);
console.log('macOS disk image ready: ' + file);
