import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { useRepoStore, type View } from './store/repo';
import { api } from './api/client';

import './styles/theme.css';
import './styles/app.css';

/**
 * Command bridge for anything outside React: the Electron menus, the `gsc` CLI
 * handing off a comparison to an already-running window, and the end-to-end
 * tests. Deliberately narrow — it exposes intents, not the store.
 */
declare global {
  interface Window {
    /** Present only in the desktop build; see apps/desktop/src/preload.ts. */
    gitscopeDesktop?: {
      isDesktop: true;
      platform: string;
      openRepositoryDialog: () => Promise<void>;
    };
    __gitscope?: {
      navigate: (view: View) => void;
      openRepo: (path: string) => Promise<void>;
      currentView: () => View;
    };
  }
}

window.__gitscope = {
  navigate: (view) => useRepoStore.getState().navigate(view),
  openRepo: (path) => useRepoStore.getState().openRepo(path),
  currentView: () => useRepoStore.getState().view,
};

const container = document.querySelector('#root');
if (!container) throw new Error('missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// If the server was started with a repository (from the CLI or the desktop
// shell), adopt it so the app opens straight into the work.
void api
  .listRepos()
  .then(async (repos) => {
    const first = repos[0];
    if (first) await useRepoStore.getState().openRepo(first.root);
  })
  .catch(() => undefined);
