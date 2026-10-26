import { build, Platform, Arch } from 'electron-builder';
import { listPackage, extractFile } from '@electron/asar';
import { access, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error(
    'Build the Windows installer on Windows x64; use build:mac for a Mac disk image.',
  );

const desktop = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(desktop, '..');
const application = join(root, 'Windows/NetPlex-win32-x64');
const output = join(root, 'Windows/Installers');
const tools = JSON.parse(await readFile(join(desktop, 'package.json'), 'utf8'));
const archive = join(application, 'resources/app.asar');
await access(join(application, 'NetPlex.exe'));
await access(join(application, 'resources/mpv/mpv.exe'));
const packaged = JSON.parse(extractFile(archive, 'package.json').toString('utf8'));
if (packaged.version !== tools.version)
  throw new Error('Byg Windows-programmet igen før installationsfilen.');
if (
  listPackage(archive).some((name) =>
    /(?:^|[\\/])(?:\.netplex|\.data|\.env|settings\.json|test-results|tests)(?:[\\/]|$)/i.test(
      name,
    ),
  )
) {
  throw new Error('Personlige data eller testfiler må ikke medtages i installationsfilen.');
}

const artifacts = await build({
  projectDir: desktop,
  prepackaged: application,
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    appId: 'dk.netplex.desktop',
    productName: 'NetPlex',
    executableName: 'NetPlex',
    electronVersion: tools.devDependencies.electron,
    directories: { output, buildResources: join(desktop, 'assets') },
    extraMetadata: {
      name: 'netplex-desktop',
      description: packaged.description,
      author: 'NetPlex',
    },
    npmRebuild: false,
    win: { icon: join(desktop, 'assets/icon.ico'), signAndEditExecutable: false },
    nsis: {
      artifactName: 'NetPlex-Setup-${version}.${ext}',
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'NetPlex',
      uninstallDisplayName: 'NetPlex',
      deleteAppDataOnUninstall: false,
      runAfterFinish: true,
      installerLanguages: ['da_DK', 'en_US'],
      language: '1030',
      include: join(desktop, 'assets/installer.nsh'),
      installerIcon: join(desktop, 'assets/icon.ico'),
      uninstallerIcon: join(desktop, 'assets/icon.ico'),
      differentialPackage: false,
    },
  },
});
const installer = artifacts.find((file) => file.endsWith('.exe'));
if (!installer) throw new Error('Installationsfilen blev ikke oprettet.');
const hash = createHash('sha256')
  .update(await readFile(installer))
  .digest('hex');
await writeFile(join(output, 'SHA256.txt'), `${hash}  ${installer.split(/[\\/]/).at(-1)}\n`);
await writeFile(
  join(output, 'LÆS MIG.txt'),
  `NetPlex ${tools.version} til Windows x64\n\nSend kun NetPlex-Setup-${tools.version}.exe til din ven.\n\n1. Dobbeltklik på installationsfilen, og vælg Installér.\n2. Åbn NetPlex fra skrivebordet eller Startmenuen.\n3. Vælg Log ind med Plex, og log ind med din egen Plex-konto i browseren.\n4. Gå tilbage til NetPlex, og vælg din Plex-server.\n\nAfspilleren følger med. Node.js og kommandofiler er ikke nødvendige.\nAdgang til en Plex-server og internetforbindelse til Plex kræves stadig.\nProgrammet kan fjernes under Windows-indstillinger > Apps.\n\nInstallationsfilen er ikke signeret med et udgivercertifikat. Windows kan\nderfor vise Ukendt udgiver eller en SmartScreen-advarsel.\n\nDine Plex-loginoplysninger er ikke med i installationsfilen.\n\n`,
);
console.log(
  `Installationsfil klar: ${installer} (${Math.round((await stat(installer)).size / 1024 / 1024)} MB)`,
);
