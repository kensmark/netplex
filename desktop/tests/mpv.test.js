import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { MpvPlayer } from '../mpv.js';

test('mpv decodes HEVC Main 10 with two EAC3 tracks and local Danish subtitles', { skip: process.platform !== 'win32' }, async () => {
  const player = new MpvPlayer(fileURLToPath(new URL('../vendor/mpv/mpv.exe', import.meta.url)), { test: true });
  try {
    await player.start(); await player.command('set_property', 'pause', true);
    const loaded = once(player, 'file-loaded');
    await player.command('loadfile', fileURLToPath(new URL('./fixtures/hevc-main10.mkv', import.meta.url)), 'replace');
    await loaded;
    const tracks = await player.command('get_property', 'track-list');
    assert.equal(tracks.filter(track => track.type === 'audio').length, 2);
    assert.equal(tracks.filter(track => track.type === 'sub').length, 1);
    await player.command('set_property', 'sid', 1); await player.command('set_property', 'aid', 2);
    await player.command('seek', 2, 'absolute+exact'); await player.command('set_property', 'pause', false);
    let position = 0;
    for (let index = 0; index < 60; index++) { position = await player.command('get_property', 'time-pos'); if (position > 2.3) break; await new Promise(resolve => setTimeout(resolve, 50)); }
    assert.ok(position > 2.3, 'Video must advance after decoding');
    assert.equal((await player.command('get_property', 'video-params')).pixelformat, 'yuv420p10');
    assert.equal(await player.command('get_property', 'audio-codec-name'), 'eac3');
    assert.equal(await player.command('get_property', 'aid'), 2); assert.equal(await player.command('get_property', 'sid'), 1);
    // Exercise the actual native input -> IPC relay instead of only setting a
    // pause property directly, which missed clicks swallowed by the video host.
    const click = once(player, 'input');
    await player.command('keypress', 'MBTN_LEFT');
    assert.deepEqual(await click, ['pause']);
    await player.command('cycle', 'pause');
    assert.equal(await player.command('get_property', 'pause'), true);
    const pausedAt = await player.command('get_property', 'time-pos');
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(await player.command('get_property', 'time-pos'), pausedAt);
    const motion = once(player, 'input');
    await player.command('keypress', 'MOUSE_MOVE');
    assert.deepEqual(await motion, ['pointer']);
  } finally { await player.close(); }
});
