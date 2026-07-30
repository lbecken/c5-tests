import type { DiffOptions, WhitespaceMode } from '@gitscope/core';
export type DiffMode = 'split' | 'unified';
export type Theme = 'system' | 'light' | 'dark';
interface SettingsState {
    theme: Theme;
    diffMode: DiffMode;
    whitespace: WhitespaceMode;
    ignoreCase: boolean;
    context: number;
    showWhitespace: boolean;
    algorithm: 'histogram' | 'myers';
    setTheme: (theme: Theme) => void;
    setDiffMode: (mode: DiffMode) => void;
    setWhitespace: (mode: WhitespaceMode) => void;
    setIgnoreCase: (value: boolean) => void;
    setContext: (lines: number) => void;
    setShowWhitespace: (value: boolean) => void;
    setAlgorithm: (algorithm: 'histogram' | 'myers') => void;
    diffOptions: () => DiffOptions;
}
export declare const useSettings: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<SettingsState>, "setState" | "persist"> & {
    setState(partial: SettingsState | Partial<SettingsState> | ((state: SettingsState) => SettingsState | Partial<SettingsState>), replace?: false | undefined): unknown;
    setState(state: SettingsState | ((state: SettingsState) => SettingsState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<SettingsState, SettingsState, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: SettingsState) => void) => () => void;
        onFinishHydration: (fn: (state: SettingsState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<SettingsState, SettingsState, unknown>>;
    };
}>;
/** Apply the chosen theme to the document root. */
export declare function applyTheme(theme: Theme): void;
export {};
//# sourceMappingURL=settings.d.ts.map