import { MpvPlayer } from './mpv.js';
import {isMediaId} from '../public/media-id.js';

const observed = ['time-pos', 'duration', 'pause', 'paused-for-cache', 'volume', 'mute', 'track-list', 'eof-reached', 'video-codec', 'audio-codec-name', 'hwdec-current'];
const finite = value => typeof value === 'number' && Number.isFinite(value);
export class DesktopPlayback {
  constructor({ client, executable, windowId, emit, showVideo, input = () => {}, diagnostic = false, playerFactory, releaseVideo = () => {} }) {
    Object.assign(this, { client, executable, windowId, emit, showVideo, input, diagnostic, releaseVideo });
    this.playerFactory = playerFactory || (() => new MpvPlayer(executable, { windowId }));
    this.syncQueue = Promise.resolve();
  }
  snapshot() { return this.active ? { ...this.active.state } : { active: false }; }
  notify() { this.emit(this.snapshot()); }
  async play(options) {
    if (!isMediaId(options?.id) || (options.sourceId!==undefined&&!isMediaId(options.sourceId)) || !Number.isInteger(Number(options.mediaIndex || 0)) || Number(options.mediaIndex || 0) < 0) throw new Error('Vælg en gyldig film eller episode.');
    await this.stop();
    const session = await this.client.request('/api/native/playback', { id: String(options.id),...(options.sourceId?{sourceId:String(options.sourceId)}:{}), mediaIndex: Number(options.mediaIndex || 0) });
    const active = this.active = { session, started: false, finished: false, state: { active: true, loading: true, paused: true, buffering: false, position: 0, duration: session.duration, volume: 80, mute: false, tracks: [], ended: false } };
    try {
      const player = active.player = this.playerFactory(); this.showVideo(false); this.notify();
      player.on('input', action => { if (this.active === active && !active.stopping) this.input(action); });
      player.on('property-change', data => {
        if (this.active !== active) return;
        const map = { 'time-pos': 'position', duration: 'duration', pause: 'paused', 'paused-for-cache': 'buffering', 'track-list': 'tracks', 'eof-reached': 'ended', 'video-codec': 'videoCodec', 'audio-codec-name': 'audioCodec', 'hwdec-current': 'hardware' };
        const key = map[data.name] || data.name;
        if (data.data !== undefined) active.state[key] = key === 'tracks' ? this.cleanTracks(data.data) : data.data;
        if (data.name === 'eof-reached' && data.data === true && active.started && !active.finished) { active.finished = true; void this.timeline('stopped', true); }
        if (data.name === 'pause' && active.started && !active.finished) void this.timeline(data.data ? 'paused' : 'playing');
        this.notify();
      });
      player.on('file-loaded', () => { void this.loaded(active, options).catch(() => this.fail(active, 'Filmen kunne ikke klargøres. Prøv igen.')); });
      player.on('end-file', event => { if (event.reason === 'error') this.fail(active, 'Filmen kunne ikke afspilles. Kontrollér forbindelsen til Plex, eller prøv en anden version.'); });
      player.on('failure', () => this.fail(active, 'Den indbyggede afspiller kunne ikke startes. Genstart NetPlex.'));
      player.on('exit', () => { if (this.active === active && !active.stopping) this.fail(active, 'Afspilleren blev lukket. Start filmen igen.'); });
      await player.start();
      await player.observe(observed);
      await player.command('set_property', 'http-header-fields', [`Cookie: ${this.client.cookie}`]);
      await player.command('set_property', 'pause', true);
      await player.command('set_property', 'volume', finite(options.volume) ? Math.max(0, Math.min(100, options.volume)) : 80);
      const source = new URL(session.source, this.client.origin);
      if (source.origin !== this.client.origin) throw new Error('Ugyldig lokal streamingadresse.');
      await player.command('loadfile', source.href, 'replace');
      return { duration: session.duration, media: session.media };
    } catch (error) { await this.stop(); throw error; }
  }
  cleanTracks(tracks) {
    return Array.isArray(tracks) ? tracks.filter(t => ['audio', 'sub'].includes(t.type)).map(t => ({ id: t.id, type: t.type, title: t.title || '', language: t.lang || '', codec: t.codec || '', selected: Boolean(t.selected), external: Boolean(t.external) })) : [];
  }
  async loaded(active, options) {
    if (this.active !== active) return;
    const { player, session } = active;
    const embedded = await player.command('get_property', 'track-list');
    for (const stream of session.nativeStreams.filter(s => s.type === 3 && s.external && s.source)) {
      await player.command('sub-add', new URL(stream.source, this.client.origin).href, 'auto', stream.title || 'Undertekster', stream.language || '');
    }
    for (const [type, trackType, property] of [[2, 'audio', 'aid'], [3, 'sub', 'sid']]) {
      const streams = session.nativeStreams.filter(s => s.type === type && !s.external), selected = streams.find(s => s.selected);
      let track;
      if (selected) track = embedded.find(t => t.type === trackType && selected.index !== null && t['ff-index'] === selected.index) || embedded.filter(t => t.type === trackType)[streams.indexOf(selected)];
      if (track) await player.command('set_property', property, track.id);
      else if (type === 3) await player.command('set_property', property, 'no');
    }
    const external = session.nativeStreams.filter(s => s.type === 3 && s.external && s.source);
    const selectedExternal = external.findIndex(s => s.selected);
    if (selectedExternal >= 0) {
      const tracks = await player.command('get_property', 'track-list');
      const track = tracks.filter(t => t.type === 'sub' && t.external)[selectedExternal];
      if (track) await player.command('set_property', 'sid', track.id);
    }
    const position = finite(options.time) ? options.time : session.resume;
    if (position > 0) await player.command('seek', Math.max(0, Math.min(position, Math.max(0, session.duration - 1))), 'absolute+exact');
    active.state.tracks = this.cleanTracks(await player.command('get_property', 'track-list'));
    active.state.position = position || 0; active.started = true; active.state.loading = false;
    await player.command('set_property', 'pause', false);
    if (this.active !== active) return;
    this.showVideo(true); this.notify();
    active.timer = setInterval(() => { if (!active.finished) void this.timeline(active.state.buffering ? 'buffering' : active.state.paused ? 'paused' : 'playing'); }, 10000);
  }
  fail(active, message) { if (this.active !== active || active.stopping) return; active.state.error = message; active.state.loading = false; this.showVideo(false); this.notify(); }
  timeline(state, ended = false) {
    const active = this.active;
    if (!active?.started || this.diagnostic) return Promise.resolve();
    const body = { state, ended, time: Math.round(Math.max(0, active.state.position || 0) * 1000) };
    this.syncQueue = this.syncQueue.catch(() => {}).then(() => this.client.request(`/api/playback/${active.session.id}/timeline`, body)).catch(() => { if (this.active === active) { active.state.warning = 'Plex kunne ikke gemme din fremdrift. Kontrollér forbindelsen.'; this.notify(); } });
    return this.syncQueue;
  }
  async command(name, value) {
    const active = this.active; if (!active?.player || !active.started) return;
    const player = active.player;
    if (name === 'pause') await player.command('cycle', 'pause');
    else if (name === 'seek' && finite(value)) { active.finished = false; active.state.ended = false; await player.command('seek', Math.max(0, Math.min(value, active.state.duration || 86400)), 'absolute+exact'); }
    else if (name === 'skip' && finite(value) && Math.abs(value) <= 300) await player.command('seek', value, 'relative+exact');
    else if (name === 'volume' && finite(value)) await player.command('set_property', 'volume', Math.max(0, Math.min(100, value)));
    else if (name === 'mute') await player.command('cycle', 'mute');
    else if (['audio', 'subtitle'].includes(name)) {
      const type = name === 'audio' ? 'audio' : 'sub';
      if (name === 'subtitle' && value === 'no') await player.command('set_property', 'sid', 'no');
      else if (Number.isInteger(value) && active.state.tracks.some(t => t.type === type && t.id === value)) await player.command('set_property', name === 'audio' ? 'aid' : 'sid', value);
      else throw new Error('Det valgte spor findes ikke.');
    } else throw new Error('Ugyldig afspilningskommando.');
  }
  async stop() {
    const active = this.active; if (!active) return;
    active.stopping = true; clearInterval(active.timer); this.showVideo(false);
    let position = active.state.position;
    if (active.started) { try { position = await active.player.command('get_property', 'time-pos'); } catch { /* Use the last observed position. */ } }
    this.active = null;
    try { await active.player?.close(); } finally { this.releaseVideo(); }
    await this.syncQueue.catch(() => {});
    await this.client.request(`/api/playback/${active.session.id}/stop`, active.started && !this.diagnostic && finite(position) ? { time: Math.round(Math.max(0, position) * 1000) } : {}).catch(() => {});
    this.notify();
  }
}
