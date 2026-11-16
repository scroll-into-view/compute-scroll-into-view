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
    // The viewport is the last one anyway
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
