import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { DesktopPlayback } from '../controller.js';

test('native playback forwards a qualified source without exposing upstream credentials', async () => {
  const requests = [],
    player = new EventEmitter();
  player.start = async () => {
    throw new Error('Intentional test stop');
  };
  player.close = async () => {};
  const controller = new DesktopPlayback({
    client: {
      request: async (path, body) => {
        requests.push({ path, body });
        return { id: 'multi-source-session', duration: 100 };
      },
    },
    emit: () => {},
    showVideo: () => {},
    playerFactory: () => player,
  });
  const sourceId = 's-' + 'a'.repeat(24) + '-17';
  await assert.rejects(controller.play({ id: '1', sourceId }), /Intentional/);
  assert.deepEqual(requests[0], {
    path: '/api/native/playback',
    body: { id: '1', sourceId, mediaIndex: 0 },
  });
  await assert.rejects(controller.play({ id: 'https://foreign.example/video' }), /gyldig/);
});

test('failed player startup releases its session without overwriting Plex progress', async () => {
  const requests = [],
    lifecycle = [],
    player = new EventEmitter();
  player.start = async () => {
    throw new Error('Player unavailable');
  };
  player.close = async () => {
    lifecycle.push('player-closed');
  };
  const controller = new DesktopPlayback({
    client: {
      origin: 'http://127.0.0.1:3246',
      request: async (path, body) => {
        requests.push({ path, body });
        return { id: 'session-1', duration: 100, resume: 60 };
      },
    },
    emit: () => {},
    showVideo: () => {},
    playerFactory: () => player,
    releaseVideo: () => lifecycle.push('surface-destroyed'),
  });
  await assert.rejects(controller.play({ id: '1' }), /Player unavailable/);
  assert.deepEqual(requests.at(-1), { path: '/api/playback/session-1/stop', body: {} });
  assert.ok(!requests.some((request) => request.path.endsWith('/timeline')));
  assert.equal(controller.snapshot().active, false);
  assert.deepEqual(lifecycle, ['player-closed', 'surface-destroyed']);
});

test('a failed surface factory releases the native session without leaving a window behind', async () => {
  const requests = [];
  let released = 0;
  const controller = new DesktopPlayback({
    client: {
      request: async (path, body) => {
        requests.push({ path, body });
        return { id: 'failed-surface', resume: 60 };
      },
    },
    emit: () => {},
    showVideo: () => {},
    playerFactory: () => {
      throw new Error('Surface unavailable');
    },
    releaseVideo: () => released++,
  });
  await assert.rejects(controller.play({ id: '1' }), /Surface unavailable/);
  assert.equal(released, 1);
  assert.deepEqual(requests.at(-1), { path: '/api/playback/failed-surface/stop', body: {} });
});

test('the renderer cannot send arbitrary mpv commands or select nonexistent tracks', async () => {
  const commands = [];
  const controller = new DesktopPlayback({ client: {}, emit: () => {}, showVideo: () => {} });
  controller.active = {
    started: true,
    state: { tracks: [{ type: 'audio', id: 1 }], duration: 100 },
    player: { command: async (...command) => commands.push(command) },
  };
  await assert.rejects(controller.command('run', 'cmd.exe'), /Ugyldig/);
  await assert.rejects(controller.command('audio', 999), /findes ikke/);
  assert.deepEqual(commands, []);
  await controller.command('audio', 1);
  assert.deepEqual(commands, [['set_property', 'aid', 1]]);
});
