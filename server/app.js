import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openStore } from './store.js';
import { openDesignStore } from './design-store.js';
import { openThemeStore } from './theme-store.js';
import {createCatalog,validMediaId} from './catalog.js';
import { validateDesign, resolveCollections, catalogFacets, queryItems } from '../public/design/core.js';
import { AppError, mediaChoices, serverUrl, plexHeaders, plexJson, createPlayback, createNativePlayback, rewritePlaylist, checkPlaybackDecision } from './plex.js';

const project = resolve(fileURLToPath(new URL('..', import.meta.url)));
const publicDir = join(project, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const allowedId = value => { if (!/^\d{1,20}$/.test(value || '')) throw new AppError(400, 'Ugyldigt medie-id.'); return value; };
const bounded = (value, fallback, max) => Math.max(0, Math.min(max, Math.floor(Number(value) || fallback)));

async function bodyJson(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new AppError(415, 'Forespørgslen skal være JSON.');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 65536) throw new AppError(413, 'Forespørgslen er for stor.');
  }
  try { return JSON.parse(body || '{}'); } catch { throw new AppError(400, 'Ugyldig JSON.'); }
}
const sendJson = (res, status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };

export async function createApp({ dataDir = join(project, '.netplex'), cloudUrl = 'https://plex.tv', nativePlayback = false } = {}) {
  const store = await openStore(dataDir), config = store.state;
  const designs = await openDesignStore(dataDir);
  const themes = openThemeStore(dataDir);
  const browserKey = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  const sessions = new Map(), pins = new Map();
  const catalog=createCatalog({config,save:()=>store.save(),resources,validateConnection});
  function invalidate(){catalog.invalidate();}
  function connection() { if (!config.connection) throw new AppError(409, 'Forbind en Plex-server for at åbne dit bibliotek.'); return config.connection; }
  const accountRequest = (path, options) => plexJson({ url: cloudUrl, token: config.account?.token }, config.clientId, path, options);
  const savedIds=()=>catalog.savedIds();
  async function validateConnection(url, token, name, timeout = 10000) {
    if (typeof token !== 'string' || !token.trim() || token.length > 4096 || /[\r\n]/.test(token)) throw new AppError(400, 'Angiv en gyldig Plex-adgangsnøgle.');
    const candidate = { url: serverUrl(url), token: token.trim() };
    const [root, sections] = await Promise.all([
      plexJson(candidate, config.clientId, '/', {timeout}),
      plexJson(candidate, config.clientId, '/library/sections', {timeout}),
    ]);
    if (typeof root.MediaContainer?.machineIdentifier!=='string' || !root.MediaContainer.machineIdentifier || root.MediaContainer.machineIdentifier.length>200 || !sections.MediaContainer) throw new AppError(502, 'Adressen ser ikke ud til at være en Plex Media Server.');
    return { ...candidate, name: root.MediaContainer.friendlyName || name || 'Plex Media Server', machineId: root.MediaContainer.machineIdentifier, version: root.MediaContainer.version || '' };
  }
  async function resources() {
    if (!config.account?.token) throw new AppError(409, 'Log ind med Plex først.');
    const result = await accountRequest('/api/v2/resources', { query: { includeHttps: 1, includeRelay: 1, includeIPv6: 0 } });
    if (!Array.isArray(result)) throw new AppError(502, 'Plex kunne ikke hente dine servere.');
    return result.filter(device => String(device.provides).split(',').includes('server') && device.accessToken);
  }
  const getLibrary=()=>catalog.getLibrary();
  async function stopSession(session) {
    if (session.mode === 'hls') {
      try { await plexJson(session.connection, config.clientId, '/video/:/transcode/universal/stop', { query: { session: session.id }, timeout: 5000 }); } catch { /* Already stopped or server offline. */ }
    }
    sessions.delete(session.id);
  }
  const expiry = setInterval(() => {
    for (const session of sessions.values()) if (Date.now() - session.lastActive > 10 * 60 * 1000) void stopSession(session);
    for (const [id, pin] of pins) if (Date.now() > pin.expires) pins.delete(id);
  }, 60000);
  expiry.unref();

  async function proxy(req, res, url, session, image = false, connectionOverride) {
    const target = connectionOverride || session?.connection || connection();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    const onClose = () => { if (!res.writableFinished) controller.abort(); };
    res.on('close', onClose);
    try {
      const headers = plexHeaders(config.clientId, target.token, session?.id);
      if (req.headers.range && !image) headers.Range = req.headers.range;
      headers.Accept = image ? 'image/*' : '*/*';
      const upstream = await fetch(url, { headers, signal: controller.signal, redirect: 'manual' });
      clearTimeout(timeout);
      if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel();
        if (upstream.status === 416) { res.writeHead(416, { 'Content-Range': upstream.headers.get('content-range') || 'bytes */0' }); res.end(); return; }
        throw new AppError([401, 403].includes(upstream.status) ? 403 : 502, `Plex afviste videostreamen (HTTP ${upstream.status}). ${[401, 403].includes(upstream.status) ? 'Kontrollér din adgang til filmen på Plex-serveren.' : 'Start afspilningen igen, eller vælg en anden version.'}`, `PLEX_STREAM_HTTP_${upstream.status}`);
      }
      const contentType = upstream.headers.get('content-type') || (image ? 'image/jpeg' : 'application/octet-stream');
      if (image && !contentType.toLowerCase().startsWith('image/')) { await upstream.body?.cancel(); throw new AppError(502, 'Plex kunne ikke levere dette billede.'); }
      const playlist = session && (/mpegurl/i.test(contentType) || new URL(url).pathname.endsWith('.m3u8'));
      if (playlist) {
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const rewritten = rewritePlaylist(await upstream.text(), session, url);
          res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Cache-Control': 'no-store' }); res.end(rewritten);
        } finally { clearTimeout(timer); }
        return;
      }
      const out = { 'Content-Type': contentType, 'Cache-Control': image ? 'private, max-age=300' : 'no-store' };
      for (const name of ['content-length', 'content-range', 'accept-ranges']) if (upstream.headers.has(name)) out[name] = upstream.headers.get(name);
      res.writeHead(upstream.status, out);
      if (!upstream.body) { res.end(); return; }
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
      if (session && !res.destroyed && !controller.signal.aborted) session.lastError = error.status ? error.message : 'Forbindelsen til Plex-streamen blev afbrudt.';
      if (res.destroyed || controller.signal.aborted) { if (!res.destroyed) res.destroy(); return; }
      if (res.headersSent) res.destroy(); else throw error;
    } finally { clearTimeout(timeout); res.off('close', onClose); }
  }

  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    try {
      let host;
      try { host = new URL(`http://${req.headers.host}`); } catch { throw new AppError(400, 'Ugyldig adresse.'); }
      if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) throw new AppError(403, 'NetPlex er kun tilgængelig fra denne computer.');
      const url = new URL(req.url, host);
      const path = url.pathname;
      // Plex returns the browser from its own origin. Loading our public app
      // document is safe; API calls still require the local session and CSRF token.
      const pageNavigation = req.method === 'GET' && path === '/' &&
        req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
      if (!pageNavigation) {
        if (req.headers.origin && req.headers.origin !== host.origin) throw new AppError(403, 'Forespørgslen kommer fra en anden hjemmeside.');
        if (req.headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'Forespørgslen kommer fra en anden hjemmeside.');
      }
      const authenticated = String(req.headers.cookie || '').split(';').some(s => s.trim() === `netplex=${browserKey}`);
      if (path === '/api/status' && req.method === 'GET') {
        res.setHeader('Set-Cookie', `netplex=${browserKey}; HttpOnly; SameSite=Strict; Path=/`);
        sendJson(res, 200, { connected: catalog.connected(), account: config.account ? { name: config.account.name } : null, server: config.connection ? { name: config.connection.name, id: config.connection.machineId, version: config.connection.version } : null, csrf, servers:catalog.summary(), warning:catalog.warning() }); return;
      }
      if (path.startsWith('/api/')) {
        if (!authenticated) throw new AppError(401, 'Åbn NetPlex igen for at starte en lokal session.');
        if (req.method !== 'GET' && req.headers['x-netplex-csrf'] !== csrf) throw new AppError(403, 'Sessionen er udløbet. Genindlæs NetPlex.');
        if (path === '/api/design' && req.method === 'GET') { sendJson(res, 200, await designs.read()); return; }
        if (path === '/api/themes' && req.method === 'GET') {
          try { sendJson(res,200,{themes:await themes.read()}); } catch(error) { throw new AppError(400,error.message); } return;
        }
        if (path === '/api/themes' && req.method === 'POST') {
          const body = await bodyJson(req);
          try { sendJson(res,200,await themes.save(body.theme)); } catch(error) { if(error.code) throw error; throw new AppError(400,error.message); } return;
        }
        if (/^\/api\/themes\/[a-f0-9-]{36}$/.test(path) && req.method === 'DELETE') {
          try { await themes.remove(path.split('/').at(-1)); } catch(error) { if(error.code) throw error; throw new AppError(400,error.message); }
          sendJson(res,200,{ok:true}); return;
        }
        if(path==='/api/design/catalog'&&req.method==='GET'){const [library,continuing]=await Promise.all([getLibrary(),catalog.continuing()]);sendJson(res,200,catalogFacets([...library.items,...continuing]));return;}
        if (['/api/design', '/api/design/collections'].includes(path) && req.method === 'POST') {
          const body = await bodyJson(req); let design;
          try { design = validateDesign(body.design); } catch (error) { throw new AppError(400, error.message); }
          if (path === '/api/design') {
            try { await designs.save(design); } catch (error) { if (!error.code) throw new AppError(400, error.message); throw error; }
            sendJson(res, 200, {ok:true}); return;
          }
          const [library,resume]=await Promise.all([getLibrary(),catalog.continuing()]);
          sendJson(res,200,{collections:resolveCollections(design,{items:library.items,continuing:resume,saved:savedIds()}),saved:savedIds(),servers:catalog.summary(),warnings:library.warnings});return;
        }
        if (path === '/api/connect' && req.method === 'POST') {
          const body = await bodyJson(req);
          const next = await validateConnection(body.url, body.token, body.name);
          await Promise.all([...sessions.values()].map(stopSession));
          config.account=null;catalog.manual(next); await store.save(); invalidate();
          sendJson(res, 200, { name: next.name, id: next.machineId }); return;
        }
        if (path === '/api/auth/start' && req.method === 'POST') {
          await bodyJson(req);
          const pin = await accountRequest('/api/v2/pins', { method: 'POST', query: { strong: 'true' } });
          if (!pin.id || !pin.code) throw new AppError(502, 'Plex kunne ikke starte login. Prøv igen.');
          const id = String(pin.id);
          pins.set(id, { code: pin.code, expires: Date.now() + Math.min(Number(pin.expiresIn) || 900, 1800) * 1000 });
          const authParams = new URLSearchParams({ clientID: config.clientId, code: pin.code, 'context[device][product]': 'NetPlex', forwardUrl: `${host.origin}/?plex=return` });
          sendJson(res, 200, { id, url: `https://app.plex.tv/auth#?${authParams}`, expiresIn: pin.expiresIn || 900 }); return;
        }
        if (/^\/api\/auth\/\d+$/.test(path) && req.method === 'POST') {
          await bodyJson(req); const id = path.split('/').at(-1), pending = pins.get(id);
          if (!pending || Date.now() > pending.expires) throw new AppError(410, 'Plex-login er udløbet. Start et nyt login.');
          const pin = await accountRequest(`/api/v2/pins/${id}`, { query: { code: pending.code } });
          if (!pin.authToken) { sendJson(res, 200, { pending: true }); return; }
          const user = await plexJson({ url: cloudUrl, token: pin.authToken }, config.clientId, '/api/v2/user');
          await Promise.all([...sessions.values()].map(stopSession));
          config.account = { token: pin.authToken, name: user.friendlyName || user.username || 'Plex-bruger', id: String(user.id) };
          config.connection = null;catalog.reset(); await store.save(); pins.delete(id); invalidate();
          sendJson(res, 200, { pending: false, name: config.account.name }); return;
        }
        if(path==='/api/servers'&&req.method==='GET'){
          await catalog.sync(true);sendJson(res,200,{servers:catalog.summary(),warning:catalog.warning()});return;
        }
        if(path==='/api/servers/toggle'&&req.method==='POST'){
          const body=await bodyJson(req);if(typeof body.id!=='string'||body.id.length>200||typeof body.enabled!=='boolean')throw new AppError(400,'Vælg en server og dens tilstand.');
          await catalog.toggle(body.id,body.enabled);
          sendJson(res,200,{ok:true,servers:catalog.summary()});return;
        }
        if(path==='/api/servers/select'&&req.method==='POST'){
          const body=await bodyJson(req);await catalog.sync(true);
          const selected=catalog.known().find(s=>s.machineId===body.id);
          if(!selected)throw new AppError(404,'Denne server er ikke tilgængelig på din Plex-konto.');
          if(!selected.url)throw new AppError(502,'Serveren kunne ikke nås. Kontrollér serverens fjernadgang.');
          await Promise.all([...sessions.values()].map(stopSession));await catalog.toggle(selected.machineId,true);
          config.connection={...selected};await store.save();invalidate();sendJson(res,200,{name:selected.name,id:selected.machineId});return;
        }

        if (path === '/api/disconnect' && req.method === 'POST') {
          await bodyJson(req); await Promise.all([...sessions.values()].map(stopSession));
          config.connection = null; config.account = null;catalog.reset(); pins.clear(); await store.save(); invalidate(); sendJson(res, 200, { ok: true }); return;
        }
        if (path === '/api/refresh' && req.method === 'POST') { await bodyJson(req); await catalog.sync(true);invalidate(); sendJson(res, 200, { ok: true }); return; }
        if(path==='/api/home'&&req.method==='GET'){const [library,resume]=await Promise.all([getLibrary(),catalog.continuing()]);const latest=[...library.items].sort((a,b)=>b.addedAt-a.addedAt);sendJson(res,200,{featured:latest.find(i=>i.type==='movie'&&i.art&&!i.watched)||latest[0]||null,recent:latest.filter(i=>i.type==='movie').slice(0,18),shows:latest.filter(i=>i.type==='show').slice(0,12),continuing:resume,saved:library.items.filter(i=>savedIds().includes(i.id)),total:library.items.length,servers:catalog.summary(),warnings:library.warnings});return;}
        if (path === '/api/library' && req.method === 'GET') {
          const library = await getLibrary(); let items = [...library.items];
          const list = key => url.searchParams.getAll(key).filter(value=>value&&value.length<=200).slice(0,50);
          items=queryItems(items,{source:'library',filter:{types:list('mediaType'),genres:list('genreAny'),directors:list('director'),actors:list('actor')},limit:items.length}).items;
          const q = (url.searchParams.get('q') || '').trim().toLocaleLowerCase('da'), type = url.searchParams.get('type'), genre = url.searchParams.get('genre');
          if (type) items = items.filter(i => i.type === type);
          const genres = [...new Set(items.flatMap(i => i.genres))].sort((a, b) => a.localeCompare(b, 'da'));
          if (url.searchParams.get('saved') === '1') items = items.filter(i => savedIds().includes(i.id));
          if (q) items = items.filter(i => `${i.title} ${i.originalTitle} ${i.genres.join(' ')} ${i.directors.join(' ')} ${i.cast.map(c => c.name).join(' ')}`.toLocaleLowerCase('da').includes(q));
          if (genre) items = items.filter(i => i.genres.some(value=>value.toLocaleLowerCase('da')===genre.toLocaleLowerCase('da')));
          if (url.searchParams.get('unwatched') === '1') items = items.filter(i => !i.watched);
          if (url.searchParams.get('resolution') === '4k') items = items.filter(i => ['4k', '2160'].includes(i.resolution));
          for (const [name, accept] of [
            ['yearFrom', (item,value)=>item.year>0&&item.year>=value],
            ['yearBefore', (item,value)=>item.year>0&&item.year<value],
            ['ratingMin', (item,value)=>item.rating>=value],
            ['durationMax', (item,value)=>item.duration>0&&item.duration<=value*60000],
          ]) { const value=url.searchParams.get(name);if(value!==null&&value!==''&&Number.isFinite(Number(value)))items=items.filter(item=>accept(item,Number(value))); }
          if (['1080','720'].includes(url.searchParams.get('resolution'))) items=items.filter(item=>item.resolution===url.searchParams.get('resolution'));
          const sort = url.searchParams.get('sort') || 'added';
          items.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title, 'da') : sort === 'year' ? (a, b) => b.year - a.year : sort === 'oldest' ? (a,b)=>(a.year||9999)-(b.year||9999) : sort === 'rating' ? (a, b) => b.rating - a.rating : sort === 'duration' ? (a, b) => a.duration - b.duration : (a, b) => b.addedAt - a.addedAt);
          const start = bounded(url.searchParams.get('start'), 0, Number.MAX_SAFE_INTEGER), size = bounded(url.searchParams.get('size'), 60, 200) || 60;
          sendJson(res, 200, { items: items.slice(start, start + size), total: items.length, genres, saved: savedIds(), sections: library.sections,servers:catalog.summary(),warnings:library.warnings }); return;
        }
        const itemRoute = path.match(/^\/api\/items\/(\d{1,20}|s-[a-f0-9]{24}-\d{1,20})(?:\/(children|saved|watched))?$/);
        if (itemRoute) {
          const id=itemRoute[1],action=itemRoute[2];
          if(req.method==='GET'&&!action){
            const result=await catalog.detail(id,url.searchParams.get('source')||undefined);
            sendJson(res,200,{item:result.item,media:mediaChoices(result.raw),saved:catalog.isSaved(result.group),activeSourceId:result.sourceId});return;
          }
          if(req.method==='GET'&&action==='children'){sendJson(res,200,{items:await catalog.children(id,url.searchParams.get('source')||undefined)});return;}
          if(req.method==='POST'&&action==='saved'){
            const body=await bodyJson(req);if(typeof body.saved!=='boolean')throw new AppError(400,'Angiv om filmen skal gemmes.');
            const result=await catalog.detail(id);await catalog.setSaved(result.group,body.saved);sendJson(res,200,{saved:body.saved});return;
          }
          if(req.method==='POST'&&action==='watched'){
            const body=await bodyJson(req);if(typeof body.watched!=='boolean')throw new AppError(400,'Ugyldig set-status.');
            const result=await catalog.detail(id,body.sourceId);await catalog.request(result.server,body.watched?'/:/scrobble':'/:/unscrobble',{query:{key:result.raw.ratingKey,identifier:'com.plexapp.plugins.library'}});
            invalidate();sendJson(res,200,{watched:body.watched});return;
          }
        }
        if(path==='/api/art'&&req.method==='GET'){
          const imagePath=url.searchParams.get('path')||'';
          if(!/^\/library\/[a-zA-Z0-9_/:.%-]+$/.test(imagePath)||/\.\.|%2e|%2f/i.test(imagePath))throw new AppError(400,'Ugyldig billedadresse.');
          const serverId=url.searchParams.get('server')||config.connection?.machineId,source=catalog.known().find(server=>server.machineId===serverId&&server.enabled!==false&&server.url);
          if(!source)throw new AppError(404,'Serveren er ikke valgt i dine indstillinger.');
          const width=bounded(url.searchParams.get('w'),400,1920)||400,target=new URL('/photo/:/transcode',source.url);
          target.search=new URLSearchParams({url:imagePath,width:String(width),height:String(Math.ceil(width*(width>600?.6:1.5))),minSize:'1',upscale:'0'});
          await proxy(req,res,target.href,null,true,source);return;
        }
        if((path==='/api/playback'||(nativePlayback&&path==='/api/native/playback'))&&req.method==='POST'){
          const body=await bodyJson(req);if(!validMediaId(body.id)||body.sourceId!==undefined&&!validMediaId(body.sourceId))throw new AppError(400,'Ugyldigt medie-id.');
          const selected=await catalog.detail(String(body.id),body.sourceId),raw=selected.raw;
          if(!['movie','episode'].includes(raw.type))throw new AppError(400,'Vælg en film eller episode, der kan afspilles.');
          if(sessions.size>=5)throw new AppError(409,'Luk en anden afspilning, før du starter en ny.');
          const session=path==='/api/native/playback'?createNativePlayback(raw,selected.server,config.clientId,body):createPlayback(raw,selected.server,config.clientId,body);
          if(session.mode!=='native'&&(session.audio!==undefined||session.subtitle!=='0'))await catalog.request(selected.server,'/library/parts/'+allowedId(session.partId),{method:'PUT',query:{audioStreamID:session.audio,subtitleStreamID:session.subtitle,allParts:1}});
          try{await checkPlaybackDecision(session);}catch(error){await stopSession(session);throw error;}
          sessions.set(session.id,session);
          sendJson(res,200,{id:session.id,source:session.source,mode:session.mode,videoDecision:session.videoDecision,audioDecision:session.audioDecision,resume:Number(raw.viewOffset||0)/1000,duration:Number(raw.duration||0)/1000,media:mediaChoices(raw),server:{id:selected.server.machineId,name:selected.server.name},activeSourceId:selected.sourceId,...(session.nativeStreams?{nativeStreams:session.nativeStreams}:{})});return;
        }

        const playRoute = path.match(/^\/api\/playback\/([a-f0-9-]{36})\/(resource\/([a-f0-9]{24})|timeline|stop|status)$/);
        if (playRoute) {
          const session = sessions.get(playRoute[1]);
          if (!session) throw new AppError(410, 'Afspilningen er udløbet. Start filmen igen.');
          session.lastActive = Date.now();
          if (playRoute[2] === 'status' && req.method === 'GET') { sendJson(res, 200, { error: session.lastError || null, videoDecision: session.videoDecision, audioDecision: session.audioDecision }); return; }
          if (playRoute[3] && req.method === 'GET') {
            const target = session.resources.get(playRoute[3]);
            if (!target) throw new AppError(404, 'Videosegmentet findes ikke.');
            await proxy(req, res, target, session); return;
          }
          if (playRoute[2] === 'timeline' && req.method === 'POST') {
            const body = await bodyJson(req);
            if (!['playing', 'paused', 'buffering', 'stopped'].includes(body.state)) throw new AppError(400, 'Ugyldig afspilningsstatus.');
            const time = bounded(body.time, 0, session.duration);
            await plexJson(session.connection, config.clientId, '/:/timeline', { query: { ratingKey: session.itemId, key: `/library/metadata/${session.itemId}`, state: body.state, time, duration: session.duration, 'X-Plex-Session-Identifier': session.id } });
            if (body.ended === true && time >= session.duration * .9) await plexJson(session.connection, config.clientId, '/:/scrobble', { query: { key: session.itemId, identifier: 'com.plexapp.plugins.library' } });
            invalidate(); sendJson(res, 200, { ok: true }); return;
          }
          if (playRoute[2] === 'stop' && req.method === 'POST') {
            const body = await bodyJson(req);
            if (Number.isFinite(body.time)) {
              try { await plexJson(session.connection, config.clientId, '/:/timeline', { query: { ratingKey: session.itemId, key: `/library/metadata/${session.itemId}`, state: 'stopped', time: bounded(body.time, 0, session.duration), duration: session.duration, 'X-Plex-Session-Identifier': session.id }, timeout: 5000 }); } catch { /* Stop must still release the stream if the server disappeared. */ }
            }
            await stopSession(session); invalidate(); sendJson(res, 200, { ok: true }); return;
          }
        }
        throw new AppError(404, 'Denne funktion findes ikke.');
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new AppError(405, 'Metoden er ikke tilladt.');
      const file = path === '/vendor/hls.min.js' ? join(project, 'node_modules/hls.js/dist/hls.min.js') : path === '/vendor/hls.min.js.map' ? join(project, 'node_modules/hls.js/dist/hls.min.js.map') : resolve(publicDir, `.${decodeURIComponent(path === '/' ? '/index.html' : path)}`);
      if (!file.startsWith(publicDir + sep) && !path.startsWith('/vendor/hls.min.js')) throw new AppError(403, 'Adgang afvist.');
      try {
        if (!(await stat(file)).isFile()) throw new Error();
        const data = await readFile(file);
        res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : data);
      } catch { throw new AppError(404, path.startsWith('/vendor/') ? 'Kør npm install, og start NetPlex igen.' : 'Filen findes ikke.'); }
    } catch (error) {
      if (res.destroyed) return;
      if (res.headersSent) { res.destroy(); return; }
      sendJson(res, error.status || 500, { error: error.status ? error.message : 'Der opstod en fejl i NetPlex. Prøv at genindlæse siden.', ...(error.status && error.code ? { code: error.code } : {}) });
      if (!error.status) console.error('NetPlex:', error.code || error.name || 'Internal error');
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('close', () => { clearInterval(expiry); });
  return { server, close: async () => { await Promise.all([...sessions.values()].map(stopSession)); clearInterval(expiry); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
