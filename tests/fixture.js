import { createServer } from 'node:http';

export async function createPlexFixture({ movieCount = 205, video = Buffer.from('0123456789-test-video'), hlsAssets, externalSubtitles = {},machineId='fixture-pms',friendlyName='Test Plex' } = {}) {
  const requests = [];
  const controls = { rejectConversion: false, remuxOnly: false, manifestStatus: 200 };
  const movies = Array.from({ length: movieCount }, (_, index) => ({
    ratingKey: String(index + 1), type: 'movie', title: index === 0 ? 'Night Signal' : index === 1 ? 'Blue Hour' : `Testfilm ${index + 1}`,
    summary: 'En beskrivelse fra Plex-serveren.', year: 2025 - index % 5, duration: index === 0 ? 5000 : 7200000,
    addedAt: 1800000000 - index, viewOffset: 0, viewCount: 0, audienceRating: 8.1,
    thumb: `/library/metadata/${index + 1}/thumb/1`, art: `/library/metadata/${index + 1}/art/1`,
    Genre: [{ tag: index % 2 ? 'Drama' : 'Science fiction' }], Director: [{ tag: 'Testinstruktør' }], Role: [{ tag: 'Testskuespiller', role: 'Pilot' }],
    Media: [{ container: index === 1 ? 'mkv' : 'mp4', videoCodec: 'h264', audioCodec: 'aac', videoResolution: index % 3 ? '1080' : '4k', Part: [{ id: String(5000 + index), key: `/library/parts/${5000 + index}/1/file.mp4`, file: 'D:/secret-storage/never-send-this-path.mp4', Stream: [{ id: '11', streamType: 2, displayTitle: 'Engelsk (AAC stereo)', languageCode: 'eng', codec: 'aac', selected: 1 }, { id: '12', streamType: 2, displayTitle: 'Dansk', codec: 'aac' }, { id: '20', streamType: 3, displayTitle: 'Dansk (SRT)', languageCode: 'dan', codec: 'srt' }] }] }],
  }));
  const show = { ratingKey: '10000', type: 'show', title: 'Signal Station', year: 2025, leafCount: 1, summary: 'En serie fra Plex.', Genre: [{ tag: 'Drama' }] };
  const season = { ratingKey: '10001', type: 'season', title: 'Sæson 1', index: 1 };
  const episode = { ...movies[0], ratingKey: '10002', type: 'episode', title: 'Pilot', parentTitle: 'Sæson 1', grandparentTitle: show.title, parentIndex: 1, index: 1 };
  const all = [...movies, show, season, episode];
  let url;
  const server = createServer((req, res) => {
    const target = new URL(req.url, url);
    requests.push({ path: target.pathname, query: Object.fromEntries(target.searchParams), method: req.method, token: req.headers['x-plex-token'], range: req.headers.range });
    const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (target.pathname === '/api/v2/pins') return json({ id: 123, code: 'fixture-pin', expiresIn: 900 });
    if (target.pathname === '/api/v2/pins/123') return json({ id: 123, authToken: 'fixture-account-token' });
    if (target.pathname === '/api/v2/user') return json({ id: 42, username: 'Testbruger' });
    if (target.pathname === '/api/v2/resources') return json(controls.resources||[{ name: 'Vennens server', clientIdentifier: machineId, provides: 'server', accessToken: 'fixture-token-only', owned: false, connections: [{ uri: url, local: true, protocol: 'http' }] }]);
    if (!['fixture-token-only', 'fixture-second-user'].includes(req.headers['x-plex-token'])) return json({ error: 'Unauthorized' }, 401);
    if (Object.hasOwn(externalSubtitles, target.pathname)) { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(externalSubtitles[target.pathname]); return; }
    if (target.pathname === '/') return json({ MediaContainer: { friendlyName, machineIdentifier: machineId, version: '1.43.4', transcoderVideoRemuxOnly: controls.remuxOnly } });
    if(controls.failLibrary&&target.pathname.startsWith('/library/sections'))return json({error:'Offline'},503);
    if(controls.failMetadata&&/^\/library\/metadata\/\d+$/.test(target.pathname))return json({error:'Offline'},503);
    if (target.pathname === '/library/sections') return json({ MediaContainer: { Directory: [{ key: '1', type: 'movie', title: 'Film' }, { key: '2', type: 'show', title: 'Serier' }] } });
    if (/^\/library\/sections\/[12]\/all$/.test(target.pathname)) {
      const items = target.pathname.includes('/1/') ? movies : [show];
      const start = Number(target.searchParams.get('X-Plex-Container-Start') || 0), size = Number(target.searchParams.get('X-Plex-Container-Size') || 200);
      return json({ MediaContainer: { totalSize: items.length, offset: start, Metadata: items.slice(start, start + size) } });
    }
    if (target.pathname === '/hubs/continueWatching') return json({ MediaContainer: { Metadata: [{ ...movies[0], viewOffset: 1200 }, episode] } });
    const match = target.pathname.match(/^\/library\/metadata\/(\d+)(\/children)?$/);
    if (match) { const item = all.find(i => i.ratingKey === match[1]); return json({ MediaContainer: { Metadata: match[2] ? match[1] === '10000' ? [season] : match[1] === '10001' ? [episode] : [] : item ? [item] : [] } }); }
    if (target.pathname === '/:/timeline') { const item = all.find(i => i.ratingKey === target.searchParams.get('ratingKey')); if (item) item.viewOffset = Number(target.searchParams.get('time')); return json({}); }
    if (['/:/scrobble', '/:/unscrobble'].includes(target.pathname)) { const item = all.find(i => i.ratingKey === target.searchParams.get('key')); if (item) item.viewCount = target.pathname === '/:/scrobble' ? 1 : 0; return json({}); }
    if (/^\/library\/parts\/\d+$/.test(target.pathname) && req.method === 'PUT') return json({});
    if (target.pathname === '/photo/:/transcode') { res.writeHead(200, { 'Content-Type': 'image/svg+xml' }); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="#283044"/><circle cx="300" cy="320" r="180" fill="#7b78a5"/><text x="300" y="650" fill="#eee" text-anchor="middle" font-size="50">NIGHT SIGNAL</text></svg>'); return; }
    if (/^\/library\/parts\/\d+\/1\/file.mp4$/.test(target.pathname)) {
      const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
      const start = range ? Number(range[1]) : 0, end = range && range[2] ? Math.min(video.length - 1, Number(range[2])) : video.length - 1;
      if (start >= video.length) { res.writeHead(416, { 'Content-Range': `bytes */${video.length}` }); res.end(); return; }
      res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${video.length}` } : {}) }); res.end(video.subarray(start, end + 1)); return;
    }
    if (target.pathname === '/video/:/transcode/universal/stop') return json({});
    if (target.pathname === '/video/:/transcode/universal/decision') {
      const id = target.searchParams.get('path')?.split('/').at(-1), item = all.find(i => i.ratingKey === id), media = item?.Media?.[0];
      const profile = target.searchParams.get('X-Plex-Client-Profile-Extra') || '';
      const codecs = [...profile.matchAll(/videoCodec=([^&)]+)/g)].flatMap(match => match[1].split(','));
      const requiredBitrate = Math.max(Number(media?.bitrate || 0), ...String(media?.requiredBandwidths || '0').split(',').map(Number));
      const canCopyVideo = target.searchParams.get('directStream') === '1' && codecs.includes(media?.videoCodec) && Number(target.searchParams.get('maxVideoBitrate')) >= requiredBitrate;
      // Real PMS refuses a required video transcode when it is configured for remux only.
      if (controls.rejectConversion || (controls.remuxOnly && !canCopyVideo)) return json({ MediaContainer: { generalDecisionCode: 2000, transcodeDecisionCode: 4002, transcodeDecisionText: 'Not enough CPU for conversion of this item.' } });
      return json({ MediaContainer: { generalDecisionCode: 1001, transcodeDecisionCode: 1001, Metadata: [{ Media: [{ videoCodec: media?.videoCodec, Part: [{ Stream: [{ streamType: 1, decision: canCopyVideo ? 'copy' : 'transcode' }, { streamType: 2, decision: 'transcode' }] }] }] }] } });
    }
    if (target.pathname.endsWith('/start.m3u8')) {
      if (controls.manifestStatus !== 200) return json({ error: 'Plex upstream rejected the manifest' }, controls.manifestStatus);
      res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end(`#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000${hlsAssets ? ',CODECS="avc1.42001E",RESOLUTION=640x360' : ''}\nsession/example/index.m3u8?X-Plex-Token=should-never-reach-browser\n`); return;
    }
    if (hlsAssets && target.pathname.endsWith('/index.m3u8')) { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXT-X-MAP:URI="init.mp4?X-Plex-Token=hidden"\n#EXTINF:5.0,\nsegment0.m4s\n#EXT-X-ENDLIST\n'); return; }
    if (hlsAssets && (target.pathname.endsWith('/init.mp4') || target.pathname.endsWith('/segment0.m4s'))) { res.writeHead(200, { 'Content-Type': 'video/mp4' }); res.end(target.pathname.endsWith('/init.mp4') ? hlsAssets.init : hlsAssets.segment); return; }
    if (target.pathname.endsWith('/index.m3u8')) { res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' }); res.end('#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin?X-Plex-Token=secret"\n#EXTINF:5,\nsegment0.ts\n#EXT-X-ENDLIST\n'); return; }
    if (target.pathname.endsWith('/segment0.ts') || target.pathname.endsWith('/key.bin')) { res.writeHead(200, { 'Content-Type': 'video/mp2t' }); res.end('fixture-segment'); return; }
    json({ error: 'Not found' }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  return { url, requests, movies,show,season,episode, controls, server, close: async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
