// Alignment follows the target's writing mode and direction, like browsers do, even where its scroll containers have
// other ones: https://github.com/w3c/csswg-drafts/issues/11796. Each case compares `compute` with the native
// scrollIntoView, for every block/inline combination
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const positions = ['start', 'center', 'end', 'nearest']

const compareAll = (setup) =>
  page
    .evaluate(
      ({ html, dir, alignments }) => {
        document.documentElement.dir = dir
        document.body.innerHTML = html
        const target = document.querySelector('#target')
        return alignments.flatMap((block) =>
          alignments.map((inline) => ({
            options: { block, inline },
            ...window.compareWithNative(target, { block, inline }),
          }))
        )
      },
      { html: setup.html, dir: setup.dir ?? 'ltr', alignments: positions }
    )
    .then((results) => ({
      native: results.map(({ options, native }) => ({ options, native })),
      computed: results.map(({ options, computed }) => ({
        options,
        native: computed,
      })),
    }))

describe('writing modes', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each([
    ['vertical-rl', 'ltr'],
    ['vertical-lr', 'rtl'],
    ['sideways-lr', 'ltr'],
    ['horizontal-tb', 'rtl'],
  ])(
    'a %s %s target in a horizontal-tb ltr scroll container',
    async (writingMode, direction) => {
      const { native, computed } = await compareAll({
        html: `
        <div id="scroller" style="width: 300px; height: 300px; overflow: scroll">
          <div style="position: relative; width: 1000px; height: 1000px">
            <div id="target" style="position: absolute; left: 400px; top: 500px; width: 100px; height: 50px; writing-mode: ${writingMode}; direction: ${direction}"></div>
          </div>
        </div>`,
      })
      expect(computed).toEqual(native)
    }
  )

  test('a horizontal-tb ltr target in a vertical-rl rtl scroll container', async () => {
    const { native, computed } = await compareAll({
      html: `
        <div id="scroller" style="width: 300px; height: 300px; overflow: scroll; writing-mode: vertical-rl; direction: rtl">
          <div style="position: relative; width: 1000px; height: 1000px">
            <div id="target" style="position: absolute; left: 400px; top: 500px; width: 100px; height: 50px; writing-mode: horizontal-tb; direction: ltr"></div>
          </div>
        </div>`,
    })
    expect(computed).toEqual(native)
  })

  test('a target in a right-to-left document scrolls the viewport to negative scrollX', async () => {
    const { native, computed } = await compareAll({
      dir: 'rtl',
      html: `
        <div style="position: relative; width: 3000px; height: 3000px">
          <div id="target" style="position: absolute; right: 1500px; top: 1500px; width: 100px; height: 50px"></div>
        </div>`,
    })
    expect(native[0].native.html.left).toBeLessThan(0)
    expect(computed).toEqual(native)
  })
})
