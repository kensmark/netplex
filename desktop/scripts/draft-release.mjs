import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
const repository = process.env.GITHUB_REPOSITORY,
  commit = process.env.GITHUB_SHA,
  token = process.env.GITHUB_TOKEN;
if (repository !== 'kensmark/netplex' || !/^\w{40}$/.test(commit || '') || !token)
  throw new Error('A trusted GitHub release job is required.');
const root = resolve(import.meta.dirname, '../..'),
  directory = join(root, 'release-assets');
const pkg = JSON.parse(await readFile(join(root, 'desktop/package.json'), 'utf8')),
  tag = 'v' + pkg.version;
const names = await readdir(directory),
  builds = await Promise.all(
    names
      .filter((name) => /^build-info-.*\.json$/.test(name))
      .map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'))),
  );
const targets = builds.map((build) => build.platform + '/' + build.arch).sort();
if (JSON.stringify(targets) !== JSON.stringify(['darwin/arm64', 'darwin/x64', 'win32/x64']))
  throw new Error('All three desktop builds must pass before a release is drafted.');
const assets = [];
for (const build of builds) {
  if (build.commit !== commit || build.version !== pkg.version)
    throw new Error('Artifacts must match the release version and source commit.');
  for (const asset of build.assets) {
    if (!/^NetPlex-[\w.\-]+\.(exe|dmg)$/.test(asset.name))
      throw new Error('Unexpected release artifact name.');
    const bytes = await readFile(join(directory, asset.name)),
      hash = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== asset.size || hash !== asset.sha256)
      throw new Error('Artifact checksum mismatch.');
    assets.push({ ...asset, bytes });
  }
}
const sums = Buffer.from(
  assets
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((asset) => `${asset.sha256}  ${asset.name}\n`)
    .join(''),
);
const windows = assets.find(asset => asset.name.endsWith('.exe'));
const windowsSums = await readFile(join(directory, 'SHA256.txt'));
if (windowsSums.toString().trim() !== `${windows.sha256}  ${windows.name}`)
  throw new Error('Windows checksum does not match its installer.');
const instructions = Buffer.from(await readFile(join(directory, 'LÆS MIG.txt'), 'utf8') +
  '\nmacOS 14 eller nyere: Vælg arm64 til Apple Silicon (M1 eller nyere) eller x64 til Intel. Åbn DMG-filen, og træk NetPlex til Applications. Mac-udgaven er en ad-hoc-signeret forhåndsvisning, ikke notariseret af Apple. Efter en blokeret første start kan du vælge Systemindstillinger > Anonymitet & sikkerhed > Åbn alligevel for en download, du stoler på. Afspilning åbner i sit eget NetPlex Player-vindue.\n');
for (const [name, bytes] of [['SHA256.txt', windowsSums], ['LÆS MIG.txt', instructions]])
  assets.push({name, bytes, size:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex')});
await writeFile(join(directory, 'SHA256SUMS.txt'), sums);
assets.push({
  name: 'SHA256SUMS.txt',
  size: sums.length,
  sha256: createHash('sha256').update(sums).digest('hex'),
  bytes: sums,
});
const headers = {
  Authorization: 'Bearer ' + token,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  'User-Agent': 'NetPlex-build',
};
async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch('https://api.github.com' + path, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}
const releases = '/repos/' + repository + '/releases';
let release = (await api(releases + '?per_page=100')).find((item) => item.tag_name === tag);
if (release && !release.draft) throw new Error('Never replace a published release or installer.');
if (release && release.target_commitish !== commit)
  throw new Error('An existing draft uses a different source commit; review it before retrying.');
if (!release)
  release = await api(releases, {
    method: 'POST',
    body: {
      tag_name: tag,
      target_commitish: commit,
      name: 'NetPlex ' + pkg.version + ' — Windows and macOS preview',
      body: await readFile(join(root, 'docs/releases/' + tag + '.md'), 'utf8'),
      draft: true,
      prerelease: true,
    },
  });
for (const asset of assets) {
  const existing = release.assets.find((item) => item.name === asset.name);
  if (existing) {
    if (existing.size !== asset.size || existing.digest !== 'sha256:' + asset.sha256)
      throw new Error('Conflicting draft asset.');
    continue;
  }
  const url = new URL(release.upload_url.split('{')[0]);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'uploads.github.com' ||
    !url.pathname.startsWith('/repos/' + repository + '/releases/')
  )
    throw new Error('Untrusted upload destination.');
  url.searchParams.set('name', asset.name);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(asset.size),
    },
    body: asset.bytes,
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Installer upload failed: HTTP ' + response.status);
  const uploaded = await response.json();
  if (uploaded.size !== asset.size || uploaded.digest !== 'sha256:' + asset.sha256)
    throw new Error('Uploaded asset integrity check failed.');
  console.log('Verified draft asset: ' + asset.name);
}
console.log('Draft release ready for final review: ' + release.html_url);
