import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge between the page and the main process.
 *
 * Deliberately tiny: the UI already talks to the local server over HTTP for
 * everything it needs, so the only thing it cannot do for itself is show a
 * native folder picker.
 */
contextBridge.exposeInMainWorld('gitscopeDesktop', {
  isDesktop: true,
  platform: process.platform,
  openRepositoryDialog: () => ipcRenderer.invoke('gitscope:open-dialog'),
});
