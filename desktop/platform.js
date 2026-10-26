import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp, chmod, unlink, rmdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export function runtimeFolder(platform = process.platform, arch = process.arch) {
  if (platform === 'win32' && arch === 'x64') return 'mpv';
  if (platform === 'darwin' && ['arm64', 'x64'].includes(arch)) return `mpv-darwin-${arch}`;
  throw new Error(`Unsupported desktop target: ${platform}/${arch}`);
}
export function playerPath(base, platform = process.platform, arch = process.arch) {
  return join(
    base,
    runtimeFolder(platform, arch),
    ...(platform === 'win32' ? ['mpv.exe'] : ['mpv.app', 'Contents', 'MacOS', 'mpv']),
  );
}
export async function createIpcEndpoint(platform = process.platform) {
  if (platform === 'win32')
    return { address: `\\\\.\\pipe\\netplex-${randomUUID()}`, directory: null };
  let directory = await mkdtemp(join(tmpdir(), 'npv-'));
  if (Buffer.byteLength(join(directory, 's')) > 100) {
    await rmdir(directory);
    directory = await mkdtemp('/tmp/npv-');
  }
  await chmod(directory, 0o700);
  return { address: join(directory, 's'), directory };
}
export async function removeIpcEndpoint(endpoint) {
  if (!endpoint?.directory) return;
  await unlink(endpoint.address).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
  await rmdir(endpoint.directory).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}
export function playerArguments({
  address,
  platform = process.platform,
  windowId,
  test = false,
  externalWindow = false,
}) {
  const args = [
    '--no-config',
    '--idle=yes',
    '--keep-open=yes',
    '--terminal=no',
    `--osc=${externalWindow ? 'yes' : 'no'}`,
    `--input-default-bindings=${externalWindow ? 'yes' : 'no'}`,
    '--input-vo-keyboard=yes',
    '--input-cursor=yes',
    `--window-dragging=${externalWindow ? 'yes' : 'no'}`,
    '--cursor-autohide=2400',
    '--input-ipc-server=' + address,
    '--hwdec=auto-safe',
    '--cache=yes',
    '--demuxer-max-bytes=128MiB',
    '--demuxer-max-back-bytes=32MiB',
    '--sid=no',
    '--force-window=yes',
    '--title=NetPlex Player',
  ];
  if (!externalWindow) args.push('--osd-level=0');
  if (platform === 'win32' && windowId)
    args.push(`--wid=${windowId}`, '--vo=gpu', '--gpu-api=d3d11', '--gpu-context=d3d11');
  if (test) args.push('--vo=null', '--ao=null', '--hwdec=no', '--force-window=no');
  return args;
}
