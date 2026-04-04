import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

export const mdHighlight = HighlightStyle.define([
  // Heading colors by level
  { tag: tags.heading1, color: '#7dd3fc', fontWeight: '700', fontSize: '1.6em' },
  { tag: tags.heading2, color: '#a78bfa', fontWeight: '700', fontSize: '1.4em' },
  { tag: tags.heading3, color: '#34d399', fontWeight: '600', fontSize: '1.2em' },
  { tag: tags.heading4, color: '#fbbf24', fontWeight: '600', fontSize: '1.1em' },
  { tag: tags.heading5, color: '#f87171', fontWeight: '600' },
  { tag: tags.heading6, color: '#fb923c', fontWeight: '600' },

  // Inline formatting
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.link, color: '#88c0d0', textDecoration: 'underline' },
  { tag: tags.url, color: '#88c0d0' },
  { tag: tags.monospace, fontFamily: 'monospace', color: '#ebcb8b' },

  // Code blocks
  { tag: tags.special(tags.string), color: '#a3be8c' },
  { tag: tags.string, color: '#a3be8c' },

  // Punctuation / markup markers
  { tag: tags.processingInstruction, color: '#616e88' },
  { tag: tags.comment, color: '#616e88', fontStyle: 'italic' },
  { tag: tags.meta, color: '#616e88' },

  // Lists
  { tag: tags.list, color: '#81a1c1' },
  { tag: tags.quote, color: '#616e88', fontStyle: 'italic' },

  // HR / block rule
  { tag: tags.contentSeparator, color: '#616e88' },
])
