import { readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let count = 0;
for (const folder of ['server', 'public', 'scripts', 'tests', 'desktop', 'desktop/tests', 'desktop/scripts']) {
  for (const name of await readdir(folder)) {
    if (!/\.(js|cjs|mjs)$/.test(name)) continue;
    const file = join(folder, name), result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { console.error(result.stderr); process.exit(1); }
    count++;
  }
}
for (const file of ['public/index.html', 'public/styles.css', 'public/cinematic.css', 'public/assets/unbounded-latin.woff2', 'node_modules/hls.js/dist/hls.min.js']) await access(file);
console.log(`NetPlex: ${count} JavaScript-filer og nødvendige lokale aktiver er kontrolleret.`);
