import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const createWindow = user32.func('uintptr_t __stdcall CreateWindowExW(uint32_t exStyle, str16 className, str16 title, uint32_t style, int x, int y, int width, int height, uintptr_t parent, uintptr_t menu, uintptr_t instance, void *parameter)');
const positionWindow = user32.func('int __stdcall SetWindowPos(uintptr_t window, uintptr_t insertAfter, int x, int y, int width, int height, uint32_t flags)');
const showWindow = user32.func('int __stdcall ShowWindow(uintptr_t window, int command)');
const destroyWindow = user32.func('int __stdcall DestroyWindow(uintptr_t window)');
const setRegion = user32.func('int __stdcall SetWindowRgn(uintptr_t window, uintptr_t region, int redraw)');
const gdi32 = koffi.load('gdi32.dll');
const createRegion = gdi32.func('uintptr_t __stdcall CreateRectRgn(int left, int top, int right, int bottom)');
const deleteObject = gdi32.func('int __stdcall DeleteObject(uintptr_t object)');

// This native surface has no Chromium compositor over mpv's swap chain. It is
// owned by the main window, created only for playback, and destroyed on stop.
export class NativeVideoSurface {
  constructor(parent) { this.parent = parent; this.handle = 0; }
  create() {
    this.destroy();
    const parent = this.parent.getNativeWindowHandle().readUInt32LE(0);
    // WS_POPUP | WS_CLIPSIBLINGS | WS_CLIPCHILDREN | SS_BLACKRECT, no activation.
    this.handle = createWindow(0x08000080, 'STATIC', 'NetPlexVideoSurface', 0x86000004, 0, 0, 1, 1, parent, 0, 0, null);
    if (!this.handle) throw new Error('NetPlex kunne ikke oprette videofladen.');
    return Number(this.handle);
  }
  layout(bounds, visible, clip) {
    if (!this.handle) return;
    if (!bounds) { this.hide(); return; }
    const values = [bounds.x, bounds.y, bounds.width, bounds.height].map(value => Math.round(value));
    // HWND_TOP and SWP_NOACTIVATE preserve keyboard focus in the controls.
    const ok = positionWindow(this.handle, 0, values[0], values[1], Math.max(1, values[2]), Math.max(1, values[3]), 0x10 | (visible ? 0x40 : 0x80));
    if (!ok) throw new Error('NetPlex kunne ikke placere videobilledet.');
    // Reveal Chromium's title and controls through the native surface without
    // resizing the movie's full-screen canvas when the controls appear.
    const top = clip?.top || 0, bottom = clip?.bottom || 0;
    const key = `${values[2]},${values[3]},${top},${bottom}`;
    if (this.regionKey !== key) {
      const region = top || bottom ? createRegion(0, top, Math.max(1, values[2]), Math.max(top + 1, values[3] - bottom)) : 0;
      if (!setRegion(this.handle, region, 1)) { if (region) deleteObject(region); throw new Error('NetPlex kunne ikke vise afspilningsknapperne.'); }
      this.regionKey = key;
    }
  }
  hide() { if (this.handle) showWindow(this.handle, 0); }
  destroy() { if (this.handle) { destroyWindow(this.handle); this.handle = 0; } this.regionKey = null; }
}
