// The middleware option of compute, and the boundary, skipOverflowHiddenElements, onlyIfNeeded and targetRect middleware
import { beforeEach, describe, expect, test } from 'vite-plus/test'

import * as rootEntry from '../src/index.ts'
import * as middlewareEntry from '../src/middleware.ts'

const nested = `
  <div style="height: 2000px"></div>
  <div id="outer" style="height: 300px; width: 300px; overflow: auto">
    <div style="height: 400px"></div>
    <div id="inner" style="height: 200px; width: 200px; overflow: auto">
      <div style="height: 400px"></div>
      <div id="target" style="height: 100px; width: 100px"></div>
      <div style="height: 400px"></div>
    </div>
    <div style="height: 400px"></div>
  </div>
  <div style="height: 2000px"></div>`

beforeEach(async () => {
  await page.goto('/integration/issues.html')
})

test('the root entry exports compute, and the middleware entry the built-in middleware', () => {
  expect(Object.keys(rootEntry)).toEqual(['compute'])
  expect(Object.keys(middlewareEntry).toSorted()).toEqual([
    'boundary',
    'onlyIfNeeded',
    'skipOverflowHiddenElements',
    'targetRect',
  ])
})

describe('boundary', () => {
  test.each([
    ['the target', '#target', []],
    ['a scroll container', '#inner', ['#inner']],
    ['an outer scroll container', '#outer', ['#inner', '#outer']],
    ['null', null, ['#inner', '#outer', 'html']],
  ])('stops at %s', async (_, limitSelector, expected) => {
    const actual = await page.evaluate(
      ({ html, selector }) => {
        document.body.innerHTML = html
        const target = document.querySelector('#target')
        const all = window.computeScrollIntoView(target)
        const limited = window.computeScrollIntoView(target, {
          middleware: [
            window.boundary(selector && document.querySelector(selector)),
          ],
        })
        return {
          els: limited.map(({ el }) =>
            el.id ? `#${el.id}` : el.tagName.toLowerCase()
          ),
          // The scroll containers that are left scroll the same as without a boundary
          same: limited.every(
            (action, index) =>
              action.el === all[index].el &&
              action.top === all[index].top &&
              action.left === all[index].left
          ),
        }
      },
      { html: nested, selector: limitSelector }
    )
    expect(actual).toEqual({ els: expected, same: true })
  })

  test('a function is called with the target and its ancestors until it returns false', async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html
      const visited = []
      const actions = window.computeScrollIntoView(
        document.querySelector('#target'),
        {
          middleware: [
            window.boundary((parent) => {
              visited.push(parent.id || parent.tagName.toLowerCase())
              return parent.id !== 'outer'
            }),
          ],
        }
      )
      return { visited, els: actions.map(({ el }) => el.id) }
    }, nested)
    expect(actual).toEqual({
      visited: ['target', 'inner', 'outer'],
      els: ['inner', 'outer'],
    })
  })
})

describe('skipOverflowHiddenElements', () => {
  test('leaves overflow: hidden scroll containers alone, and scrolls the others so the target is in view', async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html.replace(
        'id="inner" style="',
        'id="inner" style="overflow: hidden !important; '
      )
      const target = document.querySelector('#target')
      const actions = window.computeScrollIntoView(target, {
        block: 'start',
        middleware: [window.skipOverflowHiddenElements()],
      })
      for (const { el, top, left } of actions) {
        el.scroll({ top, left, behavior: 'instant' })
      }
      const outer = document.querySelector('#outer')
      return {
        els: actions.map(({ el }) => el.id || el.tagName.toLowerCase()),
        innerScrollTop: document.querySelector('#inner').scrollTop,
        // #outer scrolls to where the target is while #inner stays at 0, 800px down, as far as it can (700px)
        targetTop: Math.round(
          target.getBoundingClientRect().top - outer.getBoundingClientRect().top
        ),
      }
    }, nested)
    expect(actual).toEqual({
      els: ['outer', 'html'],
      innerScrollTop: 0,
      targetTop: 100,
    })
  })

  test("with container: 'nearest', the nearest scroll container that isn't skipped is scrolled", async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html.replace(
        'id="inner" style="',
        'id="inner" style="overflow: hidden !important; '
      )
      return window
        .computeScrollIntoView(document.querySelector('#target'), {
          container: 'nearest',
          middleware: [window.skipOverflowHiddenElements()],
        })
        .map(({ el }) => el.id)
    }, nested)
    expect(actual).toEqual(['outer'])
  })
})

describe('onlyIfNeeded', () => {
  test('returns no actions for a target that is in view', async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html
      const target = document.querySelector('#target')
      window.computeScrollIntoView(target).forEach(({ el, top, left }) => {
        el.scroll({ top, left, behavior: 'instant' })
      })
      return window.computeScrollIntoView(target, {
        middleware: [window.onlyIfNeeded()],
      }).length
    }, nested)
    expect(actual).toBe(0)
  })
})

