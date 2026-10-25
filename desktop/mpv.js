import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';

// Only the main process can send commands. URLs and authentication are supplied
// over the private IPC pipe, never through the process command line or a log.
export class MpvPlayer extends EventEmitter {
  constructor(executable, { windowId, test = false } = {}) {
    super(); this.executable = executable; this.windowId = windowId; this.test = test;
    this.pending = new Map(); this.sequence = 0; this.closed = false;
  }
  async start() {
    this.pipe = `\\\\.\\pipe\\netplex-${randomUUID()}`;
    const args = ['--no-config', '--idle=yes', '--keep-open=yes', '--terminal=no', '--osc=no', '--osd-level=0', '--input-default-bindings=no', '--input-vo-keyboard=yes', '--input-cursor=yes', '--window-dragging=no', '--cursor-autohide=2400', '--input-ipc-server=' + this.pipe, '--hwdec=auto-safe', '--cache=yes', '--demuxer-max-bytes=128MiB', '--demuxer-max-back-bytes=32MiB', '--sid=no', '--force-window=yes', '--title=NetPlex'];
    if (this.windowId) args.push(`--wid=${this.windowId}`, '--vo=gpu', '--gpu-api=d3d11', '--gpu-context=d3d11');
    if (this.test) args.push('--vo=null', '--ao=null', '--hwdec=no', '--force-window=no');
    this.process = spawn(this.executable, args, { stdio: 'ignore', windowsHide: true });
    let startupError;
    this.process.on('error', error => { startupError = error; this.emit('failure', new Error('Den indbyggede afspiller kunne ikke startes. Genbyg Windows-appen.')); });
    this.process.on('exit', () => { this.closed = true; this.socket?.destroy(); this.rejectPending(); this.emit('exit'); });
    const deadline = Date.now() + 10000;
    while (!this.socket && Date.now() < deadline && !this.closed && !startupError) {
      try {
        this.socket = await new Promise((resolve, reject) => {
          const socket = createConnection(this.pipe); socket.once('connect', () => { socket.removeAllListeners('error'); resolve(socket); }); socket.once('error', error => { socket.destroy(); reject(error); });
        });
      } catch { await new Promise(resolve => setTimeout(resolve, 50)); }
    }
    if (!this.socket) { this.process.kill(); throw new Error('Den indbyggede afspiller svarede ikke. Prøv at starte NetPlex igen.'); }
    this.socket.setEncoding('utf8'); let buffer = '';
    this.socket.on('data', chunk => {
      buffer += chunk;
      for (let position; (position = buffer.indexOf('\n')) >= 0;) {
        const line = buffer.slice(0, position); buffer = buffer.slice(position + 1);
        let data; try { data = JSON.parse(line); } catch { continue; }
        if (data.request_id && this.pending.has(data.request_id)) {
          const request = this.pending.get(data.request_id); this.pending.delete(data.request_id); clearTimeout(request.timer);
          data.error === 'success' ? request.resolve(data.data) : request.reject(new Error(`Afspilleren afviste kommandoen (${data.error}).`));
        } else if (data.event) {
          if (data.event === 'client-message' && data.args?.[0] === 'netplex-input' && ['pointer', 'pause', 'fullscreen', 'escape', 'back', 'forward', 'mute'].includes(data.args[1])) this.emit('input', data.args[1]);
          this.emit(data.event, data);
        }
      }
      if (buffer.length > 1048576) { buffer = ''; this.emit('failure', new Error('Afspilleren sendte et ugyldigt svar.')); }
    });
    this.socket.on('error', () => this.rejectPending()); this.socket.on('close', () => this.rejectPending());
    // The native video window receives input outside Chromium's DOM. Relay only
    // these fixed actions through the private pipe to the same NetPlex controls.
    for (const [key, action] of [['MBTN_LEFT', 'pause'], ['MOUSE_MOVE', 'pointer'], ['MOUSE_ENTER', 'pointer'], ['SPACE', 'pause'], ['f', 'fullscreen'], ['ESC', 'escape'], ['LEFT', 'back'], ['RIGHT', 'forward'], ['m', 'mute']]) {
      await this.command('keybind', key, `script-message netplex-input ${action}`);
    }
    return this;
  }
  command(...command) {
    if (!this.socket || this.socket.destroyed || this.closed) return Promise.reject(new Error('Afspilleren er lukket.'));
    const request_id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(request_id); reject(new Error('Afspilleren svarede ikke.')); }, 5000);
      this.pending.set(request_id, { resolve, reject, timer });
      this.socket.write(JSON.stringify({ command, request_id }) + '\n');
    });
  }
  async observe(properties) { for (let index = 0; index < properties.length; index++) await this.command('observe_property', index + 1, properties[index]); }
  rejectPending() { for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('Afspilleren er lukket.')); } this.pending.clear(); }
  async close() {
    if (!this.closed) { try { await this.command('quit'); } catch { /* The process may already have exited. */ } }
    if (this.process && !this.closed) {
      await Promise.race([new Promise(resolve => this.process.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 1000))]);
      if (!this.closed) this.process.kill();
    }
    this.socket?.destroy(); this.rejectPending(); this.closed = true;
  }
}
