// Compute what scrolling needs to be done on required scrolling boxes for target to be in view

// The type names here are named after the spec to make it easier to find more information around what they mean:
// To reduce churn and reduce things that need be maintained things from the official TS DOM library is used here
// https://drafts.csswg.org/cssom-view/

// For a definition on what is "block flow direction" exactly, check this: https://drafts.csswg.org/css-writing-modes-4/#block-flow-direction

/**
 * Library extension inspired by the open proposal: https://github.com/w3c/csswg-drafts/pull/5677
 * @public
 */
export type ScrollMode = 'always' | 'if-needed'

/** @public */
export interface Options {
  /**
   * Align in the target’s block flow direction, as defined by its CSS writing-mode.
   * @defaultValue 'center'
   */
  block?: ScrollLogicalPosition
  /**
   * Align in the target’s inline direction, respecting CSS writing-mode and direction.
   * @defaultValue 'nearest'
   */
  inline?: ScrollLogicalPosition
  /**
   * This is a proposed addition to the spec that you can track here: https://github.com/w3c/csswg-drafts/pull/5677
   *
   * This library will be updated to reflect any changes to the spec and will provide a migration path.
   * To be backwards compatible with `Element.scrollIntoViewIfNeeded` if something is not 100% visible it will count as "needs scrolling". If you need a different visibility ratio your best option would be to implement an [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).
   * @defaultValue 'always'
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
   * @defaultValue null
   */
  boundary?: Element | ((parent: Element) => boolean) | null
  /**
   * Scroll all ancestor scrolling boxes or only the nearest one.
   * Can be combined with the library's boundary option.
   * @defaultValue 'all'
   */
  container?: 'all' | 'nearest'
  /**
   * New option that skips auto-scrolling all nodes with overflow: hidden set
   * See FF implementation: https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18
   * @defaultValue false
   * @public
   */
  skipOverflowHiddenElements?: boolean
}

/** @public */
export interface ScrollAction {
  el: Element
  top: number
  left: number
}

const isElement = (el: unknown): el is Element =>
  typeof el === 'object' && el != null && (el as Element).nodeType === 1

const canOverflow = (overflow: string, skipOverflowHiddenElements = false) =>
  overflow !== 'visible' &&
  overflow !== 'clip' &&
  !(skipOverflowHiddenElements && overflow === 'hidden')

const getParentElement = (element: Element): Element | null =>
  element.assignedSlot ||
  element.parentElement ||
  (element.getRootNode() as ShadowRoot).host ||
  null

const align = (
  position: ScrollLogicalPosition,
  start: number,
  end: number,
  targetStart: number,
  targetEnd: number
) => {
  if (position === 'start') return targetStart - start
  if (position === 'end') return targetEnd - end
  if (position === 'center') return (targetStart + targetEnd - start - end) / 2

  // CSSOM View's nearest-edge rules also cover targets larger than the scrollport.
  if (
    (targetStart >= start && targetEnd <= end) ||
    (targetStart < start && targetEnd > end)
  ) {
    return 0
  }
  return (targetStart < start && targetEnd - targetStart <= end - start) ||
    (targetEnd > end && targetEnd - targetStart >= end - start)
    ? targetStart - start
    : targetEnd - end
}

const reverse = (position: ScrollLogicalPosition): ScrollLogicalPosition =>
  position === 'start' ? 'end' : position === 'end' ? 'start' : position

