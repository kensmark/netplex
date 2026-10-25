const hevcCodecs = (profile, levels) => levels.flatMap(level => [`hvc1.${profile}.L${level}.B0`, `hev1.${profile}.L${level}.B0`]);
const commonLevels = [153, 150, 123, 120, 93];
const hevc8 = hevcCodecs('1.6', commonLevels);
const hevc10 = hevcCodecs('2.4', commonLevels);

export function browserCapabilities(video = document.createElement('video'), media) {
  const Source = window.Hls?.getMediaSource?.() || window.MediaSource || window.ManagedMediaSource || window.WebKitMediaSource;
  const supports = (kind, codecs) => {
    const mime = `${kind}/mp4; codecs="${codecs}"`;
    try { return Source?.isTypeSupported ? Source.isTypeSupported(mime) : Boolean(video.canPlayType('application/vnd.apple.mpegurl') && video.canPlayType(mime)); }
    catch { return false; }
  };
  const levels = media?.videoLevel ? [Number(media.videoLevel)] : commonLevels;
  return {
    hevc: hevcCodecs('1.6', levels).some(codec => supports('video', codec)),
    hevcMain10: hevcCodecs('2.4', levels).some(codec => supports('video', codec)),
    ac3: supports('audio', 'ac-3'), eac3: supports('audio', 'ec-3'),
  };
}

export function supportsSourceVideo(media, capabilities) {
  if (media.videoCodec === 'h264') return true;
  if (media.videoCodec !== 'hevc') return false;
  return media.bitDepth > 8 || /10/.test(media.videoProfile) ? capabilities.hevcMain10 : capabilities.hevc;
}

export function supportsDirectFile(media, capabilities, video = document.createElement('video')) {
  if (!['mp4', 'm4v'].includes(media.container) || !supportsSourceVideo(media, capabilities)) return false;
  const codecs = media.videoCodec === 'hevc' ? media.bitDepth > 8 || /10/.test(media.videoProfile) ? hevc10 : hevc8 : ['avc1.640033'];
  const audio = { aac: 'mp4a.40.2', mp3: 'mp4a.6B', ac3: 'ac-3', eac3: 'ec-3' }[media.audioCodec];
  if (media.audioCodec && !audio) return false;
  return codecs.some(codec => Boolean(video.canPlayType(`video/mp4; codecs="${codec}${audio ? `, ${audio}` : ''}"`)));
}

export function preferredMediaIndex(media, capabilities, video) {
  return (media.find(source => supportsDirectFile(source, capabilities, video)) || media.find(source => supportsSourceVideo(source, capabilities)) || media[0])?.index || 0;
}
