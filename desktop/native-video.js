// Load Windows FFI only on Windows. macOS uses mpv's own native video window.
export async function createVideoSurface(parent, platform = process.platform) {
  if (platform === 'win32') {
    const { NativeVideoSurface } = await import('./native-video-win32.js');
    return new NativeVideoSurface(parent);
  }
  if (platform === 'darwin')
    return {
      embedded: false,
      create() {
        return undefined;
      },
      layout() {},
      hide() {},
      destroy() {},
    };
  throw new Error('Denne udgave af NetPlex understøtter Windows og macOS.');
}
