// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

// add support for visualViewport object currently implemented in chrome
interface visualViewport {
  height: number
  width: number
}

type ScrollLogicalPosition = 'start' | 'center' | 'end' | 'nearest'
// This new option is tracked in this PR, which is the most likely candidate at the time: https://github.com/w3c/csswg-drafts/pull/1805
type ScrollMode = 'always' | 'if-needed'
// New option that skips auto-scrolling all nodes with overflow: hidden set
// See FF implementation: https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18
type SkipOverflowHiddenElements = boolean

interface Options {
  block?: ScrollLogicalPosition
  inline?: ScrollLogicalPosition
  scrollMode?: ScrollMode
  boundary?: CustomScrollBoundary
  skipOverflowHiddenElements?: SkipOverflowHiddenElements
}

// Custom behavior, not in any spec
type CustomScrollBoundaryCallback = (parent: Element) => boolean
type CustomScrollBoundary = Element | CustomScrollBoundaryCallback | null
interface CustomScrollAction {
  el: Element
  top: number
  left: number
}

// @TODO better shadowdom test, 11 = document fragment
function isElement(el: any) {
  return el != null && typeof el === 'object' && el.nodeType === 1
}

function canOverflow(
  overflow: string | null,
  skipOverflowHiddenElements?: boolean
) {
  if (skipOverflowHiddenElements && overflow === 'hidden') {
    return false
  }

  return overflow !== 'visible' && overflow !== 'clip'
}

function getFrameElement(el: Element) {
  if (!el.ownerDocument || !el.ownerDocument.defaultView) {
    return null
  }

  try {
    return el.ownerDocument.defaultView.frameElement
  } catch (e) {
    return null
  }
}

function isHiddenByFrame(el: Element): boolean {
  const frame = getFrameElement(el)
  if (!frame) {
    return false
  }

  return (
    frame.clientHeight < el.scrollHeight || frame.clientWidth < el.scrollWidth
  )
}

