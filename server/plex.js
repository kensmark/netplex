import { createHash, randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

export function serverUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new AppError(400, 'Angiv en gyldig serveradresse, fx http://192.168.1.20:32400.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new AppError(400, 'Serveradressen skal være en HTTP- eller HTTPS-adresse uden adgangskode eller ekstra sti.');
  }
  return url.origin;
}

export function plexHeaders(clientId, token, session) {
  return {
    Accept: 'application/json', 'X-Plex-Product': 'NetPlex', 'X-Plex-Version': '1.4.0',
    'X-Plex-Client-Identifier': clientId, 'X-Plex-Platform': 'Chrome', 'X-Plex-Device': 'PC',
    ...(token ? { 'X-Plex-Token': token } : {}),
    ...(session ? { 'X-Plex-Session-Identifier': session } : {}),
  };
}

export async function plexJson(connection, clientId, path, { method = 'GET', query = {}, timeout = 15000 } = {}) {
  const url = new URL(path, connection.url);
  for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
  let response;
  try {
    response = await fetch(url, { method, headers: plexHeaders(clientId, connection.token), signal: AbortSignal.timeout(timeout), redirect: 'manual' });
  } catch { throw new AppError(502, 'Plex-serveren svarer ikke. Kontrollér, at den er tændt, og at adressen kan nås fra denne computer.'); }
  if (!response.ok) {
    await response.body?.cancel();
    if ([401, 403].includes(response.status)) throw new AppError(403, 'Plex afviste adgangen. Log ind igen, eller kontrollér din adgang til serveren.');
    throw new AppError(502, `Plex kunne ikke gennemføre forespørgslen (HTTP ${response.status}).`);
  }
  const text = await response.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw new AppError(502, 'Plex sendte et svar, NetPlex ikke kunne læse.'); }
}

export const array = value => Array.isArray(value) ? value : [];
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = value => typeof value === 'string' ? value : '';
export const metadata = data => array(data?.MediaContainer?.Metadata);
export function imageUrl(path, width = 400) {
  if (typeof path !== 'string' || !/^\/library\//.test(path) || path.startsWith('//')) return null;
  return `/api/art?${new URLSearchParams({ path, w: String(width) })}`;
}

export function normalizeItem(item) {
  const media = array(item.Media)[0] || {};
  return {
    id: String(item.ratingKey || ''), type: text(item.type) || 'movie', title: text(item.title),
    originalTitle: text(item.originalTitle), summary: text(item.summary), tagline: text(item.tagline),
    year: number(item.year), duration: number(item.duration), progress: number(item.viewOffset),
    watched: number(item.viewCount) > 0, rating: number(item.audienceRating || item.rating),
    contentRating: text(item.contentRating), addedAt: number(item.addedAt),
    genres: array(item.Genre).map(g => text(g.tag)).filter(Boolean),
    directors: array(item.Director).map(g => text(g.tag)).filter(Boolean),
    cast: array(item.Role).map(g => ({ name: text(g.tag), role: text(g.role) })).filter(person=>person.name),
    thumb: imageUrl(item.thumb || item.parentThumb || item.grandparentThumb),
    art: imageUrl(item.art || item.grandparentArt || item.thumb, 1920),
    resolution: text(media.videoResolution), videoCodec: text(media.videoCodec),
    audioCodec: text(media.audioCodec), container: text(media.container),
    parentId: item.parentRatingKey ? String(item.parentRatingKey) : null,
    parentTitle: text(item.parentTitle), grandparentTitle: text(item.grandparentTitle),
    season: number(item.parentIndex), episode: number(item.index),
    leafCount: number(item.leafCount), viewedLeafCount: number(item.viewedLeafCount),
  };
}

export function mediaChoices(item) {
  return array(item.Media).map((media, index) => {
    const part = array(media.Part)[0] || {};
    const streams = array(part.Stream);
    const mapStream = s => ({ id: String(s.id), label: text(s.displayTitle || s.extendedDisplayTitle || s.title || s.language) || text(s.codec).toUpperCase(), language: text(s.languageCode), selected: Boolean(s.selected), codec: text(s.codec) });
    return {
      index, label: `${String(media.videoResolution || 'Original').toUpperCase()} · ${text(media.container).toUpperCase()}`,
      container: text(media.container), videoCodec: text(media.videoCodec), audioCodec: text(media.audioCodec),
      videoProfile: text(media.videoProfile), bitDepth: number(streams.find(s => Number(s.streamType) === 1)?.bitDepth),
      videoLevel: number(streams.find(s => Number(s.streamType) === 1)?.level),
      audio: streams.filter(s => Number(s.streamType) === 2).map(mapStream),
      subtitles: streams.filter(s => Number(s.streamType) === 3).map(mapStream),
    };
  });
}

export function resourceId(url) { return createHash('sha256').update(url.href).digest('hex').slice(0, 24); }

export function registerResource(session, value, base) {
  const url = new URL(value, base || session.connection.url);
  if (url.origin !== new URL(session.connection.url).origin || !/^\/(video\/:\/transcode\/|transcode\/sessions\/|library\/parts\/|library\/streams\/\d+(?:[/.]|$))/.test(url.pathname)) {
    throw new AppError(502, 'Plex returnerede en ugyldig streamingadresse.');
  }
  // Credentials are sent as headers, never included in the browser-facing manifest.
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase() === 'x-plex-token') url.searchParams.delete(key);
  const id = resourceId(url);
  session.resources.set(id, url.href);
  return `/api/playback/${session.id}/resource/${id}`;
}

