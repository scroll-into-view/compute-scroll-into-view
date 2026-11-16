// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

import {
  getFrameElement,
  getParentElement,
  getRegion,
  getTargetBox,
  isScrollable,
} from './shared.js'

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

export type ComputeOptions = Options

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

// Only HTMLElement objects have offset[Width|Height], but any Element might pass by here. `instanceof HTMLElement`
// would miss elements from other frames, which have their own HTMLElement, so check for the properties instead
const hasOffsetWidth = (el: Element): el is HTMLElement => 'offsetWidth' in el
const hasOffsetHeight = (el: Element): el is HTMLElement => 'offsetHeight' in el

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

// A `scroll-snap-align` value other than `none`
const isSnapPosition = (value: string): value is 'start' | 'center' | 'end' =>
  value === 'start' || value === 'center' || value === 'end'

/**
 * The target's own snap alignment on each physical axis that its nearest scroll container snaps, as `scrollIntoView()`
 * lands on it there: https://drafts.csswg.org/cssom-view/#determine-the-scroll-into-view-position
 * Both properties are logical to the scroll container's writing mode: https://drafts.csswg.org/css-scroll-snap-1/
 */
const getSnapAlignment = (
  targetStyle: CSSStyleDeclaration,
  containerStyle: CSSStyleDeclaration
): { x?: ScrollLogicalPosition; y?: ScrollLogicalPosition } => {
  // Unset in browsers without scroll snap
  const [axis] = (containerStyle.scrollSnapType || 'none').split(' ')
  const [blockAlign, inlineAlign = blockAlign] = (
    targetStyle.scrollSnapAlign || 'none'
  ).split(' ')
  const flow = getFlowDirections(containerStyle)
  const snapsX =
    axis === 'both' ||
    axis === 'x' ||
    axis === (flow.vertical ? 'block' : 'inline')
  const snapsY =
    axis === 'both' ||
    axis === 'y' ||
    axis === (flow.vertical ? 'inline' : 'block')
  const alignX = flow.vertical ? blockAlign : inlineAlign
  const alignY = flow.vertical ? inlineAlign : blockAlign
  return {
    x:
      snapsX && isSnapPosition(alignX)
        ? toPhysical(alignX, flow.xStartIsRight)
        : undefined,
    y:
      snapsY && isSnapPosition(alignY)
        ? toPhysical(alignY, flow.yStartIsBottom)
        : undefined,
  }
}

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

const isOverflowPropagated = (doc: Document) => {
  const { overflowX, overflowY } = getComputedStyle(doc.documentElement)
  return overflowX === 'visible' && overflowY === 'visible'
}

const getScrollingElement = (doc: Document) =>
  doc.scrollingElement || doc.documentElement

// Support pinch-zooming properly, making sure elements scroll into the visual viewport
// Browsers that don't support visualViewport will report the layout viewport dimensions on document.documentElement.clientWidth/Height
// and viewport dimensions on window.innerWidth/Height
// https://www.quirksmode.org/mobile/viewports2.html
// https://bokand.github.io/viewport/index.html
const getViewportRects = (
  target: SideObject,
  scrollMargin: SideObject,
  doc: Document,
  win: Window
) => {
  const scrollport = {
    top: 0,
    right: win.visualViewport?.width ?? win.innerWidth,
    bottom: win.visualViewport?.height ?? win.innerHeight,
    left: 0,
  }
  return {
    scrollport,
    target,
    // The viewport's scroll-padding is set on the root element, also when the scrolling element is the body
    scrollPadding: getScrollPadding(
      getComputedStyle(doc.documentElement),
      scrollport,
      1,
      1
    ),
    scrollMargin,
  }
}

// The scrollport of a scroll container, and how much transforms scale it
// A computed `object-position` coordinate is a length, a percentage of the free space, or a `calc()` of both
const resolvePosition = (value: string, free: number) => {
  const calc = /^calc\((-?[\d.e]+)% ([+-]) ([\d.e]+)px\)$/.exec(value)
  if (calc) {
    const length = parseFloat(calc[3])
    return (
      (free * parseFloat(calc[1])) / 100 + (calc[2] === '-' ? -length : length)
    )
  }
  return value.endsWith('%')
    ? (free * parseFloat(value)) / 100
    : parseFloat(value)
}

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

const isSet = (value: string | undefined) => !!value && value !== 'none'

// `will-change` is a comma-separated list of property names. Match whole names so `scroll-position` is not `position`.
const willChangeHas = (willChange: string, name: string) =>
  willChange.split(',').some((value) => value.trim() === name)

