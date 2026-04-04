import * as d3Hierarchy from 'd3-hierarchy'
import * as d3Selection from 'd3-selection'
import * as d3Zoom from 'd3-zoom'
import 'd3-transition'
import type { TocEntry } from './useToc'

// ── Types ──

export interface MindMapNode {
  text: string
  level: number
  pos: number
  children?: MindMapNode[]
}

interface LayoutNode extends d3Hierarchy.HierarchyPointNode<MindMapNode> {
  _side?: 'left' | 'right'
}

// ── Colors ──
const PALETTE = [
  { bg: 'rgba(125,211,252,0.18)', border: '#7dd3fc', text: '#bae6fd', link: '#7dd3fc' },
  { bg: 'rgba(167,139,250,0.18)', border: '#a78bfa', text: '#c4b5fd', link: '#a78bfa' },
  { bg: 'rgba(52,211,153,0.18)',  border: '#34d399', text: '#6ee7b7', link: '#34d399' },
  { bg: 'rgba(251,191,36,0.18)',  border: '#fbbf24', text: '#fde68a', link: '#fbbf24' },
  { bg: 'rgba(248,113,113,0.18)', border: '#f87171', text: '#fca5a5', link: '#f87171' },
  { bg: 'rgba(251,146,60,0.18)',  border: '#fb923c', text: '#fdba74', link: '#fb923c' },
]

function paletteForDepth(depth: number) {
  if (depth <= 0) return PALETTE[0]
  return PALETTE[(depth - 1) % PALETTE.length]
}

// ── Layout constants ──
const NODE_H = 34
const NODE_PAD_X = 18
const ROOT_PAD_X = 28
const LEVEL_GAP = 200
const TRANSITION_MS = 350

// ── Text measurement ──
let measureCtx: CanvasRenderingContext2D | null = null
function measureText(text: string, fontSize: number, weight: string): number {
  if (!measureCtx) {
    measureCtx = document.createElement('canvas').getContext('2d')!
  }
  measureCtx.font = `${weight} ${fontSize}px Inter, system-ui, sans-serif`
  return measureCtx.measureText(text).width
}

function getNodeW(d: LayoutNode): number {
  const isRoot = d.depth === 0
  const fs = isRoot ? 16 : d.depth === 1 ? 14 : 13
  const fw = isRoot ? '600' : d.depth === 1 ? '500' : '400'
  const px = isRoot ? ROOT_PAD_X : NODE_PAD_X
  return measureText(d.data.text, fs, fw) + px * 2
}

/**
 * Build a MindMapNode tree from TocEntry[].
 * All h1 headings become direct children of the virtual root.
 */
export function buildTreeFromToc(tocEntries: TocEntry[], docTitle: string): MindMapNode {
  const root: MindMapNode = { text: docTitle || 'Document', level: 0, pos: -1, children: [] }
  if (!tocEntries.length) return root

  const stack: MindMapNode[] = [root]

  for (const entry of tocEntries) {
    const node: MindMapNode = { text: entry.text, level: entry.level, pos: entry.pos, children: [] }

    // Pop until we find a parent with strictly lower level
    while (stack.length > 1 && stack[stack.length - 1].level >= entry.level) {
      stack.pop()
    }
    stack[stack.length - 1].children!.push(node)
    stack.push(node)
  }

  return root
}

// ── Composable ──

