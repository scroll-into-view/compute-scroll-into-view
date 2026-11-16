// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

/**
 * Which scroll containers to scroll: https://drafts.csswg.org/cssom-view/#enumdef-scrollintoviewcontainer
 */
export type ScrollIntoViewContainer = 'all' | 'nearest'

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
   * Like the [`container`](https://drafts.csswg.org/cssom-view/#dom-scrollintoviewoptions-container) option of
   * `Element.scrollIntoView()`. `'all'` scrolls every scroll container of the target, up to and including the
   * viewport. `'nearest'` only scrolls the target's nearest scroll container, or the viewport if it has none.
   * @default 'all'
   */
  container?: ScrollIntoViewContainer
  /**
   * Change which ancestors are scrolled, and how they are measured. Run in order for every ancestor of the target,
   * innermost first, up to the viewport. Without middleware `compute` follows the spec.
   * @default []
   */
  middleware?: Middleware[]
}

export interface ScrollAction {
  el: Element
  top: number
  left: number
}

/** Edges in viewport coordinates, like `getBoundingClientRect()`, or the lengths of the sides of a box in pixels */
export interface SideObject {
  top: number
  right: number
  bottom: number
  left: number
}

/** What a scroll container is aligned with. Everything is measured before anything is scrolled */
export interface Rects {
  /** The scroll container's scrollport: its padding box without scrollbars. For the viewport, the visual viewport */
  scrollport: SideObject
  /** The target's border box. The scrolling of inner scroll containers is added to it when it's aligned */
  target: SideObject
  /** The scroll container's `scroll-padding`, in pixels. For the viewport, the root element's */
  scrollPadding: SideObject
  /** The target's `scroll-margin`, in pixels */
  scrollMargin: SideObject
}

export interface MiddlewareState {
  /** The element that is scrolled into view */
  readonly target: Element
  /** The ancestor of the target that is considered */
  readonly container: Element
  /** Whether `container` is the scrolling element of the document, which scrolls the viewport. It's the last one */
  readonly viewport: boolean
  /** Whether `container` gets scrolled: it's a scroll container, and no middleware so far returned `scrollable: false` */
  readonly scrollable: boolean
  /** The options, with their defaults */
  readonly options: Readonly<
    Required<Pick<Options, 'block' | 'inline' | 'container'>>
  >
  /** Measured the first time it's read, and with what earlier middleware returned in `rects` */
  readonly rects: Rects
  /**
   * The viewport's `rects`, with what earlier middleware return in `rects` for the viewport. Reading it before the
   * viewport is reached calls the earlier middleware for the viewport, so keep them free of side effects
   */
  readonly viewportRects: Rects
}

export interface MiddlewareReturn {
  /** Whether `container` gets scrolled. `false` leaves it alone, the target is aligned in the outer ones regardless */
  scrollable?: boolean
  /** Don't consider the ancestors of `container`. Together with `scrollable: false`, not `container` either */
  stop?: boolean
  /** Use these measurements instead, for the middleware after this one and for aligning the target */
  rects?: Partial<Rects>
}

/** Like the [middleware of Floating UI](https://floating-ui.com/docs/middleware) */
export interface Middleware {
  name: string
  /** Returns `{}` to change nothing */
  fn: (state: MiddlewareState) => MiddlewareReturn
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
  elementEdgeStart: number,
  elementEdgeEnd: number
) => {
  const scrollingSize = scrollingEdgeEnd - scrollingEdgeStart
  const elementSize = elementEdgeEnd - elementEdgeStart

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
    return elementEdgeStart - scrollingEdgeStart
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
    return elementEdgeEnd - scrollingEdgeEnd
  }

  return 0
}

const alignAxis = (
  position: ScrollLogicalPosition,
  scrollingEdgeStart: number,
  scrollingEdgeEnd: number,
  elementEdgeStart: number,
  elementEdgeEnd: number
) => {
  if (position === 'start') {
    return elementEdgeStart - scrollingEdgeStart
  }
  if (position === 'end') {
    return elementEdgeEnd - scrollingEdgeEnd
  }
  if (position === 'nearest') {
    return alignNearest(
      scrollingEdgeStart,
      scrollingEdgeEnd,
      elementEdgeStart,
      elementEdgeEnd
    )
  }
  // position === 'center'
  return (
    (elementEdgeStart + elementEdgeEnd) / 2 -
    (scrollingEdgeStart + scrollingEdgeEnd) / 2
  )
}

const isVisible = (region: SideObject, box: SideObject) =>
  box.top >= region.top &&
  box.right <= region.right &&
  box.bottom <= region.bottom &&
  box.left >= region.left

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

