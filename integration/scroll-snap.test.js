// scrollIntoView() lands on the target's own snap position in its nearest scroll container when that's a scroll snap
// container. The browser snaps the inner scroller either way, the outer one shows where `compute` expected it to land
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const cases = {
  'both axes, end': ['scroll-snap-type: both mandatory', 'end'],
  'x axis, center end': ['scroll-snap-type: x mandatory', 'center end'],
  'block axis in vertical-rl, start end': [
    'scroll-snap-type: block mandatory; writing-mode: vertical-rl',
    'start end',
  ],
  'inline axis in rtl, end': [
    'scroll-snap-type: inline mandatory; direction: rtl',
    'end',
  ],
  'scroll padding and margin, center': [
    'scroll-snap-type: both mandatory; scroll-padding: 10px 20px',
    'center; scroll-margin: 5px 15px',
  ],
  'no scroll snap container': ['scroll-snap-type: none', 'end'],
}

describe('scroll snap', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(cases))('%s', async (_, [inner, align]) => {
    const results = await page.evaluate(
      (innerStyle, snapAlign) => {
        document.body.innerHTML = `
          <div id="outer" style="width: 300px; height: 300px; overflow: auto">
            <div style="width: 1000px; height: 1000px"></div>
            <div id="inner" style="width: 200px; height: 200px; overflow: auto; ${innerStyle}">
              <div style="width: 600px; height: 600px; position: relative">
                <div id="target" style="position: absolute; left: 250px; top: 250px; width: 50px; height: 50px; scroll-snap-align: ${snapAlign}"></div>
              </div>
            </div>
            <div style="width: 1000px; height: 1000px"></div>
          </div>`
        const target = document.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].flatMap((block) =>
          ['start', 'center', 'end', 'nearest'].map((inline) =>
            window.compareWithNative(target, { block, inline })
          )
        )
      },
      inner,
      align
    )
    for (const { native, computed } of results) {
      expect(native).toHaveProperty('#outer')
      expect(computed).toEqual(native)
    }
  })
})