export function useMindMap() {
  let svg: d3Selection.Selection<SVGSVGElement, unknown, null, undefined> | null = null
  let gLinks: d3Selection.Selection<SVGGElement, unknown, null, undefined> | null = null
  let gNodes: d3Selection.Selection<SVGGElement, unknown, null, undefined> | null = null
  let zoomBehavior: d3Zoom.ZoomBehavior<SVGSVGElement, unknown> | null = null
  let currentTree: MindMapNode | null = null
  let rootNode: LayoutNode | null = null
  let svgEl: SVGSVGElement | null = null

  function init(el: SVGSVGElement) {
    svgEl = el
    svg = d3Selection.select(el)
    svg.selectAll('*').remove()

    // ── Defs ──
    const defs = svg.append('defs')

    // Soft shadow for nodes
    const f = defs.append('filter').attr('id', 'mm-glow')
      .attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%')
    f.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 6).attr('result', 'blur')
    f.append('feFlood').attr('flood-color', 'rgba(125,211,252,0.15)').attr('result', 'color')
    f.append('feComposite').attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'shadow')
    const merge = f.append('feMerge')
    merge.append('feMergeNode').attr('in', 'shadow')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    // Root glow — stronger
    const f2 = defs.append('filter').attr('id', 'mm-root-glow')
      .attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%')
    f2.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 10).attr('result', 'blur')
    f2.append('feFlood').attr('flood-color', 'rgba(125,211,252,0.25)').attr('result', 'color')
    f2.append('feComposite').attr('in', 'color').attr('in2', 'blur').attr('operator', 'in').attr('result', 'shadow')
    const merge2 = f2.append('feMerge')
    merge2.append('feMergeNode').attr('in', 'shadow')
    merge2.append('feMergeNode').attr('in', 'SourceGraphic')

    gLinks = svg.append('g').attr('class', 'mm-links')
    gNodes = svg.append('g').attr('class', 'mm-nodes')

    zoomBehavior = d3Zoom.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 3])
      .on('zoom', (event) => {
        gLinks!.attr('transform', event.transform)
        gNodes!.attr('transform', event.transform)
      })

    svg.call(zoomBehavior)
    svg.on('dblclick.zoom', null)
  }

  function buildTree(tocEntries: TocEntry[], docTitle: string): MindMapNode {
    currentTree = buildTreeFromToc(tocEntries, docTitle)
    return currentTree
  }

  function render(treeData: MindMapNode, shouldFit = false) {
    if (!gLinks || !gNodes || !svg) return
    currentTree = treeData

    const hierarchy = d3Hierarchy.hierarchy(treeData) as LayoutNode

    // ── Layout: all children expand to the right, document order top-to-bottom ──
    const nodeGap = NODE_H + 12

    d3Hierarchy.tree<MindMapNode>()
      .nodeSize([nodeGap, LEVEL_GAP])
      .separation((a, b) => a.parent === b.parent ? 1 : 1.3)
      (hierarchy)

    // Mark all nodes as right-side
    hierarchy.each((n: any) => { n._side = 'right' })

    // Root at y=0 (leftmost), children extend rightward
    rootNode = hierarchy

    drawLinks(hierarchy)
    drawNodes(hierarchy)

    if (shouldFit) {
      requestAnimationFrame(() => fit())
    }
  }

  // ── Drawing ──

  function drawLinks(root: LayoutNode) {
    if (!gLinks) return

    const links = root.links()

    const sel = gLinks.selectAll<SVGPathElement, any>('path.mm-link')
      .data(links, (d: any) => `${d.source.data.pos}→${d.target.data.pos}`)

    sel.exit().transition().duration(TRANSITION_MS).attr('opacity', 0).remove()

    const enter = sel.enter().append('path')
      .attr('class', 'mm-link')
      .attr('fill', 'none')
      .attr('opacity', 0)

    enter.merge(sel as any)
      .transition().duration(TRANSITION_MS)
      .attr('opacity', 1)
      .attr('stroke', (d: any) => paletteForDepth(d.target.depth).link)
      .attr('stroke-width', (d: any) => {
        if (d.source.depth === 0) return 2.5
        return Math.max(1.2, 2.2 - d.target.depth * 0.3)
      })
      .attr('stroke-opacity', (d: any) => d.source.depth === 0 ? 0.6 : 0.4)
      .attr('d', (d: any) => {
        const s = d.source as LayoutNode
        const t = d.target as LayoutNode
        return cubicBezier(s.y, s.x, t.y, t.x)
      })
  }

  function cubicBezier(sy: number, sx: number, ty: number, tx: number): string {
    const dx = ty - sy
    const cp = Math.abs(dx) * 0.45
    const c1x = sy + (dx > 0 ? cp : -cp)
    const c2x = ty - (dx > 0 ? cp : -cp)
    return `M${sy},${sx} C${c1x},${sx} ${c2x},${tx} ${ty},${tx}`
  }

  function drawNodes(root: LayoutNode) {
    if (!gNodes) return

    const nodes = root.descendants()

    const sel = gNodes.selectAll<SVGGElement, LayoutNode>('g.mm-node')
      .data(nodes, (d: any) => `n-${d.data.pos}-${d.depth}-${d.data.text}`)

    sel.exit().transition().duration(TRANSITION_MS).attr('opacity', 0).remove()

    const enter = sel.enter().append('g')
      .attr('class', 'mm-node')
      .attr('opacity', 0)
      .attr('transform', (d) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')

    // Card (pill shape)
    enter.append('rect').attr('class', 'mm-card')

    // Text
    enter.append('text').attr('class', 'mm-label')
      .attr('dy', '0.36em')
      .attr('text-anchor', 'middle')
      .style('pointer-events', 'none')
      .style('user-select', 'none')

    // Store ref
    enter.each(function (d) { (this as any).__mmdata__ = d })

    const all = enter.merge(sel as any)

    all.transition().duration(TRANSITION_MS)
      .attr('opacity', 1)
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`)

    // ── Style cards ──
    all.select<SVGRectElement>('rect.mm-card')
      .each(function (d: any) {
        const w = getNodeW(d)
        const h = NODE_H
        const isRoot = d.depth === 0
        const pal = paletteForDepth(d.depth)

        d3Selection.select(this)
          .attr('x', -w / 2).attr('y', -h / 2)
          .attr('width', w).attr('height', h)
          .attr('rx', h / 2).attr('ry', h / 2) // pill shape
          .attr('fill', isRoot ? 'rgba(15, 23, 42, 0.92)' : pal.bg)
          .attr('stroke', isRoot ? '#7dd3fc' : pal.border)
          .attr('stroke-width', isRoot ? 2 : 1.2)
          .attr('stroke-opacity', isRoot ? 0.7 : 0.5)
          .attr('filter', isRoot ? 'url(#mm-root-glow)' : 'url(#mm-glow)')
      })

    // ── Style labels ──
    all.select<SVGTextElement>('text.mm-label')
      .text((d: any) => d.data.text)
      .attr('fill', (d: any) => {
        if (d.depth === 0) return '#f1f5f9'
        return paletteForDepth(d.depth).text
      })
      .attr('font-size', (d: any) => d.depth === 0 ? '16px' : d.depth === 1 ? '14px' : '13px')
      .attr('font-weight', (d: any) => d.depth === 0 ? '600' : d.depth === 1 ? '500' : '400')
      .attr('font-family', "'Inter', system-ui, sans-serif")

    // Update data ref
    all.each(function (d: any) { (this as any).__mmdata__ = d })

    // ── Hover interactions (no transition delay) ──
    all.on('mouseenter', function (this: SVGGElement) {
      d3Selection.select(this).select('rect.mm-card')
        .attr('stroke-opacity', 0.9)
        .attr('stroke-width', function () {
          const d = (this as any).__data__ || (this.parentNode as any).__mmdata__
          return d?.depth === 0 ? 2.5 : 1.8
        })
    })
    all.on('mouseleave', function (this: SVGGElement) {
      const d = (this as any).__mmdata__ as LayoutNode | undefined
      const isRoot = d?.depth === 0
      d3Selection.select(this).select('rect.mm-card')
        .attr('stroke-opacity', isRoot ? 0.7 : 0.5)
        .attr('stroke-width', isRoot ? 2 : 1.2)
    })
  }

  function fit() {
    if (!svg || !gNodes || !svgEl || !rootNode) return

    const w = svgEl.clientWidth || svgEl.getBoundingClientRect().width
    const h = svgEl.clientHeight || svgEl.getBoundingClientRect().height
    if (w === 0 || h === 0) return

    const gNode = gNodes.node()
    if (!gNode) return
    const bbox = gNode.getBBox()
    if (bbox.width === 0 && bbox.height === 0) return

    const pad = 50
    const scaleX = (w - pad * 2) / bbox.width
    const scaleY = (h - pad * 2) / bbox.height
    const scale = Math.min(scaleX, scaleY, 1.8)

    const tx = w / 2 - (bbox.x + bbox.width / 2) * scale
    const ty = h / 2 - (bbox.y + bbox.height / 2) * scale

    svg.transition().duration(TRANSITION_MS)
      .call(zoomBehavior!.transform as any, d3Zoom.zoomIdentity.translate(tx, ty).scale(scale))
  }

  function findNodeAtEvent(target: Element): { el: SVGGElement; data: LayoutNode } | null {
    let el: Element | null = target
    while (el && el !== svgEl) {
      if (el instanceof SVGGElement && el.classList.contains('mm-node')) {
        const data = (el as any).__mmdata__ as LayoutNode | undefined
        if (data) return { el, data }
      }
      el = el.parentElement
    }
    return null
  }

  function getTree() { return currentTree }

  function destroy() {
    svg?.on('.zoom', null)
    svg?.selectAll('*').remove()
    svg = null; gLinks = null; gNodes = null
    zoomBehavior = null; currentTree = null; rootNode = null; svgEl = null
  }

  return { init, buildTree, render, fit, getTree, destroy, findNodeAtEvent }
}
