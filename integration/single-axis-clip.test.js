// A scroll container that clips one axis can't be scrolled on it, so its outer scroll containers align the target there
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const cases = {
  'inner clips y, outer clips x': [
    'overflow-x: clip; overflow-y: auto',
    'overflow-x: auto; overflow-y: clip',
  ],
  'inner clips x, outer clips y': [
    'overflow-x: auto; overflow-y: clip',
    'overflow-x: clip; overflow-y: auto',
  ],
}

describe('single-axis clip', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(cases))('%s', async (_, [outer, inner]) => {
    const results = await page.evaluate(
      (outerStyle, innerStyle) => {
        document.body.innerHTML = `
          <div style="width: 100px; height: 100px; ${outerStyle}">
            <div style="width: 300px; height: 300px"></div>
            <div style="width: 100px; height: 100px; ${innerStyle}">
              <div id="target" style="width: 40px; height: 40px; margin: 30px 0 0 200px"></div>
              <div style="width: 300px; height: 300px"></div>
            </div>
            <div style="width: 300px; height: 300px"></div>
          </div>`
        const target = document.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].flatMap((block) =>
          ['start', 'center', 'end', 'nearest'].map((inline) =>
            window.compareWithNative(target, { block, inline })
          )
        )
      },
      outer,
      inner
    )
    for (const { native, computed } of results) {
      expect(native).not.toEqual({})
      expect(computed).toEqual(native)
    }
  })
})