describe('custom middleware', () => {
  test('a fallback for scroll-margin and scroll-padding from custom properties', async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="scroller" style="height: 200px; overflow: auto; --scroll-padding-top: 30px">
          <div style="height: 500px"></div>
          <div id="target" style="height: 50px; --scroll-margin-top: 20px"></div>
          <div style="height: 500px"></div>
        </div>
        <div style="height: 2000px"></div>`

      const sides = ['top', 'right', 'bottom', 'left']
      const read = (el, property, fallback) => {
        const style = getComputedStyle(el)
        return Object.fromEntries(
          sides.map((side) => {
            const value = style.getPropertyValue(`--${property}-${side}`)
            return [side, value ? parseFloat(value) : fallback[side]]
          })
        )
      }
      // Reads `--scroll-margin-top` and the like, where they are set, instead of `scroll-margin` and `scroll-padding`.
      // Checking `CSS.supports('scroll-margin: 0')` first would only use them where those aren't supported
      const customScrollSpacing = {
        name: 'customScrollSpacing',
        fn: ({ target, container, viewport, rects }) => {
          return {
            rects: {
              scrollMargin: read(target, 'scroll-margin', rects.scrollMargin),
              // The viewport's scroll-padding is set on the root element
              scrollPadding: read(
                viewport ? document.documentElement : container,
                'scroll-padding',
                rects.scrollPadding
              ),
            },
          }
        },
      }

      const target = document.querySelector('#target')
      const scroller = document.querySelector('#scroller')
      const native = (style) => {
        target.style.scrollMarginTop = style.margin
        scroller.style.scrollPaddingTop = style.padding
        const [action] = window.computeScrollIntoView(target, {
          block: 'start',
        })
        target.style.scrollMarginTop = ''
        scroller.style.scrollPaddingTop = ''
        return action.top
      }
      const [custom] = window.computeScrollIntoView(target, {
        block: 'start',
        middleware: [customScrollSpacing],
      })
      return {
        custom: custom.top,
        native: native({ margin: '20px', padding: '30px' }),
        unset: native({ margin: '', padding: '' }),
      }
    })
    expect(actual.unset).toBe(500)
    expect(actual.custom).toBe(actual.native)
    expect(actual.custom).toBe(450)
  })

  test("onlyIfNeeded checks the viewport with what earlier middleware return for it, before it's reached", async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div style="height: 50px"></div>
        <div style="height: 200px; overflow: auto">
          <div id="target" style="height: 20px"></div>
          <div style="height: 500px"></div>
        </div>
        <div style="height: 2000px"></div>`
      const target = document.querySelector('#target')
      const root = document.documentElement
      const viewportPadding = {
        name: 'viewportPadding',
        fn: ({ viewport, rects }) => {
          const value = getComputedStyle(root).getPropertyValue(
            '--scroll-padding-top'
          )
          return viewport && value
            ? {
                rects: {
                  scrollPadding: Object.assign({}, rects.scrollPadding, {
                    top: parseFloat(value),
                  }),
                },
              }
            : {}
        },
      }
      const run = () =>
        window
          .computeScrollIntoView(target, {
            block: 'nearest',
            middleware: [viewportPadding, window.onlyIfNeeded()],
          })
          .map(({ el, top }) => [el.tagName.toLowerCase(), top])
      window.scrollTo(0, 0)
      const unpadded = run()
      // The target is 50px from the top, behind 100px of scroll-padding
      root.style.setProperty('--scroll-padding-top', '100px')
      const custom = run()
      root.style.removeProperty('--scroll-padding-top')
      root.style.scrollPaddingTop = '100px'
      const native = run()
      root.style.scrollPaddingTop = ''
      return { unpadded, custom, native }
    })
    expect(actual.unpadded).toEqual([])
    expect(actual.custom).toHaveLength(2)
    expect(actual.custom).toEqual(actual.native)
  })

  test('the state, and rects that earlier middleware returned', async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html
      const seen = []
      const actions = window.computeScrollIntoView(
        document.querySelector('#target'),
        {
          block: 'start',
          middleware: [
            {
              name: 'offset',
              fn: ({ rects }) => ({
                rects: { scrollMargin: { ...rects.scrollMargin, top: 10 } },
              }),
            },
            {
              name: 'record',
              fn: ({ container, viewport, scrollable, options, rects }) => {
                seen.push({
                  container: container.id || container.tagName.toLowerCase(),
                  viewport,
                  scrollable,
                  options,
                  marginTop: rects.scrollMargin.top,
                })
                return {}
              },
            },
          ],
        }
      )
      return { seen, tops: actions.map(({ top }) => Math.round(top)) }
    }, nested)
    expect(actual.seen.map(({ container }) => container)).toEqual([
      'inner',
      'outer',
      'body',
      'html',
    ])
    expect(actual.seen.map(({ scrollable }) => scrollable)).toEqual([
      true,
      true,
      false,
      true,
    ])
    expect(actual.seen.at(-1)).toMatchObject({
      viewport: true,
      options: { block: 'start', inline: 'nearest', container: 'all' },
      marginTop: 10,
    })
    // 10px above the target in #inner
    expect(actual.tops[0]).toBe(390)
  })
})

