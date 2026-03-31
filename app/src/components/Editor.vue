<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx } from '@milkdown/core'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { nord } from '@milkdown/theme-nord'
import type { Ctx } from '@milkdown/ctx'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { math } from '@milkdown/plugin-math'
import '@milkdown/theme-nord/style.css'
import 'katex/dist/katex.min.css'

const emit = defineEmits<{
  dirty: []
}>()

const editorRef = ref<HTMLDivElement | null>(null)
let editorInstance: Editor | null = null
let editorReady = false
let suppressDirtyEvent = false
let pendingContent = ''
let burnOverlay: HTMLDivElement | null = null
let fadeInTimer = 0
const MIN_BURN_PARTICLES = 72
const MAX_BURN_PARTICLES = 320

type BurnRect = {
  left: number
  top: number
  width: number
  height: number
  color: string
}

function cleanupBurnOverlay() {
  editorRef.value
    ?.querySelector('.ProseMirror.is-burning-source')
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
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function createBurnSnapshot(source: HTMLElement, ...classNames: string[]) {
  const clone = source.cloneNode(true) as HTMLElement
  clone.classList.add(...classNames)
  clone.removeAttribute('contenteditable')
  clone.removeAttribute('spellcheck')
  clone.querySelectorAll('[contenteditable]').forEach((node) => {
    node.removeAttribute('contenteditable')
  })
  clone.querySelectorAll('.ProseMirror-trailingBreak').forEach((node) => {
    node.remove()
  })
  return clone
}

function collectBurnRects(source: HTMLElement): BurnRect[] {
  const sourceBounds = source.getBoundingClientRect()
  const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.textContent?.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT
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
        if (rect.width < 2 || rect.height < 2) {
          return
        }

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
  if (!rects.length) {
    return layer
  }

  const weights = rects.map((rect) => Math.max(1, rect.width * rect.height))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  const particleBudget = clamp(Math.round(totalWeight / 150), MIN_BURN_PARTICLES, MAX_BURN_PARTICLES)
  const cumulativeWeights: number[] = []

  weights.reduce((sum, weight, index) => {
    const next = sum + weight
    cumulativeWeights[index] = next
    return next
  }, 0)

  for (let i = 0; i < particleBudget; i++) {
    const target = Math.random() * totalWeight
    let rect = rects[rects.length - 1]

    for (let index = 0; index < cumulativeWeights.length; index++) {
      if (cumulativeWeights[index] >= target) {
        rect = rects[index]
        break
      }
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

async function createEditor(initialContent: string) {
  if (!editorRef.value) return

  editorInstance = await Editor.make()
    .use(listener)
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value!)
      ctx.set(defaultValueCtx, initialContent)
      ctx.get(listenerCtx).updated(handleDocumentUpdated)
    })
    .config(nord)
    .use(commonmark)
    .use(gfm)
    .use(math)
    .create()

  editorReady = true
}

function handleDocumentUpdated(_ctx: Ctx) {
  if (!suppressDirtyEvent) {
    emit('dirty')
  }
}

async function setMarkdown(content: string) {
  pendingContent = content

  if (!editorRef.value) return

  suppressDirtyEvent = true

  try {
    if (editorInstance) {
      await editorInstance.destroy()
      editorInstance = null
      editorReady = false
    }

    editorRef.value.innerHTML = ''
    cleanupBurnOverlay()
    await nextTick()
    await createEditor(content)
    triggerContentFadeIn()
  } finally {
    suppressDirtyEvent = false
  }
}

function getMarkdown() {
  if (!editorInstance || !editorReady) {
    return pendingContent
  }

  return editorInstance.action((ctx) => {
    const serializer = ctx.get(serializerCtx)
    const view = ctx.get(editorViewCtx)
    return serializer(view.state.doc)
  })
}

/**
 * Burn-after-writing: sample the visible text areas, emit soft particles
 * directly from those glyph regions, then let the snapshot blur away.
 */
async function playBurnAnimation() {
  if (!editorRef.value) {
    return false
  }

  cleanupBurnOverlay()

  const proseMirror = editorRef.value.querySelector('.ProseMirror') as HTMLElement | null
  if (!proseMirror) {
    return false
  }

  if (!proseMirror.textContent?.trim()) {
    return false
  }

  const editorBounds = editorRef.value.getBoundingClientRect()
  const sourceBounds = proseMirror.getBoundingClientRect()
  const originX = sourceBounds.left - editorBounds.left
  const originY = sourceBounds.top - editorBounds.top
  const contentH = Math.max(proseMirror.scrollHeight, proseMirror.offsetHeight)

  const overlay = document.createElement('div')
  overlay.className = 'burn-overlay'
  overlay.style.height = `${Math.ceil(originY + contentH + 24)}px`
  burnOverlay = overlay

  const snapshot = createBurnSnapshot(proseMirror, 'burn-base')
  snapshot.style.cssText = [
    `left:${originX.toFixed(2)}px`,
    `top:${originY.toFixed(2)}px`,
    `width:${sourceBounds.width.toFixed(2)}px`,
    `min-height:${contentH}px`,
  ].join(';')

  const ash = createBurnSnapshot(proseMirror, 'burn-ash')
  ash.style.cssText = snapshot.style.cssText

  overlay.appendChild(snapshot)
  overlay.appendChild(ash)
  overlay.appendChild(createSmokeParticles(proseMirror, originX, originY))

  proseMirror.classList.add('is-burning-source')
  editorRef.value.appendChild(overlay)

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-burning')
      resolve()
    })
  })

  await wait(1600)
  return true
}

