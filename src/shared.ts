import type { Rects, SideObject } from './index.js'

/** A `SideObject` of what `fn` returns for each side, given whether it's a start (top or left) edge, and its axis */
export const mapSides = (
  fn: (side: keyof SideObject, start: boolean, axis: 'x' | 'y') => number
): SideObject => ({
  top: fn('top', true, 'y'),
  right: fn('right', false, 'x'),
  bottom: fn('bottom', false, 'y'),
  left: fn('left', true, 'x'),
})

// Moves each edge of `box` inwards by `by`, or outwards with a `sign` of -1
const inset = (box: SideObject, by: SideObject, sign: number): SideObject =>
  mapSides((side, start) => box[side] + (start ? sign : -sign) * by[side])

const canOverflow = (
  overflow: string | null,
  skipOverflowHiddenElements?: boolean
) => {
  if (skipOverflowHiddenElements && overflow === 'hidden') {
    return false
  }

  return overflow !== 'visible' && overflow !== 'clip'
}

// Throws without a window, or for a cross-origin parent
export const getFrameElement = (el: Element): Element | null => {
  try {
    return el.ownerDocument.defaultView!.frameElement
  } catch {
    return null
  }
}

const isHiddenByFrame = (el: Element): boolean => {
  const { documentElement, scrollingElement } = el.ownerDocument
  const frame = getFrameElement(el)
  // An iframe clips its document's viewport, not the overflow: visible elements in it
  return (
    !!frame &&
    (el === documentElement || el === scrollingElement) &&
    (frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth)
  )
}

export const isScrollable = (
  el: Element,
  skipOverflowHiddenElements?: boolean
): boolean => {
  if (el.clientHeight < el.scrollHeight || el.clientWidth < el.scrollWidth) {
    const style = getComputedStyle(el)
    return (
      canOverflow(style.overflowY, skipOverflowHiddenElements) ||
      canOverflow(style.overflowX, skipOverflowHiddenElements) ||
      isHiddenByFrame(el)
    )
  }

  return false
}

const isShadowRoot = (node: Node): node is ShadowRoot => 'host' in node

const isSlottable = (node: Node): node is Element | Text =>
  'assignedSlot' in node

// A slotted element is laid out in its slot, in the host's shadow tree, so the slot's ancestors there come first
export const getParentElement = (element: Node): Element | null => {
  const parent =
    (isSlottable(element) && element.assignedSlot) || element.parentElement
  if (parent == null) {
    const root = element.getRootNode()
    return isShadowRoot(root) ? root.host || null : null
  }
  return parent
}

// The optimal viewing region is the scrollport, inset by `scroll-padding`, in viewport coordinates
export const getRegion = ({ scrollport, scrollPadding }: Rects): SideObject =>
  inset(scrollport, scrollPadding, 1)

// The scroll-margin box of the target is what gets aligned
export const getTargetBox = ({ target, scrollMargin }: Rects): SideObject =>
  inset(target, scrollMargin, -1)

const isText = (node: Node): node is Text => node.nodeType === 3
const isElementNode = (node: Node): node is Element => node.nodeType === 1

// A box that is all zeros is what browsers return when there is nothing to measure
const toBox = (rect: DOMRect | undefined): SideObject | null =>
  rect && (rect.width || rect.height || rect.top || rect.left)
    ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }
    : null

const unionBoxes = (boxes: SideObject[]): SideObject | null =>
  boxes.length
    ? boxes.reduce((union, box) => ({
        top: Math.min(union.top, box.top),
        right: Math.max(union.right, box.right),
        bottom: Math.max(union.bottom, box.bottom),
        left: Math.min(union.left, box.left),
      }))
    : null

// A collapsed range has no box of its own in every browser, so a caret is measured as the box of the character or
// node next to it. That box is as tall as the line, and its edge nearest the caret is where the caret is, in any
// writing mode and direction. A caret looks at the one after it, like browsers place it after a soft wrap, and the
// focus of a selection at the selected one. At the ends, the one on the other side is measured. A neighboring
// element, like a `<strong>` that wraps over several lines, is entered at the edge nearest the caret, down to the
// character there. Elements without children, like `<img>` and `<br>`, are the box themselves
const measureCaret = (
  node: Node,
  offset: number,
  before: boolean
): SideObject | null => {
  const length = isText(node) ? node.length : node.childNodes.length
  if (!length) {
    // An empty block, or a `<br>`, is the line the caret is on
    return isElementNode(node) ? toBox(node.getBoundingClientRect()) : null
  }
  const index = before ? Math.max(offset - 1, 0) : Math.min(offset, length - 1)
  const isBefore = index < offset
  if (isText(node)) {
    const range = node.ownerDocument.createRange()
    range.setStart(node, index)
    range.setEnd(node, index + 1)
    const rects = range.getClientRects()
    return toBox(isBefore ? rects[rects.length - 1] : rects[0])
  }
  const child = node.childNodes[index]
  if (!isText(child) && !isElementNode(child)) return null
  const childLength = isText(child) ? child.length : child.childNodes.length
  return measureCaret(child, isBefore ? childLength : 0, isBefore)
}

const measureRange = (range: Range): SideObject | null =>
  range.collapsed
    ? measureCaret(range.endContainer, range.endOffset, false)
    : toBox(range.getBoundingClientRect())

const isSelection = (selected: Selection | Range): selected is Selection =>
  'rangeCount' in selected

export const measureSelection = (
  selected: Selection | Range,
  align: 'focus' | 'bounds' | undefined
): SideObject | null => {
  if (!isSelection(selected)) {
    return align === 'bounds'
      ? measureRange(selected)
      : measureCaret(
          selected.endContainer,
          selected.endOffset,
          !selected.collapsed
        )
  }
  if (!selected.rangeCount) return null
  if (align === 'bounds') {
    // Firefox has more than one range for a selection across table cells, or with ctrl-select. The ranges are not
    // contiguous, so the box around the selection is the union of their boxes, not a span over what's between them
    const boxes: SideObject[] = []
    for (let index = 0; index < selected.rangeCount; index++) {
      const box = measureRange(selected.getRangeAt(index))
      if (box) boxes.push(box)
    }
    return unionBoxes(boxes)
  }
  // The focus is the end of a forward selection, and the start of a backward one
  const range = selected.getRangeAt(selected.rangeCount - 1)
  const { focusNode, focusOffset } = selected
  if (!focusNode) return null
  const forward =
    !range.collapsed &&
    focusNode === range.endContainer &&
    focusOffset === range.endOffset
  return measureCaret(focusNode, focusOffset, forward)
}