// `scroll-padding` is `auto` (resolved to 0) or a length or percentage, relative to the size of the scrollport
const resolvePadding = (value: string, scrollportSize: number, scale: number) =>
  (value.endsWith('%')
    ? (parseFloat(value) / 100) * scrollportSize
    : parseFloat(value) * scale) || 0

const getScrollPadding = (
  style: CSSStyleDeclaration,
  scrollport: SideObject,
  scaleX: number,
  scaleY: number
): SideObject => {
  const width = scrollport.right - scrollport.left
  const height = scrollport.bottom - scrollport.top
  return {
    top: resolvePadding(style.scrollPaddingTop, height, scaleY),
    right: resolvePadding(style.scrollPaddingRight, width, scaleX),
    bottom: resolvePadding(style.scrollPaddingBottom, height, scaleY),
    left: resolvePadding(style.scrollPaddingLeft, width, scaleX),
  }
}

// The optimal viewing region is the scrollport, inset by `scroll-padding`, in viewport coordinates
const getRegion = ({ scrollport, scrollPadding }: Rects): SideObject => ({
  top: scrollport.top + scrollPadding.top,
  right: scrollport.right - scrollPadding.right,
  bottom: scrollport.bottom - scrollPadding.bottom,
  left: scrollport.left + scrollPadding.left,
})

// The scroll-margin box of the target is what gets aligned
const getTargetBox = ({ target, scrollMargin }: Rects): SideObject => ({
  top: target.top - scrollMargin.top,
  right: target.right + scrollMargin.right,
  bottom: target.bottom + scrollMargin.bottom,
  left: target.left - scrollMargin.left,
})

const getScrollingElement = () =>
  document.scrollingElement || document.documentElement

// Support pinch-zooming properly, making sure elements scroll into the visual viewport
// Browsers that don't support visualViewport will report the layout viewport dimensions on document.documentElement.clientWidth/Height
// and viewport dimensions on window.innerWidth/Height
// https://www.quirksmode.org/mobile/viewports2.html
// https://bokand.github.io/viewport/index.html
const getViewportRects = (target: SideObject, scrollMargin: SideObject) => {
  const scrollport = {
    top: 0,
    right: window.visualViewport?.width ?? innerWidth,
    bottom: window.visualViewport?.height ?? innerHeight,
    left: 0,
  }
  return {
    scrollport,
    target,
    // The viewport's scroll-padding is set on the root element, also when the scrolling element is the body
    scrollPadding: getScrollPadding(
      getComputedStyle(document.documentElement),
      scrollport,
      1,
      1
    ),
    scrollMargin,
  }
}

// The scrollport of a scroll container, and how much transforms scale it
const measureFrame = (frame: Element, frameStyle: CSSStyleDeclaration) => {
  const { height, width, top, right, bottom, left } =
    frame.getBoundingClientRect()

  // Borders, plus the scrollbar on whichever side it is, like the left in right-to-left scroll containers
  const insetLeft = hasOffsetWidth(frame)
    ? frame.clientLeft
    : parseInt(frameStyle.borderLeftWidth, 10)
  const insetRight = hasOffsetWidth(frame)
    ? frame.offsetWidth - frame.clientLeft - frame.clientWidth
    : parseInt(frameStyle.borderRightWidth, 10)
  const insetTop = hasOffsetHeight(frame)
    ? frame.clientTop
    : parseInt(frameStyle.borderTopWidth, 10)
  const insetBottom = hasOffsetHeight(frame)
    ? frame.offsetHeight - frame.clientTop - frame.clientHeight
    : parseInt(frameStyle.borderBottomWidth, 10)

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

  return {
    scrollport: {
      top: top + insetTop * scaleY,
      right: right - insetRight * scaleX,
      bottom: bottom - insetBottom * scaleY,
      left: left + insetLeft * scaleX,
    },
    scaleX,
    scaleY,
  }
}

