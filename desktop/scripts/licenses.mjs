import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const directory = fileURLToPath(new URL('../assets/licenses', import.meta.url)); await mkdir(directory, { recursive: true });
for (const [name, url] of [
  ['mpv-Copyright.txt', 'https://raw.githubusercontent.com/mpv-player/mpv/e471496c56/Copyright'],
  ['GPL-2.0.txt', 'https://raw.githubusercontent.com/mpv-player/mpv/e471496c56/LICENSE.GPL'],
  ['LGPL-2.1.txt', 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/9a861e968/COPYING.LGPLv2.1'],
]) {
  const response = await fetch(url); if (!response.ok) throw new Error(`Licensen ${name} kunne ikke hentes (HTTP ${response.status}).`);
  await writeFile(join(directory, name), await response.text());
}
console.log('Afspillerens copyright og GPL/LGPL-licenstekster er hentet.');
