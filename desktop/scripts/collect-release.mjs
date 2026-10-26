import { mkdir, readdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '../..'),
  pkg = JSON.parse(await readFile(join(root, 'desktop/package.json'), 'utf8'));
const directory = join(
  root,
  process.platform === 'darwin' ? 'Mac/Installers' : 'Windows/Installers',
);
const files = (await readdir(directory)).filter(
  (name) => name.startsWith('NetPlex-') && name.includes(pkg.version) && /\.(exe|dmg)$/.test(name),
);
if (files.length !== 1) throw new Error('Expected exactly one installer for this job.');
const output = join(root, 'release-assets');
await mkdir(output, { recursive: true });
const manifest = {
  version: pkg.version,
  platform: process.platform,
  arch: process.arch,
  commit: process.env.GITHUB_SHA || null,
  assets: [],
};
for (const name of files) {
  const source = join(directory, name),
    bytes = await readFile(source);
  await copyFile(source, join(output, name));
  manifest.assets.push({
    name: basename(name),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
}
await writeFile(
  join(output, `build-info-${process.platform}-${process.arch}.json`),
  JSON.stringify(manifest, null, 2) + '\n',
);
console.log('Collected verified installer metadata for ' + process.platform + '/' + process.arch);
