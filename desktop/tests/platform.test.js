import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { stat, access } from 'node:fs/promises';
import {
  runtimeFolder,
  playerPath,
  playerArguments,
  createIpcEndpoint,
  removeIpcEndpoint,
} from '../platform.js';
import { createVideoSurface } from '../native-video.js';

test('macOS uses its own player window and does not load Windows FFI', async () => {
  const surface = await createVideoSurface({}, 'darwin');
  assert.equal(surface.embedded, false);
  assert.equal(surface.create(), undefined);
  surface.layout(null, false);
  surface.destroy();
  const args = playerArguments({
    platform: 'darwin',
    address: '/tmp/private/s',
    windowId: 123,
    externalWindow: true,
  });
  assert.ok(args.includes('--osc=yes'));
  assert.ok(args.includes('--input-default-bindings=yes'));
  assert.ok(!args.some((arg) => /d3d11|^--wid=/.test(arg)));
});
test('Windows retains embedded D3D playback and renderer input handling', () => {
  const args = playerArguments({ platform: 'win32', address: 'test-pipe', windowId: 123 });
  for (const option of [
    '--wid=123',
    '--gpu-api=d3d11',
    '--osc=no',
    '--input-default-bindings=no',
    '--osd-level=0',
  ])
    assert.ok(args.includes(option));
  assert.equal(runtimeFolder('win32', 'x64'), 'mpv');
});
test('both Mac architectures resolve a bundled executable without Homebrew', () => {
  for (const arch of ['arm64', 'x64'])
    assert.equal(
      playerPath('resources', 'darwin', arch),
      join('resources', `mpv-darwin-${arch}`, 'mpv.app', 'Contents', 'MacOS', 'mpv'),
    );
  assert.throws(() => runtimeFolder('linux', 'x64'), /Unsupported/);
});
test(
  'macOS IPC uses a private directory and removes its socket location',
  { skip: process.platform !== 'darwin' },
  async () => {
    const endpoint = await createIpcEndpoint();
    try {
      assert.equal((await stat(endpoint.directory)).mode & 0o777, 0o700);
      assert.ok(Buffer.byteLength(endpoint.address) <= 100);
    } finally {
      await removeIpcEndpoint(endpoint);
    }
    await assert.rejects(access(endpoint.directory));
  },
);
