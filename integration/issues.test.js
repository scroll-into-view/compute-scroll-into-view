// Reproductions of the bugs reported in open issues and pull requests. Each compares `compute` with the browser's own
// scrollIntoView. `test.fails` marks the ones that `compute` gets wrong today: when a fix lands, flip it to `test`
import { beforeEach, describe, expect, test } from 'vite-plus/test'

// Loads issues-frame.html, with its own copy of `compute`, into a frame below the fold of a scrollable page
const loadFrame = () =>
  page.evaluate(async () => {
    document.body.innerHTML = `
      <div style="height: 1000px"></div>
      <iframe id="frame" style="height: 300px; width: 300px; border: 0"></iframe>
      <div style="height: 2000px"></div>`
    const frame = document.querySelector('#frame')
    await new Promise((resolve) => {
      frame.addEventListener('load', resolve)
      frame.src = '/integration/issues-frame.html'
    })
    await new Promise((resolve) => {
      const ready = () =>
        frame.contentWindow.computeScrollIntoView
          ? resolve()
          : setTimeout(ready, 10)
      ready()
    })
  })

describe('issues', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test('#918, #919: ancestors that are not in the containing block chain of a positioned target are not scrolled', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.body.innerHTML = `
          <div id="scroller" style="position: relative; height: 200px; overflow: auto">
            <div id="clip" style="height: 100px; overflow: auto">
              <div style="height: 300px"></div>
              <div id="target" style="position: absolute; top: 400px; height: 50px; width: 50px"></div>
            </div>
            <div style="height: 1000px"></div>
          </div>`
      return window.compareWithNative(document.querySelector('#target'), {
        block: 'start',
        inline: 'nearest',
      })
    })
    expect(computed).toEqual(native)
  })

  test("#916, #917: scroll containers in the shadow tree of the target's slot are scrolled", async () => {
    const { native, computed } = await page.evaluate(() => {
      document.body.innerHTML = `
          <div id="host"><div id="target" style="height: 100px">target</div></div>
          <div style="height: 2000px"></div>`
      const host = document.querySelector('#host')
      host.attachShadow({ mode: 'open' }).innerHTML = `
          <div id="shadow-scroller" style="height: 200px; overflow: auto">
            <div style="height: 600px"></div>
            <slot></slot>
            <div style="height: 600px"></div>
          </div>`
      return window.compareWithNative(document.querySelector('#target'), {
        block: 'start',
        inline: 'nearest',
      })
    })
    expect(native).toHaveProperty(['#host #shadow-scroller'])
    expect(computed).toEqual(native)
  })

  test('#831: scroll-padding on the scroll container is respected', async () => {
    const { native, computed } = await page
      .evaluate(() => {
        document.body.innerHTML = `
          <div id="scroller" style="height: 200px; overflow: auto; scroll-padding: 30px 0 50px">
            <div style="height: 500px"></div>
            <div id="target" style="height: 50px"></div>
            <div style="height: 500px"></div>
          </div>`
        const target = document.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].map((block) =>
          window.compareWithNative(target, { block, inline: 'nearest' })
        )
      })
      .then((results) => ({
        native: results.map((result) => result.native),
        computed: results.map((result) => result.computed),
      }))
    expect(computed).toEqual(native)
  })

  test('#817: scroll-padding (a fixed header) is part of the visibility check of scrollMode: "if-needed"', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.documentElement.style.scrollPaddingTop = '70px'
      document.body.innerHTML = `
          <header style="position: fixed; top: 0; height: 70px; width: 100%; background: white"></header>
          <div style="height: 1000px"></div>
          <div id="target" style="height: 50px"></div>
          <div style="height: 2000px"></div>`
      // The target is in the viewport, behind the header
      window.scrollTo(0, 980)
      return window.compareWithNative(
        document.querySelector('#target'),
        { block: 'nearest', inline: 'nearest' },
        { block: 'nearest', inline: 'nearest' },
        window.computeScrollIntoViewIfNeeded
      )
    })
    expect(native).not.toEqual({})
    expect(computed).toEqual(native)
  })

  test('#933: scroll-margin is applied correctly with block: "center"', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.body.innerHTML = `
          <div id="scroller" style="height: 200px; width: 200px; overflow: auto">
            <div style="padding: 300px">
              <div id="target" style="height: 100px; width: 100px; scroll-margin: 20px 30px 40px 50px"></div>
            </div>
          </div>`
      return window.compareWithNative(document.querySelector('#target'), {
        block: 'center',
        inline: 'center',
      })
    })
    expect(computed).toEqual(native)
  })

  test('#933: scroll-margin is applied correctly with block: "nearest"', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.body.innerHTML = `
          <div id="scroller" style="height: 200px; width: 200px; overflow: auto">
            <div style="padding: 300px">
              <div id="target" style="height: 100px; width: 100px; scroll-margin: 20px 30px 40px 50px"></div>
            </div>
          </div>`
      return window.compareWithNative(document.querySelector('#target'), {
        block: 'nearest',
        inline: 'nearest',
      })
    })
    expect(computed).toEqual(native)
  })

  test('#827: a body with overflow: auto, under a root with overflow: hidden, is scrolled', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.documentElement.style.cssText = 'height: 100%; overflow: hidden'
      document.body.style.cssText = 'height: 100%; overflow: auto'
      document.body.innerHTML = `
          <div style="height: 2000px"></div>
          <div id="target" style="height: 50px"></div>
          <div style="height: 2000px"></div>`
      return window.compareWithNative(document.querySelector('#target'), {
        block: 'start',
        inline: 'nearest',
      })
    })
    expect(native).toHaveProperty(['body'])
    expect(computed).toEqual(native)
  })

  test('#821, #907: right-to-left scroll containers get negative scrollLeft', async () => {
    const { native, computed } = await page
      .evaluate(() => {
        document.body.innerHTML = `
          <div id="scroller" dir="rtl" style="width: 200px; overflow: auto; white-space: nowrap">
            ${Array.from({ length: 10 }, (_, index) => `<span id="item-${index}" style="display: inline-block; width: 100px">${index}</span>`).join('')}
          </div>`
        const target = document.querySelector('#item-7')
        return ['start', 'center', 'end', 'nearest'].map((inline) =>
          window.compareWithNative(target, { block: 'nearest', inline })
        )
      })
      .then((results) => ({
        native: results.map((result) => result.native),
        computed: results.map((result) => result.computed),
      }))
    expect(computed).toEqual(native)
  })

  test('#652: scrollMode: "if-needed" leaves a visible target alone when the root is height: 100% and scrolled past it', async () => {
    const actions = await page.evaluate(() => {
      document.documentElement.style.height = '100%'
      document.body.innerHTML = `
          <div style="height: 1500px"></div>
          <div id="target" style="height: 50px"></div>
          <div style="height: 3000px"></div>`
      window.scrollTo(0, 1400)
      return window
        .computeScrollIntoViewIfNeeded(document.querySelector('#target'), {
          block: 'nearest',
          inline: 'nearest',
        })
        .map(window.mapActions)
    })
    expect(actions).toEqual([])
  })

  describe('iframes', () => {
    test.fails('#694: scrolling a target in a frame from inside the frame scrolls the parent document too', async () => {
      await loadFrame()
      const { native, computed } = await page.evaluate(() => {
        const frame = document.querySelector('#frame')
        return window.compareWithNative(
          frame.contentDocument.querySelector('.target'),
          { block: 'start', inline: 'nearest' },
          { block: 'start', inline: 'nearest' },
          frame.contentWindow.computeScrollIntoView
        )
      })
      expect(native).toHaveProperty(['html'])
      expect(computed).toEqual(native)
    })

    test.fails("#854: scrolling a target in a frame from the parent document's context uses the frame's viewport", async () => {
      await loadFrame()
      const { native, computed } = await page.evaluate(() => {
        const frame = document.querySelector('#frame')
        // Below the 300px frame's viewport, but within the 600px top-level viewport
        frame.contentWindow.scrollTo(0, 690)
        return window.compareWithNative(
          frame.contentDocument.querySelector('.small'),
          { block: 'nearest', inline: 'nearest' },
          { block: 'nearest', inline: 'nearest' },
          window.computeScrollIntoViewIfNeeded
        )
      })
      expect(native).toHaveProperty(['#frame html'])
      expect(computed['#frame html']).toEqual(native['#frame html'])
    })

    test('#914, #922: overflow: visible ancestors in a frame are not scrolled', async () => {
      await loadFrame()
      const actions = await page.evaluate(() => {
        const frame = document.querySelector('#frame')
        return frame.contentWindow
          .computeScrollIntoView(
            frame.contentDocument.querySelector('.target'),
            { block: 'start', inline: 'nearest' }
          )
          .map(window.mapActions)
      })
      expect(actions.map(({ el }) => el)).not.toContain('div.visible')
    })
  })
})

describe('issues in quirks mode', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues-quirks.html')
  })

  test('#292: the body can be scrolled into view when it is the scrollingElement', async () => {
    const { native, computed } = await page.evaluate(() => {
      window.scrollTo(0, 1000)
      return window.compareWithNative(document.body, {
        block: 'start',
        inline: 'nearest',
      })
    })
    expect(native).toEqual({ body: { left: 0, top: 0 } })
    expect(computed).toEqual(native)
  })
})
