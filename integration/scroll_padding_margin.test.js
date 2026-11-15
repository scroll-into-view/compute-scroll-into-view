// The scroll-margin of the target and the scroll-padding of its scroll containers, and of the viewport, are respected
// like browsers do: https://drafts.csswg.org/cssom-view/#dom-element-scrollintoview. Each case compares `compute` with
// the native scrollIntoView, for every block/inline combination
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const positions = ['start', 'center', 'end', 'nearest']

const compareAll = (setup) =>
  page
    .evaluate(
      ({ html, rootStyle, scroll, alignments }) => {
        document.documentElement.style.cssText = rootStyle
        document.body.innerHTML = html
        window.scrollTo(scroll.x, scroll.y)
        const target = document.querySelector('#target')
        return alignments.flatMap((block) =>
          alignments.map((inline) => ({
            options: { block, inline },
            ...window.compareWithNative(target, { block, inline }),
          }))
        )
      },
      {
        html: setup.html,
        rootStyle: setup.rootStyle ?? '',
        scroll: setup.scroll ?? { x: 0, y: 0 },
        alignments: positions,
      }
    )
    .then((results) => ({
      native: results.map(({ options, native }) => ({ options, native })),
      computed: results.map(({ options, computed }) => ({
        options,
        native: computed,
      })),
    }))

describe('scroll-padding and scroll-margin', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test('scroll-margin and scroll-padding combined', async () => {
    const { native, computed } = await compareAll({
      html: `
        <div style="height: 200px; width: 200px; overflow: auto; scroll-padding: 10px 20px 30px 40px">
          <div style="padding: 300px">
            <div id="target" style="height: 100px; width: 100px; scroll-margin: 20px 30px 40px 50px"></div>
          </div>
        </div>`,
    })
    expect(computed).toEqual(native)
  })

  test('scroll-padding in percentages is relative to the scrollport', async () => {
    const { native, computed } = await compareAll({
      html: `
        <div style="height: 200px; width: 300px; overflow: auto; scroll-padding: 10% 20%">
          <div style="padding: 300px">
            <div id="target" style="height: 50px; width: 50px"></div>
          </div>
        </div>`,
    })
    expect(computed).toEqual(native)
  })

  test('scroll-padding is measured from the padding edge of a scroll container with borders', async () => {
    const { native, computed } = await compareAll({
      html: `
        <div style="height: 200px; width: 200px; overflow: auto; border: solid black; border-width: 5px 10px 20px 15px; scroll-padding: 10px">
          <div style="padding: 300px">
            <div id="target" style="height: 50px; width: 50px; scroll-margin: 5px"></div>
          </div>
        </div>`,
    })
    expect(computed).toEqual(native)
  })

  test('scroll-padding on the root element is applied to the viewport', async () => {
    const { native, computed } = await compareAll({
      rootStyle: 'scroll-padding: 40px 30px 20px 10px',
      html: `
        <div style="width: 3000px; height: 3000px; position: relative">
          <div id="target" style="position: absolute; top: 1500px; left: 1500px; height: 100px; width: 100px; scroll-margin: 5px 10px"></div>
        </div>`,
      scroll: { x: 1400, y: 1400 },
    })
    expect(computed).toEqual(native)
  })

  test('scroll-padding and scroll-margin of nested scroll containers', async () => {
    const { native, computed } = await compareAll({
      rootStyle: 'scroll-padding-top: 30px',
      html: `
        <div style="height: 1000px"></div>
        <div style="height: 300px; width: 300px; overflow: auto; scroll-padding: 20px">
          <div style="height: 1000px; width: 1000px; padding: 400px; box-sizing: border-box">
            <div id="target" style="height: 50px; width: 50px; scroll-margin: 15px"></div>
          </div>
        </div>
        <div style="height: 3000px"></div>`,
    })
    expect(computed).toEqual(native)
  })

  test('scrollMode: "if-needed" scrolls a target that is visible, but not within the scroll-padding and scroll-margin', async () => {
    const { native, computed } = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="scroller" style="height: 200px; overflow: auto; scroll-padding-top: 50px">
          <div style="height: 500px"></div>
          <div id="target" style="height: 50px; scroll-margin-bottom: 30px"></div>
          <div style="height: 500px"></div>
        </div>`
      const scroller = document.querySelector('#scroller')
      const target = document.querySelector('#target')
      const results = []
      // The scroll-margin sticks out below the bottom edge, then the target is behind the scroll-padding, then it is within both
      for (const scrollTop of [370, 480, 440]) {
        scroller.scrollTop = scrollTop
        results.push(
          window.compareWithNative(
            target,
            { block: 'end', inline: 'nearest' },
            { block: 'end', inline: 'nearest', scrollMode: 'if-needed' }
          )
        )
      }
      return {
        native: results.map((result) => result.native),
        computed: results.map((result) => result.computed),
      }
    })
    expect(native[0]).not.toEqual({})
    expect(computed[2]).toEqual({})
    expect(computed.slice(0, 2)).toEqual(native.slice(0, 2))
  })
})
