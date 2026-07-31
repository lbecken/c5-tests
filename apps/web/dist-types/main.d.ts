import { type View } from './store/repo';
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
//# sourceMappingURL=main.d.ts.map