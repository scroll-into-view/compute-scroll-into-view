import {
  boundary,
  compute,
  onlyIfNeeded,
  skipOverflowHiddenElements,
} from '../src/index.ts'
window.computeScrollIntoView = compute
window.onlyIfNeeded = onlyIfNeeded
window.boundary = boundary
window.skipOverflowHiddenElements = skipOverflowHiddenElements
// What `scrollMode: 'if-needed'` did before it became the onlyIfNeeded middleware
window.computeScrollIntoViewIfNeeded = (target, options) =>
  compute(target, { ...options, middleware: [onlyIfNeeded()] })

window.mapActions = (item) => ({
  el: (item.el.tagName.toLowerCase() + '.' + item.el.className).replace(
    /\.$/,
    ''
  ),
  left: Math.round(item.left),
  top: Math.round(item.top),
})

// Every element in the document and its same-origin frames, with a label for reporting where it scrolled
function scrollableElements(doc, prefix = '') {
  const result = []
  for (const el of doc.querySelectorAll('*')) {
    const label =
      prefix +
      (el.id
        ? `#${el.id}`
        : (el.tagName.toLowerCase() + '.' + el.className).replace(/\.$/, ''))
    result.push([label, el])
    if (el.tagName === 'IFRAME' && el.contentDocument) {
      result.push(...scrollableElements(el.contentDocument, `${label} `))
    }
    if (el.shadowRoot) {
      result.push(...scrollableElements(el.shadowRoot, `${label} `))
    }
  }
  return result
}

/**
 * Scrolls `target` into view with the native `scrollIntoView(nativeOptions)`, and again with the actions from
 * `computeFn(target, computeOptions)`, from the same starting positions. Returns where every element that moved ended
 * up in both cases, rounded to whole pixels
 */
window.compareWithNative = (
  target,
  nativeOptions,
  computeOptions = nativeOptions,
  computeFn = compute
) => {
  const elements = scrollableElements(document)
  const initial = elements.map(([, el]) => [el.scrollLeft, el.scrollTop])
  const reset = () =>
    elements.forEach(([, el], index) => {
      el.scrollLeft = initial[index][0]
      el.scrollTop = initial[index][1]
    })
  const positions = () =>
    Object.fromEntries(
      elements
        .filter(
          ([, el], index) =>
            el.scrollLeft !== initial[index][0] ||
            el.scrollTop !== initial[index][1]
        )
        .map(([label, el]) => [
          label,
          { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) },
        ])
    )

  target.scrollIntoView(nativeOptions)
  const native = positions()
  reset()
  for (const { el, top, left } of computeFn(target, computeOptions)) {
    el.scroll({ top, left, behavior: 'instant' })
  }
  const computed = positions()
  reset()
  return { native, computed }
}
