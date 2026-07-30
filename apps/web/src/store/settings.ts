import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'system',
      diffMode: 'split',
      whitespace: 'none',
      ignoreCase: false,
      context: 3,
      showWhitespace: false,
      algorithm: 'histogram',
      setTheme: (theme) => set({ theme }),
      setDiffMode: (diffMode) => set({ diffMode }),
      setWhitespace: (whitespace) => set({ whitespace }),
      setIgnoreCase: (ignoreCase) => set({ ignoreCase }),
      setContext: (context) => set({ context }),
      setShowWhitespace: (showWhitespace) => set({ showWhitespace }),
      setAlgorithm: (algorithm) => set({ algorithm }),
      diffOptions: () => {
        const state = get();
        return {
          whitespace: state.whitespace,
          ignoreCase: state.ignoreCase,
          context: state.context,
          algorithm: state.algorithm,
        };
      },
    }),
    { name: 'gitscope.settings' },
  ),
);

/** Apply the chosen theme to the document root. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
