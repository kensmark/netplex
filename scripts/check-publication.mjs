import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const git = (args, options = {}) =>
  execFileSync('git', ['-c', 'safe.directory=' + resolve('.').replaceAll('\\', '/'), ...args], {
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
const names = git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean);
if (!names.length) {
  console.log('No staged files to publish.');
  process.exit(0);
}
const secrets = new Set();
function collect(value, key = '') {
  if (value && typeof value === 'object') {
    for (const [name, child] of Object.entries(value)) collect(child, name);
  } else if (typeof value === 'string' && value.length >= 8 && /token|password|secret/i.test(key))
    secrets.add(value);
}
for (const path of [
  '.netplex/settings.json',
  'desktop/.data/settings.json',
  ...(process.platform === 'darwin'
    ? [join(homedir(), 'Library/Application Support/NetPlex Desktop/settings.json')]
    : process.env.APPDATA
      ? [join(process.env.APPDATA, 'NetPlex Desktop/settings.json')]
      : []),
]) {
  try {
    collect(JSON.parse(await readFile(path, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT')
      throw new Error('Could not safely inspect local credentials; fix before publishing.');
  }
}
const forbidden =
  /(?:^|\/)(?:\.netplex|\.data|\.cache|\.tools|\.codex|\.agents|node_modules|Windows|Mac|release-assets|test-results|vendor)(?:\/|$)|(?:^|\/)(?:settings\.json|design\.json|design\.backup\.json|design\.tmp|themes\.json|\.env(?:\..*)?)$|\.(?:pem|pfx|p12)$/i;
const excluded = new Set([
  'Start NetPlex.cmd',
  'server/index.js',
  'src/design/validate.generated.js',
  'src/design/validate-v1.generated.js',
  'src/design/validate-packages.generated.js',
]);
let total = 0;
for (const name of names) {
  if (forbidden.test(name) || excluded.has(name) || name.startsWith('public/design/'))
    throw new Error('Private, generated or desktop-excluded path staged: ' + name);
  const bytes = git(['show', ':' + name]);
  total += bytes.length;
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error('Large file staged; use Releases for binaries: ' + name);
  if ([...secrets].some((secret) => bytes.includes(Buffer.from(secret))))
    throw new Error('A locally stored credential appears in staged file: ' + name);
  const text = bytes.toString('utf8');
  if (
    /\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)
  )
    throw new Error('Credential or signing key pattern found in staged file: ' + name);
}
console.log(
  `PASS: ${names.length} staged files (${(total / 1024 / 1024).toFixed(1)} MB); no forbidden outputs or detected credentials. Secret values were not logged.`,
);