// Computed scroll-padding retains percentages and mixed-unit math functions.
// Resolve them against the scrollport without inserting measurement elements.
const resolvePadding = (value: string, size: number): number => {
  const tokens =
    value
      .replace(/([\d.e+-]+)%/gi, (_, number) =>
        String((Number(number) * size) / 100)
      )
      .replace(/px/g, '')
      .match(/[a-z]+|(?:\d*\.)?\d+(?:e[+-]?\d+)?|[^\s]/gi) || []
  let index = 0
  function atom(): number {
    const token = tokens[index++]
    if (token === '+') return atom()
    if (token === '-') return -atom()
    if (token === '(') {
      const result = sum()
      index++
      return result
    }
    if (['calc', 'min', 'max', 'clamp'].includes(token)) {
      index++
      const values = [sum()]
      while (tokens[index] === ',') {
        index++
        values.push(sum())
      }
      index++
      if (token === 'min') return Math.min(...values)
      if (token === 'max') return Math.max(...values)
      if (token === 'clamp')
        return Math.max(values[0], Math.min(values[1], values[2]))
      return values[0]
    }
    return Number(token)
  }
  function product(): number {
    let result = atom()
    while (tokens[index] === '*' || tokens[index] === '/') {
      const operator = tokens[index++]
      const right = atom()
      result = operator === '*' ? result * right : result / right
    }
    return result
  }
  function sum(): number {
    let result = product()
    while (tokens[index] === '+' || tokens[index] === '-') {
      const operator = tokens[index++]
      const right = product()
      result += operator === '+' ? right : -right
    }
    return result
  }
  return Math.max(0, sum() || 0)
}

const clamp = (value: number, max: number, reversed: boolean) =>
  reversed
    ? Math.max(-max, Math.min(0, value))
    : Math.max(0, Math.min(max, value))

