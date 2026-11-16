// The body is a scroll container unless its overflow applies to the viewport, which happens when the root's is visible
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const cases = {
  'root overflow: hidden, body overflow: auto': [
    'height: 100%; overflow: hidden',
    'height: 100%; overflow: auto',
  ],
  "root overflow: auto that doesn't overflow, body overflow: auto": [
    'height: 100%; overflow: auto',
    'height: 100%; overflow: auto',
  ],
  'root overflow: visible, body overflow: auto, which applies to the viewport':
    ['', 'height: 100%; overflow: auto'],
  'root overflow: clip, body overflow: scroll': [
    'height: 100%; overflow: clip',
    'height: 100%; overflow: scroll',
  ],
}

describe('body overflow', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test.each(Object.entries(cases))('%s', async (_, [root, body]) => {
    const results = await page.evaluate(
      (rootStyle, bodyStyle) => {
        document.documentElement.style.cssText = rootStyle
        document.body.style.cssText = `margin: 0; ${bodyStyle}`
        document.body.innerHTML = `
          <div style="height: 2000px"></div>
          <div id="target" style="height: 50px"></div>
          <div style="height: 2000px"></div>`
        const target = document.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].map((block) =>
          window.compareWithNative(target, { block, inline: 'nearest' })
        )
      },
      root,
      body
    )
    for (const { native, computed } of results) {
      expect(native).not.toEqual({})
      expect(computed).toEqual(native)
    }
  })
})
