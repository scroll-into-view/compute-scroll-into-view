import type { Middleware, SideObject } from './index.js'
import {
  getParentElement,
  getRegion,
  getTargetBox,
  isScrollable,
} from './shared.js'

const isVisible = (region: SideObject, box: SideObject): boolean =>
  box.top >= region.top &&
  box.right <= region.right &&
  box.bottom <= region.bottom &&
  box.left >= region.left

/**
 * Only scrolls if the target isn't already visible, like the
 * [`scrollMode: "if-needed"` proposal](https://github.com/w3c/csswg-drafts/pull/5677), to be backwards compatible with
 * `Element.scrollIntoViewIfNeeded`. If something is not 100% visible it counts as "needs scrolling".
 *
 * Stops at the first scroll container that the target's scroll-margin box is visible in, inside its `scroll-padding`,
 * if it's visible in the viewport too. Put it after the middleware that change which containers are scrolled, or how
 * they are measured.
 */
export const onlyIfNeeded = (): Middleware => ({
  name: 'onlyIfNeeded',
  fn: ({ scrollable, rects, viewportRects }) => {
    if (!scrollable) return {}
    const box = getTargetBox(rects)
    if (
      isVisible(getRegion(rects), box) &&
      // The target has to be visible in the viewport too, which isn't implied by it being visible in an inner frame
      isVisible(getRegion(viewportRects), box)
    ) {
      return { scrollable: false, stop: true }
    }
    return {}
  },
})

/**
 * Stops at a boundary. The boundary element itself is scrolled if it's a scroll container. A function is called with
 * the target and then each of its ancestors, and stops at the first one it returns `false` for.
 */
export const boundary = (
  limit: Element | ((parent: Element) => boolean) | null | undefined
): Middleware => ({
  name: 'boundary',
  fn: ({ target, container, viewport }) => {
    if (limit == null) return {}
    const checkBoundary =
      typeof limit === 'function' ? limit : (node: Element) => node !== limit
    if (container === getParentElement(target) && !checkBoundary(target)) {
      return { scrollable: false, stop: true }
    }
    // The viewport is the last scrolling box of its document
    return !viewport && !checkBoundary(container) ? { stop: true } : {}
  },
})

/**
 * Leaves `overflow: hidden` scroll containers alone, which the spec scrolls, like
 * [Firefox's convention](https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18). The viewport is always
 * scrolled.
 */
export const skipOverflowHiddenElements = (): Middleware => ({
  name: 'skipOverflowHiddenElements',
  fn: ({ container, viewport, scrollable }) => {
    return scrollable && !viewport && !isScrollable(container, true)
      ? { scrollable: false }
      : {}
  },
})

export interface SelectionOptions {
  /**
   * `'focus'` aligns the end of the selection where the caret is, which is the end of a `Range`. `'bounds'` aligns the
   * box around the whole selection
   * @default 'focus'
   */
  align?: 'focus' | 'bounds'
}

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
// focus of a selection at the selected one. At the ends, the one on the other side is measured
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
  if (isText(child)) {
    return measureCaret(child, isBefore ? child.length : 0, isBefore)
  }
  return isElementNode(child) ? toBox(child.getBoundingClientRect()) : null
}

const measureRange = (range: Range): SideObject | null =>
  range.collapsed
    ? measureCaret(range.endContainer, range.endOffset, false)
    : toBox(range.getBoundingClientRect())

const isSelection = (selected: Selection | Range): selected is Selection =>
  'rangeCount' in selected

const measureSelection = (
  selected: Selection | Range,
  align: SelectionOptions['align']
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
  if (align === 'bounds') {
    const boxes: SideObject[] = []
    for (let index = 0; index < selected.rangeCount; index++) {
      const box = measureRange(selected.getRangeAt(index))
      if (box) boxes.push(box)
    }
    return unionBoxes(boxes)
  }
  const { focusNode, focusOffset } = selected
  if (!focusNode || !selected.rangeCount) return null
  // The focus is the end of a forward selection, and the start of a backward one
  const range = selected.getRangeAt(selected.rangeCount - 1)
  const forward =
    !range.collapsed &&
    focusNode === range.endContainer &&
    focusOffset === range.endOffset
  return measureCaret(focusNode, focusOffset, forward)
}

/**
 * Aligns a text selection instead of the target element's border box, like editors scroll the caret into view. The
 * selection is a `Selection` or a `Range` in the target's document, and defaults to the document's selection. The
 * focus end of the selection is aligned, where the caret is: a collapsed caret is measured as the character or node
 * next to it, so empty lines and carets without a box of their own work too. `align: 'bounds'` aligns the box around
 * the whole selection instead. A `Range` has no direction, so its focus is its end.
 *
 * The ancestor walk is still the target's, so pass an element inside the scroll container that should scroll, such
 * as the parent element of the focus node, not the scroll container itself. The target's `scroll-margin` still grows
 * the box, and the scroll containers' `scroll-padding` keeps the caret away from their edges. Put it before
 * `onlyIfNeeded()`, which then checks the selection. When the selection has nothing to measure, the target's border
 * box is aligned instead.
 */
export const selection = (
  selected?: Selection | Range | null,
  options: SelectionOptions = {}
): Middleware => ({
  name: 'selection',
  fn: ({ target, container }) => {
    // The boxes are in the target's viewport. After the walk crosses into a parent document, compute has mapped the
    // box into it already
    if (container.ownerDocument !== target.ownerDocument) return {}
    const current = selected ?? target.ownerDocument.getSelection()
    const box = current && measureSelection(current, options.align)
    return box ? { rects: { target: box } } : {}
  },
})
