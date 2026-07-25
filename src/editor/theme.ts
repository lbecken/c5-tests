/**
 * Editor themes. Syntax colours are exposed as CSS custom properties so the
 * highlight style in `language.ts` stays theme-agnostic.
 */

import { EditorView } from '@codemirror/view';

const shared = {
  '&': {
    height: '100%',
    fontSize: '13px',
  },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    lineHeight: '1.6',
  },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 16px' },
  '.cm-tooltip': {
    border: '1px solid var(--cm-border)',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
  },
  '.cm-tooltip-autocomplete > ul > li': { padding: '4px 10px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    background: 'var(--cm-selection)',
    color: 'var(--cm-text)',
  },
  '.cm-completionDetail': { marginLeft: '8px', fontStyle: 'normal', opacity: 0.6 },
} as const;

export const lightTheme = EditorView.theme({
  ...shared,
  '&': {
    ...shared['&'],
    '--cm-text': '#1f2933',
    '--cm-border': '#d5dbe3',
    '--cm-selection': '#cfe0ff',
    '--syntax-keyword': '#0f62c9',
    '--syntax-comment': '#8a94a3',
    '--syntax-string': '#0a7f5a',
    '--syntax-expression': '#a1560c',
    '--syntax-name': '#1f2933',
    '--syntax-type': '#7c3aed',
    '--syntax-setting': '#b45309',
    '--syntax-value': '#0a7f5a',
    '--syntax-number': '#b45309',
    '--syntax-color': '#c2410c',
    '--syntax-operator': '#d92d6b',
    '--syntax-punctuation': '#6b7684',
    backgroundColor: '#ffffff',
    color: '#1f2933',
  },
  '.cm-gutters': { ...shared['.cm-gutters'], background: '#f6f7f9', color: '#9aa4b2' },
  '.cm-activeLine': { background: '#f2f6ff' },
  '.cm-activeLineGutter': { background: '#e8eefc', color: '#4b5563' },
  '.cm-selectionBackground, ::selection': { background: '#cfe0ff !important' },
  '.cm-cursor': { borderLeftColor: '#1f2933' },
});

export const darkTheme = EditorView.theme(
  {
    ...shared,
    '&': {
      ...shared['&'],
      '--cm-text': '#e6e9ee',
      '--cm-border': '#2f3742',
      '--cm-selection': '#2c3d5c',
      '--syntax-keyword': '#7cb0ff',
      '--syntax-comment': '#6d7684',
      '--syntax-string': '#63d3a6',
      '--syntax-expression': '#e0a35c',
      '--syntax-name': '#e6e9ee',
      '--syntax-type': '#c4a6ff',
      '--syntax-setting': '#e6b673',
      '--syntax-value': '#63d3a6',
      '--syntax-number': '#e6b673',
      '--syntax-color': '#ff9b6a',
      '--syntax-operator': '#ff85b3',
      '--syntax-punctuation': '#8b95a5',
      backgroundColor: '#181c22',
      color: '#e6e9ee',
    },
    '.cm-gutters': { ...shared['.cm-gutters'], background: '#14171c', color: '#5f6b7a' },
    '.cm-activeLine': { background: '#1f242c' },
    '.cm-activeLineGutter': { background: '#222831', color: '#aab4c2' },
    '.cm-selectionBackground, ::selection': { background: '#2c3d5c !important' },
    '.cm-cursor': { borderLeftColor: '#e6e9ee' },
    '.cm-panels': { background: '#1b1f26', color: '#e6e9ee' },
  },
  { dark: true },
);
