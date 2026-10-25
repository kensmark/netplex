import { icon } from './icons.js';
import {renderCast} from './metadata-display.js';
import { initDesignUI } from './design/ui.js';
import { demoItems, demoArt, demoChildren } from './demo.js';
import { browserCapabilities, supportsDirectFile, preferredMediaIndex } from './playback-capabilities.js';

const $ = (query, parent = document) => parent.querySelector(query);
const root = $('#app'), detailDialog = $('#detail-dialog'), playerDialog = $('#player-dialog'), settingsDialog = $('#settings-dialog');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const local = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(`netplex.${key}`)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(`netplex.${key}`, JSON.stringify(value)); } catch { /* Private browsing may disable storage. */ } } };
const state = { status: null, demo: new URLSearchParams(location.search).get('demo') === '1', route: 'home', query: '', globalQuery: '', genre: '', unwatched: false, only4k: false, sort: 'added', items: new Map(), saved: new Set(), pageItems: [], total: 0, request: null, detailRequest: 0, authTimer: null, player: null };
let toastTimer, searchTimer, globalSearchTimer;
let selectedCollection = null;
const designUI = initDesignUI({api, host:()=>({artwork,icon,saved:state.saved,route:state.route,demo:state.demo,globalQuery:state.globalQuery}), loadCatalog:()=>state.demo?Promise.resolve(designUI.facets(demoItems)):api('/api/design/catalog'), onChange:()=>void refreshDesignData()});
async function refreshDesignData(){
  if(!(state.demo||state.status?.connected)||!$('#main-content'))return;
  if(state.route!=='home'){if(selectedCollection)await renderPage({keepFocus:true,preserveView:true});return;}
  state.request?.abort();const controller=new AbortController();state.request=controller;
  try{await renderHome(controller.signal);}catch(error){if(error.name!=='AbortError'&&!controller.signal.aborted)toast(error.message);}
}

