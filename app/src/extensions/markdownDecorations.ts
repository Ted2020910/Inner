/**
 * markdownDecorations.ts
 *
 * Hides Markdown syntax markers when the cursor is not on/inside the span,
 * giving a lightweight WYSIWYG feel inside CodeMirror 6.
 *
 * Markers hidden:
 *  - HeaderMark          (#, ##, …)    — hidden when cursor is off the line
 *  - EmphasisMark        (* / _)       — hidden when cursor leaves the emphasis span
 *  - CodeMark            (`)           — hidden when cursor leaves the inline code span
 *  - QuoteMark           (>)           — hidden when cursor is off the line
 *  - ListMark            (-, *, +, N.) — hidden when cursor is off the line
 *  - StrikethroughMark   (~~)          — hidden when cursor leaves the span
 */

import {
  Decoration,
  ViewPlugin,
  EditorView,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
import { RangeSetBuilder } from '@codemirror/state'

// The single hidden-marker decoration (zero-width replacement)
const hideMark = Decoration.replace({})

// Inline marks that are hidden when the cursor is outside the parent span
const INLINE_MARKS = new Set([
  'EmphasisMark',
  'StrikethroughMark',
  'CodeMark',
])

// Inline parent node types for the marks above
const INLINE_PARENTS = new Set([
  'Emphasis',
  'StrongEmphasis',
  'InlineCode',
  'Strikethrough',
])

// Marks hidden based on cursor line (not parent span)
// Also includes which of these should consume a trailing space
const LINE_MARKS = new Set([
  'HeaderMark',
  'QuoteMark',
  'ListMark',
])

// Which LINE_MARKS should also eat the space that follows the mark
const EAT_TRAILING_SPACE = new Set(['HeaderMark', 'QuoteMark', 'ListMark'])

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { state } = view
  const cursorPos = state.selection.main.head
  const cursorLine = state.doc.lineAt(cursorPos).number

  for (const { from, to } of view.visibleRanges) {
    // Collect ranges in this viewport slice, then sort before adding to builder
    const pendingRanges: Array<[number, number]> = []

    syntaxTree(state).iterate({
      from,
      to,

      enter(node) {
        const name = node.name

        // ── Line-level marks (header/quote/list) ─────────────────────────
        if (LINE_MARKS.has(name)) {
          const markLine = state.doc.lineAt(node.from).number
          if (markLine !== cursorLine) {
            let end = node.to
            if (EAT_TRAILING_SPACE.has(name)) {
              // Consume the mandatory space that follows the marker if present
              const nextCh = node.to < state.doc.length
                ? state.doc.sliceString(node.to, node.to + 1)
                : ''
              if (nextCh === ' ') end = node.to + 1
            }
            pendingRanges.push([node.from, end])
          }
          return false // don't recurse into the mark node
        }

        // ── Inline marks (emphasis / code / strikethrough) ────────────────
        if (INLINE_MARKS.has(name)) {
          // Resolve the parent span from the tree
          const nodeRef = syntaxTree(state).resolve(node.from, 1)
          const parent = nodeRef.parent

          if (parent && INLINE_PARENTS.has(parent.name)) {
            // Hide when cursor is outside the parent span
            if (cursorPos < parent.from || cursorPos > parent.to) {
              pendingRanges.push([node.from, node.to])
            }
          } else {
            // Fallback: line-based
            const markLine = state.doc.lineAt(node.from).number
            if (markLine !== cursorLine) {
              pendingRanges.push([node.from, node.to])
            }
          }
          return false
        }
      },
    })

    // RangeSetBuilder requires ranges in strictly ascending from-position order
    pendingRanges.sort((a, b) => a[0] - b[0] || a[1] - b[1])

    for (const [f, t] of pendingRanges) {
      if (f < t) builder.add(f, t, hideMark)
    }
  }

  return builder.finish()
}

class MarkdownDecorationsPlugin {
  decorations: DecorationSet

  constructor(view: EditorView) {
    this.decorations = buildDecorations(view)
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = buildDecorations(update.view)
    }
  }
}

export const markdownDecorations = ViewPlugin.fromClass(MarkdownDecorationsPlugin, {
  decorations: (plugin) => plugin.decorations,
})

/**
 * Makes hidden ranges atomic so the cursor jumps over them cleanly,
 * avoiding the cursor landing on a visually invisible character.
 */
export const markdownAtomicRanges = EditorView.atomicRanges.of((view) => {
  return view.plugin(markdownDecorations)?.decorations ?? new RangeSetBuilder<Decoration>().finish()
})
