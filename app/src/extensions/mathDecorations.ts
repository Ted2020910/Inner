/**
 * mathDecorations.ts
 *
 * Renders $...$ (inline) and $$...$$ (block) LaTeX formulas as KaTeX widgets
 * when the cursor is not inside the formula. When the cursor enters, the raw
 * LaTeX source is shown so it can be edited.
 */

import {
  Decoration,
  ViewPlugin,
  WidgetType,
  EditorView,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// ── KaTeX Widget ─────────────────────────────────────────────────────────────

class MathWidget extends WidgetType {
  constructor(
    private readonly latex: string,
    private readonly block: boolean,
  ) {
    super()
  }

  eq(other: MathWidget) {
    return other.latex === this.latex && other.block === this.block
  }

  toDOM() {
    const container = document.createElement(this.block ? 'div' : 'span')
    container.className = this.block ? 'cm-math-block' : 'cm-math-inline'

    try {
      katex.render(this.latex, container, {
        displayMode: this.block,
        throwOnError: false,
        output: 'html',
      })
    } catch {
      container.textContent = this.latex
      container.style.color = '#f87171'
    }

    return container
  }

  ignoreEvent() {
    return false
  }
}

// ── Regex patterns ────────────────────────────────────────────────────────────

// Block math: $$...$$ (possibly multiline, non-greedy)
const BLOCK_RE = /\$\$([\s\S]+?)\$\$/g

// Inline math: $...$ — must not be empty, must not start/end with space,
// avoids matching $$ by using a negative lookahead/lookbehind
const INLINE_RE = /(?<!\$)\$(?!\$)((?:[^$\n]|\\.)+?)(?<!\$)\$(?!\$)/g

// ── Build decorations ─────────────────────────────────────────────────────────

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const { state } = view
  const cursorFrom = state.selection.main.from
  const cursorTo = state.selection.main.to

  // Collect all matches across visible ranges, then sort and add
  const matches: Array<{ from: number; to: number; latex: string; block: boolean }> = []

  for (const { from, to } of view.visibleRanges) {
    const text = state.doc.sliceString(from, to)

    // ── Block math first (higher priority, may span lines) ───────────────
    BLOCK_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = BLOCK_RE.exec(text)) !== null) {
      const matchFrom = from + m.index
      const matchTo = matchFrom + m[0].length
      const latex = m[1].trim()
      if (!latex) continue

      // Show source if cursor is inside
      if (cursorFrom <= matchTo && cursorTo >= matchFrom) continue

      matches.push({ from: matchFrom, to: matchTo, latex, block: true })
    }

    // ── Inline math (skip positions already covered by block matches) ────
    INLINE_RE.lastIndex = 0
    while ((m = INLINE_RE.exec(text)) !== null) {
      const matchFrom = from + m.index
      const matchTo = matchFrom + m[0].length

      // Skip if this range overlaps a block match
      const overlapsBlock = matches.some(
        (bm) => bm.block && matchFrom < bm.to && matchTo > bm.from,
      )
      if (overlapsBlock) continue

      const latex = m[1].trim()
      if (!latex) continue

      // Show source if cursor is inside
      if (cursorFrom <= matchTo && cursorTo >= matchFrom) continue

      matches.push({ from: matchFrom, to: matchTo, latex, block: false })
    }
  }

  // Sort ascending by `from` (required by RangeSetBuilder)
  matches.sort((a, b) => a.from - b.from || a.to - b.to)

  // Deduplicate overlapping ranges (keep the first / widest)
  let lastTo = -1
  for (const { from, to, latex, block } of matches) {
    if (from < lastTo) continue // overlaps previous — skip
    builder.add(from, to, Decoration.replace({ widget: new MathWidget(latex, block) }))
    lastTo = to
  }

  return builder.finish()
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

class MathDecorationsPlugin {
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

export const mathDecorations = ViewPlugin.fromClass(MathDecorationsPlugin, {
  decorations: (plugin) => plugin.decorations,
})

// ── Styles ────────────────────────────────────────────────────────────────────

export const mathTheme = EditorView.baseTheme({
  '.cm-math-inline': {
    display: 'inline-block',
    verticalAlign: 'middle',
    cursor: 'text',
  },
  '.cm-math-block': {
    display: 'block',
    textAlign: 'center',
    padding: '0.6em 0',
    cursor: 'text',
    overflowX: 'auto',
  },
  // KaTeX color fix for dark themes
  '.cm-math-inline .katex, .cm-math-block .katex': {
    color: 'var(--color-text-primary, #e2e8f0)',
  },
  '.cm-math-inline .katex-html, .cm-math-block .katex-html': {
    color: 'var(--color-text-primary, #e2e8f0)',
  },
})
