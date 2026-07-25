/**
 * Local persistence. Everything lives in this browser — there is no server and
 * nothing is uploaded anywhere.
 */

import { PositionOverrides } from '../diagram/layout';

const KEYS = {
  doc: 'dbdraw:doc',
  positions: 'dbdraw:positions',
  theme: 'dbdraw:theme',
  editorWidth: 'dbdraw:editor-width',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing or a full quota: losing autosave is not worth an error.
  }
}

export const storage = {
  getDoc(fallback: string): string {
    return read(KEYS.doc, fallback);
  },
  setDoc(value: string): void {
    write(KEYS.doc, value);
  },

  getPositions(): PositionOverrides {
    return read<PositionOverrides>(KEYS.positions, {});
  },
  setPositions(value: PositionOverrides): void {
    write(KEYS.positions, value);
  },

  getTheme(): 'light' | 'dark' {
    const stored = read<'light' | 'dark' | null>(KEYS.theme, null);
    if (stored) return stored;
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  },
  setTheme(value: 'light' | 'dark'): void {
    write(KEYS.theme, value);
  },

  getEditorWidth(): number | null {
    return read<number | null>(KEYS.editorWidth, null);
  },
  setEditorWidth(value: number): void {
    write(KEYS.editorWidth, value);
  },
};
