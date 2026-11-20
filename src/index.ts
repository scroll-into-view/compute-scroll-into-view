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
  mapSides,
  measureSelection,
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
  /**
   * The element that is scrolled into view. For a `Range` or `Selection` target, the element around its focus end,
   * where the ancestor walk starts
   */
  readonly target: Element
  /** The `Range` or `Selection` that is the target of `compute`, or `null` for an element */
  readonly selection: Range | Selection | null
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

// Checks the properties rather than `instanceof`, which would miss ranges and selections from other frames
const isRangeOrSelection = (target: any): target is Range | Selection =>
  typeof target === 'object' &&
  target != null &&
  ('endContainer' in target || 'rangeCount' in target)

// The element around the focus end, where a caret is. A `Range` has no direction, so its focus is its end
const getFocusElement = (selected: Range | Selection): Element | null => {
  const focus =
    'rangeCount' in selected ? selected.focusNode : selected.endContainer
  return !focus ? null : isElement(focus) ? focus : getParentElement(focus)
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

// Only HTMLElement objects have offset[Width|Height], but any Element might pass by here. `instanceof HTMLElement`
// would miss elements from other frames, which have their own HTMLElement, so check for the properties instead
const isHTMLElement = (el: Element): el is HTMLElement => 'offsetWidth' in el

/**
 * Which axis is the block axis, and whether the start edge of each physical axis is its right (`x`) or bottom (`y`)
 * edge, for a box with this writing mode and direction: https://drafts.csswg.org/css-writing-modes-4/#logical-to-physical
 * A scroll container whose start edge is on the right or bottom has negative scroll offsets on that axis
 */
const getFlowDirections = (style: CSSStyleDeclaration) => {
  const { writingMode, direction } = style
  const rtl = direction === 'rtl'
  // Also matches the legacy `tb`, `tb-rl` values
  const vertical = /^(vertical|sideways|tb)/.test(writingMode)
  return {
    vertical,
    x: vertical ? !writingMode.endsWith('lr') : rtl,
    // Lines in sideways-lr run bottom to top
    y: vertical && (writingMode === 'sideways-lr' ? !rtl : rtl),
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
  const snap = (physical: 'x' | 'y', isBlock: boolean) => {
    const align = isBlock ? blockAlign : inlineAlign
    return (axis === 'both' ||
      axis === physical ||
      axis === (isBlock ? 'block' : 'inline')) &&
      isSnapPosition(align)
      ? toPhysical(align, flow[physical])
      : undefined
  }
  return { x: snap('x', flow.vertical), y: snap('y', !flow.vertical) }
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
  scale: Scale
): SideObject =>
  mapSides((side, _start, axis) =>
    resolvePadding(
      style.getPropertyValue(`scroll-padding-${side}`),
      axis === 'x'
        ? scrollport.right - scrollport.left
        : scrollport.bottom - scrollport.top,
      scale[axis]
    )
  )

const getRootStyle = (doc: Document) => getComputedStyle(doc.documentElement)

const isOverflowPropagated = (doc: Document) => {
  const { overflowX, overflowY } = getRootStyle(doc)
  return overflowX === 'visible' && overflowY === 'visible'
}

const getScrollingElement = (doc: Document) =>
  doc.scrollingElement || doc.documentElement

// How much transforms scale a box on each axis
interface Scale {
  x: number
  y: number
}

// The scrollport of a scroll container, and how much transforms scale it
const measureFrame = (frame: Element, frameStyle: CSSStyleDeclaration) => {
  const rect = frame.getBoundingClientRect()
  const html = isHTMLElement(frame)
  const scale = {
    x: html && frame.offsetWidth ? rect.width / frame.offsetWidth : 0,
    y: html && frame.offsetHeight ? rect.height / frame.offsetHeight : 0,
  }
  return {
    scrollport: mapSides(
      (side, start, axis) =>
        rect[side] +
        (start ? 1 : -1) *
          // Borders, plus the scrollbar on whichever side it is, like the left in right-to-left scroll containers
          (!html
            ? parseInt(frameStyle.getPropertyValue(`border-${side}-width`), 10)
            : start
              ? axis === 'x'
                ? frame.clientLeft
                : frame.clientTop
              : axis === 'x'
                ? frame.offsetWidth - frame.clientLeft - frame.clientWidth
                : frame.offsetHeight - frame.clientTop - frame.clientHeight) *
          scale[axis]
    ),
    scale,
  }
}

const isSet = (value: string) => !!value && value !== 'none'

// Whether an element with this style is the containing block of its absolutely positioned descendants, or with
// `fixed`, of its fixed positioned ones: https://drafts.csswg.org/css-position-3/#def-cb
// `container-type` no longer applies layout containment, so it is not a containing block.
// Some of these properties are missing in older browsers, where they're empty
const isContainingBlock = (style: CSSStyleDeclaration, fixed: boolean) => {
  // `will-change` is a comma-separated list of property names. Match whole names so `scroll-position` is not `position`
  const willChange = new Set(
    style
      .getPropertyValue('will-change')
      .split(',')
      .map((name) => name.trim())
  )
  return (
    (!fixed && (style.position !== 'static' || willChange.has('position'))) ||
    [
      'transform',
      'translate',
      'rotate',
      'scale',
      'perspective',
      'filter',
      'backdrop-filter',
    ].some(
      (name) => isSet(style.getPropertyValue(name)) || willChange.has(name)
    ) ||
    /layout|paint|strict|content/.test(style.getPropertyValue('contain')) ||
    /auto|hidden/.test(style.getPropertyValue('content-visibility'))
  )
}

/**
 * The scroll actions that scroll `target` into view. A `Range` or `Selection` target aligns the box around it, and
 * scrolls the element around its focus end, where a caret is, and that element's ancestors. Add `selection()` from
 * `compute-scroll-into-view/middleware` to align its focus end instead
 */
export const compute = (
  input: Element | Range | Selection,
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

  const selected = !isElement(input) && isRangeOrSelection(input) ? input : null
  const target = selected ? getFocusElement(selected) : input
  if (!isElement(target)) {
    // A selection without ranges has nothing to scroll to
    if (selected) return []
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
  let scroll = { x: win.scrollX, y: win.scrollY }

  // Alignment follows the target's writing mode and direction in every scroll container, like browsers do, rather
  // than each scroll container's own as the spec says: https://github.com/w3c/csswg-drafts/issues/11796
  // From here on `start` means the top or left edge
  const targetStyle = getComputedStyle(target)
  const targetFlow = getFlowDirections(targetStyle)
  const align = {
    x: toPhysical(targetFlow.vertical ? block : inline, targetFlow.x),
    y: toPhysical(targetFlow.vertical ? inline : block, targetFlow.y),
  }

  const targetRect = target.getBoundingClientRect()
  let targetBox =
    (selected && measureSelection(selected, 'bounds')) ||
    mapSides((side) => targetRect[side])
  const scrollMargin = mapSides(
    (side) =>
      parseFloat(targetStyle.getPropertyValue(`scroll-margin-${side}`)) || 0
  )

  // How much the inner scroll containers move the target, in the order they scroll
  let shifts = { x: [] as number[], y: [] as number[] }
  const shift = (box: SideObject) =>
    mapSides((side, _start, axis) =>
      shifts[axis].reduce((edge, offset) => edge + offset, box[side])
    )

  // Runs the first `count` middleware for an ancestor of the target. Ancestors that aren't in the target's containing
  // block chain don't move it when they scroll, so they aren't scrollable
  const visit = (
    frame: Element,
    style: CSSStyleDeclaration,
    count: number,
    inChain = true
  ) => {
    const viewport = frame === scrollingElement
    let measured: ReturnType<typeof measureFrame> | undefined
    let rects: Rects | undefined
    // Support pinch-zooming properly, making sure elements scroll into the visual viewport
    // Browsers that don't support visualViewport will report the layout viewport dimensions on
    // document.documentElement.clientWidth/Height and viewport dimensions on window.innerWidth/Height
    // https://www.quirksmode.org/mobile/viewports2.html
    // https://bokand.github.io/viewport/index.html
    const measureBox = () => {
      const visualViewport = win.visualViewport
      return viewport
        ? {
            scrollport: {
              top: 0,
              right: visualViewport ? visualViewport.width : win.innerWidth,
              bottom: visualViewport ? visualViewport.height : win.innerHeight,
              left: 0,
            },
            scale: { x: 1, y: 1 },
          }
        : (measured = measureFrame(frame, style))
    }
    const getRects = (): Rects => {
      if (!rects) {
        const { scrollport, scale } = measureBox()
        rects = {
          scrollport,
          target: Object.assign({}, targetBox),
          scrollPadding: getScrollPadding(
            // The viewport's scroll-padding is set on the root element, also when the scrolling element is the body
            viewport ? getRootStyle(doc) : style,
            scrollport,
            scale
          ),
          scrollMargin: Object.assign({}, scrollMargin),
        }
      }
      return rects
    }

    // A fixed positioned target doesn't move with the viewport either, unless the root is its containing block
    let scrollable =
      inChain &&
      (viewport ||
        (isScrollable(frame) &&
          // The body's overflow applies to the viewport instead when the root's is visible, so it isn't a scroll
          // container then: https://drafts.csswg.org/css-overflow-3/#overflow-propagation
          !(frame === doc.body && isOverflowPropagated(doc))))
    let stop = false
    for (let index = 0; index < count; index++) {
      const result = middleware[index].fn({
        target,
        selection: selected,
        container: frame,
        viewport,
        scrollable,
        options: resolvedOptions,
        get rects() {
          return getRects()
        },
        get viewportRects() {
          return viewport
            ? getRects()
            : // The viewport's rects don't depend on its style
              visit(scrollingElement, style, index).rects()
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
      // How transforms scale the scroll container, once its rects are measured
      scale: () => (measured || measureBox()).scale,
    }
  }

  // Collect new scroll positions
  const computations: ScrollAction[] = []
  // Only the nearest scroll container has the target's snap positions
  let nearestContainer = true
  // Walk the ancestors for the scrolling boxes, as defined in the spec: https://drafts.csswg.org/cssom-view/#scrolling-box
  // The viewport is an ancestor of every element, including the scrolling element and the root when it's the body.
  // A Range or Selection can resolve to a scroll container itself (text child, selectNode, selectNodeContents), which
  // elements never do, so start there instead of its parent
  let cursor: Element | null = target.contains(scrollingElement)
    ? scrollingElement
    : selected
      ? target
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
    const visited = visit(frame, frameStyle, middleware.length, inChain)
    const { viewport, scrollable } = visited
    let { stop } = visited

    if (scrollable) {
      const rects = visited.rects()
      const region = getRegion(rects)
      const box = shift(getTargetBox(rects))

      const snap = nearestContainer
        ? getSnapAlignment(
            targetStyle,
            // The root element's scroll-snap-type applies to the viewport
            viewport ? getRootStyle(document) : frameStyle
          )
        : {}
      nearestContainer = false

      // A middleware may have measured the rects for this frame, or replaced them
      const scale = visited.scale()
      // Scroll offsets are negative on axes where the scroll container's writing mode and direction make it overflow
      // to the left or top. The root's applies to the viewport
      const flow = getFlowDirections(viewport ? getRootStyle(doc) : frameStyle)
      const scrollAxis = (axis: 'x' | 'y') => {
        const [start, end] =
          axis === 'x'
            ? (['left', 'right'] as const)
            : (['top', 'bottom'] as const)
        const delta = alignAxis(
          snap[axis] || align[axis],
          region[start],
          region[end],
          box[start],
          box[end]
        )
        const current = viewport
          ? scroll[axis]
          : axis === 'x'
            ? frame.scrollLeft
            : frame.scrollTop
        const max =
          axis === 'x'
            ? frame.scrollWidth - frame.clientWidth
            : frame.scrollHeight - frame.clientHeight
        // `overflow: clip` forbids programmatic scrolling too, so an axis that clips keeps its scroll offset, and the
        // outer scroll containers align the target on it: https://drafts.csswg.org/css-overflow-3/#valdef-overflow-clip
        const offset =
          !viewport &&
          (axis === 'x' ? frameStyle.overflowX : frameStyle.overflowY) ===
            'clip'
            ? current
            : scale[axis] === 0
              ? 0
              : clampScroll(current + delta / scale[axis], max, flow[axis])
        // Cache the offset so that parent frames can scroll this into view correctly. The browser keeps the viewport
        // in range, which moves the target when the parent frames align it
        shifts[axis].push(current - offset)
        // @TODO add more test cases to cover this 100%
        return viewport
          ? clampScroll(current + delta, Infinity, flow[axis])
          : offset
      }

      computations.push({
        el: frame,
        top: scrollAxis('y'),
        left: scrollAxis('x'),
      })

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
      const ownerWindow = owner && owner.ownerDocument.defaultView
      if (!owner || !ownerWindow) {
        break
      }
      // The border box middleware left, where the scrolling so far puts it, in the parent document.
      // With no replacement, that is the element's border box. `shift` returns a new box
      const box = shift(visited.rects().target)
      shifts = { x: [], y: [] }
      const ownerStyle = getComputedStyle(owner)
      const { scrollport, scale } = measureFrame(owner, ownerStyle)
      // The frame's viewport is the content box of the `<iframe>`
      const origin = {
        x:
          scrollport.left + (parseFloat(ownerStyle.paddingLeft) || 0) * scale.x,
        y: scrollport.top + (parseFloat(ownerStyle.paddingTop) || 0) * scale.y,
      }
      targetBox = mapSides(
        (side, _start, axis) => origin[axis] + box[side] * scale[axis]
      )
      doc = owner.ownerDocument
      win = ownerWindow
      scroll = { x: win.scrollX, y: win.scrollY }
      scrollingElement = getScrollingElement(doc)
      // The `<iframe>` is a box in the parent document, whose containing block chain starts at it
      position = ownerStyle.position
      cursor = getParentElement(owner)
      continue
    }
    cursor = getParentElement(frame)
  }

  return computations
}