// Whether an element with this style is the containing block of its absolutely positioned descendants, or with
// `fixed`, of its fixed positioned ones: https://drafts.csswg.org/css-position-3/#def-cb
// `container-type` no longer applies layout containment, so it is not a containing block.
// Some of these properties are missing in older browsers, where they're undefined
const isContainingBlock = (style: CSSStyleDeclaration, fixed: boolean) => {
  const willChange = style.willChange || ''
  return (
    (!fixed && style.position !== 'static') ||
    isSet(style.transform) ||
    isSet(style.translate) ||
    isSet(style.rotate) ||
    isSet(style.scale) ||
    isSet(style.perspective) ||
    isSet(style.filter) ||
    isSet(style.backdropFilter) ||
    /layout|paint|strict|content/.test(style.contain || '') ||
    /auto|hidden/.test(style.contentVisibility || '') ||
    [
      'transform',
      'perspective',
      'filter',
      'backdrop-filter',
      'translate',
      'rotate',
      'scale',
    ].some((name) => willChangeHas(willChange, name)) ||
    (!fixed && willChangeHas(willChange, 'position'))
  )
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

  // The viewport is the target's, also when `compute` runs in another frame's window
  let doc = target.ownerDocument
  const targetWindow = doc.defaultView
  if (!targetWindow) {
    return []
  }
  let win = targetWindow
  // The viewport of the document that the walk is in, the last scrolling box in it
  let scrollingElement = getScrollingElement(doc)
  let { scrollX, scrollY } = win

  // Alignment follows the target's writing mode and direction in every scroll container, like browsers do, rather
  // than each scroll container's own as the spec says: https://github.com/w3c/csswg-drafts/issues/11796
  // From here on `start` means the top or left edge
  const targetStyle = getComputedStyle(target)
  const targetFlow = getFlowDirections(targetStyle)
  const alignY = toPhysical(
    targetFlow.vertical ? inline : block,
    targetFlow.yStartIsBottom
  )
  const alignX = toPhysical(
    targetFlow.vertical ? block : inline,
    targetFlow.xStartIsRight
  )

  const { top, right, bottom, left } = target.getBoundingClientRect()
  let targetRect = { top, right, bottom, left }
  const scrollMargin = getScrollMargins(target)

  // How much the inner scroll containers move the target, in the order they scroll
  const blockShifts: number[] = []
  const inlineShifts: number[] = []

  // Runs the first `count` middleware for an ancestor of the target. Ancestors that aren't in the target's containing
  // block chain don't move it when they scroll, so they aren't scrollable
  const visit = (frame: Element, count: number, inChain = true) => {
    const viewport = frame === scrollingElement
    let style: CSSStyleDeclaration | undefined
    const getStyle = () => (style ??= getComputedStyle(frame))
    let measured: ReturnType<typeof measureFrame> | undefined
    let rects: Rects | undefined
    const measure = (): Rects => {
      if (viewport) {
        return getViewportRects(
          Object.assign({}, targetRect),
          Object.assign({}, scrollMargin),
          doc,
          win
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

    // A fixed positioned target doesn't move with the viewport either, unless the root is its containing block
    let scrollable = viewport
      ? inChain
      : inChain &&
        isScrollable(frame) &&
        // The body's overflow applies to the viewport instead when the root's is visible, so it isn't a scroll
        // container then: https://drafts.csswg.org/css-overflow-3/#overflow-propagation
        !(frame === doc.body && isOverflowPropagated(doc))
    let stop = false
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
  // Only the nearest scroll container has the target's snap positions
  let nearestContainer = true
  // Walk the ancestors for the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  // The viewport is an ancestor of every element, including the scrolling element and the root when it's the body
  let cursor: Element | null = target.contains(scrollingElement)
    ? scrollingElement
    : getParentElement(target)
  // The position of the last box in the containing block chain, which says which ancestor is its containing block
  let position = targetStyle.position
  while (isElement(cursor)) {
    const frame: Element = cursor
    const frameStyle = getComputedStyle(frame)
    const inChain =
      (position !== 'absolute' && position !== 'fixed') ||
      // Without another one, the containing block of absolutely positioned boxes is the initial containing block,
      // which moves with the viewport
      (position === 'absolute' && frame === scrollingElement) ||
      isContainingBlock(frameStyle, position === 'fixed')
    if (inChain) {
      position = frameStyle.position
    }
    const visited = visit(frame, middleware.length, inChain)
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

      const snap = nearestContainer
        ? getSnapAlignment(
            targetStyle,
            // The root element's scroll-snap-type applies to the viewport
            viewport ? getComputedStyle(document.documentElement) : frameStyle
          )
        : {}
      nearestContainer = false

      let blockScroll: number = alignAxis(
        snap.y || alignY,
        region.top,
        region.bottom,
        box.top,
        box.bottom
      )
      let inlineScroll: number = alignAxis(
        snap.x || alignX,
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
          getComputedStyle(doc.documentElement)
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
        // The browser keeps the viewport in range, which moves the target when the parent frames align it
        blockShifts.push(
          scrollY -
            clampScroll(
              blockScroll,
              scrollingElement.scrollHeight - scrollingElement.clientHeight,
              rootFlow.yStartIsBottom
            )
        )
        inlineShifts.push(
          scrollX -
            clampScroll(
              inlineScroll,
              scrollingElement.scrollWidth - scrollingElement.clientWidth,
              rootFlow.xStartIsRight
            )
        )
      } else {
        // A middleware may have measured the rects for this frame, or replaced them
        const { scaleX, scaleY } = visited.scale()
        const { scrollLeft, scrollTop } = frame
        // Ensure scroll coordinates are not out of bounds while applying scroll offsets. The offsets are negative on
        // axes where the scroll container's own writing mode and direction make it overflow to the left or top
        const frameFlow = getFlowDirections(frameStyle)
        // `overflow: clip` forbids programmatic scrolling too, so an axis that clips keeps its scroll offset, and the
        // outer scroll containers align the target on it: https://drafts.csswg.org/css-overflow-3/#valdef-overflow-clip
        blockScroll =
          frameStyle.overflowY === 'clip'
            ? scrollTop
            : scaleY === 0
              ? 0
              : clampScroll(
                  scrollTop + blockScroll / scaleY,
                  frame.scrollHeight - frame.clientHeight,
                  frameFlow.yStartIsBottom
                )
        inlineScroll =
          frameStyle.overflowX === 'clip'
            ? scrollLeft
            : scaleX === 0
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
    if (viewport) {
      // The viewport of a frame is inside its `<iframe>` in the parent document, which is scrolled too when it's
      // same-origin. `frameElement` is `null` otherwise. 'nearest' stops at the first scrolling box
      const owner = container === 'nearest' ? null : getFrameElement(frame)
      const ownerWindow = owner?.ownerDocument.defaultView
      if (!owner || !ownerWindow) {
        break
      }
      // The border box middleware left, where the scrolling so far puts it, in the parent document.
      // With no replacement, that is the element's border box
      const box = Object.assign({}, visited.rects().target)
      for (const shift of blockShifts) {
        box.top += shift
        box.bottom += shift
      }
      for (const shift of inlineShifts) {
        box.left += shift
        box.right += shift
      }
      blockShifts.length = 0
      inlineShifts.length = 0
      const ownerStyle = getComputedStyle(owner)
      const { scrollport, scaleX, scaleY } = measureFrame(owner, ownerStyle)
      const paddingLeft = parseFloat(ownerStyle.paddingLeft) || 0
      const paddingTop = parseFloat(ownerStyle.paddingTop) || 0
      // The frame's viewport fills the content box of the `<iframe>`, unless `object-fit` sizes it like a replaced
      // element with a natural aspect ratio (an SVG document in an `<object>`), and `object-position` places it
      const freeX =
        owner.clientWidth -
        paddingLeft -
        parseFloat(ownerStyle.paddingRight) -
        win.innerWidth
      const freeY =
        owner.clientHeight -
        paddingTop -
        parseFloat(ownerStyle.paddingBottom) -
        win.innerHeight
      const fitted = Math.abs(freeX) >= 1 || Math.abs(freeY) >= 1
      // The computed value is two coordinates, separated by the space that isn't in a `calc()`
      const [positionX, positionY] =
        ownerStyle.objectPosition.split(/ (?![^(]*\))/)
      const originX =
        scrollport.left +
        (paddingLeft + (fitted ? resolvePosition(positionX, freeX) : 0)) *
          scaleX
      const originY =
        scrollport.top +
        (paddingTop + (fitted ? resolvePosition(positionY, freeY) : 0)) * scaleY
      targetRect = {
        top: originY + box.top * scaleY,
        right: originX + box.right * scaleX,
        bottom: originY + box.bottom * scaleY,
        left: originX + box.left * scaleX,
      }
      doc = owner.ownerDocument
      win = ownerWindow
      scrollingElement = getScrollingElement(doc)
      ;({ scrollX, scrollY } = win)
      // The `<iframe>` is a box in the parent document, whose containing block chain starts at it
      position = ownerStyle.position
      cursor = getParentElement(owner)
      continue
    }
    cursor = getParentElement(frame)
  }

  return computations
}