export function rewritePlaylist(body, session, base) {
  if (!body.trimStart().startsWith('#EXTM3U')) throw new AppError(502, 'Plex sendte en ugyldig HLS-afspilningsliste.');
  return body.split(/\r?\n/).map(line => {
    if (!line.trim()) return line;
    if (line.startsWith('#')) return line.replace(/URI="([^"\r\n]+)"/g, (_, uri) => `URI="${registerResource(session, uri, base)}"`);
    return registerResource(session, line.trim(), base);
  }).join('\n');
}

// Desktop playback reads the original container; mpv handles video, audio and
// embedded subtitles locally. This never starts a Plex transcoding session.
export function createNativePlayback(item, connection, clientId, options = {}) {
  const mediaIndex = Number(options.mediaIndex || 0), media = array(item.Media)[mediaIndex];
  const parts = array(media?.Part), part = parts[0];
  if (!media || !part?.id || !part.key) throw new AppError(400, 'Denne titel har ingen tilgængelig videofil.');
  if (parts.length > 1) throw new AppError(400, 'Windows-afspilleren understøtter endnu ikke film fordelt på flere filer. Vælg en samlet version.');
  const session = { id: randomUUID(), itemId: String(item.ratingKey), duration: number(item.duration), connection: { ...connection }, resources: new Map(), mode: 'native', lastActive: Date.now(), partId: String(part.id), clientId };
  session.source = registerResource(session, part.key);
  session.nativeStreams = array(part.Stream).filter(s => [1, 2, 3].includes(Number(s.streamType))).map(s => ({
    type: Number(s.streamType), index: s.index === undefined ? null : Number(s.index), selected: Boolean(s.selected),
    external: Boolean(s.key), title: text(s.displayTitle || s.title), language: text(s.languageCode),
    ...(s.key && /^\/library\/streams\/\d+(?:[/.]|$)/.test(s.key) ? { source: registerResource(session, s.key) } : {}),
  }));
  return session;
}

