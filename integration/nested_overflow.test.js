import { beforeAll, describe, expect, test } from 'vite-plus/test'

beforeAll(async () => {
  await page.goto('/integration/nested_overflow.html')
})

describe('scrollMode: if-needed', () => {
  test('target in view, container out of view', async () => {
    const actual = await page.evaluate(() => {
      const container = document.querySelector('.container')
      window.scrollTo(0, 0)
      container.scrollTo(250, 250)
      return window
        .computeScrollIntoViewIfNeeded(document.querySelector('.target'), {})
        .map(window.mapActions)
    })
    expect(actual).toHaveLength(2)
    expect(actual).toMatchSnapshot()
  })
})
