<script setup lang="ts">
import { ref, shallowRef, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { EditorState, Annotation, type ChangeSpec } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { syntaxHighlighting, foldKeymap } from '@codemirror/language'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { nordTheme } from '../theme/nordTheme'
import { mdHighlight } from '../theme/mdHighlight'
import { headingFoldService, headingFoldGutter } from '../fold/headingFold'
import { useToc, extractHeadings } from '../composables/useToc'
import { markdownDecorations, markdownAtomicRanges } from '../extensions/markdownDecorations'
import { mathDecorations, mathTheme } from '../extensions/mathDecorations'

const emit = defineEmits<{
  dirty: []
  'toc-update': [entries: ReturnType<typeof useToc>['entries']['value']]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
const view = shallowRef<EditorView | null>(null)

const isProgrammaticAnnotation = Annotation.define<boolean>()

let pendingContent = ''
let burnOverlay: HTMLDivElement | null = null
let fadeInTimer = 0
const MIN_BURN_PARTICLES = 72
const MAX_BURN_PARTICLES = 320

const { entries: tocEntries, update: updateToc } = useToc()

// ── TOC exposed for parent ──────────────────────────────────────────────────
defineExpose({
  getMarkdown,
  setMarkdown,
  updateContent,
  burnAndClear,
  transitionTo,
  tocEntries,
  scrollToPos,
  replaceHeadingText,
  insertHeading,
  deleteHeading,
})

// ── Heading editing API (for MindMap bidirectional sync) ─────────────────────

/**
 * Replace the heading text at the given document position.
 * Preserves the `#` prefix and only replaces the text portion.
 */
function replaceHeadingText(pos: number, newText: string) {
  if (!view.value) return

  const state = view.value.state
  const line = state.doc.lineAt(pos)
  const lineText = line.text
  const match = lineText.match(/^(#{1,6}\s+)/)
  if (!match) return

  const prefix = match[1] // e.g. "## "
  const newLineText = prefix + newText
  const changes: ChangeSpec = {
    from: line.from,
    to: line.to,
    insert: newLineText,
  }

  view.value.dispatch({
    changes,
    annotations: isProgrammaticAnnotation.of(true),
  })

  // Manually trigger dirty + toc update since we suppress programmatic annotation
  emit('dirty')
  updateToc(view.value.state)
  emit('toc-update', tocEntries.value)
}

/**
 * Insert a new heading after the section that starts at `afterPos`.
 * The new heading is placed just before the next heading of the same or higher level.
 */
function insertHeading(afterPos: number, level: number, text: string) {
  if (!view.value) return

  const state = view.value.state
  const headings = extractCurrentHeadings()
  const afterIdx = headings.findIndex((h) => h.pos === afterPos)
  const afterHeading = headings[afterIdx]
  if (!afterHeading) return

  // Find the end of the section: look for the next heading of same or higher level
  let insertAt = state.doc.length
  for (let i = afterIdx + 1; i < headings.length; i++) {
    if (headings[i].level <= afterHeading.level) {
      // Insert before this heading's line
      const line = state.doc.lineAt(headings[i].pos)
      insertAt = line.from
      break
    }
  }

  const prefix = '#'.repeat(level)
  const insertion = `\n${prefix} ${text}\n`

  const changes: ChangeSpec = {
    from: insertAt,
    to: insertAt,
    insert: insertion,
  }

  view.value.dispatch({
    changes,
    annotations: isProgrammaticAnnotation.of(true),
  })

  emit('dirty')
  updateToc(view.value.state)
  emit('toc-update', tocEntries.value)
}

/**
 * Delete the heading at the given position along with its entire section content
 * (up to the next heading of the same or higher level).
 */
function deleteHeading(pos: number) {
  if (!view.value) return

  const state = view.value.state
  const headings = extractCurrentHeadings()
  const headingIdx = headings.findIndex((h) => h.pos === pos)
  if (headingIdx === -1) return

  const heading = headings[headingIdx]
  const startLine = state.doc.lineAt(heading.pos)

  // Find the end of the section
  let deleteEnd = state.doc.length
  for (let i = headingIdx + 1; i < headings.length; i++) {
    if (headings[i].level <= heading.level) {
      const line = state.doc.lineAt(headings[i].pos)
      deleteEnd = line.from
      break
    }
  }

  const changes: ChangeSpec = {
    from: startLine.from,
    to: deleteEnd,
    insert: '',
  }

  view.value.dispatch({
    changes,
    annotations: isProgrammaticAnnotation.of(true),
  })

  emit('dirty')
  updateToc(view.value.state)
  emit('toc-update', tocEntries.value)
}

/**
 * Extract current headings from the editor state (used internally by edit helpers).
 */
function extractCurrentHeadings(): Array<{ level: number; text: string; pos: number }> {
  if (!view.value) return []
  return extractHeadings(view.value.state)
}

// ── Burn helpers (ported from Milkdown version) ─────────────────────────────

type BurnRect = { left: number; top: number; width: number; height: number; color: string }

function cleanupBurnOverlay() {
  editorRef.value
    ?.querySelector('.cm-content.is-burning-source')
    ?.classList.remove('is-burning-source')

  if (burnOverlay) {
    burnOverlay.remove()
    burnOverlay = null
  }
}

function triggerContentFadeIn() {
  if (!editorRef.value) return
  window.clearTimeout(fadeInTimer)
  editorRef.value.classList.remove('content-fade-in')
  requestAnimationFrame(() => {
    editorRef.value?.classList.add('content-fade-in')
    fadeInTimer = window.setTimeout(() => {
      editorRef.value?.classList.remove('content-fade-in')
    }, 260)
  })
}

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createBurnSnapshot(source: HTMLElement, ...classNames: string[]) {
  const clone = source.cloneNode(true) as HTMLElement
  clone.classList.add(...classNames)
  clone.removeAttribute('contenteditable')
  clone.removeAttribute('spellcheck')
  clone.querySelectorAll('[contenteditable]').forEach((n) => n.removeAttribute('contenteditable'))
  return clone
}

function collectBurnRects(source: HTMLElement): BurnRect[] {
  const sourceBounds = source.getBoundingClientRect()
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })
  const rects: BurnRect[] = []
  let currentNode = walker.nextNode()

  while (currentNode) {
    const textNode = currentNode as Text
    const parent = textNode.parentElement
    if (parent) {
      const color = window.getComputedStyle(parent).color || 'rgba(226, 232, 240, 0.7)'
      const range = document.createRange()
      range.selectNodeContents(textNode)
      Array.from(range.getClientRects()).forEach((rect) => {
        if (rect.width < 2 || rect.height < 2) return
        rects.push({
          left: rect.left - sourceBounds.left,
          top: rect.top - sourceBounds.top,
          width: rect.width,
          height: rect.height,
          color,
        })
      })
    }
    currentNode = walker.nextNode()
  }

  return rects
}

function createSmokeParticles(source: HTMLElement, originX: number, originY: number) {
  const layer = document.createElement('div')
  layer.className = 'burn-particles'

  const rects = collectBurnRects(source)
  if (!rects.length) return layer

  const weights = rects.map((r) => Math.max(1, r.width * r.height))
  const totalWeight = weights.reduce((s, w) => s + w, 0)
  const particleBudget = clamp(Math.round(totalWeight / 150), MIN_BURN_PARTICLES, MAX_BURN_PARTICLES)
  const cumulativeWeights: number[] = []
  weights.reduce((sum, w, i) => {
    const next = sum + w
    cumulativeWeights[i] = next
    return next
  }, 0)

  for (let i = 0; i < particleBudget; i++) {
    const target = Math.random() * totalWeight
    let rect = rects[rects.length - 1]
    for (let j = 0; j < cumulativeWeights.length; j++) {
      if (cumulativeWeights[j] >= target) { rect = rects[j]; break }
    }

    const particle = document.createElement('span')
    const size = 4.2 + Math.random() * 7.8
    const height = size * (0.94 + Math.random() * 1.18)
    const driftX = (Math.random() - 0.5) * 24
    const driftY = -(26 + Math.random() * 58)
    const opacity = (0.07 + Math.random() * 0.09).toFixed(2)
    const softDriftX = driftX * 0.08
    const softDriftY = driftY * 0.18
    const midDriftX = driftX * 0.4
    const midDriftY = driftY * 0.62
    const rotate = Math.round((Math.random() - 0.5) * 24)
    const particleBlur = (1.2 + Math.random() * 1.8).toFixed(2)
    const radius = `${42 + Math.random() * 14}% ${48 + Math.random() * 14}% ${54 + Math.random() * 12}% ${46 + Math.random() * 12}% / ${54 + Math.random() * 16}% ${40 + Math.random() * 18}% ${62 + Math.random() * 12}% ${44 + Math.random() * 16}%`

    particle.className = 'burn-particle'
    particle.style.cssText = [
      `left:${(originX + rect.left + Math.random() * rect.width).toFixed(2)}px`,
      `top:${(originY + rect.top + Math.random() * rect.height).toFixed(2)}px`,
      `width:${size.toFixed(2)}px`,
      `height:${height.toFixed(2)}px`,
      `color:${rect.color}`,
      `--burn-delay:${Math.round(Math.random() * 280)}ms`,
      `--burn-duration:${1280 + Math.round(Math.random() * 820)}ms`,
      `--drift-x:${driftX.toFixed(2)}px`,
      `--drift-y:${driftY.toFixed(2)}px`,
      `--drift-x-soft:${softDriftX.toFixed(2)}px`,
      `--drift-y-soft:${softDriftY.toFixed(2)}px`,
      `--drift-x-mid:${midDriftX.toFixed(2)}px`,
      `--drift-y-mid:${midDriftY.toFixed(2)}px`,
      `--drift-scale:${(1.04 + Math.random() * 0.62).toFixed(2)}`,
      `--burn-opacity:${opacity}`,
      `--burn-rotate:${rotate}deg`,
      `--burn-rotate-soft:${(rotate * 0.22).toFixed(2)}deg`,
      `--burn-rotate-mid:${(rotate * 0.64).toFixed(2)}deg`,
      `--particle-blur:${particleBlur}px`,
      `border-radius:${radius}`,
    ].join(';')
    layer.appendChild(particle)
  }

  return layer
}

// ── Editor lifecycle ────────────────────────────────────────────────────────

function buildExtensions() {
  return [
    nordTheme,
    syntaxHighlighting(mdHighlight),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    history(),
    lineNumbers(),
    headingFoldGutter,
    headingFoldService,
    markdownDecorations,
    markdownAtomicRanges,
    mathDecorations,
    mathTheme,
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        // Only emit dirty if this was NOT a programmatic set
        const isProgrammatic = update.transactions.some((tr) =>
          tr.annotation(isProgrammaticAnnotation) === true,
        )
        if (!isProgrammatic) {
          emit('dirty')
        }
        updateToc(update.state)
        emit('toc-update', tocEntries.value)
      }
    }),
  ]
}

