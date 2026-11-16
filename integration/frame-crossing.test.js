// Scrolling a target in an iframe also scrolls the scroll containers of the same-origin parent document, which align the
// iframe where the frame's own scrolling left the target
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const frameBody = (wrapperStyle) => `
  <body style='margin: 0'>
    <div style='height: 400px'></div>
    <div style='height: 100px; width: 100px; ${wrapperStyle}'>
      <div id='target' style='height: 50px; width: 50px'></div>
    </div>
    <div style='height: 400px; width: 600px'></div>
  </body>`

const loadFrame = (frameStyle, outerStyle, wrapperStyle) =>
  page.evaluate(
    async (frameCss, outerCss, body) => {
      document.body.innerHTML = `
        <div id="outer" style="width: 300px; height: 300px; ${outerCss}">
          <div style="height: 500px"></div>
          <iframe id="frame" style="width: 200px; height: 200px; ${frameCss}"></iframe>
          <div style="height: 2000px; width: 1000px"></div>
        </div>`
      const frame = document.querySelector('#frame')
      await new Promise((resolve) => {
        frame.addEventListener('load', resolve)
        frame.srcdoc = body
      })
    },
    frameStyle,
    outerStyle,
    frameBody(wrapperStyle)
  )

const cases = {
  'iframe in a scroll container': [
    'position: static',
    'overflow: auto',
    'position: static',
  ],
  'iframe with border and padding': [
    'position: static; border: 7px solid; padding: 5px',
    'overflow: auto',
    'position: static',
  ],
  'iframe in a positioned scroll container': [
    'position: absolute; top: 300px; left: 40px',
    'overflow: auto; position: relative',
    'position: static',
  ],
}

describe('frame crossing', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(cases))(
    '%s',
    async (_, [frameStyle, outerStyle, wrapperStyle]) => {
      await loadFrame(frameStyle, outerStyle, wrapperStyle)
      const results = await page.evaluate(() => {
        const frame = document.querySelector('#frame')
        const target = frame.contentDocument.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].flatMap((block) =>
          ['start', 'center', 'end', 'nearest'].map((inline) =>
            window.compareWithNative(target, { block, inline })
          )
        )
      })
      // Where the target is already visible, nothing scrolls
      expect(results.some(({ native }) => '#outer' in native)).toBe(true)
      for (const { native, computed } of results) {
        expect(computed).toEqual(native)
      }
    }
  )

  test("a fixed box in the iframe doesn't scroll the iframe, but its parent document", async () => {
    await loadFrame(
      'position: static',
      'overflow: auto',
      'position: fixed; top: 20px; left: 20px'
    )
    // Browsers don't scroll the parent document yet, but the WPT scrollIntoView-fixed.html says they should
    const result = await page.evaluate(() => {
      const frame = document.querySelector('#frame')
      const outer = document.querySelector('#outer')
      const target = frame.contentDocument.querySelector('#target')
      const actions = window
        .computeScrollIntoView(target, { block: 'start', inline: 'start' })
        .map(({ el, top, left }) => {
          el.scroll({ top, left, behavior: 'instant' })
          return `${el.ownerDocument === document ? 'parent' : 'frame'} ${el.tagName}`
        })
      const targetRect = target.getBoundingClientRect()
      const frameRect = frame.getBoundingClientRect()
      const outerRect = outer.getBoundingClientRect()
      return {
        actions,
        frameScroll: frame.contentWindow.scrollY,
        // The target is aligned with the top left corner of the scroll container
        top: Math.round(
          frameRect.top + frame.clientTop + targetRect.top - outerRect.top
        ),
        left: Math.round(
          frameRect.left + frame.clientLeft + targetRect.left - outerRect.left
        ),
      }
    })
    expect(result).toEqual({
      actions: ['parent DIV', 'parent HTML'],
      frameScroll: 0,
      top: 0,
      left: 0,
    })
  })
})
