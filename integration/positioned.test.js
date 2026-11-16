// Only the scroll containers in the containing block chain of the target move it, so the others aren't scrolled
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const cases = {
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
  'an absolutely positioned target in a transformed scroll container': `
    <div id="outer" style="position: relative; height: 200px; overflow: auto">
      <div id="inner" style="height: 100px; overflow: auto; transform: translateZ(0)">
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
  'a fixed positioned target in a scroll container': `
    <div style="height: 1000px"></div>
    <div id="scroller" style="position: relative; height: 200px; overflow: auto">
      <div style="height: 300px"></div>
      <div id="target" style="position: fixed; top: 400px; height: 50px; width: 50px"></div>
      <div style="height: 1000px"></div>
    </div>`,
  'a fixed positioned target in a scroll container with a filter': `
    <div id="scroller" style="height: 200px; overflow: auto; filter: blur(0)">
      <div style="height: 300px"></div>
      <div id="target" style="position: fixed; top: 400px; height: 50px; width: 50px"></div>
      <div style="height: 1000px"></div>
    </div>`,
}

describe('positioned targets', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(cases))('%s', async (_, html) => {
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

  test('middleware still see the ancestors outside the containing block chain, as not scrollable', async () => {
    const visited = await page.evaluate((markup) => {
      document.body.innerHTML = markup
      const visits = []
      window.computeScrollIntoView(document.querySelector('#target'), {
        middleware: [
          {
            name: 'record',
            fn: ({ container, scrollable }) => {
              visits.push([container.id || container.tagName, scrollable])
              return {}
            },
          },
        ],
      })
      return visits
    }, cases['an absolutely positioned target that escapes a scroll container that is not positioned'])
    expect(visited).toEqual([
      ['inner', false],
      ['outer', true],
      ['BODY', false],
      ['HTML', true],
    ])
  })
})