function createView(content: string) {
  if (!editorRef.value) return

  const state = EditorState.create({
    doc: content,
    extensions: buildExtensions(),
  })

  view.value = new EditorView({
    state,
    parent: editorRef.value,
  })

  // Initial TOC
  updateToc(state)
  emit('toc-update', tocEntries.value)
}

function destroyView() {
  view.value?.destroy()
  view.value = null
}

// ── Public API ──────────────────────────────────────────────────────────────

function getMarkdown(): string {
  if (!view.value) return pendingContent
  return view.value.state.doc.toString()
}

function scrollToPos(pos: number) {
  if (!view.value) return
  view.value.dispatch({
    effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }),
  })
  view.value.focus()
}

async function setMarkdown(content: string) {
  pendingContent = content

  if (!editorRef.value) return

  destroyView()
  editorRef.value.innerHTML = ''
  cleanupBurnOverlay()
  await nextTick()
  createView(content)
  triggerContentFadeIn()
}

/**
 * Incrementally update the editor content while preserving cursor position and scroll.
 * Use this for external file changes (e.g., from file watcher).
 */
function updateContent(newContent: string, cursorAnchor?: number, cursorHead?: number) {
  if (!view.value) {
    // If editor doesn't exist yet, just set pending content
    pendingContent = newContent
    return
  }

  const state = view.value.state
  const currentContent = state.doc.toString()

  // If content hasn't changed, do nothing
  if (currentContent === newContent) return

  // Save current cursor/scroll position
  const scrollTop = editorRef.value?.querySelector('.cm-scroller')?.scrollTop ?? 0

  // Try to preserve relative cursor position
  const currentLength = currentContent.length
  const newLength = newContent.length
  const preserveCursor = cursorAnchor === undefined

  view.value.dispatch({
    changes: { from: 0, to: currentLength, insert: newContent },
    // Try to keep cursor at relative position
    selection: preserveCursor
      ? undefined
      : {
          anchor: Math.min(cursorAnchor ?? 0, newLength),
          head: Math.min(cursorHead ?? 0, newLength),
        },
    // Suppress dirty event for external updates
    annotations: isProgrammaticAnnotation.of(true),
  })

  // Restore scroll position
  nextTick(() => {
    const scroller = editorRef.value?.querySelector('.cm-scroller')
    if (scroller) {
      scroller.scrollTop = scrollTop
    }
  })
}

