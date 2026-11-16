// The middleware option of compute, and the boundary, skipOverflowHiddenElements and onlyIfNeeded middleware
import { beforeEach, describe, expect, test } from 'vite-plus/test'

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