export function createPlayback(item, connection, clientId, options = {}) {
  const mediaIndex = Number(options.mediaIndex || 0);
  const media = array(item.Media)[mediaIndex];
  const parts = array(media?.Part), part = parts[0];
  if (!media || !part?.key || !part.id) throw new AppError(400, 'Denne titel har ingen tilgængelig videofil.');
  const streams = array(part.Stream);
  const audio = options.audio === undefined ? streams.find(s => Number(s.streamType) === 2 && s.selected)?.id : options.audio;
  const subtitle = options.subtitle === undefined ? (streams.find(s => Number(s.streamType) === 3 && s.selected)?.id || '0') : options.subtitle;
  if (audio !== undefined && !streams.some(s => Number(s.streamType) === 2 && String(s.id) === String(audio))) throw new AppError(400, 'Det valgte lydspor findes ikke.');
  if (String(subtitle) !== '0' && !streams.some(s => Number(s.streamType) === 3 && String(s.id) === String(subtitle))) throw new AppError(400, 'Den valgte undertekst findes ikke.');
  const firstAudio = streams.find(s => Number(s.streamType) === 2);
  const capabilities = options.capabilities || {};
  const bitDepth = number(streams.find(s => Number(s.streamType) === 1)?.bitDepth);
  const supportsHevc = (bitDepth > 8 || /10/.test(media.videoProfile || '')) ? capabilities.hevcMain10 === true : capabilities.hevc === true;
  const videoCodecs = ['h264', ...(supportsHevc ? ['hevc'] : [])];
  const audioCodecs = ['aac', 'mp3', ...(capabilities.ac3 === true ? ['ac3'] : []), ...(capabilities.eac3 === true ? ['eac3'] : [])];
  const originalQuality = options.quality === 'original' || (options.quality === 'auto' && videoCodecs.includes(media.videoCodec) && String(subtitle) === '0');
  const direct = originalQuality && options.forceRemux !== true && options.directSupported === true && parts.length === 1 &&
    ['mp4', 'm4v'].includes(media.container) && videoCodecs.includes(media.videoCodec) &&
    (!media.audioCodec || audioCodecs.includes(media.audioCodec)) &&
    String(subtitle) === '0' && (!audio || String(audio) === String(firstAudio?.id));
  const id = randomUUID();
  const session = {
    id, itemId: String(item.ratingKey), duration: number(item.duration), connection: { ...connection },
    resources: new Map(), mode: direct ? 'direct' : 'hls', lastActive: Date.now(),
    partId: String(part.id), audio, subtitle: String(subtitle), clientId,
    sourceVideoCodec: media.videoCodec, sourceVideoSupported: videoCodecs.includes(media.videoCodec),
  };
  let url;
  if (direct) url = new URL(part.key, connection.url);
  else {
    // Original must leave headroom for the source's peak bitrate. A 40 Mbps
    // ceiling can force a 25 Mbps HEVC film into an unnecessary video transcode.
    // Automatic first preserves a compatible source. A fixed 1080p cap would
    // require video conversion even on a server configured for remux only.
    const quality = { '1080': ['1920x1080', 10000], '720': ['1280x720', 4000], '480': ['854x480', 2000], original: [`${Math.max(4096, number(media.width))}x${Math.max(2160, number(media.height))}`, Math.max(1000000, number(media.bitrate) * 4)] }[originalQuality ? 'original' : options.quality] || ['1920x1080', 12000];
    const container = supportsHevc ? 'mp4' : 'mpegts';
    const hlsAudio = audioCodecs.filter(codec => codec !== 'mp3').join(',');
    const profile = [
      `add-direct-play-profile(type=videoProfile&protocol=http&container=mp4,mov&videoCodec=${videoCodecs.join(',')}&audioCodec=${hlsAudio}&subtitleCodec=mov_text,webvtt)`,
      `add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=${container}&videoCodec=${videoCodecs.join(',')}&audioCodec=${hlsAudio}&replace=true)`,
      `add-limitation(scope=videoCodec&scopeName=*&type=upperBound&name=video.width&value=${Math.max(4096, number(media.width))}&replace=true)`,
      `add-limitation(scope=videoCodec&scopeName=*&type=upperBound&name=video.height&value=${Math.max(2160, number(media.height))}&replace=true)`,
      'add-limitation(scope=videoAudioCodec&scopeName=*&type=upperBound&name=audio.channels&value=8&replace=true)',
    ].join('+');
    url = new URL('/video/:/transcode/universal/start.m3u8', connection.url);
    const params = {
      path: `/library/metadata/${item.ratingKey}`, mediaIndex, partIndex: parts.length > 1 ? -1 : 0,
      protocol: 'hls', container, directPlay: 0, directStream: 1, directStreamAudio: 1,
      videoCodec: videoCodecs.join(','), audioCodec: hlsAudio,
      maxVideoBitrate: quality[1], videoResolution: quality[0], videoQuality: 100,
      subtitles: String(subtitle) === '0' ? 'none' : 'burn', advancedSubtitles: 'burn',
      audioStreamID: audio, subtitleStreamID: subtitle, audioChannelCount: 8,
      offset: 0, session: id, location: 'wan', fastSeek: 1,
      'X-Plex-Client-Identifier': clientId, 'X-Plex-Session-Identifier': id,
      'X-Plex-Product': 'NetPlex', 'X-Plex-Platform': 'Chrome',
      'X-Plex-Client-Profile-Name': 'Generic',
      'X-Plex-Client-Profile-Extra': profile,
    };
    for (const [key, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(key, String(value));
  }
  session.source = registerResource(session, url.href);
  return session;
}

export async function checkPlaybackDecision(session) {
  if (session.mode !== 'hls') return;
  const start = new URL([...session.resources.values()][0]);
  const result = await plexJson(session.connection, session.clientId, '/video/:/transcode/universal/decision', { query: Object.fromEntries(start.searchParams) });
  const decision = result.MediaContainer;
  if (!decision) throw new AppError(502, 'Plex kunne ikke kontrollere afspilningen. Prøv igen.', 'PLEX_INVALID_DECISION');
  const generalCode = Number(decision.generalDecisionCode || 0), transcodeCode = Number(decision.transcodeDecisionCode || 0);
  if (generalCode >= 2000 || transcodeCode >= 4000) {
    if (transcodeCode === 4002) {
      const root = await plexJson(session.connection, session.clientId, '/').catch(() => null);
      const remuxOnly = Boolean(root?.MediaContainer?.transcoderVideoRemuxOnly);
      const unsupported = session.sourceVideoCodec === 'hevc' && !session.sourceVideoSupported;
      throw new AppError(409, `${remuxOnly ? 'Videokonvertering er slået fra på Plex-serveren.' : 'Plex afviste videokonverteringen på grund af serverens kapacitet eller begrænsninger.'} ${unsupported ? 'Denne browser melder ikke understøttelse af filmens HEVC-video. Brug en browser med HEVC-understøttelse eller vælg en H.264-version.' : 'Vælg Original og slå undertekster fra for at undgå videokonvertering. Hvis det stadig fejler, skal serverejeren kontrollere indstillingerne for konvertering.'}`, 'PLEX_VIDEO_CONVERSION_UNAVAILABLE');
    }
    throw new AppError(409, `Plex afviste den valgte afspilning (kode ${transcodeCode || generalCode}). Prøv en anden version, et andet lydspor eller en anden kvalitet.`, 'PLEX_PLAYBACK_REJECTED');
  }
  const media = array(decision.Metadata).flatMap(item => array(item.Media))[0];
  const streams = array(media?.Part).flatMap(part => array(part.Stream));
  session.videoDecision = streams.find(stream => Number(stream.streamType) === 1)?.decision || media?.videoDecision || null;
  session.audioDecision = streams.find(stream => Number(stream.streamType) === 2)?.decision || media?.audioDecision || null;
}
