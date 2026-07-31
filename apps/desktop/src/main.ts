import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { startServer, type RunningServer } from '@gitscope/server';

/**
 * Desktop shell.
 *
 * The local server runs inside this process rather than as a child: one process
 * to ship, one to shut down, and no port to coordinate. The window then talks
 * to `http://127.0.0.1:<port>` exactly as the browser build does, which means
 * there is only one UI to maintain and it behaves identically in both.
 */

let server: RunningServer | null = null;
const windows = new Set<BrowserWindow>();

/** Repository paths given on the command line, ignoring Electron's own flags. */
function repositoryArguments(argv: string[]): string[] {
  return argv
    .slice(app.isPackaged ? 1 : 2)
    .filter((arg) => !arg.startsWith('-') && arg !== '.')
    .map((arg) => resolve(arg));
}

async function ensureServer(openPaths: string[]): Promise<RunningServer> {
  if (server) {
    for (const path of openPaths) {
      await server.sessions.open(path).catch(() => undefined);
    }
    return server;
  }
  const staticDir = join(__dirname, 'ui');
  server = await startServer({
    port: 0,
    staticDir: existsSync(staticDir) ? staticDir : undefined,
    openPaths: openPaths.length > 0 ? openPaths : [process.cwd()],
  });
  return server;
}

async function createWindow(openPaths: string[]): Promise<BrowserWindow> {
  const running = await ensureServer(openPaths);

  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: 'Gitscope',
    backgroundColor: '#16181d',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  windows.add(window);
  window.on('closed', () => windows.delete(window));

  // Anything that is not our own UI belongs in the user's browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  await window.loadURL(running.url);
  return window;
}

/** Run a command in the focused window's UI. */
function dispatch(view: Record<string, unknown>): void {
  const window = BrowserWindow.getFocusedWindow() ?? [...windows][0];
  if (!window) return;
  void window.webContents.executeJavaScript(
    `window.__gitscope && window.__gitscope.navigate(${JSON.stringify(view)})`,
  );
}

async function openRepositoryDialog(): Promise<void> {
  const window = BrowserWindow.getFocusedWindow() ?? [...windows][0];
  const result = await dialog.showOpenDialog(window!, {
    title: 'Open repository',
    properties: ['openDirectory'],
  });
  const path = result.filePaths[0];
  if (!path) return;
  if (!window) {
    await createWindow([path]);
    return;
  }
  await window.webContents.executeJavaScript(
    `window.__gitscope && window.__gitscope.openRepo(${JSON.stringify(path)})`,
  );
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([{ role: 'appMenu' }] as MenuItemConstructorOptions[])
      : ([] as MenuItemConstructorOptions[])),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Repository…',
          accelerator: 'CmdOrCtrl+O',
          click: () => void openRepositoryDialog(),
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => void createWindow([]),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Working Copy',
          accelerator: 'CmdOrCtrl+1',
          click: () => dispatch({ kind: 'working' }),
        },
        { label: 'History', accelerator: 'CmdOrCtrl+2', click: () => dispatch({ kind: 'graph' }) },
        {
          label: 'Conflicts',
          accelerator: 'CmdOrCtrl+3',
          click: () => dispatch({ kind: 'conflicts' }),
        },
        {
          label: 'Text Compare',
          accelerator: 'CmdOrCtrl+4',
          click: () => dispatch({ kind: 'compare' }),
        },
        {
          label: 'Folder Compare',
          accelerator: 'CmdOrCtrl+5',
          click: () => dispatch({ kind: 'directories' }),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Register with git',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: 'Register with git',
              message: 'Run `gsc install-git --global` to use Gitscope as git difftool and mergetool.',
              detail:
                'That configures diff.tool, merge.tool and the commands git invokes, so `git difftool` and `git mergetool` open here.',
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// A second launch should reach the running application rather than start a
// rival copy that watches the same repositories.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const paths = repositoryArguments(argv);
    const window = [...windows][0];
    if (window) {
      if (window.isMinimized()) window.restore();
      window.focus();
      if (paths[0]) {
        void ensureServer(paths).then(() =>
          window.webContents.executeJavaScript(
            `window.__gitscope && window.__gitscope.openRepo(${JSON.stringify(paths[0])})`,
          ),
        );
      }
    } else {
      void createWindow(paths);
    }
  });

  void app.whenReady().then(async () => {
    buildMenu();
    ipcMain.handle('gitscope:open-dialog', () => openRepositoryDialog());
    await createWindow(repositoryArguments(process.argv));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) void createWindow([]);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    void server?.close();
    server = null;
  });
}
