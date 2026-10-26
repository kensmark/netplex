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

test('closing a separate native player saves its last observed progress and stops the session', async () => {
  const requests = [],
    states = [],
    player = new EventEmitter();
  let closed = false;
  player.externalWindow = true;
  player.start = async () => player;
  player.observe = async () => {};
  player.focus = async () => {};
  player.command = async (command, property) => {
    if (closed) throw new Error('closed');
    if (command === 'get_property' && property === 'track-list') return [];
  };
  player.close = async () => {
    closed = true;
  };
  const controller = new DesktopPlayback({
    client: {
      origin: 'http://127.0.0.1:1234',
      cookie: 'fixture-session',
      request: async (path, body) => {
        requests.push({ path, body });
        return {
          id: 'external-session',
          duration: 12,
          resume: 0,
          source: '/stream',
          nativeStreams: [],
          media: [],
        };
      },
    },
    emit: (state) => states.push(state),
    showVideo: () => {},
    playerFactory: () => player,
  });
  try {
    await controller.play({ id: '1' });
    player.emit('file-loaded');
    for (let i = 0; i < 50 && !controller.active.started; i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(controller.active.started, true);
    player.emit('property-change', { name: 'time-pos', data: 4.2 });
    closed = true;
    player.emit('exit', 0);
    for (let i = 0; i < 50 && !states.some((state) => !state.active); i++)
      await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(controller.snapshot().active, false);
    assert.ok(!states.some((state) => state.error));
    assert.deepEqual(requests.at(-1), {
      path: '/api/playback/external-session/stop',
      body: { time: 4200 },
    });
  } finally {
    await controller.stop();
  }
});
