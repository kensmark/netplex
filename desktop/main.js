import { app, BrowserWindow, ipcMain, shell, Menu, nativeTheme, screen } from 'electron';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { LocalClient } from './local-client.js';
import { DesktopPlayback } from './controller.js';
import { MpvPlayer } from './mpv.js';
import { createVideoSurface } from './native-video.js';
import { playerPath } from './platform.js';

const root = fileURLToPath(new URL('..', import.meta.url));
app.setName('NetPlex Desktop');
if (process.platform === 'win32') app.setAppUserModelId('dk.netplex.desktop');
const development = !app.isPackaged;
const profileOverride = process.argv
  .find((arg) => arg.startsWith('--profile-dir='))
  ?.slice('--profile-dir='.length);
if (profileOverride && !isAbsolute(profileOverride))
  throw new Error('The profile directory must be an absolute path.');
const dataDir =
  profileOverride ||
  (development
    ? resolve(process.env.NETPLEX_DATA_DIR || join(root, 'desktop/.data'))
    : join(app.getPath('appData'), 'NetPlex Desktop'));
app.setPath('userData', dataDir);
let mainWindow,
  videoSurface,
  backend,
  controller,
  origin,
  videoBounds,
  videoVisible = false,
  quitting = false;
const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  app
    .whenReady()
    .then(start)
    .catch((error) => {
      console.error('NetPlex Desktop:', error.code || error.name);
      app.quit();
    });
}
async function importConnection() {
  await mkdir(dataDir, { recursive: true });
  try {
    await access(join(dataDir, 'settings.json'));
    return;
  } catch {
    /* First launch. */
  }
  if (profileOverride || (development && process.env.NETPLEX_NO_IMPORT === '1')) return;
  const source = development
    ? join(root, '.netplex/settings.json')
    : resolve(dirname(process.execPath), '..', '..', '.netplex/settings.json');
  try {
    const settings = JSON.parse(await readFile(source, 'utf8'));
    if (settings.version === 1 && settings.clientId && settings.lists) {
      settings.clientId = randomUUID();
      await writeFile(join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2), {
        flag: 'wx',
        mode: 0o600,
      });
    }
  } catch {
    /* A separate computer starts with normal Plex login. */
  }
}
function alignVideo() {
  if (!mainWindow || !videoSurface?.embedded || mainWindow.isDestroyed()) return;
  const content = mainWindow.getContentBounds();
  const physical = videoBounds
    ? screen.dipToScreenRect(mainWindow, {
        x: Math.round(content.x + videoBounds.x),
        y: Math.round(content.y + videoBounds.y),
        width: Math.round(videoBounds.width),
        height: Math.round(videoBounds.height),
      })
    : null;
  videoSurface.layout(
    physical,
    videoVisible && !mainWindow.isMinimized() && mainWindow.isVisible(),
    videoBounds
      ? {
          top: Math.round(videoBounds.clipTop * (physical.height / videoBounds.height)),
          bottom: Math.round(videoBounds.clipBottom * (physical.height / videoBounds.height)),
        }
      : null,
  );
}
function validSender(event) {
  if (
    event.sender !== mainWindow?.webContents ||
    event.senderFrame !== event.sender.mainFrame ||
    new URL(event.senderFrame.url).origin !== origin
  )
    throw new Error('Ugyldig programforespørgsel.');
}
function register(name, handler) {
  ipcMain.handle(`netplex:${name}`, async (event, ...args) => {
    validSender(event);
    return handler(...args);
  });
}
async function start() {
  nativeTheme.themeSource = 'dark';
  Menu.setApplicationMenu(
    process.platform === 'darwin'
      ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
      : null,
  );
  await importConnection();
  backend = await createApp({
    dataDir,
    nativePlayback: true,
    ...(development && process.env.NETPLEX_CLOUD_URL
      ? { cloudUrl: process.env.NETPLEX_CLOUD_URL }
      : {}),
  });
  await new Promise((resolve, reject) => {
    backend.server.once('error', reject);
    backend.server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${backend.server.address().port}`;
  const client = await new LocalClient(origin).ready();
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    title: 'NetPlex',
    backgroundColor: '#0d0d11',
    show: false,
    autoHideMenuBar: true,
    icon: join(root, 'desktop/assets/icon.ico'),
    webPreferences: {
      preload: join(root, 'desktop/preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  videoSurface = await createVideoSurface(mainWindow);
  const executable = playerPath(
    app.isPackaged ? process.resourcesPath : join(root, 'desktop/vendor'),
  );
  controller = new DesktopPlayback({
    client,
    diagnostic: development && process.env.NETPLEX_DIAGNOSTIC === '1',
    playerFactory: () =>
      new MpvPlayer(executable, {
        windowId: videoSurface.create(),
        externalWindow: !videoSurface.embedded,
      }),
    releaseVideo: () => {
      videoVisible = false;
      videoSurface.destroy();
    },
    emit: (state) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('netplex:player-state', state);
        if ((!state.active || state.error) && !videoSurface.embedded && !quitting) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    input: (action) => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('netplex:player-input', action);
    },
    showVideo: (visible) => {
      videoVisible = visible;
      alignVideo();
    },
  });
  let playQueue = Promise.resolve();
  register('play', (options) => {
    const work = playQueue.catch(() => {}).then(() => controller.play(options));
    playQueue = work;
    return work;
  });
  register('command', (name, value) => controller.command(name, value));
  register('stop', () => {
    const work = playQueue
      .catch(() => {})
      .then(async () => {
        await controller.stop();
        if (mainWindow.isFullScreen()) mainWindow.setFullScreen(false);
      });
    playQueue = work;
    return work;
  });
  register('bounds', (bounds) => {
    if (
      !bounds ||
      !['x', 'y', 'width', 'height'].every(
        (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]),
      )
    )
      throw new Error('Ugyldige vinduesmål.');
    bounds = { ...bounds, clipTop: bounds.clipTop ?? 0, clipBottom: bounds.clipBottom ?? 0 };
    if (
      ![bounds.clipTop, bounds.clipBottom].every(
        (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
      ) ||
      bounds.clipTop + bounds.clipBottom >= bounds.height
    )
      throw new Error('Ugyldigt kontrolområde.');
    const [width, height] = mainWindow.getContentSize();
    if (
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.width < 1 ||
      bounds.height < 1 ||
      bounds.x + bounds.width > width + 2 ||
      bounds.y + bounds.height > height + 2
    ) {
      videoBounds = null;
      alignVideo();
      return;
    }
    videoBounds = bounds;
    alignVideo();
  });
  register('fullscreen', () => {
    if (!videoSurface.embedded) return controller.command('fullscreen');
    const fullscreen = !mainWindow.isFullScreen();
    mainWindow.setFullScreen(fullscreen);
    return fullscreen;
  });
  register('plex-login', async (value) => {
    const url = new URL(value);
    if (url.origin !== 'https://app.plex.tv' || url.pathname !== '/auth')
      throw new Error('Ugyldig Plex-loginadresse.');
    await shell.openExternal(url.href);
  });
  const contents = mainWindow.webContents;
  contents.session.on('will-download', (event, item, source) => {
    const filename = item.getFilename();
    if (
      source !== contents ||
      !item.getURL().startsWith(`blob:${origin}/`) ||
      !(/\.netplex\.json$/i.test(filename) || filename === 'NetPlex-ChatGPT-guide.md')
    ) {
      event.preventDefault();
      return;
    }
    item.setSaveDialogOptions({
      title: 'Eksportér NetPlex-design',
      buttonLabel: 'Gem',
      defaultPath: join(app.getPath('downloads'), filename),
      filters: [
        {
          name: filename.endsWith('.md') ? 'ChatGPT-guide' : 'NetPlex-design',
          extensions: [filename.endsWith('.md') ? 'md' : 'json'],
        },
      ],
    });
  });
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  contents.session.setPermissionCheckHandler(() => false);
  contents.setWindowOpenHandler(({ url }) => {
    try {
      const target = new URL(url);
      if (target.protocol === 'https:' && target.hostname === 'support.plex.tv')
        void shell.openExternal(target.href);
    } catch {
      /* Reject invalid links. */
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, value) => {
    if (new URL(value).origin !== origin) event.preventDefault();
  });
  contents.on('will-attach-webview', (event) => event.preventDefault());
  contents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace && controller.active) void controller.stop();
  });
  mainWindow.on('ready-to-show', () => mainWindow.show());
  for (const event of [
    'move',
    'resize',
    'restore',
    'show',
    'minimize',
    'hide',
    'enter-full-screen',
    'leave-full-screen',
  ])
    mainWindow.on(event, alignVideo);
  for (const event of ['enter-full-screen', 'leave-full-screen'])
    mainWindow.on(event, () =>
      contents.send('netplex:window-state', { fullscreen: mainWindow.isFullScreen() }),
    );
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      app.quit();
    }
  });
  await mainWindow.loadURL(origin + (process.argv.includes('--demo') ? '/?demo=1' : '/'));
}
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  void (async () => {
    await controller?.stop();
    videoSurface?.destroy();
    await backend?.close();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    app.quit();
  })();
});
app.on('window-all-closed', () => {
  if (!quitting) app.quit();
});
