import { foldService, foldGutter } from '@codemirror/language'
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'

// Node names for ATX headings in @lezer/markdown
const HEADING_NODES = new Set([
  'ATXHeading1', 'ATXHeading2', 'ATXHeading3',
  'ATXHeading4', 'ATXHeading5', 'ATXHeading6',
])

/**
 * Returns the fold range for a heading: from end of heading line
 * to the last line before the next heading of same or higher level (lower number).
 */
export const headingFoldService = foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
  const tree = syntaxTree(state)

  // Find if there is a heading node that starts on this line
  let headingNode: SyntaxNode | null = null
  let headingLevel = 0

  tree.iterate({
    from: lineStart,
    to: lineEnd,
    enter(nodeRef) {
      if (HEADING_NODES.has(nodeRef.name)) {
        headingNode = nodeRef.node
        headingLevel = parseInt(nodeRef.name.replace('ATXHeading', ''), 10)
        return false // stop
      }
    },
  })

  if (!headingNode || headingLevel === 0) return null

  // Fold range starts at end of this heading line
  const foldFrom = lineEnd

  // Scan forward to find next heading of same or higher level
  let foldTo = state.doc.length
  const docEnd = state.doc.length

  tree.iterate({
    from: lineEnd + 1,
    to: docEnd,
    enter(node) {
      if (HEADING_NODES.has(node.name)) {
        const level = parseInt(node.name.replace('ATXHeading', ''), 10)
        if (level <= headingLevel) {
          // Found a heading at same or higher level — fold up to the line before it
          const lineOfNext = state.doc.lineAt(node.from)
          foldTo = lineOfNext.from - 1
          return false // stop iteration
        }
      }
    },
  })

  if (foldTo <= foldFrom) return null
  return { from: foldFrom, to: foldTo }
})

/**
 * Fold gutter showing ▶ / ▼ markers next to foldable headings.
 */
export const headingFoldGutter = foldGutter({
  markerDOM(open) {
    const span = document.createElement('span')
    span.textContent = open ? '▼' : '▶'
    span.title = open ? 'Collapse section' : 'Expand section'
    span.style.fontSize = '0.65em'
    span.style.lineHeight = '1'
    span.style.display = 'inline-block'
    span.style.verticalAlign = 'middle'
    return span
  },
})
