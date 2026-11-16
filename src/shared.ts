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
