// The middleware option of compute, and the boundary, skipOverflowHiddenElements, onlyIfNeeded and selection middleware
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
    'selection',
    'skipOverflowHiddenElements',
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

// An editor: 20px lines in a 100px tall scroller, with text that wraps to 15 lines of 20 characters. Characters are
// measured as glyph boxes, which are a pixel inside the line boxes, so their positions are checked to within 5px
const editor = `
  <div style="height: 300px"></div>
  <div id="editor" style="height: 100px; width: 240px; overflow: auto; font: 16px/20px monospace">
    <p id="text" style="margin: 0; width: 20ch; word-break: break-all">${'x'.repeat(20 * 15)}</p>
    <p id="empty" style="margin: 0"><br></p>
    <p id="wrapped" style="margin: 0; width: 20ch; word-break: break-all">aaaa<strong>${'x'.repeat(100)}</strong></p>
  </div>
  <div style="height: 2000px"></div>`

// Helpers for the fixture page, evaluated there. `scrollEditor` is how far the editor is scrolled for the text, with
// `block` and `middleware`, or `null` when it isn't. The viewport isn't scrolled, as the editor is in view. `caretAt`
// is a collapsed range at `offset` in the text
const editorHelpers = `({
  scrollEditor: (block, middleware, target = document.querySelector('#text')) => {
    const action = window
      .computeScrollIntoView(target, {
        block,
        inline: 'nearest',
        middleware,
      })
      .find(({ el }) => el.id === 'editor')
    return action ? Math.round(action.top) : null
  },
  caretAt: (offset) => {
    const range = document.createRange()
    range.setStart(document.querySelector('#text').firstChild, offset)
    range.collapse(true)
    return range
  },
})`

