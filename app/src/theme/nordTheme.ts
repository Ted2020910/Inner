import { EditorView } from '@codemirror/view'

export const nordTheme = EditorView.theme({
  '&': {
    color: 'var(--color-text, #d8dee9)',
    backgroundColor: 'transparent',
    height: '100%',
    fontSize: 'var(--editor-font-size, 15px)',
    fontFamily: 'var(--editor-font-family, inherit)',
  },
  '.cm-content': {
    caretColor: 'var(--color-accent, #88c0d0)',
    padding: '1rem 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--color-accent, #88c0d0)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--color-selection, rgba(136,192,208,0.25))',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(136,192,208,0.06)',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: 'var(--color-text-muted, #4c566a)',
    border: 'none',
  },
  '.cm-foldGutter span': {
    color: 'var(--color-text-muted, #616e88)',
    cursor: 'pointer',
  },
  '.cm-foldGutter span:hover': {
    color: 'var(--color-text, #d8dee9)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
  },
  // List styles - ensure ordered list markers are visible
  '.cm-content ol': {
    paddingLeft: '1.5em',
  },
  '.cm-content ul': {
    paddingLeft: '1.5em',
  },
  '.cm-content li': {
    paddingLeft: '0.25em',
  },
  '.cm-content li::marker': {
    color: 'var(--editor-marker-color, #94a3b8)',
    fontWeight: '500',
  },
}, { dark: true })
