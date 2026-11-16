// The viewport is an ancestor of every element, so the scrolling element and the root can be scrolled into view too
import { describe, expect, test } from 'vite-plus/test'

const compareAll = (selector) =>
  page.evaluate((query) => {
    const target = document.querySelector(query)
    return ['start', 'center', 'end', 'nearest'].map((block) => {
      window.scrollTo(0, 1000)
      return window.compareWithNative(target, { block, inline: 'nearest' })
    })
  }, selector)

describe('standards mode, where the root is the scrolling element', () => {
  test.each(['html', 'body'])('%s', async (selector) => {
    await page.goto('/integration/issues.html')
    await page.evaluate(() => {
      document.body.innerHTML = '<div style="height: 3000px"></div>'
    })
    const results = await compareAll(selector)
    expect(results[0].native).toHaveProperty(['html'])
    for (const { native, computed } of results) {
      expect(computed).toEqual(native)
    }
  })
})

describe('quirks mode, where the body is the scrolling element', () => {
  test.each(['html', 'body'])('%s', async (selector) => {
    await page.goto('/integration/issues-quirks.html')
    const results = await compareAll(selector)
    expect(results[0].native).toHaveProperty(['body'])
    for (const { native, computed } of results) {
      expect(computed).toEqual(native)
    }
  })
})
