import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
if (process.platform !== 'darwin') throw new Error('Create the ICNS icon on macOS.');
const desktop = fileURLToPath(new URL('..', import.meta.url)),
  directory = join(desktop, '.cache/NetPlex.iconset');
await mkdir(directory, { recursive: true });
const png = join(desktop, '.cache/netplex-icon.png');
await writeFile(png, (await readFile(join(desktop, 'assets/icon.ico'))).subarray(22));
for (const size of [16, 32, 128, 256, 512])
  for (const scale of [1, 2]) {
    const pixels = size * scale,
      target = join(directory, `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`);
    execFileSync('/usr/bin/sips', ['-z', String(pixels), String(pixels), png, '--out', target], {
      stdio: 'ignore',
    });
  }
execFileSync('/usr/bin/iconutil', [
  '-c',
  'icns',
  directory,
  '-o',
  join(desktop, 'assets/icon.icns'),
]);