async function playBurnAnimation(): Promise<boolean> {
  if (!editorRef.value) return false

  cleanupBurnOverlay()

  const cmContent = editorRef.value.querySelector('.cm-content') as HTMLElement | null
  if (!cmContent) return false
  if (!cmContent.textContent?.trim()) return false

  const editorBounds = editorRef.value.getBoundingClientRect()
  const sourceBounds = cmContent.getBoundingClientRect()
  const originX = sourceBounds.left - editorBounds.left
  const originY = sourceBounds.top - editorBounds.top
  const contentH = Math.max(cmContent.scrollHeight, cmContent.offsetHeight)

  const overlay = document.createElement('div')
  overlay.className = 'burn-overlay'
  overlay.style.height = `${Math.ceil(originY + contentH + 24)}px`
  burnOverlay = overlay

  const snapshot = createBurnSnapshot(cmContent, 'burn-base')
  snapshot.style.cssText = [
    `left:${originX.toFixed(2)}px`,
    `top:${originY.toFixed(2)}px`,
    `width:${sourceBounds.width.toFixed(2)}px`,
    `min-height:${contentH}px`,
  ].join(';')

  const ash = createBurnSnapshot(cmContent, 'burn-ash')
  ash.style.cssText = snapshot.style.cssText

  overlay.appendChild(snapshot)
  overlay.appendChild(ash)
  overlay.appendChild(createSmokeParticles(cmContent, originX, originY))

  cmContent.classList.add('is-burning-source')
  editorRef.value.appendChild(overlay)

  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => {
      overlay.classList.add('is-burning')
      resolve()
    }),
  )

  await wait(1600)
  return true
}

