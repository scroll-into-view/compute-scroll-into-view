// Only the ancestors whose scrolling moves a positioned target are scrolled: the offset parent chain of an absolutely
// positioned target, and the viewport for a fixed positioned one
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const nativeCases = {
  'an absolutely positioned target in a positioned scroll container': `
    <div id="scroller" style="position: relative; height: 200px; overflow: auto">
      <div style="height: 300px"></div>
      <div id="target" style="position: absolute; top: 400px; height: 50px; width: 50px"></div>
      <div style="height: 1000px"></div>
    </div>`,
  'an absolutely positioned target that escapes a scroll container that is not positioned': `
    <div id="outer" style="position: relative; height: 200px; overflow: auto">
      <div id="inner" style="height: 100px; overflow: auto">
        <div style="height: 300px"></div>
        <div id="target" style="position: absolute; top: 400px; height: 50px; width: 50px"></div>
      </div>
      <div style="height: 1000px"></div>
    </div>`,
  'an absolutely positioned target in a positioned box inside a scroll container': `
    <div id="scroller" style="height: 200px; overflow: auto">
      <div style="height: 300px"></div>
      <div style="position: relative; height: 50px">
        <div id="target" style="position: absolute; top: 100px; height: 50px; width: 50px"></div>
      </div>
      <div style="height: 1000px"></div>
    </div>`,
  'an absolutely positioned target in an absolutely positioned box that escapes a scroll container': `
    <div id="outer" style="position: relative; height: 200px; overflow: auto">
      <div id="inner" style="height: 100px; overflow: auto">
        <div style="height: 300px"></div>
        <div style="position: absolute; top: 300px; height: 50px; width: 100px">
          <div style="height: 200px"></div>
          <div id="target" style="position: absolute; top: 100px; height: 50px; width: 50px"></div>
        </div>
      </div>
      <div style="height: 1000px"></div>
    </div>`,
  'an absolutely positioned target without a positioned ancestor, which moves with the viewport': `
    <div id="scroller" style="height: 200px; overflow: auto">
      <div style="height: 300px"></div>
      <div id="target" style="position: absolute; top: 1500px; height: 50px; width: 50px"></div>
      <div style="height: 1000px"></div>
    </div>`,
}

describe('positioned targets', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(nativeCases))('%s', async (_, html) => {
    const results = await page.evaluate((markup) => {
      document.body.innerHTML = `${markup}<div style="height: 2000px"></div>`
      const target = document.querySelector('#target')
      return ['start', 'center', 'end', 'nearest'].map((block) =>
        window.compareWithNative(target, { block, inline: 'nearest' })
      )
    }, html)
    for (const { native, computed } of results) {
      expect(computed).toEqual(native)
    }
  })

  test('a fixed positioned target scrolls the viewport, and not the scroll containers around it', async () => {
    const actions = await page.evaluate(() => {
      document.body.innerHTML = `
        <div style="height: 1000px"></div>
        <div id="scroller" style="position: relative; height: 200px; overflow: auto">
          <div style="height: 300px"></div>
          <div id="target" style="position: fixed; top: 400px; height: 50px; width: 50px"></div>
          <div style="height: 1000px"></div>
        </div>
        <div style="height: 2000px"></div>`
      return window
        .computeScrollIntoView(document.querySelector('#target'), {
          block: 'start',
        })
        .map(window.mapActions)
    })
    expect(actions).toEqual([{ el: 'html', top: 400, left: 0 }])
  })

  test('the boundary middleware checks the target against its offset parent', async () => {
    const actions = await page.evaluate(() => {
      document.body.innerHTML = `
        <div id="outer" style="position: relative; height: 200px; overflow: auto">
          <div id="inner" style="height: 100px; overflow: auto">
            <div style="height: 300px"></div>
            <div id="target" style="position: absolute; top: 400px; height: 50px; width: 50px"></div>
          </div>
          <div style="height: 1000px"></div>
        </div>
        <div style="height: 2000px"></div>`
      const target = document.querySelector('#target')
      return window
        .computeScrollIntoView(target, {
          middleware: [window.boundary((parent) => parent !== target)],
        })
        .map(window.mapActions)
    })
    expect(actions).toEqual([])
  })
})
