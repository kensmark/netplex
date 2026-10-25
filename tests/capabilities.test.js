import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserCapabilities, supportsSourceVideo, supportsDirectFile, preferredMediaIndex } from '../public/playback-capabilities.js';

test('detects HEVC Main 10 and Dolby audio separately from baseline H.264', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { MediaSource: { isTypeSupported: mime => mime.includes('hvc1.2.4.') || mime.includes('ec-3') } };
    const capabilities = browserCapabilities({ canPlayType: () => '' });
    assert.deepEqual(capabilities, { hevc: false, hevcMain10: true, ac3: false, eac3: true });
    assert.equal(supportsSourceVideo({ videoCodec: 'hevc', bitDepth: 10 }, capabilities), true);
    assert.equal(supportsSourceVideo({ videoCodec: 'hevc', bitDepth: 8 }, capabilities), false);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
test('selects a compatible file version without falsely advertising native MKV playback', () => {
  const video = { canPlayType: mime => mime.includes('avc1') ? 'probably' : '' };
  const media = [
    { index: 0, container: 'mkv', videoCodec: 'hevc', audioCodec: 'eac3', bitDepth: 10 },
    { index: 1, container: 'mp4', videoCodec: 'h264', audioCodec: 'aac' },
  ];
  const capabilities = { hevc: false, hevcMain10: false, ac3: false, eac3: false };
  assert.equal(preferredMediaIndex(media, capabilities, video), 1);
  assert.equal(supportsDirectFile(media[0], { hevcMain10: true, eac3: true }, { canPlayType: () => 'probably' }), false);
  assert.equal(supportsDirectFile(media[1], capabilities, video), true);
});
test('checks the selected HEVC level instead of rejecting every file when level 5.1 is unavailable', () => {
  const previous = globalThis.window;
  try {
    globalThis.window = { MediaSource: { isTypeSupported: mime => mime.includes('hvc1.2.4.L150.') } };
    const video = { canPlayType: () => '' };
    assert.equal(browserCapabilities(video).hevcMain10, true);
    assert.equal(browserCapabilities(video, { videoLevel: 150 }).hevcMain10, true);
    assert.equal(browserCapabilities(video, { videoLevel: 153 }).hevcMain10, false);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
