import { ref, type Ref } from 'vue'
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

export interface TocEntry {
  level: number       // 1–6
  text: string        // heading text (no # markers)
  pos: number         // document position (char offset) of the heading node start
}

const HEADING_NODE_LEVEL: Record<string, number> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
}

/**
 * Walk the syntax tree and collect all ATX headings.
 */
export function extractHeadings(state: EditorState): TocEntry[] {
  const entries: TocEntry[] = []
  const tree = syntaxTree(state)

  tree.iterate({
    enter(node) {
      const level = HEADING_NODE_LEVEL[node.name]
      if (!level) return

      // The raw text of the whole heading node includes the # markers.
      // Strip leading hashes and whitespace to get the display text.
      const raw = state.doc.sliceString(node.from, node.to)
      const text = raw.replace(/^#{1,6}\s*/, '').trim()

      entries.push({ level, text, pos: node.from })
    },
  })

  return entries
}

/**
 * Composable that keeps a reactive TOC list in sync with the editor state.
 * Call `update(state)` from the EditorView update listener.
 */
export function useToc() {
  const entries: Ref<TocEntry[]> = ref([])

  function update(state: EditorState) {
    entries.value = extractHeadings(state)
  }

  return { entries, update }
}