async function burnAndClear(): Promise<void> {
  const didBurn = await playBurnAnimation()
  await setMarkdown('')
  void didBurn
}

async function transitionTo(content: string): Promise<void> {
  const didBurn = await playBurnAnimation()
  await setMarkdown(content)
  void didBurn
}

// ── Mount ───────────────────────────────────────────────────────────────────

onMounted(() => {
  createView(pendingContent)
})

onBeforeUnmount(() => {
  window.clearTimeout(fadeInTimer)
  destroyView()
})
</script>

<template>
  <div class="editor-wrapper">
    <div ref="editorRef" class="cm-editor-host" />
  </div>
</template>

<style scoped>
.editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.cm-editor-host {
  position: relative;
  min-height: 100%;
  outline: none;
}

.cm-editor-host.content-fade-in {
  animation: editorContentFade 240ms cubic-bezier(0.2, 0.72, 0.2, 1);
}

/* Let CodeMirror fill the wrapper */
.cm-editor-host :deep(.cm-editor) {
  height: 100%;
  background: transparent !important;
}

.cm-editor-host :deep(.cm-scroller) {
  font-family: var(--editor-font-family, inherit);
  font-size: var(--editor-font-size, 15px);
  line-height: 1.8;
  padding: 1.5rem 2rem;
  overflow: visible;
}