/** @public */
export const compute = (target: Element, options: Options): ScrollAction[] => {
  if (typeof document === 'undefined') return []
  if (!isElement(target)) throw new TypeError('Invalid target')

  const doc = target.ownerDocument
  const win = doc.defaultView
  if (!win || !target.isConnected || target.getClientRects().length === 0)
    return []

  const {
    scrollMode,
    block = 'center',
    inline = 'nearest',
    container = 'all',
    boundary,
    skipOverflowHiddenElements,
  } = options
  const checkBoundary =
    typeof boundary === 'function'
      ? boundary
      : (node: Element) => node !== boundary
  const scrollingElement = doc.scrollingElement || doc.documentElement
  const styleOf = (element: Element) => win.getComputedStyle(element)
  const isScrollable = (element: Element) => {
    const style = styleOf(element)
    if (element.getClientRects().length === 0) return false
    return (
      (canOverflow(style.overflowY, skipOverflowHiddenElements) ||
        canOverflow(style.overflowX, skipOverflowHiddenElements)) &&
      (container === 'nearest' ||
        element.clientHeight < element.scrollHeight ||
        element.clientWidth < element.scrollWidth)
    )
  }

  const frames: Element[] = []
  let cursor: Element | null = target
  while (cursor && checkBoundary(cursor)) {
    cursor = getParentElement(cursor)
    if (!cursor) break
    if (cursor === scrollingElement) {
      frames.push(cursor)
      break
    }
    // The body's overflow normally propagates to the viewport.
    if (
      cursor === doc.body &&
      styleOf(doc.documentElement).overflowX === 'visible' &&
      styleOf(doc.documentElement).overflowY === 'visible'
    ) {
      continue
    }
    if (isScrollable(cursor)) {
      frames.push(cursor)
      if (container === 'nearest') break
    }
  }

  const rect = target.getBoundingClientRect()
  const targetStyle = styleOf(target)
  const marginTop = parseFloat(targetStyle.scrollMarginTop) || 0
  const marginRight = parseFloat(targetStyle.scrollMarginRight) || 0
  const marginBottom = parseFloat(targetStyle.scrollMarginBottom) || 0
  const marginLeft = parseFloat(targetStyle.scrollMarginLeft) || 0
  let targetTop = rect.top
  let targetRight = rect.right
  let targetBottom = rect.bottom
  let targetLeft = rect.left
  const computations: ScrollAction[] = []

  for (const frame of frames) {
    const style = styleOf(frame)
    const viewport = frame === scrollingElement
    const frameRect = frame.getBoundingClientRect()
    const scaleX =
      !viewport && 'offsetWidth' in frame && frame.offsetWidth
        ? frameRect.width / (frame as HTMLElement).offsetWidth
        : 1
    const scaleY =
      !viewport && 'offsetHeight' in frame && frame.offsetHeight
        ? frameRect.height / (frame as HTMLElement).offsetHeight
        : 1
    if (!scaleX || !scaleY) continue

    const layoutWidth = doc.documentElement.clientWidth
    const layoutHeight = doc.documentElement.clientHeight
    const width = viewport ? layoutWidth : frame.clientWidth
    const height = viewport ? layoutHeight : frame.clientHeight
    const visual = win.visualViewport
    // clientLeft includes a scrollbar placed on the left (for example in RTL).
    const left = viewport ? 0 : frameRect.left + frame.clientLeft * scaleX
    const top = viewport ? 0 : frameRect.top + frame.clientTop * scaleY
    const paddingLeft = resolvePadding(style.scrollPaddingLeft, width) * scaleX
    const paddingRight =
      resolvePadding(style.scrollPaddingRight, width) * scaleX
    const paddingTop = resolvePadding(style.scrollPaddingTop, height) * scaleY
    const paddingBottom =
      resolvePadding(style.scrollPaddingBottom, height) * scaleY
    // Root scroll padding is relative to the layout viewport, intersected with
    // the visual viewport when zoomed or when the on-screen keyboard is visible.
    const portLeft = viewport
      ? Math.max(paddingLeft, visual?.offsetLeft || 0)
      : left + paddingLeft
    const portTop = viewport
      ? Math.max(paddingTop, visual?.offsetTop || 0)
      : top + paddingTop
    const portRight = viewport
      ? Math.min(
          width - paddingRight,
          (visual?.offsetLeft || 0) + (visual?.width ?? width)
        )
      : left + width * scaleX - paddingRight
    const portBottom = viewport
      ? Math.min(
          height - paddingBottom,
          (visual?.offsetTop || 0) + (visual?.height ?? height)
        )
      : top + height * scaleY - paddingBottom

    // Scroll Snap defines margin outsets in each scroller's coordinate space,
    // after finding the target's transformed bounding box in that space.
    const areaTop = targetTop - marginTop * scaleY
    const areaRight = targetRight + marginRight * scaleX
    const areaBottom = targetBottom + marginBottom * scaleY
    const areaLeft = targetLeft - marginLeft * scaleX

    // Check each ancestor independently. An inner box being visible does not
    // imply that its outer scrolling boxes are visible as well.
    if (
      scrollMode === 'if-needed' &&
      areaTop >= portTop &&
      areaBottom <= portBottom &&
      areaLeft >= portLeft &&
      areaRight <= portRight
    ) {
      continue
    }

    // Engines resolve logical alignment using the target's writing mode. This
    // interoperable behavior is tracked against the draft wording in CSSWG #11796.
    const vertical = /^(vertical|sideways)/.test(targetStyle.writingMode)
    const rtl = targetStyle.direction === 'rtl'
    const reverseX = vertical ? targetStyle.writingMode.endsWith('-rl') : rtl
    const reverseY =
      vertical && rtl !== (targetStyle.writingMode === 'sideways-lr')
    // Scroll coordinate origins, however, belong to each scrolling box.
    const frameVertical = /^(vertical|sideways)/.test(style.writingMode)
    const frameRTL = style.direction === 'rtl'
    const negativeX = frameVertical
      ? style.writingMode.endsWith('-rl')
      : frameRTL
    const negativeY =
      frameVertical && frameRTL !== (style.writingMode === 'sideways-lr')
    const x = vertical ? block : inline
    const y = vertical ? inline : block
    const scrollLeft = viewport ? win.scrollX : frame.scrollLeft
    const scrollTop = viewport ? win.scrollY : frame.scrollTop
    const newLeft = clamp(
      scrollLeft +
        align(
          reverseX ? reverse(x) : x,
          portLeft,
          portRight,
          areaLeft,
          areaRight
        ) /
          scaleX,
      Math.max(0, frame.scrollWidth - width),
      negativeX
    )
    const newTop = clamp(
      scrollTop +
        align(
          reverseY ? reverse(y) : y,
          portTop,
          portBottom,
          areaTop,
          areaBottom
        ) /
          scaleY,
      Math.max(0, frame.scrollHeight - height),
      negativeY
    )

    // Predict the target's actual position after clamping each inner scroll.
    const dx = (scrollLeft - newLeft) * scaleX
    const dy = (scrollTop - newTop) * scaleY
    targetLeft += dx
    targetRight += dx
    targetTop += dy
    targetBottom += dy
    computations.push({ el: frame, top: newTop, left: newLeft })
  }

  return computations
}
