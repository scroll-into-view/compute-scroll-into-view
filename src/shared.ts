import type { Rects, SideObject } from './index.js'

const canOverflow = (
  overflow: string | null,
  skipOverflowHiddenElements?: boolean
) => {
  if (skipOverflowHiddenElements && overflow === 'hidden') {
    return false
  }

  return overflow !== 'visible' && overflow !== 'clip'
}

const getFrameElement = (el: Element) => {
  if (!el.ownerDocument || !el.ownerDocument.defaultView) {
    return null
  }

  try {
    return el.ownerDocument.defaultView.frameElement
  } catch {
    return null
  }
}

const isHiddenByFrame = (el: Element): boolean => {
  // An iframe clips its document's viewport, not the overflow: visible elements in it
  if (
    el !== el.ownerDocument.documentElement &&
    el !== el.ownerDocument.scrollingElement
  ) {
    return false
  }
  const frame = getFrameElement(el)
  if (!frame) {
    return false
  }

  return (
    frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth
  )
}

export const isScrollable = (
  el: Element,
  skipOverflowHiddenElements?: boolean
): boolean => {
  if (el.clientHeight < el.scrollHeight || el.clientWidth < el.scrollWidth) {
    const style = getComputedStyle(el, null)
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
export const getRegion = ({
  scrollport,
  scrollPadding,
}: Rects): SideObject => ({
  top: scrollport.top + scrollPadding.top,
  right: scrollport.right - scrollPadding.right,
  bottom: scrollport.bottom - scrollPadding.bottom,
  left: scrollport.left + scrollPadding.left,
})

// The scroll-margin box of the target is what gets aligned
export const getTargetBox = ({ target, scrollMargin }: Rects): SideObject => ({
  top: target.top - scrollMargin.top,
  right: target.right + scrollMargin.right,
  bottom: target.bottom + scrollMargin.bottom,
  left: target.left - scrollMargin.left,
})