.cm-editor-host :deep(.cm-content) {
  min-height: 60vh;
  caret-color: var(--color-accent, #88c0d0);
}

/* Ordered list markers - ensure they're visible */
.cm-editor-host :deep(.cm-content) ol,
.cm-editor-host :deep(.cm-content) ul {
  padding-left: 1.5em;
}

.cm-editor-host :deep(.cm-content) li {
  padding-left: 0.25em;
}

.cm-editor-host :deep(.cm-content) li::marker {
  color: var(--editor-marker-color, #94a3b8);
  font-weight: 500;
}

/* ── Burn — text turns into smoke in place ── */
.cm-editor-host :deep(.cm-content.is-burning-source) {
  opacity: 0;
}

.editor-wrapper :deep(.burn-overlay) {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
  overflow: visible;
}

.editor-wrapper :deep(.burn-base) {
  position: absolute;
  margin: 0 !important;
  opacity: 1;
  will-change: opacity, filter, transform;
  filter: blur(0);
  transform: translate3d(0, 0, 0) scale(1);
  transform-origin: center top;
  transition:
    opacity 760ms cubic-bezier(0.22, 0.61, 0.28, 1),
    filter 900ms cubic-bezier(0.2, 0.65, 0.24, 1),
    transform 1080ms cubic-bezier(0.18, 0.68, 0.22, 1);
}

.editor-wrapper :deep(.burn-overlay.is-burning .burn-base) {
  opacity: 0;
  filter: blur(6px) saturate(0.76);
  transform: translate3d(0, -4px, 0) scale(1.008);
}

.editor-wrapper :deep(.burn-ash) {
  position: absolute;
  margin: 0 !important;
  opacity: 0;
  filter: blur(0.4px) grayscale(1) saturate(0) brightness(0.42) contrast(0.88);
  transform: translate3d(0, 0, 0) scale(1);
  transform-origin: center top;
  will-change: opacity, filter, transform;
}

.editor-wrapper :deep(.burn-overlay.is-burning .burn-ash) {
  animation: burnAsh 1480ms cubic-bezier(0.22, 0.61, 0.24, 1) 60ms forwards;
}

.editor-wrapper :deep(.burn-particles) {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.editor-wrapper :deep(.burn-particle) {
  position: absolute;
  left: 0;
  top: 0;
  background:
    radial-gradient(circle at 38% 32%, rgb(255 255 255 / 0.14) 0%, transparent 32%),
    radial-gradient(circle, currentColor 0%, transparent 74%);
  opacity: 0;
  filter: blur(var(--particle-blur, 1.8px));
  transform: translate3d(-50%, -50%, 0) scale(0.22);
  will-change: opacity, transform;
  contain: layout paint style;
  backface-visibility: hidden;
}

.editor-wrapper :deep(.burn-overlay.is-burning .burn-particle) {
  animation: burnSmoke var(--burn-duration, 1480ms) cubic-bezier(0.22, 0.61, 0.24, 1) var(--burn-delay, 0ms) forwards;
}

@keyframes burnSmoke {
  0% {
    opacity: 0;
    transform: translate3d(-50%, -50%, 0) scale(0.22) rotate(0deg);
  }
  18% {
    opacity: calc(var(--burn-opacity, 0.14) * 0.78);
    transform: translate3d(calc(-50% + var(--drift-x-soft, 0px)), calc(-50% + var(--drift-y-soft, -12px)), 0) scale(0.52)
      rotate(var(--burn-rotate-soft, 0deg));
  }
  56% {
    opacity: var(--burn-opacity, 0.14);
    transform: translate3d(calc(-50% + var(--drift-x-mid, 0px)), calc(-50% + var(--drift-y-mid, -28px)), 0) scale(0.96)
      rotate(var(--burn-rotate-mid, 0deg));
  }
  100% {
    opacity: 0;
    transform: translate3d(calc(-50% + var(--drift-x, 0px)), calc(-50% + var(--drift-y, -48px)), 0) scale(var(--drift-scale, 1.8))
      rotate(var(--burn-rotate, 0deg));
  }
}

@keyframes burnAsh {
  0% {
    opacity: 0;
    filter: blur(0px) grayscale(0.55) saturate(0.24) brightness(0.72) contrast(0.94);
    transform: translate3d(0, 0, 0) scale(1);
  }
  24% {
    opacity: 0.12;
    filter: blur(0.8px) grayscale(0.9) saturate(0.08) brightness(0.4) contrast(0.86);
  }
  58% {
    opacity: 0.09;
    filter: blur(1.6px) grayscale(1) saturate(0) brightness(0.28) contrast(0.82);
    transform: translate3d(0, -1px, 0) scale(1.002);
  }
  100% {
    opacity: 0;
    filter: blur(4px) grayscale(1) saturate(0) brightness(0.16) contrast(0.76);
    transform: translate3d(0, -4px, 0) scale(1.006);
  }
}

@keyframes editorContentFade {
  from {
    opacity: 0.72;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