async function burnAndClear(): Promise<void> {
  const didBurn = await playBurnAnimation()
  if (!didBurn) {
    await setMarkdown('')
    return
  }
  await setMarkdown('')
}

async function transitionTo(content: string): Promise<void> {
  const didBurn = await playBurnAnimation()
  if (!didBurn) {
    await setMarkdown(content)
    return
  }

  await setMarkdown(content)
}

defineExpose({
  getMarkdown,
  setMarkdown,
  burnAndClear,
  transitionTo,
})

onMounted(async () => {
  await createEditor(pendingContent)
})

onBeforeUnmount(() => {
  window.clearTimeout(fadeInTimer)
  void editorInstance?.destroy()
})
</script>

<template>
  <div class="editor-wrapper">
    <div ref="editorRef" class="milkdown-editor" />
  </div>
</template>

<style scoped>
.editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.milkdown-editor {
  position: relative;
  min-height: 100%;
  outline: none;
}

.milkdown-editor.content-fade-in {
  animation: editorContentFade 240ms cubic-bezier(0.2, 0.72, 0.2, 1);
}

.milkdown-editor :deep(.milkdown) {
  padding: 1.5rem 2rem;
  color: var(--color-text-primary, #e2e8f0);
  font-size: 1rem;
  line-height: 1.8;
  background: transparent !important;
}

.milkdown-editor :deep(.editor) {
  padding: 0;
  background: transparent !important;
  color: var(--color-text-primary, #e2e8f0);
}

.milkdown-editor :deep(.ProseMirror) {
  outline: none;
  min-height: 60vh;
  padding: 1rem;
  background: transparent !important;
}

.milkdown-editor :deep(h1) {
  color: var(--color-text-heading, #f1f5f9);
  font-weight: 300;
  font-size: 2.2rem;
  letter-spacing: -0.02em;
  border-bottom: 1px solid var(--color-border-hover, rgba(148, 163, 184, 0.15));
  padding-bottom: 0.5rem;
  margin-bottom: 1.5rem;
}

.milkdown-editor :deep(h2) {
  color: var(--color-text-primary, #e2e8f0);
  font-weight: 400;
  font-size: 1.6rem;
  margin-top: 2rem;
}

.milkdown-editor :deep(h3) {
  color: var(--color-text-primary, #cbd5e1);
  font-weight: 500;
  font-size: 1.25rem;
}

.milkdown-editor :deep(p) {
  color: var(--color-text-primary, #cbd5e1);
  margin: 0.8rem 0;
}

.milkdown-editor :deep(a) {
  color: var(--color-accent, #7dd3fc);
  text-decoration: none;
  border-bottom: 1px solid var(--editor-link-border);
  transition: border-color 0.2s;
}

.milkdown-editor :deep(a:hover) {
  border-bottom-color: var(--color-accent);
}

.milkdown-editor :deep(code) {
  background: var(--color-code-bg, rgba(30, 41, 59, 0.6));
  color: var(--color-code, #a5f3fc);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
  font-family: var(--font-mono, 'JetBrains Mono', monospace);
}

.milkdown-editor :deep(pre) {
  background: var(--color-pre-bg, rgba(15, 23, 42, 0.6));
  border: 1px solid var(--color-pre-border, rgba(51, 65, 85, 0.4));
  border-radius: 8px;
  padding: 1rem 1.2rem;
  overflow-x: auto;
}

.milkdown-editor :deep(pre code) {
  background: none;
  padding: 0;
  color: var(--editor-precode-color);
}

.milkdown-editor :deep(blockquote) {
  border-left: 3px solid var(--editor-blockquote-border);
  padding-left: 1rem;
  margin-left: 0;
  color: var(--color-text-secondary);
  font-style: italic;
}

.milkdown-editor :deep(ul),
.milkdown-editor :deep(ol) {
  padding-left: 1.5rem;
  color: var(--editor-list-color);
}

.milkdown-editor :deep(li) {
  margin: 0.3rem 0;
}

.milkdown-editor :deep(li::marker) {
  color: var(--editor-marker-color);
}

.milkdown-editor :deep(hr) {
  border: none;
  border-top: 1px solid var(--editor-hr-color);
  margin: 2rem 0;
}

.milkdown-editor :deep(strong) {
  color: var(--editor-strong-color);
  font-weight: 600;
}

.milkdown-editor :deep(em) {
  color: var(--color-emphasis);
}

.milkdown-editor :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  background: transparent !important;
}

.milkdown-editor :deep(thead),
.milkdown-editor :deep(tbody),
.milkdown-editor :deep(tr) {
  background: transparent !important;
}

.milkdown-editor :deep(tr:hover) {
  background: var(--editor-tr-hover) !important;
}

.milkdown-editor :deep(th) {
  background: var(--editor-th-bg) !important;
  color: var(--color-text-primary);
  font-weight: 500;
  padding: 0.5rem 0.75rem;
  text-align: left;
  border: 1px solid var(--editor-th-border);
}

.milkdown-editor :deep(td) {
  background: transparent !important;
  color: var(--editor-list-color);
  padding: 0.5rem 0.75rem;
  text-align: left;
  border: 1px solid var(--editor-td-border);
}

.milkdown-editor :deep(.tableWrapper),
.milkdown-editor :deep([class*="table"]) {
  background: transparent !important;
}

.milkdown-editor :deep(.math-inline),
.milkdown-editor :deep(.math-block),
.milkdown-editor :deep(.katex-display),
.milkdown-editor :deep(.katex) {
  color: var(--color-code);
  background: transparent !important;
}

.milkdown-editor :deep(.katex-html) {
  color: var(--color-accent);
}

.milkdown-editor :deep(.math-block) {
  padding: 0.75rem 0;
  overflow-x: auto;
}

.milkdown-editor :deep([data-type="math_inline"]),
.milkdown-editor :deep([data-type="math_block"]) {
  background: var(--editor-math-bg) !important;
  border-radius: 4px;
  padding: 0 4px;
}

.milkdown-editor :deep(input[type='checkbox']) {
  accent-color: var(--color-accent);
  margin-right: 0.5rem;
}

.milkdown-editor :deep(::selection) {
  background: var(--editor-selection-bg);
}

.milkdown-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: 'Start writing...';
  color: var(--color-text-muted);
  float: left;
  pointer-events: none;
  height: 0;
}

/* ── Burn — text turns into smoke in place ── */
.milkdown-editor :deep(.ProseMirror.is-burning-source) {
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
