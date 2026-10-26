const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('netplexDesktop', Object.freeze({
  version: '1.5.0-beta.1',
  platform: process.platform,
  play: options => ipcRenderer.invoke('netplex:play', options),
  command: (name, value) => ipcRenderer.invoke('netplex:command', name, value),
  stop: () => ipcRenderer.invoke('netplex:stop'),
  setVideoBounds: bounds => ipcRenderer.invoke('netplex:bounds', bounds),
  toggleFullscreen: () => ipcRenderer.invoke('netplex:fullscreen'),
  openPlexLogin: url => ipcRenderer.invoke('netplex:plex-login', url),
  onPlayerState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('netplex:player-state', listener);
    return () => ipcRenderer.removeListener('netplex:player-state', listener);
  },
  onPlayerInput(callback) {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('netplex:player-input', listener);
    return () => ipcRenderer.removeListener('netplex:player-input', listener);
  },
  onWindowState(callback) {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('netplex:window-state', listener);
    return () => ipcRenderer.removeListener('netplex:window-state', listener);
  },
}));
