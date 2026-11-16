import { beforeAll, describe, expect, test } from 'vite-plus/test'

beforeAll(async () => {
  await page.goto('/integration/iframe.html')
})

describe('scrollable element is "overflow: visible" but hidden by iframe', () => {
  test('should scroll to inside iframe', async () => {
    expect.assertions(3)
    const actual = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      const target = iframe.contentDocument.querySelector('.target')
      return window.computeScrollIntoView(target, {}).map(window.mapActions)
    })
    expect(actual).toHaveLength(1)
    expect(actual[0]).toMatchObject({ el: 'html' })
    expect(actual).toMatchSnapshot()
  })

  test('skips overflow: visible ancestors inside the iframe, and scrolls the scroll containers', async () => {
    const actual = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      const doc = iframe.contentDocument
      const scroller = doc.createElement('div')
      scroller.className = 'scroller'
      scroller.style.cssText = 'height: 100px; overflow: auto'
      const visible = doc.createElement('div')
      visible.className = 'visible'
      visible.style.cssText =
        'height: 40px; padding-top: 1px; overflow: visible'
      const target = doc.createElement('div')
      target.style.cssText = 'margin-top: 200px; height: 100px'
      visible.append(target)
      scroller.append(visible)
      doc.body.append(scroller)

      const actions = window
        .computeScrollIntoView(target)
        .map(window.mapActions)
      scroller.remove()
      return actions
    })

    expect(actual.map(({ el }) => el)).toContain('div.scroller')
    expect(actual.map(({ el }) => el)).not.toContain('div.visible')
  })
})
