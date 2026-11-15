// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

/**
 * This new option is tracked in this PR, which is the most likely candidate at the time: https://github.com/w3c/csswg-drafts/pull/1805
 */
export type ScrollMode = 'always' | 'if-needed'

export interface Options {
  /**
   * Control the scroll position in the block direction of the target's [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode).
   * In `horizontal-tb` (the default) `block: 'start'` aligns to the top edge and `block: 'end'` to the bottom, in `vertical-rl` they align to the right and left edges.
   * @default 'center'
   */
  block?: ScrollLogicalPosition
  /**
   * Control the scroll position in the inline direction of the target's [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode) and [direction](https://developer.mozilla.org/en-US/docs/Web/CSS/direction). In left-to-right text `inline: 'start'` aligns to the left edge, in right-to-left text to the right edge. Scroll containers that overflow to the left or top get negative `left` or `top` values, like `scrollLeft` in right-to-left scroll containers.
   * @default 'nearest'
   */
  inline?: ScrollLogicalPosition
  /**
   * This is a proposed addition to the spec that you can track here: https://github.com/w3c/csswg-drafts/pull/5677
   *
   * This library will be updated to reflect any changes to the spec and will provide a migration path.
   * To be backwards compatible with `Element.scrollIntoViewIfNeeded` if something is not 100% visible it will count as "needs scrolling". If you need a different visibility ratio your best option would be to implement an [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
   * @default 'always'
   */
  scrollMode?: ScrollMode
  /**
   * By default there is no boundary. All the parent elements of your target is checked until it reaches the viewport ([`document.scrollingElement`](https://developer.mozilla.org/en-US/docs/Web/API/document/scrollingElement)) when calculating layout and what to scroll.
   * By passing a boundary you can short-circuit this loop depending on your needs:
   * 
   * - Prevent the browser window from scrolling.
   * - Scroll elements into view in a list, without scrolling container elements.
   * 
   * You can also pass a function to do more dynamic checks to override the scroll scoping:
   * 
   * ```js
   * let actions = compute(target, {
   *   boundary: (parent) => {
   *     // By default `overflow: hidden` elements are allowed, only `overflow: visible | clip` is skipped as
   *     // this is required by the CSSOM spec
   *     if (getComputedStyle(parent)['overflow'] === 'hidden') {
   *       return false
   *     }

   *     return true
   *   },
   * })
   * ```
   * @default null
   */
  boundary?: Element | ((parent: Element) => boolean) | null
  /**
   * New option that skips auto-scrolling all nodes with overflow: hidden set
   * See FF implementation: https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18
   * @default false
   */
  skipOverflowHiddenElements?: boolean
}

export interface ScrollAction {
  el: Element
  top: number
  left: number
}

// @TODO better shadowdom test, 11 = document fragment
const isElement = (el: any): el is Element =>
  typeof el === 'object' && el != null && el.nodeType === 1

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
  const frame = getFrameElement(el)
  if (!frame) {
    return false
  }

  return (
    frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth
  )
}