const brand = '<span class="brand">Net<span>Plex</span><b>.</b></span>';
const duration = ms => { const minutes = Math.round(ms / 60000); return minutes ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} t ` : ''}${minutes % 60 ? `${minutes % 60} min` : ''}`.trim() : ''; };
const quality = item => ['4k', '2160'].includes(item.resolution) ? '4K' : item.resolution === '1080' ? 'HD' : item.resolution === '720' ? '720p' : '';
const episodeTitle = item => item.type === 'episode' ? `${item.grandparentTitle || item.parentTitle} · S${item.season} E${item.episode}` : '';
const remember = items => { for (const item of items.filter(Boolean)) state.items.set(item.id, item); return items; };
const errorBox = message => `<div class="error-message" role="alert">${escape(message)}</div>`;
const spinner = text => `<div class="loading"><span class="loader" aria-hidden="true"></span><span>${escape(text)}</span></div>`;

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3800); }
async function api(path, options = {}) {
  const { method = 'GET', body, signal, keepalive } = options;
  let response;
  try { response = await fetch(path, { method, headers: { ...(method !== 'GET' ? { 'Content-Type': 'application/json', 'X-NetPlex-CSRF': state.status?.csrf || '' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal, keepalive }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('Forbindelsen til NetPlex blev afbrudt. Kontrollér, at programmet stadig kører.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Forespørgslen kunne ikke gennemføres.');
  return result;
}

function artwork(item, { poster = false, large = false } = {}) {
  if (state.demo) {
    if (!poster && item.id === '1001') return '<img class="generated-hero" src="/assets/hero-dark-fantasy.png" alt="" data-art-fallback="1001">';
    return demoArt(item, poster);
  }
  const url = large ? item.art || item.thumb : item.thumb;
  if (url) return `<img src="${escape(`${url}`)}" alt="" ${large ? 'fetchpriority="high"' : 'loading="lazy"'} data-fallback-title="${escape(item.title)}">`;
  return `<span class="art-fallback ${large ? 'backdrop' : ''}">${icon('film')}<span>${escape(item.title)}</span></span>`;
}
document.addEventListener('error', event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  if (image.dataset.artFallback) { image.outerHTML = demoArt(state.items.get(image.dataset.artFallback) || demoItems[0]); return; }
  image.outerHTML = `<span class="art-fallback">${icon('film')}<span>${escape(image.dataset.fallbackTitle || '')}</span></span>`;
}, true);

function itemMeta(item) {
  return `<div class="meta">${item.year ? `<span>${item.year}</span>` : ''}${item.duration ? `<span>${duration(item.duration)}</span>` : ''}${item.type === 'show' ? `<span>${item.leafCount} episoder</span>` : ''}${item.contentRating ? `<span>${escape(item.contentRating)}</span>` : ''}${quality(item) ? `<span class="tag">${quality(item)}</span>` : ''}${item.rating ? `<span class="rating">${icon('star')}${item.rating.toFixed(1)}</span>` : ''}${item.genres.slice(0, 2).map(g => `<span>${escape(g)}</span>`).join('')}</div>`;
}
function shell() {
  designUI.unmount(); designUI.unmountNavigation();
  const server = state.demo ? 'Demobibliotek' : state.status.server?.name || 'Plex Media Server';
  const name = state.demo ? 'Demo' : state.status.account?.name || 'Min profil';
  root.innerHTML = '<header class="site-header"></header>' + (state.demo ? '<div class="demo-banner">Demovisning med fiktive film <button data-action="connect">Forbind din Plex-server</button></div>' : '') + '<main class="page" id="main-content"></main><footer class="footer"><span><span class="dot ' + (state.demo ? '' : 'live-dot') + '"></span>' + escape(server) + '</span><span>Dit bibliotek. <b>Dit univers.</b></span></footer>';
  designUI.navigation(root.querySelector('.site-header'), name);
}

function navigate(route) {
  const target = `#/${route}`;
  if (location.hash === target) void renderPage(); else location.hash = target;
}
function commitGlobalSearch() {
  clearTimeout(globalSearchTimer);
  const query = state.globalQuery.trim();
  if (!query && state.route !== 'search') return;
  const target = query ? `#/search?${new URLSearchParams({ q: query })}` : '#/home';
  if (location.hash === target) return;
  // Keep typing within one history entry; Back returns to the page before the search.
  history[state.route === 'search' ? 'replaceState' : 'pushState'](null, '', target);
  void renderPage({ keepFocus: true });
}
function emptyState(title, description, action = '') { return `<div class="empty-state">${icon('film')}<h2>${escape(title)}</h2><p>${escape(description)}</p>${action}</div>`; }

async function renderHome(signal) {
  const querySignature=designUI.querySignature;
  let collections;
  if (state.demo) collections = designUI.resolve({items:demoItems, continuing:demoItems.filter(item=>item.progress), saved:[...state.saved]});
  else {
    const data = await api('/api/design/collections', {method:'POST', body:{design:designUI.design}, signal});
    if (signal.aborted || querySignature!==designUI.querySignature) return;
    state.saved = new Set(data.saved); collections = data.collections;updateServerSummary(data);
  }
  remember(Object.values(collections).flatMap(result=>result.items));
  if (signal.aborted || querySignature!==designUI.querySignature) return;
  designUI.home($('#main-content'), collections);
}

function libraryParams(start=0){
  const filter=selectedCollection?.query.filter||{};
  const params=new URLSearchParams({...(selectedCollection?{}:state.route==='movies'?{type:'movie'}:state.route==='shows'?{type:'show'}:{}),...(state.route==='saved'?{saved:'1'}:{}),...(filter.year?.gte!==undefined?{yearFrom:String(filter.year.gte)}:{}),...(filter.year?.lt!==undefined?{yearBefore:String(filter.year.lt)}:{}),...(filter.ratingMin!==undefined?{ratingMin:String(filter.ratingMin)}:{}),...(filter.durationMax?{durationMax:String(filter.durationMax)}:{}),q:state.query||filter.text||'',genre:state.genre,unwatched:state.unwatched||filter.unwatched?'1':'0',resolution:state.only4k?'4k':filter.resolution||'',sort:state.sort,start:String(start),size:'60'});
  for(const [key,parameter] of [['types','mediaType'],['genres','genreAny'],['directors','director'],['actors','actor']])for(const value of filter[key]||[])params.append(parameter,value);
  return params;
}

function demoLibrary(start = 0) {
  let list = [...demoItems];
  if (selectedCollection) list = designUI.filter(list, selectedCollection.query);
  if (!selectedCollection && state.route === 'movies') list = list.filter(i => i.type === 'movie');
  if (!selectedCollection && state.route === 'shows') list = list.filter(i => i.type === 'show');
  const genres = [...new Set(list.flatMap(i => i.genres))].sort();
  if (state.route === 'saved') list = list.filter(i => state.saved.has(i.id));
  if (state.query) list = list.filter(i => `${i.title} ${i.genres.join(' ')} ${i.directors.join(' ')} ${i.cast.map(c => c.name).join(' ')}`.toLocaleLowerCase('da').includes(state.query.toLocaleLowerCase('da')));
  if (state.genre) list = list.filter(i => i.genres.includes(state.genre));
  if (state.unwatched) list = list.filter(i => !i.watched);
  if (state.only4k) list = list.filter(i => quality(i) === '4K');
  list.sort(state.sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : state.sort === 'rating' ? (a, b) => b.rating - a.rating : state.sort === 'year' ? (a, b) => b.year - a.year : state.sort === 'oldest' ? (a,b)=>(a.year||9999)-(b.year||9999) : state.sort === 'duration' ? (a, b) => a.duration - b.duration : (a, b) => b.addedAt - a.addedAt);
  return { items: list.slice(start, start + 60), total: list.length, genres, saved: [...state.saved] };
}
async function renderLibrary(signal, append = false) {
  const title = selectedCollection?.title || { movies: 'Film', shows: 'Serier', saved: 'Din liste', search: 'Søgeresultater' }[state.route] || 'Dit bibliotek';
  const start = append ? state.pageItems.length : 0;
  const data = state.demo ? demoLibrary(start) : await api(`/api/library?${libraryParams(start)}`, { signal });
  if (signal.aborted) return;
  state.saved = new Set(data.saved); remember(data.items);
  state.pageItems = append ? [...state.pageItems, ...data.items] : data.items; state.total = data.total;
  const genres = data.genres;updateServerSummary(data);
  if (!append) {
    designUI.unmount();
    $('#main-content').innerHTML = `<div class="library-shell"><aside class="filter-sidebar" aria-label="Filtre"><div class="filter-group"><h3>GENRE</h3><button class="genre-button ${!state.genre ? 'active' : ''}" data-genre="">Alle genrer</button>${genres.map(g => `<button class="genre-button ${state.genre === g ? 'active' : ''}" data-genre="${escape(g)}">${escape(g)}</button>`).join('')}</div><div class="filter-group"><h3>VIS KUN</h3><label class="filter-check"><input type="checkbox" data-filter="unwatched" ${state.unwatched ? 'checked' : ''}> Usete titler</label><label class="filter-check"><input type="checkbox" data-filter="only4k" ${state.only4k ? 'checked' : ''}> 4K Ultra HD</label></div><button class="text-button" data-action="clear-filters">Nulstil filtre</button></aside><section class="library-main"><div class="library-heading"><div><h1>${title}</h1><p aria-live="polite">${data.total} ${data.total === 1 ? 'titel' : 'titler'}${state.query ? ` matcher “${escape(state.query)}”` : ' i dit bibliotek'}</p></div>${state.route === 'search' ? '' : `<label class="library-search">${icon('search')}<input type="search" id="library-query" placeholder="Søg efter titel eller person" aria-label="Søg i biblioteket" value="${escape(state.query)}"></label>`}</div><div class="library-toolbar"><div class="library-chips"><button class="chip ${!state.unwatched && !state.only4k ? 'active' : ''}" data-action="all-status">Alle</button><button class="chip ${state.unwatched ? 'active' : ''}" data-toggle-filter="unwatched" aria-pressed="${state.unwatched}">Usete</button><button class="chip ${state.only4k ? 'active' : ''}" data-toggle-filter="only4k" aria-pressed="${state.only4k}">4K</button>${state.genre ? `<button class="chip" data-genre="">${escape(state.genre)} ${icon('close')}</button>` : ''}</div><select id="sort-select" class="sort-select" aria-label="Sortér titler">${[['added', 'Senest tilføjet'], ['title', 'Titel A–Å'], ['year', 'Nyeste årstal'], ['oldest', 'Ældste først'], ['rating', 'Højest bedømt'], ['duration', 'Korteste først']].map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select><select class="mobile-genre" aria-label="Vælg genre"><option value="">Alle genrer</option>${genres.map(g => `<option ${state.genre === g ? 'selected' : ''}>${escape(g)}</option>`).join('')}</select></div><div class="poster-grid library-grid" id="library-results"></div><div id="library-pagination"></div></section></div>`;
  }
  if (state.pageItems.length) designUI.cards($('#library-results'), state.pageItems);
  else $('#library-results').innerHTML = emptyState(state.route === 'saved' && !state.query && !state.genre && !state.unwatched && !state.only4k ? 'Gem en film til en anden aften' : 'Ingen titler fundet', state.route === 'saved' ? 'Åbn en film, og tryk på “Din liste”. Dine gemte titler dukker op her.' : 'Prøv en anden søgning, eller nulstil filtrene.', '<button class="text-button" data-action="clear-filters">Nulstil søgning og filtre</button>');
  $('#library-results').classList.toggle('no-results', !state.pageItems.length);
  $('#library-pagination').innerHTML = state.pageItems.length < data.total ? '<div class="load-more"><button class="btn btn-ghost" data-action="load-more">Vis flere titler</button></div>' : state.pageItems.length ? `<p class="result-status">${state.pageItems.length} af ${data.total} titler</p>` : '';
}
async function renderPage({ keepFocus = false, preserveView = false } = {}) {
  const previousScroll=window.scrollY;
  if (!state.demo && !state.status?.connected) return;
  const previousRoute = state.route;
  clearTimeout(searchTimer);
  clearTimeout(globalSearchTimer);
  const previousCollection = selectedCollection?.id;
  selectedCollection = designUI.collection(new URLSearchParams(location.hash.split('?')[1] || '').get('collection'));
  if (previousCollection !== selectedCollection?.id) state.sort = selectedCollection?.query.sort || 'added';
  state.route = location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';
  if (!['home', 'movies', 'shows', 'saved', 'search'].includes(state.route)) state.route = 'home';
  if (previousRoute !== state.route) { state.genre = ''; state.unwatched = false; state.only4k = false; if (state.route !== 'search') state.query = ''; }
  if (state.route === 'search') {
    state.globalQuery = new URLSearchParams(location.hash.split('?')[1] || '').get('q') || '';
    state.query = state.globalQuery;
    if (previousRoute !== 'search') state.sort = 'added';
  } else state.globalQuery = '';
  const globalInput = $('#global-query');
  if (globalInput && globalInput.value.trim() !== state.globalQuery) globalInput.value = state.globalQuery;
  state.request?.abort(); const controller = new AbortController(); state.request = controller;
  const focus = keepFocus && document.activeElement?.id === 'library-query';
  const selection = focus ? document.activeElement.selectionStart : null;
  if (!$('#main-content')) shell();
  root.querySelectorAll('[data-route]').forEach(b => b.classList.toggle('active', b.dataset.route === state.route && b.classList.contains('nav-button')));
  if (!preserveView) designUI.unmount();
  if (!keepFocus && !preserveView) $('#main-content').innerHTML = spinner('Dit bibliotek indlæses…');
  try {
    if (state.route === 'home') await renderHome(controller.signal); else await renderLibrary(controller.signal);
    if (preserveView) window.scrollTo({top:previousScroll,behavior:'instant'});
    if (focus) { $('#library-query')?.focus(); if (selection !== null) { try { $('#library-query').setSelectionRange(selection, selection); } catch { /* Search inputs may not expose selection. */ } } }
  } catch (error) {
    if (error.name === 'AbortError' || controller.signal.aborted) return;
    $('#main-content').innerHTML = emptyState('Vi kunne ikke hente biblioteket', error.message, '<div class="actions"><button class="btn btn-primary" data-action="refresh">Prøv igen</button><button class="btn" data-action="settings">Forbindelse</button></div>');
  }
}

function showSetup() {
  designUI.unmount(); designUI.unmountNavigation();
  state.request?.abort();
  root.innerHTML = `<header class="setup-header">${brand}<span class="local-label"><span class="dot live-dot"></span>KØRER LOKALT PÅ DIN COMPUTER</span></header><main class="welcome"><section class="welcome-copy" id="setup-copy"><span class="eyebrow">DREVET AF PLEX MEDIA SERVER</span><h1>Dine film.<br>Et helt nyt <em>univers.</em></h1><p class="welcome-intro">En filmisk forside. Et enkelt overblik. Forbind din Plex-konto, og giv din samling et nyt hjem.</p><div class="actions"><button class="btn btn-primary" data-action="login">${icon('play')} Log ind med Plex</button><button class="text-button" data-action="demo">Udforsk en demo ${icon('arrow')}</button></div><p class="privacy-note">${icon('shield')}Du logger ind hos Plex. Din adgangsnøgle gemmes på denne computer.</p><div id="setup-error"></div><details class="manual-setup"><summary>${icon('server')} Forbind med serveradresse</summary><form id="manual-form"><label class="form-field">Plex-serverens adresse<input name="url" type="url" placeholder="http://192.168.1.20:32400" required autocomplete="url" spellcheck="false"></label><label class="form-field">Plex-adgangsnøgle (X-Plex-Token)<input name="token" type="password" required autocomplete="off" placeholder="Indsæt din adgangsnøgle" maxlength="4096"></label><button class="btn btn-primary btn-small" type="submit">Forbind server ${icon('arrow')}</button><p class="form-help">Adgangsnøglen skal tilhøre den Plex-bruger, du vil se film som. <a href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/" target="_blank" rel="noreferrer">Sådan finder du nøglen ${icon('external')}</a></p></form></details></section><div class="welcome-art" aria-hidden="true">${[demoItems[1], demoItems[0], demoItems[2]].map(item => `<div class="welcome-poster">${demoArt(item, true)}</div>`).join('')}</div></main><footer class="setup-footer">NetPlex er en selvstændig klient til dit personlige Plex-bibliotek.</footer>`;
  $('#manual-form').addEventListener('submit', async event => {
    event.preventDefault(); const button = $('button[type=submit]', event.target); button.disabled = true; button.textContent = 'Forbinder…'; $('#setup-error').innerHTML = '';
    const values = new FormData(event.target);
    try { await api('/api/connect', { method: 'POST', body: { url: values.get('url'), token: values.get('token') } }); await connected(); }
    catch (error) { $('#setup-error').innerHTML = errorBox(error.message); button.disabled = false; button.innerHTML = `Forbind server ${icon('arrow')}`; }
  });
  if (state.status.account && !state.status.connected) void showServers();
}
async function connected() {
  state.status = await api('/api/status'); state.demo = false; state.saved.clear(); state.items.clear();
  const url = new URL(location.href); url.search = ''; url.hash = '/home'; history.replaceState(null, '', url);
  state.route = 'home'; shell(); await renderPage(); toast('Dit samlede Plex-bibliotek er klar');
}
async function startLogin() {
  const button = $('[data-action="login"]'); if (button) { button.disabled = true; button.textContent = 'Åbner Plex…'; }
  try {
    const result = await api('/api/auth/start', { method: 'POST', body: {} }); sessionStorage.setItem('netplex.pin', result.id);
    if (window.netplexDesktop) { await window.netplexDesktop.openPlexLogin(result.url); await finishLogin(); }
    else location.assign(result.url);
  }
  catch (error) { if ($('#setup-error')) $('#setup-error').innerHTML = errorBox(error.message); else toast(error.message); if (button) { button.disabled = false; button.innerHTML = `${icon('play')} Log ind med Plex`; } }
}
async function finishLogin() {
  const id = sessionStorage.getItem('netplex.pin');
  if (!id) return;
  $('#setup-copy').innerHTML = `<span class="eyebrow">PLEX-LOGIN</span><h1>Velkommen<br>tilbage.</h1>${spinner('Bekræfter dit login hos Plex…')}<button class="text-button" data-action="cancel-login">Annullér login</button>`;
  try {
    const result = await api(`/api/auth/${id}`, { method: 'POST', body: {} });
    if (result.pending) { state.authTimer = setTimeout(finishLogin, 2000); return; }
    sessionStorage.removeItem('netplex.pin'); history.replaceState(null, '', '/'); state.status = await api('/api/status');settingsDialog.close();showSetup();
  } catch (error) { sessionStorage.removeItem('netplex.pin'); showSetup(); $('#setup-error').innerHTML = errorBox(error.message); }
}
async function showServers() {
  const copy=$('#setup-copy');if(!copy)return;
  copy.innerHTML='<span class="eyebrow">DIT PLEX-BIBLIOTEK</span><h1>Alle dine<br><em>servere.</em></h1><p class="welcome-intro">Vælg de servere, du vil se film og serier fra. Du kan ændre valget i indstillingerne.</p><div id="server-choices">'+spinner('Finder dine servere…')+'</div><div id="setup-error"></div><button class="btn btn-primary" data-action="servers-ready" disabled>Åbn biblioteket</button><button class="text-button" data-action="cancel-login">Brug en anden forbindelse</button>';
  try{const result=await api('/api/servers');if(!$('#server-choices'))return;$('#server-choices').innerHTML=result.servers.length?'<div class="server-list">'+serverChoices(result.servers)+'</div>':'<p class="error-message">Din konto har ingen tilgængelige servere. Din ven skal først dele sit bibliotek med din Plex-konto.</p>';const ready=$('[data-action="servers-ready"]');if(ready)ready.disabled=!result.servers.length;if(result.warning)$('#setup-error').innerHTML=errorBox(result.warning);}
  catch(error){if($('#server-choices'))$('#server-choices').innerHTML=errorBox(error.message);}
}

async function loadDetail(id,sourceId) {
  if (state.demo) { const item = state.items.get(id) || demoItems.find(i => i.id === id); if (!item) throw new Error('Titlen findes ikke i demoen.'); return { item, media: [], saved: state.saved.has(id) }; }
  return api(`/api/items/${id}${sourceId?"?"+new URLSearchParams({source:sourceId}):""}`);
}
function closeDetail() { state.detailRequest++; if (detailDialog.open) detailDialog.close(); }
async function openDetail(id,sourceId) {
  const request = ++state.detailRequest;
  detailDialog.innerHTML = `<button class="icon-btn dialog-close" data-action="close-detail" aria-label="Luk">${icon('close')}</button>${spinner('Henter filmdetaljer…')}`;
  if (!detailDialog.open) detailDialog.showModal();
  try {
    const { item, media, saved,activeSourceId } = await loadDetail(id,sourceId); if (request !== state.detailRequest || !detailDialog.open) return;
    remember([item]); if (saved) state.saved.add(id); else state.saved.delete(id);
    detailDialog.innerHTML = `<button class="icon-btn dialog-close" data-action="close-detail" aria-label="Luk filmdetaljer">${icon('close')}</button><div class="detail-art">${artwork(item, { large: true })}<h2 class="detail-art-title">${escape(item.title)}</h2></div><div class="detail-body">${itemMeta(item)}${sourceMarkup(item,activeSourceId)}<div class="actions">${['movie', 'episode'].includes(item.type) ? `<button class="btn btn-primary" data-play="${item.id}" data-source-id="${escape(activeSourceId||'')}">${icon('play')}${item.progress ? `Fortsæt fra ${duration(item.progress)}` : 'Afspil nu'}</button>` : ''}<button class="btn" data-save="${item.id}" data-saveid="${item.id}" aria-pressed="${saved}">${icon(saved ? 'check' : 'plus')}<span>${saved ? 'På din liste' : 'Din liste'}</span></button></div><p class="detail-description">${escape(item.summary || 'Der er ingen beskrivelse til denne titel på Plex-serveren.')}</p><div class="detail-facts"><div><strong>INSTRUKTION</strong><span>${escape(item.directors.join(', ') || '—')}</span></div><div><strong>MEDVIRKENDE</strong>${renderCast(item.cast)}</div></div><div class="detail-actions-secondary"><button class="text-button" data-watched="${item.id}" data-current-watched="${item.watched}" data-source-id="${escape(activeSourceId||'')}">${icon(item.watched ? 'check' : 'eye')}${item.watched ? 'Marker som uset' : 'Marker som set'}</button>${media.length ? `<span class="text-button muted">${escape(media[0].label)}</span>` : ''}</div>${item.type === 'show' ? '<section class="episode-section"><header><h3>Episoder</h3><select id="season-select" aria-label="Vælg sæson"></select></header><div id="episode-list"></div></section>' : ''}</div>`;
    if (item.type === 'show') await loadSeasons(item, request,activeSourceId);
  } catch (error) { if (request === state.detailRequest && detailDialog.open) detailDialog.innerHTML = `<button class="icon-btn dialog-close" data-action="close-detail" aria-label="Luk">${icon('close')}</button><div class="detail-body" style="padding-top:45px">${errorBox(error.message)}</div>`; }
}
async function children(item,sourceId) { const result = state.demo ? { items: demoChildren(item) } : await api(`/api/items/${item.id}/children${sourceId?'?'+new URLSearchParams({source:sourceId}):''}`); remember(result.items); return result.items; }
async function loadSeasons(item, request,sourceId) {
  const seasons = await children(item,sourceId); if (request !== state.detailRequest) return;
  const select = $('#season-select'); if (!select) return;
  select.innerHTML = seasons.map(s => `<option value="${s.id}">${escape(s.title)}</option>`).join('');
  select.addEventListener('change', () => void loadEpisodes(state.items.get(select.value), request));
  if (seasons[0]) await loadEpisodes(seasons[0], request); else $('#episode-list').innerHTML = '<p class="muted">Der er ingen episoder i denne serie.</p>';
}
async function loadEpisodes(season, request) {
  const list = $('#episode-list'); if (!list) return; list.innerHTML = spinner('Henter episoder…');
  try { const episodes = await children(season,season.preferredSourceId); if (request !== state.detailRequest) return; list.innerHTML = episodes.length ? episodes.map(item => `<button class="episode-row" data-play="${item.id}" data-source-id="${escape(item.preferredSourceId||'')}"><span class="episode-number">${item.episode}</span><span class="episode-text"><strong>${escape(item.title)}</strong><small>${duration(item.duration)}${item.watched ? ' · Set' : item.progress ? ' · Påbegyndt' : ''} · ${escape(item.summary)}</small></span>${icon('play')}</button>`).join('') : '<p class="muted">Ingen episoder fundet.</p>'; }
  catch (error) { if (request === state.detailRequest) list.innerHTML = errorBox(error.message); }
}

async function toggleSaved(id) {
  const saved = !state.saved.has(id);
  try {
    if (!state.demo) await api(`/api/items/${id}/saved`, { method: 'POST', body: { saved } });
    saved ? state.saved.add(id) : state.saved.delete(id);
    if (state.demo) local.set('demo.saved', [...state.saved]);
    document.querySelectorAll('[data-saveid]').forEach(button => {
      if (button.dataset.saveid !== id) return;
      if (button.classList.contains('np-card-action')) return;
      button.setAttribute('aria-pressed', String(saved)); button.setAttribute('aria-label', saved ? 'Fjern fra din liste' : 'Gem på din liste');
      button.setAttribute('title',saved ? 'Fjern fra din liste' : 'Gem på din liste');
      button.innerHTML = `${button.classList.contains('np-card-action')?`<span class="np-icon">${icon(saved?'check':'plus')}</span>`:icon(saved ? 'check' : 'plus')}${button.closest('.detail-body') ? `<span>${saved ? 'På din liste' : 'Din liste'}</span>` : ''}`;
    });
    designUI.refresh();
    toast(saved ? 'Gemt på din liste' : 'Fjernet fra din liste');
    if (state.route === 'saved' || state.route === 'home') await renderPage({preserveView:true});
  } catch (error) { toast(error.message); }
}

function serverChoices(servers) {
  return servers.map(server=>'<label class="server-toggle-row"><input type="checkbox" data-server-toggle="'+escape(server.id)+'" '+(server.enabled?'checked':'')+'><span><strong>'+escape(server.name)+'</strong><small>'+escape(server.status==='disabled'?'Slået fra':server.status==='offline'?'Kan ikke nås':server.status==='online'?'Tilgængelig':'Ikke testet endnu')+'</small></span></label>').join('');
}
function updateServerSummary(data) {
  if(state.demo||!data.servers)return;
  state.status.servers=data.servers;
  const active=data.servers.filter(server=>server.enabled),warning=(data.warnings||[]).length;
  const label=active.length===1?active[0].name:active.length?active.length+' Plex-servere':'Ingen servere valgt';
  const footer=root.querySelector('.footer>span');if(footer)footer.textContent=label+(warning?' · '+warning+' utilgængelig'+(warning>1?'e':''):'');
}
async function loadServerSettings() {
  const container=$('#settings-servers');if(!container||state.demo)return;
  try{const data=await api('/api/servers');if(!container.isConnected)return;container.innerHTML=data.servers.length?serverChoices(data.servers):'<p>Ingen servere fundet.</p>';state.status=await api('/api/status');const selected=data.servers.filter(server=>server.enabled),summary=$('#settings-server-summary');if(summary)summary.textContent=selected.length===1?selected[0].name:selected.length?selected.length+' valgte Plex-servere':'Ingen servere valgt';if(data.warning)$('#settings-feedback').innerHTML=errorBox(data.warning);}
  catch(error){if(container.isConnected)container.innerHTML=errorBox(error.message);}
}
async function toggleServer(input) {
  const enabled=input.checked;input.disabled=true;state.request?.abort();
  try{await api('/api/servers/toggle',{method:'POST',body:{id:input.dataset.serverToggle,enabled}});state.status=await api('/api/status');state.items.clear();state.saved.clear();
    if($('#setup-copy'))await showServers();else{await loadServerSettings();await renderPage({preserveView:true});}
  }catch(error){input.checked=!enabled;const feedback=$('#settings-feedback')||$('#setup-error');if(feedback)feedback.innerHTML=errorBox(error.message);else toast(error.message);}finally{input.disabled=false;}
}
function sourceMarkup(item,activeSourceId) {
  if(!item.sources?.length)return '';
  const servers=[...new Map(item.sources.map(source=>[source.serverId,source])).values()];
  return '<section class="detail-sources" aria-label="Servere med denne titel"><strong>TILGÆNGELIG PÅ</strong><div class="detail-server-badges">'+servers.map(source=>'<span>'+icon('server')+escape(source.name)+'</span>').join('')+'</div>'+(item.sources.length>1?'<label class="form-field">Afspil fra<select id="detail-source" data-item="'+escape(item.id)+'" aria-label="Afspil fra">'+item.sources.map(source=>'<option value="'+escape(source.id)+'" '+(source.id===activeSourceId?'selected':'')+'>'+escape(source.name+(source.resolution?' · '+source.resolution.toUpperCase():'')+(source.edition?' · '+source.edition:''))+'</option>').join('')+'</select></label>':'')+'</section>';
}

function showSettings() {
  const selected=state.status.servers?.filter(server=>server.enabled)||[];
  const serverLabel=state.demo?'Demovisning':selected.length===1?selected[0].name:selected.length?selected.length+' valgte Plex-servere':'Ingen servere valgt';
  const server = state.demo ? { name: 'Demovisning', version: 'Fiktive film og serier' } : state.status.server;
  settingsDialog.innerHTML = `<button class="icon-btn dialog-close" data-action="close-settings" aria-label="Luk indstillinger">${icon('close')}</button><h2>Dit NetPlex</h2><p>Forbindelse og personlige indstillinger.</p><div class="settings-server">${icon('server')}<span><strong id="settings-server-summary">${escape(serverLabel)}</strong><small>${escape(state.demo ? server.version : 'Samlet bibliotek fra dine valgte servere')}</small>${state.status.account && !state.demo ? `<small>Logget ind som ${escape(state.status.account.name)}</small>` : ''}</span></div><section class="settings-server-selection"><h3>Servere i dit bibliotek</h3><p>Film og serier samles fra de valgte servere.</p><div id="settings-servers">${state.demo?'Demovisning':spinner('Henter dine servere…')}</div>${!state.demo?'<button class="text-button" data-action="refresh-servers">Find servere igen</button>':''}${!state.demo&&!state.status.account?'<button class="text-button" data-action="login">Log ind med Plex for at finde alle dine servere</button>':''}</section><label class="form-field">Foretrukken afspilningskvalitet<select id="preferred-quality">${[['original', 'Original (direkte hvis muligt)'], ['auto', 'Automatisk · original hvis muligt'], ['1080', '1080p · 10 Mbps'], ['720', '720p · 4 Mbps'], ['480', '480p · 2 Mbps']].map(([value, text]) => `<option value="${value}" ${local.get('quality', 'original') === value ? 'selected' : ''}>${text}</option>`).join('')}</select></label><div class="settings-actions">${state.demo ? `<button class="btn btn-primary" data-action="connect">Forbind Plex ${icon('arrow')}</button>` : `<button class="btn btn-small" data-action="refresh">${icon('refresh')} Opdater bibliotek</button><button class="btn btn-ghost btn-small" data-action="confirm-disconnect">${icon('logout')} Afbryd forbindelse</button>`}</div><div id="settings-feedback"></div><p class="settings-footnote">Din liste gemmes lokalt i NetPlex. Afspilningshistorik og set-status synkroniseres med den tilsluttede Plex-bruger. Filmene bliver på Plex-serveren.</p>`;
  $('#preferred-quality').addEventListener('change', e => { local.set('quality', e.target.value); toast('Afspilningskvaliteten er gemt'); });
  if (!settingsDialog.open) settingsDialog.showModal();
  void loadServerSettings();
}

async function startPlayback(id,sourceId) {
  if (state.demo) { toast('Forbind din Plex-server for at afspille dine film. Demoen viser kun designet.'); return; }
  if (state.player) await stopPlayback(false);
  let details;
  try { details = await loadDetail(id,sourceId); } catch (error) { toast(error.message); return; }
  const { item, media } = details; remember([item]);
  if (!['movie', 'episode'].includes(item.type)) { await openDetail(id); return; }
  closeDetail();
  if (window.netplexDesktop) {
    try { const { openDesktopPlayer } = await import('./desktop-player.js'); await openDesktopPlayer(details, { onClose: () => renderPage() }); }
    catch (error) { toast(error.message); }
    return;
  }
  const capabilities = browserCapabilities(), mediaIndex = preferredMediaIndex(media, capabilities);
  const selected = media[mediaIndex] || { index: 0, audio: [], subtitles: [] };
  state.player = { item, media,sourceId:details.activeSourceId, capabilities, session: null, hls: null, timer: null, quality: local.get('quality', 'original'), mediaIndex, audio: selected.audio.find(s => s.selected)?.id || selected.audio[0]?.id, subtitle: selected.subtitles.find(s => s.selected)?.id || '0', restart: 0, fallback: false, closing: false, timelineError: false };
  playerDialog.innerHTML = `<div class="player-top"><div class="player-title">${brand}<div><h2>${escape(item.title)}</h2><small>${escape(episodeTitle(item) || `${item.year} · ${duration(item.duration)}`)}</small></div></div><button class="icon-btn" data-action="close-player" aria-label="Luk afspiller">${icon('close')}</button></div><div class="player-screen"><video id="netplex-video" controls playsinline preload="metadata"></video><div class="player-loading" id="player-loading"><span class="loader"></span><span>Forbereder din film…</span></div><div class="player-error" id="player-error" hidden></div></div><div class="player-bottom"><span class="player-mode" id="player-mode"></span><div class="player-settings">${media.length > 1 ? `<label>Version<select id="player-media">${media.map(m => `<option value="${m.index}">${escape(m.label)}</option>`).join('')}</select></label>` : ''}<label>Kvalitet<select id="player-quality">${[['original', 'Original'], ['auto', 'Automatisk'], ['1080', '1080p · 10 Mbps'], ['720', '720p · 4 Mbps'], ['480', '480p · 2 Mbps']].map(([key, text]) => `<option value="${key}">${text}</option>`).join('')}</select></label><label>Lyd<select id="player-audio"></select></label><label>Undertekster<select id="player-subtitle"></select></label></div></div><p class="player-help">Mellemrum: pause · ← / →: 10 sekunder · F: fuldskærm · M: lyd · Esc: luk</p>`;
  playerDialog.showModal();
  if ($('#player-media')) $('#player-media').value = String(mediaIndex);
  $('#player-quality').value = state.player.quality; renderStreamChoices();
  for (const [selector, key] of [['#player-quality', 'quality'], ['#player-audio', 'audio'], ['#player-subtitle', 'subtitle'], ['#player-media', 'mediaIndex']]) {
    $(selector)?.addEventListener('change', async e => {
      const player = state.player; if (!player) return;
      const time = $('#netplex-video').currentTime;
      player[key] = e.target.value;
      if (key === 'mediaIndex') { const source = player.media[Number(player.mediaIndex)]; player.audio = source.audio.find(s => s.selected)?.id || source.audio[0]?.id; player.subtitle = '0'; renderStreamChoices(); }
      player.fallback = false; await loadStream(time);
    });
  }
  const video = $('#netplex-video');
  video.volume = Math.min(1, Math.max(0, Number(local.get('volume', .8))));
  video.addEventListener('volumechange', () => local.set('volume', video.volume));
  video.addEventListener('playing', () => { $('#player-loading').hidden = true; void reportTimeline('playing'); });
  video.addEventListener('pause', () => { if (!state.player?.closing) void reportTimeline('paused'); });
  video.addEventListener('waiting', () => { if (!$('#player-error').hidden) return; $('#player-loading').hidden = false; void reportTimeline('buffering'); });
  video.addEventListener('canplay', () => { $('#player-loading').hidden = true; });
      video.addEventListener('ended', async () => { if (await reportTimeline('stopped', true)) toast('Din fremdrift er gemt i Plex'); });
  video.addEventListener('error', () => {
    const player = state.player;
    if (!player || player.closing || !video.currentSrc) return;
    if (player.session?.mode === 'direct' && !player.fallback) { player.fallback = true; void loadStream(video.currentTime || item.progress / 1000); }
    else showPlayerError('Videoen kunne ikke afspilles. Prøv en lavere kvalitet, og kontrollér, at Plex-serveren tillader transcoding.');
  });
  await loadStream(item.progress / 1000);
  if (state.player) state.player.timer = setInterval(() => { const video = $('#netplex-video'); if (video && !video.ended) void reportTimeline(video.paused ? 'paused' : video.readyState < 3 ? 'buffering' : 'playing'); }, 10000);
}
function renderStreamChoices() {
  const player = state.player, source = player.media[Number(player.mediaIndex)] || { audio: [], subtitles: [] };
  $('#player-audio').innerHTML = source.audio.length ? source.audio.map(s => `<option value="${escape(s.id)}">${escape(s.label)}</option>`).join('') : '<option value="">Standard</option>';
  $('#player-audio').value = player.audio || '';
  $('#player-subtitle').innerHTML = '<option value="0">Fra</option>' + source.subtitles.map(s => `<option value="${escape(s.id)}">${escape(s.label)}</option>`).join('');
  $('#player-subtitle').value = player.subtitle;
}
async function reportTimeline(playState, ended = false, keepalive = false) {
  const player = state.player, video = $('#netplex-video');
  if (!player?.session || !video || !Number.isFinite(video.currentTime)) return;
  try {
    await api(`/api/playback/${player.session.id}/timeline`, { method: 'POST', body: { state: playState, time: Math.round(video.currentTime * 1000), ended }, keepalive }); player.timelineError = false;
    player.item.progress = Math.round(video.currentTime * 1000); if (ended) player.item.watched = true;
    return true;
  } catch (error) { if (!player.timelineError && !player.closing) toast('Plex kunne ikke gemme din fremdrift. Kontrollér forbindelsen.'); player.timelineError = true; return false; }
}
async function loadStream(time = 0) {
  const player = state.player; if (!player || player.closing) return;
  const restart = ++player.restart;
  $('#player-loading').hidden = false; $('#player-error').hidden = true;
  try {
    const previous = player.session;
    if (previous) { await api(`/api/playback/${previous.id}/stop`, { method: 'POST', body: { time: Math.round((Number(time) || 0) * 1000) } }).catch(() => {}); if (player.session === previous) player.session = null; }
    if (state.player !== player || restart !== player.restart) return;
    player.hls?.destroy(); player.hls = null;
    const video = $('#netplex-video'); video.pause(); video.removeAttribute('src'); video.load();
    const source = player.media[Number(player.mediaIndex)] || {};
    player.capabilities = browserCapabilities(video, source);
    const session = await api('/api/playback', { method: 'POST', body: { id: player.item.id,...(player.sourceId?{sourceId:player.sourceId}:{}), quality: player.quality, mediaIndex: Number(player.mediaIndex), audio: player.audio, subtitle: player.subtitle, capabilities: player.capabilities, directSupported: supportsDirectFile(source, player.capabilities, video), forceRemux: player.fallback } });
    if (state.player !== player || restart !== player.restart) { await api(`/api/playback/${session.id}/stop`, { method: 'POST', body: {} }).catch(() => {}); return; }
    player.session = session;
    $('#player-mode').innerHTML = `<span class="dot live-dot"></span>${session.mode === 'direct' ? 'Direkte afspilning' : session.videoDecision === 'copy' ? session.audioDecision === 'copy' ? 'Original billed- og lydkvalitet' : 'Original billedkvalitet · tilpasset lyd' : 'Tilpasset afspilning via Plex'}`;
    const start = Math.max(0, Math.min(Number(time) || 0, Math.max(0, session.duration - 1)));
    const ready = () => { if (state.player !== player || restart !== player.restart) return; if (start > 0 && Math.abs(video.currentTime - start) > 2) { try { video.currentTime = start; } catch { /* The stream will seek when ready. */ } } video.play().catch(() => { $('#player-loading').hidden = true; }); };
    video.addEventListener('loadedmetadata', ready, { once: true });
    if (session.mode === 'direct') video.src = session.source;
    else if (window.Hls?.isSupported()) {
      const hls = player.hls = new window.Hls({ startPosition: start, backBufferLength: 30, maxBufferLength: 30 });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => { $('#player-loading').hidden = true; }); });
      hls.on(window.Hls.Events.ERROR, async (_event, data) => {
        if (!data.fatal || state.player !== player || restart !== player.restart) return;
        let message;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          const status = await api(`/api/playback/${session.id}/status`).catch(() => null);
          message = status?.error || `Forbindelsen til Plex-streamen blev afbrudt${data.response?.code ? ` (HTTP ${data.response.code})` : ''}. Prøv igen, eller kontrollér forbindelsen til serveren.`;
        } else message = 'Browseren kunne ikke afkode denne videostream. Prøv en H.264-version eller en browser med understøttelse af filmens videoformat.';
        if (state.player === player && restart === player.restart) showPlayerError(message);
      });
      hls.loadSource(session.source); hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) video.src = session.source;
    else throw new Error('Denne browser understøtter ikke HLS-afspilning. Brug en opdateret Chrome, Edge, Firefox eller Safari.');
  } catch (error) { if (state.player === player && restart === player.restart) showPlayerError(error.message); }
}
function showPlayerError(message) { const el = $('#player-error'); if (!el) return; $('#player-loading').hidden = true; el.hidden = false; el.innerHTML = `${icon('info')}<h2>Afspilningen kunne ikke starte</h2><p>${escape(message)}</p><button class="btn btn-primary" data-action="retry-player">Prøv igen</button>`; }
async function stopPlayback(refresh = true) {
  const player = state.player; if (!player || player.closing) return;
  player.closing = true; clearInterval(player.timer);
  const session = player.session;
  const video = $('#netplex-video'), time = video?.currentTime;
  player.hls?.destroy(); video?.pause(); video?.removeAttribute('src'); video?.load();
  state.player = null; playerDialog.close(); playerDialog.innerHTML = '';
  if (session) await api(`/api/playback/${session.id}/stop`, { method: 'POST', body: { ...(Number.isFinite(time) ? { time: Math.round(time * 1000) } : {}) } }).catch(() => {});
  if (refresh) await renderPage();
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || button.disabled) return;
  const { action, route, detail, play, save, genre, toggleFilter, watched, server, collection } = button.dataset;
  if (collection) { const category=designUI.collection(collection);if(category)location.hash=`/${category.query.source==='saved'?'saved':category.query.filter?.types?.length===1&&category.query.filter.types[0]==='show'?'shows':'movies'}?collection=${encodeURIComponent(collection)}`;return; }
  if (route) { navigate(route); return; }
  if (detail) { await openDetail(detail); return; }
  if (play) { button.disabled = true; await startPlayback(play,button.dataset.sourceId||undefined); if (button.isConnected) button.disabled = false; return; }
  if (save) { button.disabled = true; await toggleSaved(save); if (button.isConnected) button.disabled = false; return; }
  if (genre !== undefined) { state.genre = genre; await renderPage(); return; }
  if (toggleFilter) { state[toggleFilter] = !state[toggleFilter]; await renderPage(); return; }
  if (watched) {
    const value = button.dataset.currentWatched !== 'true'; button.disabled = true;
    try { if (!state.demo) await api(`/api/items/${watched}/watched`, { method: 'POST', body: { watched: value,sourceId:button.dataset.sourceId||undefined } }); state.items.get(watched).watched = value; await openDetail(watched); await renderPage(); toast(value ? 'Markeret som set' : 'Markeret som uset'); } catch (error) { toast(error.message); button.disabled = false; } return;
  }
  if (server) {
    document.querySelectorAll('[data-server]').forEach(b => b.disabled = true); const original = button.innerHTML; button.innerHTML = '<span class="loader"></span><span>Forbinder til serveren…</span>';
    try { await api('/api/servers/select', { method: 'POST', body: { id: server } }); await connected(); }
    catch (error) { $('#setup-error').innerHTML = errorBox(error.message); button.innerHTML = original; document.querySelectorAll('[data-server]').forEach(b => b.disabled = false); } return;
  }
  if(action==='toggle-cast') {
    const expanded=button.getAttribute('aria-expanded')!=='true';
    $('#detail-cast-preview',detailDialog).hidden=expanded;
    $('#detail-cast-full',detailDialog).hidden=!expanded;
    button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'Vis mindre':'Mere information';return;
  }
  if(action==='servers-ready'){await connected();return;}
  if(action==='refresh-servers'){button.disabled=true;await loadServerSettings();state.items.clear();await renderPage({preserveView:true});button.disabled=false;return;}
  if (action === 'close-detail') closeDetail();
  else if (action === 'close-settings') settingsDialog.close();
  else if (action === 'close-player') await stopPlayback();
  else if (action === 'settings') showSettings();
  else if (action === 'design-studio') { settingsDialog.close(); designUI.openStudio(); }
  else if (action === 'login') await startLogin();
  else if (action === 'demo') { state.demo = true; state.saved = new Set(local.get('demo.saved', ['1001', '1004', '1007'])); remember(demoItems); const url = new URL(location.href); url.search = '?demo=1'; url.hash = '/home'; history.replaceState(null, '', url); state.route = 'home'; shell(); await renderPage(); }
  else if (action === 'connect') { settingsDialog.close(); state.demo = false; history.replaceState(null, '', '/'); if (state.status.connected) { shell(); await renderPage(); } else showSetup(); }
  else if (action === 'cancel-login') { clearTimeout(state.authTimer); sessionStorage.removeItem('netplex.pin'); if (state.status.account) { await api('/api/disconnect', { method: 'POST', body: {} }); state.status = await api('/api/status'); } history.replaceState(null, '', '/'); showSetup(); }
  else if (action === 'search') { $('#global-query')?.focus(); }
  else if (action === 'clear-filters') { state.query = ''; state.genre = ''; state.unwatched = false; state.only4k = false; if(state.route==='search'){state.globalQuery='';if($('#global-query'))$('#global-query').value='';commitGlobalSearch();}else await renderPage(); }
  else if (action === 'all-status') { state.unwatched = false; state.only4k = false; await renderPage(); }
  else if (action === 'load-more') { button.disabled = true; try { await renderLibrary(state.request?.signal, true); } catch (error) { toast(error.message); button.disabled = false; } }
  else if (action === 'refresh') { button.disabled = true; try { if (!state.demo) await api('/api/refresh', { method: 'POST', body: {} }); settingsDialog.close(); await renderPage(); toast('Biblioteket er opdateret'); } catch (error) { toast(error.message); button.disabled = false; } }
  else if (action === 'confirm-disconnect') $('#settings-feedback').innerHTML = '<div class="settings-confirm"><p>Vil du afbryde forbindelsen? Du kan tilslutte en server igen bagefter. Din lokale liste bliver gemt.</p><div class="actions"><button class="btn btn-small" data-action="disconnect">Afbryd forbindelse</button><button class="text-button" data-action="cancel-disconnect">Annullér</button></div></div>';
  else if (action === 'cancel-disconnect') $('#settings-feedback').innerHTML = '';
  else if (action === 'disconnect') { try { await api('/api/disconnect', { method: 'POST', body: {} }); state.status = await api('/api/status'); state.saved.clear(); state.items.clear(); settingsDialog.close(); state.demo = false; history.replaceState(null, '', '/'); showSetup(); } catch (error) { toast(error.message); } }
  else if (action === 'retry-player') await loadStream($('#netplex-video')?.currentTime || 0);
});
document.addEventListener('input', event => {
  if (event.target.id === 'global-query') {
    state.globalQuery = event.target.value;
    clearTimeout(globalSearchTimer);
    if (!event.isComposing) globalSearchTimer = setTimeout(commitGlobalSearch, 250);
  } else if (event.target.id === 'library-query') {
    state.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void renderPage({ keepFocus: true }), 300);
  }
});
document.addEventListener('submit', event => {
  if (event.target.id !== 'global-search') return;
  event.preventDefault();
  state.globalQuery = $('#global-query').value;
  commitGlobalSearch();
});
document.addEventListener('change', event => {
  if(event.target.dataset.serverToggle){void toggleServer(event.target);return;}
  if(event.target.id==='detail-source'){void openDetail(event.target.dataset.item,event.target.value);return;}
  if (event.target.id === 'sort-select') { state.sort = event.target.value; void renderPage(); }
  if (event.target.matches('.mobile-genre')) { state.genre = event.target.value; void renderPage(); }
  if (event.target.dataset.filter) { state[event.target.dataset.filter] = event.target.checked; void renderPage(); }
});
detailDialog.addEventListener('cancel', event => { event.preventDefault(); closeDetail(); });
playerDialog.addEventListener('cancel', event => { event.preventDefault(); void stopPlayback(); });
for (const dialog of [detailDialog, settingsDialog]) dialog.addEventListener('click', event => { if (event.target === dialog) { const bounds = dialog.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog === detailDialog ? closeDetail() : dialog.close(); } });
window.addEventListener('hashchange', () => void renderPage());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && (state.demo || state.status?.connected) && !document.querySelector('dialog[open]')) { event.preventDefault(); $('#global-query')?.focus(); $('#global-query')?.select(); }
  if (event.target.id === 'global-query' && event.key === 'Escape') { event.preventDefault(); event.target.blur(); }
  if (!playerDialog.open || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || (event.target.tagName === 'BUTTON' && event.key === ' ')) return;
  const video = $('#netplex-video'); if (!video) return;
  if (event.key === ' ') { event.preventDefault(); video.paused ? video.play().catch(() => {}) : video.pause(); }
  else if (event.key === 'ArrowRight') { event.preventDefault(); video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 10); }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); video.currentTime = Math.max(0, video.currentTime - 10); }
  else if (event.key.toLowerCase() === 'm') video.muted = !video.muted;
  else if (event.key.toLowerCase() === 'f') { if (document.fullscreenElement) void document.exitFullscreen(); else void video.requestFullscreen().catch(() => {}); }
});
window.addEventListener('pagehide', () => { const player = state.player; if (!player?.session) return; const time = $('#netplex-video')?.currentTime; void api(`/api/playback/${player.session.id}/stop`, { method: 'POST', body: { ...(Number.isFinite(time) ? { time: Math.round(time * 1000) } : {}) }, keepalive: true }).catch(() => {}); });

async function boot() {
  try {
    state.status = await api('/api/status');
    const designRecovery = await designUI.load(); if (designRecovery) toast(designRecovery);
    if (state.demo) { state.saved = new Set(local.get('demo.saved', ['1001', '1004', '1007'])); remember(demoItems); }
    if (state.demo || state.status.connected) { shell(); await renderPage(); }
    else { showSetup(); if (sessionStorage.getItem('netplex.pin')) await finishLogin(); }
  } catch (error) { root.innerHTML = `<header class="setup-header">${brand}</header>${emptyState('NetPlex kunne ikke starte', error.message, '<a class="btn btn-primary" href="/">Prøv igen</a>')}`; }
}
void boot();
