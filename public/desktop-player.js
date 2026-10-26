import { icon } from './icons.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clock = seconds => { const value = Math.max(0, Math.floor(Number(seconds) || 0)); return `${value >= 3600 ? `${Math.floor(value / 3600)}:` : ''}${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; };
let active;
export async function openDesktopPlayer({ item, media,activeSourceId }, { onClose } = {}) {
  if (active) await active.close();
  const bridge = window.netplexDesktop, dialog = document.querySelector('#player-dialog'), external = bridge.platform === 'darwin';
  const current = active = { state: {}, mediaIndex: 0, closing: false, unsubscribe: null, observer: null };
  dialog.classList.add('native-player'); document.documentElement.classList.add('native-playing');
  dialog.innerHTML = `<div class="player-top"><div class="player-title"><span class="brand">Net<span>Plex</span><b>.</b></span><div><h2>${escape(item.title)}</h2><small>${item.year || ''} · ${Math.round(item.duration / 60000)} min</small></div></div><button class="icon-btn" data-native="close" aria-label="Luk afspiller">${icon('close')}</button></div><div class="player-screen native-screen" id="native-video-surface"><div class="player-loading" id="native-loading"><span class="loader"></span><span>Åbner filmen…</span></div><div class="player-error" id="native-error" hidden></div></div><div class="native-controls"><div class="native-progress"><span id="native-position">00:00</span><input id="native-seek" type="range" min="0" max="${item.duration / 1000}" value="0" step="1" aria-label="Afspilningsposition"><span id="native-duration">${clock(item.duration / 1000)}</span></div><div class="native-buttons"><button class="icon-btn" data-native="skip-back" aria-label="10 sekunder tilbage">↶</button><button class="native-play icon-btn" data-native="pause" aria-label="Pause">${icon('pause')}</button><button class="icon-btn" data-native="skip-forward" aria-label="10 sekunder frem">↷</button><button class="text-button" data-native="mute" id="native-mute" aria-label="Slå lyden fra">Lyd</button><input id="native-volume" type="range" min="0" max="100" value="80" aria-label="Lydstyrke"><span class="native-status" id="native-mode">Original kvalitet</span><button class="text-button native-fullscreen" data-native="fullscreen" aria-label="Fuldskærm">⛶</button></div></div><div class="player-bottom"><span class="player-mode"><span class="dot live-dot"></span>Afspilles på din computer</span><div class="player-settings">${media.length > 1 ? `<label>Version<select id="native-media">${media.map(m => `<option value="${m.index}">${escape(m.label)}</option>`).join('')}</select></label>` : ''}<label>Lyd<select id="native-audio"><option>Indlæser…</option></select></label><label>Undertekster<select id="native-subtitle"><option value="no">Fra</option></select></label></div></div><p class="player-help" id="native-help">Mellemrum: pause · ← / →: 10 sekunder · F: fuldskærm · M: lyd · Esc: luk</p>`;
  const $ = selector => dialog.querySelector(selector);
  if(external){
    dialog.classList.add('native-external');
    const note=document.createElement('div');note.id='native-external-note';note.className='native-external-note';note.hidden=true;
    note.innerHTML=`${icon('external')}<h2>Filmen afspilles i NetPlex Player</h2><p>Afspilleren åbner i sit eget vindue. Du kan også styre pause, lyd og undertekster her.</p><button class="btn btn-primary" data-native="reveal">Vis afspilleren</button>`;
    $('#native-video-surface').append(note);
  }
  const footer = document.createElement('div'); footer.className = 'native-bottom-chrome';
  footer.append(...dialog.querySelectorAll('.native-controls, .player-bottom, .player-help')); dialog.append(footer);
  current.fullscreen = false; current.hiddenControls = false;
  function activity() {
    if (current.closing) return;
    clearTimeout(current.idleTimer);
    const wasHidden = current.hiddenControls;
    current.hiddenControls = false; dialog.classList.remove('native-idle');
    if (wasHidden) bounds();
    if (!external && current.fullscreen && !current.state.paused && !current.state.loading && !current.state.ended && !current.state.error) {
      current.idleTimer = setTimeout(() => {
        if (current.interacting || document.activeElement?.tagName === 'SELECT') { activity(); return; }
        current.hiddenControls = true; dialog.classList.add('native-idle'); bounds();
      }, 2400);
    }
  }
  function fullscreen(value) {
    current.fullscreen = Boolean(value); dialog.classList.toggle('native-fullscreen-mode', !external && current.fullscreen);
    $('[data-native="fullscreen"]').setAttribute('aria-label', current.fullscreen ? 'Forlad fuldskærm' : 'Fuldskærm');
    activity(); requestAnimationFrame(bounds);
  }
  async function toggleFullscreen() { fullscreen(await bridge.toggleFullscreen()); }
  async function escapePlayer() { if (current.fullscreen) await toggleFullscreen(); else await close(); }
  function error(message) { $('#native-loading').hidden = true; $('#native-error').hidden = false; $('#native-error').innerHTML = `${icon('info')}<h2>Afspilningen kunne ikke starte</h2><p>${escape(message)}</p><button class="btn btn-primary" data-native="retry">Prøv igen</button>`; current.state.error = message; activity(); }
  const command = async (name, value) => { try { await bridge.command(name, value); } catch (failure) { error(failure.message); } };
  function bounds() {
    if (external || current.closing || !dialog.open) return;
    const rect = $('#native-video-surface').getBoundingClientRect();
    const showChrome = current.fullscreen && !current.hiddenControls;
    void bridge.setVideoBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, clipTop: showChrome ? $('.player-top').getBoundingClientRect().height : 0, clipBottom: showChrome ? footer.getBoundingClientRect().height : 0 }).catch(() => {});
  }
  function update(state) {
    if (current.closing || active !== current) return;
    if(!state.active){if(external && current.state.active && !current.starting)void close();return;}
    const wake = ['paused', 'loading', 'ended', 'error'].some(key => current.state[key] !== state[key]);
    current.state = state;
    if(external){$('#native-external-note').hidden=Boolean(state.loading||state.error);if(typeof state.fullscreen==='boolean'&&state.fullscreen!==current.fullscreen)fullscreen(state.fullscreen);}
    $('#native-loading').hidden = !state.loading;
    if (state.error) error(state.error);
    $('#native-position').textContent = clock(state.position);
    $('#native-duration').textContent = clock(state.duration);
    const seek = $('#native-seek'); seek.max = state.duration || item.duration / 1000;
    if (document.activeElement !== seek) seek.value = state.position || 0;
    const volume = $('#native-volume'); if (document.activeElement !== volume) volume.value = state.volume ?? 80;
    const paused = state.paused || state.ended;
    const pauseButton = $('[data-native="pause"]'), label = paused ? 'Afspil' : 'Pause';
    // Preserve the click target while time-pos updates arrive during a press.
    if (pauseButton.getAttribute('aria-label') !== label) { pauseButton.innerHTML = icon(paused ? 'play' : 'pause'); pauseButton.setAttribute('aria-label', label); }
    $('#native-mute').textContent = state.mute ? 'Lyd fra' : 'Lyd';
    $('#native-mute').setAttribute('aria-label', state.mute ? 'Slå lyden til' : 'Slå lyden fra');
    const codec = /hevc|h\.?265/i.test(state.videoCodec || '') ? 'HEVC' : /avc|h\.?264/i.test(state.videoCodec || '') ? 'H.264' : state.videoCodec?.slice(0, 24);
    $('#native-mode').textContent = state.buffering ? 'Buffer…' : ['Original kvalitet', codec, state.audioCodec?.toUpperCase()].filter(Boolean).join(' · ');
    for (const [type, selector] of [['audio', '#native-audio'], ['sub', '#native-subtitle']]) {
      const tracks = (state.tracks || []).filter(t => t.type === type);
      const content = (type === 'sub' ? '<option value="no">Fra</option>' : '') + tracks.map(t => `<option value="${Number(t.id)}">${escape(t.title || [t.language?.toUpperCase(), t.codec?.toUpperCase()].filter(Boolean).join(' · ') || `${type === 'sub' ? 'Undertekst' : 'Lydspor'} ${t.id}`)}</option>`).join('');
      const select = $(selector); if (select.innerHTML !== content) select.innerHTML = content;
      select.value = String(tracks.find(t => t.selected)?.id ?? (type === 'sub' ? 'no' : tracks[0]?.id ?? ''));
      select.disabled = !tracks.length;
    }
    if (state.warning) $('#native-help').textContent = state.warning;
    if (wake) activity();
  }
  async function play(time) {
    current.starting=true;
    $('#native-error').hidden = true; $('#native-loading').hidden = false;
    try { bounds(); await bridge.play({ id: item.id,...(activeSourceId?{sourceId:activeSourceId}:{}), mediaIndex: Number(current.mediaIndex), ...(typeof time === 'number' ? { time } : {}), volume: Number($('#native-volume').value) }); }
    catch (failure) { if (!current.closing) error(failure.message); }
    finally { current.starting=false; }
  }
  async function close() {
    if (current.closing) return;
    current.closing = true; clearTimeout(current.idleTimer); current.unsubscribe?.(); current.unsubscribeInput?.(); current.unsubscribeWindow?.(); current.observer?.disconnect();
    document.removeEventListener('keydown', keydown); dialog.removeEventListener('cancel', cancel); dialog.removeEventListener('click', click);
    dialog.removeEventListener('pointermove', activity); dialog.removeEventListener('pointerdown', pointerDown); window.removeEventListener('pointerup', pointerUp);
    await bridge.stop().catch(() => {});
    if (active === current) { active = null; dialog.close(); dialog.classList.remove('native-player', 'native-idle', 'native-fullscreen-mode','native-external'); document.documentElement.classList.remove('native-playing'); dialog.innerHTML = ''; await onClose?.(); }
  }
  current.close = close;
  const cancel = event => { event.preventDefault(); void escapePlayer(); };
  const keydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); void escapePlayer(); return; }
    activity();
    if (!dialog.open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || (event.key === ' ' && event.target.tagName === 'BUTTON')) return;
    const key = event.key.toLowerCase();
    if (key === ' ') { event.preventDefault(); void command('pause'); }
    else if (key === 'arrowleft' || key === 'arrowright') { event.preventDefault(); void command('skip', key === 'arrowleft' ? -10 : 10); }
    else if (key === 'm') void command('mute');
    else if (key === 'f') void toggleFullscreen();
  };
  dialog.addEventListener('cancel', cancel); document.addEventListener('keydown', keydown);
  async function click(event) {
    if (active !== current) return;
    const action = event.target.closest('[data-native]')?.dataset.native;
    if (action === 'close') await close();
    else if (action === 'retry') await play(current.state.position);
    else if (action === 'pause') { if (current.state.ended) { await command('seek', 0); } await command('pause'); }
    else if (action === 'skip-back' || action === 'skip-forward') await command('skip', action === 'skip-back' ? -10 : 10);
    else if (action === 'mute') await command('mute');
    else if (action === 'fullscreen') await toggleFullscreen();
    else if (action === 'reveal') await command('reveal');
    else if (!action && event.target.closest('#native-video-surface') && !current.state.loading && !current.state.error) await command('pause');
  }
  const pointerDown = () => { current.interacting = true; activity(); };
  const pointerUp = () => { current.interacting = false; activity(); };
  dialog.addEventListener('pointermove', activity); dialog.addEventListener('pointerdown', pointerDown); window.addEventListener('pointerup', pointerUp);
  dialog.addEventListener('click', click);
  $('#native-seek').addEventListener('input', event => { $('#native-position').textContent = clock(event.target.value); });
  $('#native-seek').addEventListener('change', event => void command('seek', Number(event.target.value)));
  $('#native-volume').addEventListener('input', event => void command('volume', Number(event.target.value)));
  $('#native-audio').addEventListener('change', event => void command('audio', Number(event.target.value)));
  $('#native-subtitle').addEventListener('change', event => void command('subtitle', event.target.value === 'no' ? 'no' : Number(event.target.value)));
  $('#native-media')?.addEventListener('change', async event => { current.mediaIndex = Number(event.target.value); await play(current.state.position); });
  current.unsubscribe = bridge.onPlayerState(update);
  current.unsubscribeInput = bridge.onPlayerInput(action => {
    activity();
    if (action === 'pause') void command('pause');
    else if (action === 'fullscreen') void toggleFullscreen();
    else if (action === 'escape') void escapePlayer();
    else if (action === 'back' || action === 'forward') void command('skip', action === 'back' ? -10 : 10);
    else if (action === 'mute') void command('mute');
  });
  current.unsubscribeWindow = bridge.onWindowState(state => fullscreen(state.fullscreen));
  dialog.showModal(); current.observer = new ResizeObserver(bounds); for (const element of [$('#native-video-surface'), footer, $('.player-top')]) current.observer.observe(element); bounds();
  await play();
}