function isScrollable(el: Element, skipOverflowHiddenElements?: boolean) {
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
function alignNearest(
  scrollingEdgeStart: number,
  scrollingEdgeEnd: number,
  scrollingSize: number,
  scrollingBorderStart: number,
  scrollingBorderEnd: number,
  elementEdgeStart: number,
  elementEdgeEnd: number,
  elementSize: number
) {
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

export default (target: Element, options: Options): CustomScrollAction[] => {
  //TODO: remove this hack when microbundle will support typescript >= 4.0
  const windowWithViewport = (window as unknown) as Window & {
    visualViewport: visualViewport
  }

  const {
    scrollMode,
    block,
    inline,
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
  let cursor = target
  while (isElement(cursor) && checkBoundary(cursor)) {
    // Move cursor to parent
    cursor = cursor.parentNode as Element

    // Stop when we reach the viewport
    if (cursor === scrollingElement) {
      frames.push(cursor)
      break
    }

    // Skip document.body if it's not the scrollingElement and documentElement isn't independently scrollable
    if (
      cursor === document.body &&
      isScrollable(cursor) &&
      !isScrollable(document.documentElement as HTMLElement)
    ) {
      continue
    }

    // Now we check if the element is scrollable, this code only runs if the loop haven't already hit the viewport or a custom boundary
    if (isScrollable(cursor, skipOverflowHiddenElements)) {
      frames.push(cursor)
    }
  }

  // Support pinch-zooming properly, making sure elements scroll into the visual viewport
  // Browsers that don't support visualViewport will report the layout viewport dimensions on document.documentElement.clientWidth/Height
  // and viewport dimensions on window.innerWidth/Height
  // https://www.quirksmode.org/mobile/viewports2.html
  // https://bokand.github.io/viewport/index.html
  const viewportWidth = windowWithViewport.visualViewport
    ? windowWithViewport.visualViewport.width
    : innerWidth
  const viewportHeight = windowWithViewport.visualViewport
    ? windowWithViewport.visualViewport.height
    : innerHeight

  // Newer browsers supports scroll[X|Y], page[X|Y]Offset is
  const viewportX = window.scrollX || pageXOffset
  const viewportY = window.scrollY || pageYOffset

  const {
    height: targetHeight,
    width: targetWidth,
    top: targetTop,
    right: targetRight,
    bottom: targetBottom,
    left: targetLeft,
  } = target.getBoundingClientRect()

  // These values mutate as we loop through and generate scroll coordinates
  let targetBlock: number =
    block === 'start' || block === 'nearest'
      ? targetTop
      : block === 'end'
      ? targetBottom
      : targetTop + targetHeight / 2 // block === 'center
  let targetInline: number =
    inline === 'center'
      ? targetLeft + targetWidth / 2
      : inline === 'end'
      ? targetRight
      : targetLeft // inline === 'start || inline === 'nearest

  // Collect new scroll positions
  const computations: CustomScrollAction[] = []
  // In chrome there's no longer a difference between caching the `frames.length` to a var or not, so we don't in this case (size > speed anyways)
  for (let index = 0; index < frames.length; index++) {
    const frame = frames[index]

    // @TODO add a shouldScroll hook here that allows userland code to take control

    const {
      height,
      width,
      top,
      right,
      bottom,
      left,
    } = frame.getBoundingClientRect()

    // If the element is already visible we can end it here
    // @TODO targetBlock and targetInline should be taken into account to be compliant with https://github.com/w3c/csswg-drafts/pull/1805/files#diff-3c17f0e43c20f8ecf89419d49e7ef5e0R1333
    if (
      scrollMode === 'if-needed' &&
      targetTop >= 0 &&
      targetLeft >= 0 &&
      targetBottom <= viewportHeight &&
      targetRight <= viewportWidth &&
      targetTop >= top &&
      targetBottom <= bottom &&
      targetLeft >= left &&
      targetRight <= right
    ) {
      // Break the loop and return the computations for things that are not fully visible
      return computations
    }

    const frameStyle = getComputedStyle(frame)
    const borderLeft = parseInt(frameStyle.borderLeftWidth as string, 10)
    const borderTop = parseInt(frameStyle.borderTopWidth as string, 10)
    const borderRight = parseInt(frameStyle.borderRightWidth as string, 10)
    const borderBottom = parseInt(frameStyle.borderBottomWidth as string, 10)

    let blockScroll: number = 0
    let inlineScroll: number = 0

    // The property existance checks for offfset[Width|Height] is because only HTMLElement objects have them, but any Element might pass by here
    // @TODO find out if the "as HTMLElement" overrides can be dropped
    const scrollbarWidth =
      'offsetWidth' in frame
        ? (frame as HTMLElement).offsetWidth -
          (frame as HTMLElement).clientWidth -
          borderLeft -
          borderRight
        : 0
    const scrollbarHeight =
      'offsetHeight' in frame
        ? (frame as HTMLElement).offsetHeight -
          (frame as HTMLElement).clientHeight -
          borderTop -
          borderBottom
        : 0

    if (scrollingElement === frame) {
      // Handle viewport logic (document.documentElement or document.body)

      if (block === 'start') {
        blockScroll = targetBlock
      } else if (block === 'end') {
        blockScroll = targetBlock - viewportHeight
      } else if (block === 'nearest') {
        blockScroll = alignNearest(
          viewportY,
          viewportY + viewportHeight,
          viewportHeight,
          borderTop,
          borderBottom,
          viewportY + targetBlock,
          viewportY + targetBlock + targetHeight,
          targetHeight
        )
      } else {
        // block === 'center' is the default
        blockScroll = targetBlock - viewportHeight / 2
      }

      if (inline === 'start') {
        inlineScroll = targetInline
      } else if (inline === 'center') {
        inlineScroll = targetInline - viewportWidth / 2
      } else if (inline === 'end') {
        inlineScroll = targetInline - viewportWidth
      } else {
        // inline === 'nearest' is the default
        inlineScroll = alignNearest(
          viewportX,
          viewportX + viewportWidth,
          viewportWidth,
          borderLeft,
          borderRight,
          viewportX + targetInline,
          viewportX + targetInline + targetWidth,
          targetWidth
        )
      }

      // Apply scroll position offsets and ensure they are within bounds
      // @TODO add more test cases to cover this 100%
      blockScroll = Math.max(0, blockScroll + viewportY)
      inlineScroll = Math.max(0, inlineScroll + viewportX)
    } else {
      // Handle each scrolling frame that might exist between the target and the viewport

      if (block === 'start') {
        blockScroll = targetBlock - top - borderTop
      } else if (block === 'end') {
        blockScroll = targetBlock - bottom + borderBottom + scrollbarHeight
      } else if (block === 'nearest') {
        blockScroll = alignNearest(
          top,
          bottom,
          height,
          borderTop,
          borderBottom + scrollbarHeight,
          targetBlock,
          targetBlock + targetHeight,
          targetHeight
        )
      } else {
        // block === 'center' is the default
        blockScroll = targetBlock - (top + height / 2) + scrollbarHeight / 2
      }

      if (inline === 'start') {
        inlineScroll = targetInline - left - borderLeft
      } else if (inline === 'center') {
        inlineScroll = targetInline - (left + width / 2) + scrollbarWidth / 2
      } else if (inline === 'end') {
        inlineScroll = targetInline - right + borderRight + scrollbarWidth
      } else {
        // inline === 'nearest' is the default
        inlineScroll = alignNearest(
          left,
          right,
          width,
          borderLeft,
          borderRight + scrollbarWidth,
          targetInline,
          targetInline + targetWidth,
          targetWidth
        )
      }

      const { scrollLeft, scrollTop } = frame
      // Ensure scroll coordinates are not out of bounds while applying scroll offsets
      blockScroll = Math.max(
        0,
        Math.min(
          scrollTop + blockScroll,
          frame.scrollHeight - height + scrollbarHeight
        )
      )
      inlineScroll = Math.max(
        0,
        Math.min(
          scrollLeft + inlineScroll,
          frame.scrollWidth - width + scrollbarWidth
        )
      )

      // Cache the offset so that parent frames can scroll this into view correctly
      targetBlock += scrollTop - blockScroll
      targetInline += scrollLeft - inlineScroll
    }

    computations.push({ el: frame, top: blockScroll, left: inlineScroll })
  }

  return computations
}