describe('selection', () => {
  test('a collapsed caret aligns the line it is on, where the element would not scroll', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor, caretAt } = window.eval(helpers)
        // The caret is on the 8th line, which starts 140px into the paragraph
        return {
          element: scrollEditor('nearest', []),
          caret: scrollEditor('nearest', [
            window.selection(caretAt(20 * 7 + 3)),
          ]),
        }
      },
      editor,
      editorHelpers
    )
    // The paragraph is taller than the editor and already overlaps it, so 'nearest' leaves it alone
    expect(actual.element).toBe(0)
    // The line's bottom edge (160px) at the editor's bottom edge (100px)
    expect(actual.caret).toBeCloseTo(60, -1)
  })

  test('a caret at the end of a text node is measured from the character before it', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor, caretAt } = window.eval(helpers)
        return scrollEditor('nearest', [window.selection(caretAt(20 * 15))])
      },
      editor,
      editorHelpers
    )
    // The last line's bottom edge (300px) at the editor's bottom edge
    expect(actual).toBeCloseTo(200, -1)
  })

  test('a caret on an empty line is measured as the line', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const range = document.createRange()
        range.setStart(document.querySelector('#empty'), 0)
        range.collapse(true)
        return scrollEditor('nearest', [window.selection(range)])
      },
      editor,
      editorHelpers
    )
    // The empty paragraph is the 16th line, with its bottom edge at 320px
    expect(actual).toBeCloseTo(220, -1)
  })

  test('a caret next to an inline wrapper is measured at the character there, not the wrapper', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const wrapped = document.querySelector('#wrapped')
        const caret = (offset) => {
          const range = document.createRange()
          range.setStart(wrapped, offset)
          range.collapse(true)
          return range
        }
        return {
          // After the <strong>, at the end of the paragraph
          after: scrollEditor('nearest', [window.selection(caret(2))]),
          // Before the <strong>, after the "aaaa"
          before: scrollEditor('nearest', [window.selection(caret(1))]),
        }
      },
      editor,
      editorHelpers
    )
    // The paragraph starts at 320px and wraps over 6 lines, 4 of which the <strong> spans past the editor's height.
    // The caret after it is on the last line, with its bottom edge at 440px
    expect(actual.after).toBeCloseTo(340, -1)
    // The caret before it is on the first line, with its bottom edge at 340px
    expect(actual.before).toBeCloseTo(240, -1)
  })

  test('a multi-line selection aligns its focus end by default, and its bounds on request', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const text = document.querySelector('#text').firstChild
        // Lines 3 through 9: a 140px tall selection, which is taller than the editor
        const range = document.createRange()
        range.setStart(text, 20 * 2)
        range.setEnd(text, 20 * 9)
        return {
          focus: scrollEditor('nearest', [window.selection(range)]),
          bounds: scrollEditor('nearest', [
            window.selection(range, { align: 'bounds' }),
          ]),
        }
      },
      editor,
      editorHelpers
    )
    // The focus is the end of line 9, whose bottom edge is at 180px
    expect(actual.focus).toBeCloseTo(80, -1)
    // The bounds are taller than the editor, so 'nearest' aligns their start edge, at 40px
    expect(actual.bounds).toBeCloseTo(40, -1)
  })

  test("a backward Selection's focus is its start, and it's the document's selection by default", async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const text = document.querySelector('#text').firstChild
        // Selected from the end of line 9 back to the start of line 3
        const selected = document.getSelection()
        selected.setBaseAndExtent(text, 20 * 9, text, 20 * 2)
        const result = {
          explicit: scrollEditor('nearest', [window.selection(selected)]),
          implicit: scrollEditor('nearest', [window.selection()]),
          range: scrollEditor('nearest', [
            window.selection(selected.getRangeAt(0)),
          ]),
          // The box around the selection is taller than the editor, so its start edge (line 3's) is aligned
          bounds: scrollEditor('nearest', [
            window.selection(selected, { align: 'bounds' }),
          ]),
        }
        selected.removeAllRanges()
        return result
      },
      editor,
      editorHelpers
    )
    // Line 3 is in view already: its bottom edge is at 60px, inside the 100px tall editor
    expect(actual.explicit).toBe(0)
    expect(actual.implicit).toBe(actual.explicit)
    // The range has no direction, so its focus is its end
    expect(actual.range).toBeCloseTo(80, -1)
    expect(actual.bounds).toBeCloseTo(40, -1)
  })

  test('a caret in a long line scrolls horizontally', async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="editor" style="height: 100px; width: 200px; overflow: auto; font: 16px/20px monospace; white-space: nowrap">
          <p id="text" style="margin: 0">${'x'.repeat(100)}</p>
        </div>`
      const text = document.querySelector('#text').firstChild
      const range = document.createRange()
      range.setStart(text, 50)
      range.setEnd(text, 51)
      const character = range.getBoundingClientRect()
      const scroller = document.querySelector('#editor')
      range.collapse(true)
      const [action] = window.computeScrollIntoView(text.parentElement, {
        block: 'nearest',
        inline: 'nearest',
        middleware: [window.selection(range)],
      })
      return {
        left: action.left,
        editor: action.el.id,
        // The 51st character's right edge at the editor's right edge
        expected:
          character.right -
          scroller.getBoundingClientRect().left -
          scroller.clientWidth,
      }
    })
    expect(actual.editor).toBe('editor')
    expect(actual.expected).toBeGreaterThan(0)
    expect(actual.left).toBeCloseTo(actual.expected, 1)
  })

  test("the bounds of a Selection with several ranges are the ranges', not what's between them", async () => {
    const actual = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="editor" style="height: 100px; width: 100px; overflow: auto; font: 16px/20px monospace; white-space: nowrap">
          <p id="first" style="margin: 0">aaaa</p>
          <p style="margin: 0">${'b'.repeat(60)}</p>
          <p id="last" style="margin: 0">cccc</p>
        </div>`
      const ranges = ['#first', '#last'].map((selector) => {
        const range = document.createRange()
        range.selectNodeContents(document.querySelector(selector))
        return range
      })
      // Chromium keeps one range, so this is what Firefox gives for a selection across table cells
      const selected = {
        rangeCount: ranges.length,
        getRangeAt: (index) => ranges[index],
      }
      const [action] = window.computeScrollIntoView(
        document.querySelector('#first'),
        {
          block: 'nearest',
          inline: 'end',
          middleware: [window.selection(selected, { align: 'bounds' })],
        }
      )
      return { left: action.left }
    })
    // The ranges end at 64px, inside the 100px wide editor, which can't scroll back past its start. The box between
    // them is about 580px wide
    expect(actual.left).toBeLessThanOrEqual(0)
  })

  test('onlyIfNeeded checks the caret, not the element', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor, caretAt } = window.eval(helpers)
        return {
          // Line 2 is in view
          visible: scrollEditor('center', [
            window.selection(caretAt(25)),
            window.onlyIfNeeded(),
          ]),
          // The paragraph isn't fully in view
          element: scrollEditor('center', [window.onlyIfNeeded()]),
          // Line 11 isn't in view, so its center (210px) is at the editor's center (50px)
          hidden: scrollEditor('center', [
            window.selection(caretAt(205)),
            window.onlyIfNeeded(),
          ]),
        }
      },
      editor,
      editorHelpers
    )
    expect(actual.visible).toBe(null)
    expect(actual.element).not.toBe(null)
    expect(actual.hidden).toBe(160)
  })

  test('a selection with nothing to measure leaves the element in place', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        document.getSelection().removeAllRanges()
        return {
          element: scrollEditor('start', []),
          none: scrollEditor('start', [window.selection()]),
        }
      },
      editor,
      editorHelpers
    )
    expect(actual.element).toBe(0)
    expect(actual.none).toBe(actual.element)
  })

  test('a Range target aligns its bounds, and selection() without an argument its focus', async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const text = document.querySelector('#text').firstChild
        // Lines 3 through 9, like the multi-line selection above
        const range = document.createRange()
        range.setStart(text, 20 * 2)
        range.setEnd(text, 20 * 9)
        // The document's selection is somewhere else, so selection() has to use the target
        document
          .getSelection()
          .selectAllChildren(document.querySelector('#empty'))
        const result = {
          bounds: scrollEditor('nearest', [], range),
          focus: scrollEditor('nearest', [window.selection()], range),
          element: scrollEditor('nearest', [window.selection(range)]),
          state: null,
        }
        window.computeScrollIntoView(range, {
          middleware: [
            {
              name: 'spy',
              fn: (state) => {
                result.state ??= {
                  target: state.target.id,
                  selection: state.selection === range,
                }
                return {}
              },
            },
          ],
        })
        document.getSelection().removeAllRanges()
        return result
      },
      editor,
      editorHelpers
    )
    // The bounds are taller than the editor, so 'nearest' aligns their start edge, at 40px
    expect(actual.bounds).toBeCloseTo(40, -1)
    // The focus is the end of line 9, whose bottom edge is at 180px
    expect(actual.focus).toBeCloseTo(80, -1)
    // The same as the element around the focus with selection(range)
    expect(actual.focus).toBe(actual.element)
    expect(actual.state).toEqual({ target: 'text', selection: true })
  })

  test("a Selection target walks from its focus, and an empty one doesn't scroll", async () => {
    const actual = await page.evaluate(
      (html, helpers) => {
        document.body.innerHTML = html
        const { scrollEditor } = window.eval(helpers)
        const text = document.querySelector('#text').firstChild
        const selected = document.getSelection()
        // Backward, from the end of line 9 back to the start of line 3
        selected.setBaseAndExtent(text, 20 * 9, text, 20 * 2)
        const result = {
          bounds: scrollEditor('nearest', [], selected),
          focus: scrollEditor('nearest', [window.selection()], selected),
        }
        selected.removeAllRanges()
        result.empty = window.computeScrollIntoView(selected).length
        return result
      },
      editor,
      editorHelpers
    )
    expect(actual.bounds).toBeCloseTo(40, -1)
    // The focus of a backward selection is its start, on line 3, which is in view
    expect(actual.focus).toBe(0)
    expect(actual.empty).toBe(0)
  })

  test("a caret in an iframe is what the parent document aligns, when the frame can't scroll it", async () => {
    const actual = await page.evaluate(async () => {
      document.body.style.margin = '0'
      document.body.innerHTML = `
        <div id="outer" style="height: 160px; overflow: auto">
          <div style="height: 220px"></div>
          <iframe id="frame" style="width: 300px; height: 300px; border: 0; display: block"></iframe>
          <div style="height: 500px"></div>
        </div>`
      const frame = document.querySelector('#frame')
      await new Promise((resolve) => {
        frame.addEventListener('load', resolve)
        frame.srcdoc = `<body style="margin: 0; font: 16px/20px monospace">
          <p id="text" style="margin: 0; width: 20ch; word-break: break-all">${'x'.repeat(20 * 5)}</p>
        </body>`
      })
      const text = frame.contentDocument.querySelector('#text')
      // The caret is on the 4th line, 60px into the paragraph
      const range = frame.contentDocument.createRange()
      range.setStart(text.firstChild, 20 * 3 + 1)
      range.collapse(true)
      const outerTop = (middleware) =>
        window
          .computeScrollIntoView(text, { block: 'start', middleware })
          .find(({ el }) => el.id === 'outer').top
      return {
        element: outerTop([]),
        caret: outerTop([window.selection(range)]),
      }
    })
    // The glyph box is a pixel inside the line box on some platforms
    expect(actual.caret).toBeCloseTo(actual.element + 60, -1)
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