describe('targetRect', () => {
  test("aligns the rectangle, not the element's border box", async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="scroller" style="height: 180px; width: 180px; overflow: auto">
          <div style="height: 240px"></div>
          <div id="target" style="height: 60px; width: 60px; margin-left: 80px"></div>
          <div style="height: 400px; width: 400px"></div>
        </div>`
      const target = document.querySelector('#target')
      const box = target.getBoundingClientRect()
      const rect = {
        top: box.top + 50,
        bottom: box.bottom + 50,
        left: box.left + 30,
        right: box.right + 30,
      }
      const tops = (middleware) =>
        window
          .computeScrollIntoView(target, {
            block: 'start',
            inline: 'start',
            middleware,
          })
          .find(({ el }) => el.id === 'scroller')
      const element = tops([])
      const range = tops([window.targetRect(rect)])
      return {
        elementTop: element.top,
        elementLeft: element.left,
        rangeTop: range.top,
        rangeLeft: range.left,
      }
    })
    expect(actual.rangeTop).toBe(actual.elementTop + 50)
    expect(actual.rangeLeft).toBe(actual.elementLeft + 30)
  })

  test("the element's own border box matches compute without the middleware", async () => {
    const actual = await page.evaluate((html) => {
      document.body.innerHTML = html
      const target = document.querySelector('#target')
      const box = target.getBoundingClientRect()
      const rect = {
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        left: box.left,
      }
      const actions = (middleware) =>
        window
          .computeScrollIntoView(target, { block: 'center', middleware })
          .map(window.mapActions)
      return {
        element: actions([]),
        range: actions([window.targetRect(rect)]),
      }
    }, nested)
    expect(actual.range).toEqual(actual.element)
  })

  test('onlyIfNeeded checks the rectangle', async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="scroller" style="height: 200px; overflow: auto">
          <div id="target" style="height: 800px"></div>
        </div>`
      const target = document.querySelector('#target')
      const box = target.getBoundingClientRect()
      const slice = (offset) => ({
        top: box.top + offset,
        bottom: box.top + offset + 20,
        left: box.left,
        right: box.right,
      })
      const scrollerTop = (block, middleware) => {
        const action = window
          .computeScrollIntoView(target, { block, middleware })
          .find(({ el }) => el.id === 'scroller')
        return action ? action.top : 0
      }
      return {
        // The top 20px is already in view, so centering it is skipped
        visible: scrollerTop('center', [
          window.targetRect(slice(0)),
          window.onlyIfNeeded(),
        ]),
        // The element itself is 800px, so it is not fully in view
        element: scrollerTop('center', [window.onlyIfNeeded()]),
        hidden: scrollerTop('start', [
          window.targetRect(slice(350)),
          window.onlyIfNeeded(),
        ]),
      }
    })
    expect(actual.visible).toBe(0)
    expect(actual.element).toBeGreaterThan(0)
    expect(actual.hidden).toBe(350)
  })

  test("a rectangle in an iframe is what the parent document aligns, when the frame can't scroll it", async () => {
    const actual = await page.evaluate(async () => {
      document.body.style.margin = '0'
      document.body.innerHTML = `
        <div id="outer" style="height: 160px; overflow: auto">
          <div style="height: 220px"></div>
          <iframe id="frame" style="width: 200px; height: 200px; border: 0; display: block"></iframe>
          <div style="height: 500px"></div>
        </div>`
      const frame = document.querySelector('#frame')
      await new Promise((resolve) => {
        frame.addEventListener('load', resolve)
        frame.srcdoc =
          '<body style="margin:0"><div id="target" style="position:absolute;top:24px;left:16px;width:40px;height:40px"></div></body>'
      })
      const target = frame.contentDocument.querySelector('#target')
      const box = target.getBoundingClientRect()
      const rect = {
        top: box.top + 48,
        bottom: box.bottom + 48,
        left: box.left,
        right: box.right,
      }
      const outerTop = (middleware) =>
        window
          .computeScrollIntoView(target, {
            block: 'start',
            inline: 'nearest',
            middleware,
          })
          .find(({ el }) => el.id === 'outer').top
      return {
        element: outerTop([]),
        range: outerTop([window.targetRect(rect)]),
      }
    })
    expect(actual.range).toBe(actual.element + 48)
  })
})

test('the middleware compose', async () => {
  const actual = await page.evaluate((html) => {
    document.body.innerHTML = html
    return window
      .computeScrollIntoView(document.querySelector('#target'), {
        middleware: [
          window.boundary(document.querySelector('#outer')),
          window.skipOverflowHiddenElements(),
          window.onlyIfNeeded(),
        ],
      })
      .map(({ el }) => el.id)
  }, nested)
  expect(actual).toEqual(['inner', 'outer'])
})