const isScrollable = (el: Element, skipOverflowHiddenElements?: boolean) => {
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
/**
 * Find out which edge to align against when logical scroll position is "nearest"
 * Interesting fact: "nearest" works similarily to "if-needed", if the element is fully visible it will not scroll it
 *
 * Legends:
 * ┌────────┐ ┏ ━ ━ ━ ┓
 * │ target │   frame
 * └────────┘ ┗ ━ ━ ━ ┛
 */
const alignNearest = (
  scrollingEdgeStart: number,
  scrollingEdgeEnd: number,
  scrollingSize: number,
  scrollingBorderStart: number,
  scrollingBorderEnd: number,
  elementEdgeStart: number,
  elementEdgeEnd: number,
  elementSize: number
) => {
  /**
   * If element edge A and element edge B are both outside scrolling box edge A and scrolling box edge B
   *
   *          ┌──┐
   *        ┏━│━━│━┓
   *          │  │
   *        ┃ │  │ ┃        do nothing
   *          │  │
   *        ┗━│━━│━┛
   *          └──┘
   *
   *  If element edge C and element edge D are both outside scrolling box edge C and scrolling box edge D
   *
   *    ┏ ━ ━ ━ ━ ┓
   *   ┌───────────┐
   *   │┃         ┃│        do nothing
   *   └───────────┘
   *    ┗ ━ ━ ━ ━ ┛
   */
  if (
    (elementEdgeStart < scrollingEdgeStart &&
      elementEdgeEnd > scrollingEdgeEnd) ||
    (elementEdgeStart > scrollingEdgeStart && elementEdgeEnd < scrollingEdgeEnd)
  ) {
    return 0
  }

  /**
   * If element edge A is outside scrolling box edge A and element height is less than scrolling box height
   *
   *          ┌──┐
   *        ┏━│━━│━┓         ┏━┌━━┐━┓
   *          └──┘             │  │
   *  from  ┃      ┃     to  ┃ └──┘ ┃
   *
   *        ┗━ ━━ ━┛         ┗━ ━━ ━┛
   *
   * If element edge B is outside scrolling box edge B and element height is greater than scrolling box height
   *
   *        ┏━ ━━ ━┓         ┏━┌━━┐━┓
   *                           │  │
   *  from  ┃ ┌──┐ ┃     to  ┃ │  │ ┃
   *          │  │             │  │
   *        ┗━│━━│━┛         ┗━│━━│━┛
   *          │  │             └──┘
   *          │  │
   *          └──┘
   *
   * If element edge C is outside scrolling box edge C and element width is less than scrolling box width
   *
   *       from                 to
   *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *  ┌───┐                 ┌───┐
   *  │ ┃ │       ┃         ┃   │     ┃
   *  └───┘                 └───┘
   *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   * If element edge D is outside scrolling box edge D and element width is greater than scrolling box width
   *
   *       from                 to
   *    ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *        ┌───────────┐   ┌───────────┐
   *    ┃   │     ┃     │   ┃         ┃ │
   *        └───────────┘   └───────────┘
   *    ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   */
  if (
    (elementEdgeStart <= scrollingEdgeStart && elementSize <= scrollingSize) ||
    (elementEdgeEnd >= scrollingEdgeEnd && elementSize >= scrollingSize)
  ) {
    return elementEdgeStart - scrollingEdgeStart - scrollingBorderStart
  }

  /**
   * If element edge B is outside scrolling box edge B and element height is less than scrolling box height
   *
   *        ┏━ ━━ ━┓         ┏━ ━━ ━┓
   *
   *  from  ┃      ┃     to  ┃ ┌──┐ ┃
   *          ┌──┐             │  │
   *        ┗━│━━│━┛         ┗━└━━┘━┛
   *          └──┘
   *
   * If element edge A is outside scrolling box edge A and element height is greater than scrolling box height
   *
   *          ┌──┐
   *          │  │
   *          │  │             ┌──┐
   *        ┏━│━━│━┓         ┏━│━━│━┓
   *          │  │             │  │
   *  from  ┃ └──┘ ┃     to  ┃ │  │ ┃
   *                           │  │
   *        ┗━ ━━ ━┛         ┗━└━━┘━┛
   *
   * If element edge C is outside scrolling box edge C and element width is greater than scrolling box width
   *
   *           from                 to
   *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *  ┌───────────┐           ┌───────────┐
   *  │     ┃     │   ┃       │ ┃         ┃
   *  └───────────┘           └───────────┘
   *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   * If element edge D is outside scrolling box edge D and element width is less than scrolling box width
   *
   *           from                 to
   *        ┏ ━ ━ ━ ━ ┓         ┏ ━ ━ ━ ━ ┓
   *                ┌───┐             ┌───┐
   *        ┃       │ ┃ │       ┃     │   ┃
   *                └───┘             └───┘
   *        ┗ ━ ━ ━ ━ ┛         ┗ ━ ━ ━ ━ ┛
   *
   */
  if (
    (elementEdgeEnd > scrollingEdgeEnd && elementSize < scrollingSize) ||
    (elementEdgeStart < scrollingEdgeStart && elementSize > scrollingSize)
  ) {
    return elementEdgeEnd - scrollingEdgeEnd + scrollingBorderEnd
  }

  return 0
}

// Only HTMLElement objects have offset[Width|Height], but any Element might pass by here. `instanceof HTMLElement`
// would miss elements from other frames, which have their own HTMLElement, so check for the properties instead
const hasOffsetWidth = (el: Element): el is HTMLElement => 'offsetWidth' in el
const hasOffsetHeight = (el: Element): el is HTMLElement => 'offsetHeight' in el

const isShadowRoot = (node: Node): node is ShadowRoot => 'host' in node

const getParentElement = (element: Node): Element | null => {
  const parent = element.parentElement
  if (parent == null) {
    const root = element.getRootNode()
    return isShadowRoot(root) ? root.host || null : null
  }
  return parent
}

const getScrollMargins = (target: Element) => {
  const computedStyle = window.getComputedStyle(target)
  return {
    top: parseFloat(computedStyle.scrollMarginTop) || 0,
    right: parseFloat(computedStyle.scrollMarginRight) || 0,
    bottom: parseFloat(computedStyle.scrollMarginBottom) || 0,
    left: parseFloat(computedStyle.scrollMarginLeft) || 0,
  }
}

/**
 * Which axis is the block axis, and whether the start edge of each physical axis is its right or bottom edge, for a
 * box with this writing mode and direction: https://drafts.csswg.org/css-writing-modes-4/#logical-to-physical
 * A scroll container whose start edge is on the right or bottom has negative scroll offsets on that axis
 */
const getFlowDirections = (style: CSSStyleDeclaration) => {
  const { writingMode, direction } = style
  const rtl = direction === 'rtl'
  // Also matches the legacy `tb`, `tb-rl` values
  const vertical = /^(vertical|sideways|tb)/.test(writingMode)
  if (!vertical) {
    return { vertical, xStartIsRight: rtl, yStartIsBottom: false }
  }
  return {
    vertical,
    xStartIsRight: !writingMode.endsWith('lr'),
    // Lines in sideways-lr run bottom to top
    yStartIsBottom: writingMode === 'sideways-lr' ? !rtl : rtl,
  }
}

// `start` and `end` of a physical axis, where `start` is the top or left edge
const toPhysical = (
  position: ScrollLogicalPosition,
  startIsBottomOrRight: boolean
): ScrollLogicalPosition =>
  !startIsBottomOrRight
    ? position
    : position === 'start'
      ? 'end'
      : position === 'end'
        ? 'start'
        : position

// Keeps a scroll offset within the scroll container's range, which is negative when its start edge is the right or
// bottom one
const clampScroll = (
  offset: number,
  max: number,
  startIsBottomOrRight: boolean
) =>
  startIsBottomOrRight
    ? Math.min(0, Math.max(offset, -max))
    : Math.max(0, Math.min(offset, max))

export const compute = (target: Element, options: Options): ScrollAction[] => {
  if (typeof document === 'undefined') {
    // If there's no DOM we assume it's not in a browser environment
    return []
  }

  const {
    scrollMode,
    block: logicalBlock = 'center',
    inline: logicalInline = 'nearest',
    boundary,
    skipOverflowHiddenElements,
  } = options
  // Allow using a callback to check the boundary
  // The default behavior is to check if the current target matches the boundary element or not
  // If undefined it'll check that target is never undefined (can happen as we recurse up the tree)
  const checkBoundary =
    typeof boundary === 'function' ? boundary : (node: any) => node !== boundary

  if (!isElement(target)) {
    throw new TypeError('Invalid target')
  }

  // Used to handle the top most element that can be scrolled
  const scrollingElement = document.scrollingElement || document.documentElement

  // Collect all the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  const frames: Element[] = []
  let cursor: Element | null = target
  while (isElement(cursor) && checkBoundary(cursor)) {
    // Move cursor to parent
    cursor = getParentElement(cursor)

    // Stop when we reach the viewport
    if (cursor === scrollingElement) {
      frames.push(cursor)
      break
    }

    // Skip document.body if it's not the scrollingElement and documentElement isn't independently scrollable
    if (
      cursor != null &&
      cursor === document.body &&
      isScrollable(cursor) &&
      !isScrollable(document.documentElement)
    ) {
      continue
    }

    // Now we check if the element is scrollable, this code only runs if the loop haven't already hit the viewport or a custom boundary
    if (cursor != null && isScrollable(cursor, skipOverflowHiddenElements)) {
      frames.push(cursor)
    }
  }

  // Support pinch-zooming properly, making sure elements scroll into the visual viewport
  // Browsers that don't support visualViewport will report the layout viewport dimensions on document.documentElement.clientWidth/Height
  // and viewport dimensions on window.innerWidth/Height
  // https://www.quirksmode.org/mobile/viewports2.html
  // https://bokand.github.io/viewport/index.html
  const viewportWidth = window.visualViewport?.width ?? innerWidth
  const viewportHeight = window.visualViewport?.height ?? innerHeight
  const { scrollX, scrollY } = window

  // Alignment follows the target's writing mode and direction in every scroll container, like browsers do, rather
  // than each scroll container's own as the spec says: https://github.com/w3c/csswg-drafts/issues/11796
  // From here on `start` means the top or left edge
  const targetFlow = getFlowDirections(getComputedStyle(target))
  const alignY = toPhysical(
    targetFlow.vertical ? logicalInline : logicalBlock,
    targetFlow.yStartIsBottom
  )
  const alignX = toPhysical(
    targetFlow.vertical ? logicalBlock : logicalInline,
    targetFlow.xStartIsRight
  )

  const {
    height: targetHeight,
    width: targetWidth,
    top: targetTop,
    right: targetRight,
    bottom: targetBottom,
    left: targetLeft,
  } = target.getBoundingClientRect()
  const {
    top: marginTop,
    right: marginRight,
    bottom: marginBottom,
    left: marginLeft,
  } = getScrollMargins(target)

  // These values mutate as we loop through and generate scroll coordinates
  let targetBlock: number =
    alignY === 'start' || alignY === 'nearest'
      ? targetTop - marginTop
      : alignY === 'end'
        ? targetBottom + marginBottom
        : targetTop + targetHeight / 2 - marginTop + marginBottom // alignY === 'center'
  let targetInline: number =
    alignX === 'center'
      ? targetLeft + targetWidth / 2 - marginLeft + marginRight
      : alignX === 'end'
        ? targetRight + marginRight
        : targetLeft - marginLeft // alignX === 'start' || alignX === 'nearest'

  // Collect new scroll positions
  const computations: ScrollAction[] = []
  // In chrome there's no longer a difference between caching the `frames.length` to a var or not, so we don't in this case (size > speed anyways)
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]

    // @TODO add a shouldScroll hook here that allows userland code to take control

    const { height, width, top, right, bottom, left } =
      frame.getBoundingClientRect()

    // If the element is already visible we can end it here
    // @TODO targetBlock and targetInline should be taken into account to be compliant with https://github.com/w3c/csswg-drafts/pull/1805/files#diff-3c17f0e43c20f8ecf89419d49e7ef5e0R1333
    if (
      scrollMode === 'if-needed' &&
      targetTop >= 0 &&
      targetLeft >= 0 &&
      targetBottom <= viewportHeight &&
      targetRight <= viewportWidth &&
      // scrollingElement is added to the frames array even if it's not scrollable, in which case checking its bounds is not required
      ((frame === scrollingElement && !isScrollable(frame)) ||
        (targetTop >= top &&
          targetBottom <= bottom &&
          targetLeft >= left &&
          targetRight <= right))
    ) {
      // Break the loop and return the computations for things that are not fully visible
      return computations
    }

    const frameStyle = getComputedStyle(frame)
    const borderLeft = parseInt(frameStyle.borderLeftWidth, 10)
    const borderTop = parseInt(frameStyle.borderTopWidth, 10)
    const borderRight = parseInt(frameStyle.borderRightWidth, 10)
    const borderBottom = parseInt(frameStyle.borderBottomWidth, 10)

    let blockScroll: number = 0
    let inlineScroll: number = 0

    // Borders, plus the scrollbar on whichever side it is, like the left in right-to-left scroll containers
    const insetLeft = hasOffsetWidth(frame) ? frame.clientLeft : borderLeft
    const insetRight = hasOffsetWidth(frame)
      ? frame.offsetWidth - frame.clientLeft - frame.clientWidth
      : borderRight
    const insetTop = hasOffsetHeight(frame) ? frame.clientTop : borderTop
    const insetBottom = hasOffsetHeight(frame)
      ? frame.offsetHeight - frame.clientTop - frame.clientHeight
      : borderBottom

    const scaleX = hasOffsetWidth(frame)
      ? frame.offsetWidth === 0
        ? 0
        : width / frame.offsetWidth
      : 0
    const scaleY = hasOffsetHeight(frame)
      ? frame.offsetHeight === 0
        ? 0
        : height / frame.offsetHeight
      : 0

    if (scrollingElement === frame) {
      // Handle viewport logic (document.documentElement or document.body)

      if (alignY === 'start') {
        blockScroll = targetBlock
      } else if (alignY === 'end') {
        blockScroll = targetBlock - viewportHeight
      } else if (alignY === 'nearest') {
        blockScroll = alignNearest(
          scrollY,
          scrollY + viewportHeight,
          viewportHeight,
          borderTop,
          borderBottom,
          scrollY + targetBlock,
          scrollY + targetBlock + targetHeight,
          targetHeight
        )
      } else {
        // alignY === 'center' is the default
        blockScroll = targetBlock - viewportHeight / 2
      }

      if (alignX === 'start') {
        inlineScroll = targetInline
      } else if (alignX === 'center') {
        inlineScroll = targetInline - viewportWidth / 2
      } else if (alignX === 'end') {
        inlineScroll = targetInline - viewportWidth
      } else {
        // alignX === 'nearest' is the default
        inlineScroll = alignNearest(
          scrollX,
          scrollX + viewportWidth,
          viewportWidth,
          borderLeft,
          borderRight,
          scrollX + targetInline,
          scrollX + targetInline + targetWidth,
          targetWidth
        )
      }

      // Apply scroll position offsets and ensure they are within bounds, which are negative when the root's writing
      // mode and direction make it overflow to the left or top
      // @TODO add more test cases to cover this 100%
      const rootFlow = getFlowDirections(
        getComputedStyle(document.documentElement)
      )
      blockScroll = clampScroll(
        blockScroll + scrollY,
        Infinity,
        rootFlow.yStartIsBottom
      )
      inlineScroll = clampScroll(
        inlineScroll + scrollX,
        Infinity,
        rootFlow.xStartIsRight
      )
    } else {
      // Handle each scrolling frame that might exist between the target and the viewport
      if (alignY === 'start') {
        blockScroll = targetBlock - top - insetTop
      } else if (alignY === 'end') {
        blockScroll = targetBlock - bottom + insetBottom
      } else if (alignY === 'nearest') {
        blockScroll = alignNearest(
          top,
          bottom,
          height,
          insetTop,
          insetBottom,
          targetBlock,
          targetBlock + targetHeight,
          targetHeight
        )
      } else {
        // alignY === 'center' is the default
        blockScroll =
          targetBlock - (top + height / 2) - (insetTop - insetBottom) / 2
      }

      if (alignX === 'start') {
        inlineScroll = targetInline - left - insetLeft
      } else if (alignX === 'center') {
        inlineScroll =
          targetInline - (left + width / 2) - (insetLeft - insetRight) / 2
      } else if (alignX === 'end') {
        inlineScroll = targetInline - right + insetRight
      } else {
        // alignX === 'nearest' is the default
        inlineScroll = alignNearest(
          left,
          right,
          width,
          insetLeft,
          insetRight,
          targetInline,
          targetInline + targetWidth,
          targetWidth
        )
      }

      const { scrollLeft, scrollTop } = frame
      // Ensure scroll coordinates are not out of bounds while applying scroll offsets. The offsets are negative on
      // axes where the scroll container's own writing mode and direction make it overflow to the left or top
      const frameFlow = getFlowDirections(frameStyle)
      blockScroll =
        scaleY === 0
          ? 0
          : clampScroll(
              scrollTop + blockScroll / scaleY,
              frame.scrollHeight - frame.clientHeight,
              frameFlow.yStartIsBottom
            )
      inlineScroll =
        scaleX === 0
          ? 0
          : clampScroll(
              scrollLeft + inlineScroll / scaleX,
              frame.scrollWidth - frame.clientWidth,
              frameFlow.xStartIsRight
            )

      // Cache the offset so that parent frames can scroll this into view correctly
      targetBlock += scrollTop - blockScroll
      targetInline += scrollLeft - inlineScroll
    }

    computations.push({ el: frame, top: blockScroll, left: inlineScroll })
  }

  return computations
}