export const compute = (
  target: Element,
  options: Options = {}
): ScrollAction[] => {
  if (typeof document === 'undefined') {
    // If there's no DOM we assume it's not in a browser environment
    return []
  }

  const {
    block = 'center',
    inline = 'nearest',
    container = 'all',
    middleware = [],
  } = options
  const resolvedOptions = { block, inline, container }

  if (!isElement(target)) {
    throw new TypeError('Invalid target')
  }

  // Used to handle the top most element that can be scrolled
  const scrollingElement = getScrollingElement()
  const { scrollX, scrollY } = window

  // Alignment follows the target's writing mode and direction in every scroll container, like browsers do, rather
  // than each scroll container's own as the spec says: https://github.com/w3c/csswg-drafts/issues/11796
  // From here on `start` means the top or left edge
  const targetFlow = getFlowDirections(getComputedStyle(target))
  const alignY = toPhysical(
    targetFlow.vertical ? inline : block,
    targetFlow.yStartIsBottom
  )
  const alignX = toPhysical(
    targetFlow.vertical ? block : inline,
    targetFlow.xStartIsRight
  )

  const { top, right, bottom, left } = target.getBoundingClientRect()
  const targetRect = { top, right, bottom, left }
  const scrollMargin = getScrollMargins(target)

  // How much the inner scroll containers move the target, in the order they scroll
  const blockShifts: number[] = []
  const inlineShifts: number[] = []

  // Runs the first `count` middleware for an ancestor of the target
  const visit = (frame: Element, count: number) => {
    const viewport = frame === scrollingElement
    let style: CSSStyleDeclaration | undefined
    const getStyle = () => (style ??= getComputedStyle(frame))
    let measured: ReturnType<typeof measureFrame> | undefined
    let rects: Rects | undefined
    const measure = (): Rects => {
      if (viewport) {
        return getViewportRects(
          Object.assign({}, targetRect),
          Object.assign({}, scrollMargin)
        )
      }
      measured = measureFrame(frame, getStyle())
      return {
        scrollport: measured.scrollport,
        target: Object.assign({}, targetRect),
        scrollPadding: getScrollPadding(
          getStyle(),
          measured.scrollport,
          measured.scaleX,
          measured.scaleY
        ),
        scrollMargin: Object.assign({}, scrollMargin),
      }
    }
    const getRects = () => (rects ??= measure())

    let scrollable =
      viewport ||
      (isScrollable(frame) &&
        // Skip document.body if it's not the scrollingElement and documentElement isn't independently scrollable
        !(frame === document.body && !isScrollable(document.documentElement)))
    let stop = viewport
    for (let index = 0; index < count; index++) {
      const result = middleware[index].fn({
        target,
        container: frame,
        viewport,
        scrollable,
        options: resolvedOptions,
        get rects() {
          return getRects()
        },
        get viewportRects() {
          return viewport ? getRects() : visit(scrollingElement, index).rects()
        },
      })
      if (result.scrollable !== undefined) scrollable = result.scrollable
      if (result.stop) stop = true
      if (result.rects) rects = Object.assign({}, getRects(), result.rects)
    }
    return {
      viewport,
      scrollable,
      stop,
      rects: getRects,
      style: getStyle,
      // How transforms scale the scroll container, once its rects are measured
      scale: () => measured ?? measureFrame(frame, getStyle()),
    }
  }

  // Collect new scroll positions
  const computations: ScrollAction[] = []
  // Walk the ancestors for the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  let cursor: Element | null = getParentElement(target)
  while (isElement(cursor)) {
    const frame: Element = cursor
    const visited = visit(frame, middleware.length)
    const { viewport, scrollable } = visited
    let { stop } = visited

    if (scrollable) {
      const rects = visited.rects()
      const region = getRegion(rects)
      const box = getTargetBox(rects)
      for (const shift of blockShifts) {
        box.top += shift
        box.bottom += shift
      }
      for (const shift of inlineShifts) {
        box.left += shift
        box.right += shift
      }

      let blockScroll: number = alignAxis(
        alignY,
        region.top,
        region.bottom,
        box.top,
        box.bottom
      )
      let inlineScroll: number = alignAxis(
        alignX,
        region.left,
        region.right,
        box.left,
        box.right
      )

      if (viewport) {
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
        // A middleware may have measured the rects for this frame, or replaced them
        const { scaleX, scaleY } = visited.scale()
        const { scrollLeft, scrollTop } = frame
        // Ensure scroll coordinates are not out of bounds while applying scroll offsets. The offsets are negative on
        // axes where the scroll container's own writing mode and direction make it overflow to the left or top
        const frameFlow = getFlowDirections(visited.style())
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
        blockShifts.push(scrollTop - blockScroll)
        inlineShifts.push(scrollLeft - inlineScroll)
      }

      computations.push({ el: frame, top: blockScroll, left: inlineScroll })

      // `scrollIntoView()` passes the target itself as the container for 'nearest', and every scroll container of the
      // target is its ancestor, so the loop stops after the first one
      if (container === 'nearest') {
        stop = true
      }
    }

    if (stop) {
      break
    }
    cursor = getParentElement(frame)
  }

  return computations
}

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
