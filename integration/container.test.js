// The `container` option of scrollIntoView: https://drafts.csswg.org/cssom-view/#dom-scrollintoviewoptions-container.
// Each case compares `compute` with the native scrollIntoView
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const compare = (markup, container) =>
  page.evaluate(
    ({ html, options }) => {
      document.body.innerHTML = html
      window.scrollTo(0, 0)
      return window.compareWithNative(
        document.querySelector('#target'),
        options
      )
    },
    { html: markup, options: { block: 'start', container } }
  )

const nested = `
  <div style="height: 2000px"></div>
  <div id="outer" style="height: 200px; overflow: auto">
    <div style="height: 400px"></div>
    <div id="inner" style="height: 200px; overflow: auto">
      <div style="height: 400px"></div>
      <div id="target" style="height: 100px"></div>
    </div>
    <div style="height: 400px"></div>
  </div>
  <div style="height: 2000px"></div>`

describe('container', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(['all', 'nearest'])(
    "container: '%s' with nested scroll containers",
    async (container) => {
      const { native, computed } = await compare(nested, container)
      expect(computed).toEqual(native)
      expect(Object.keys(native)).toEqual(
        container === 'all' ? ['html', '#outer', '#inner'] : ['#inner']
      )
    }
  )

  test("container: 'nearest' scrolls the viewport when there is no other scroll container", async () => {
    const { native, computed } = await compare(
      `<div style="height: 2000px"></div><div id="target" style="height: 100px"></div><div style="height: 2000px"></div>`,
      'nearest'
    )
    expect(computed).toEqual(native)
    expect(Object.keys(native)).toEqual(['html'])
  })
})
