beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/iframe')
})

describe('scrollable element is "overflow: visible" but hidden by iframe', () => {
  test('should scroll to inside iframe', async () => {
    expect.assertions(3)
    const actual = await page.evaluate(() => {
      const iframe = document.querySelector('iframe')
      const target = iframe.contentDocument.querySelector('.target')
      return window
        .computeScrollIntoView(target, {
          scrollMode: 'always',
        })
        .map(window.mapActions)
    })
    expect(actual).toHaveLength(1)
    expect(actual[0]).toMatchObject({ el: 'html' })
    expect(actual).toMatchSnapshot()
  })

  test('should skip overflow-visible parents inside the iframe', async () => {
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
      visible.appendChild(target)
      scroller.appendChild(visible)
      doc.body.appendChild(scroller)

      const actions = window
        .computeScrollIntoView(target, {
          scrollMode: 'always',
        })
        .map(window.mapActions)
      scroller.remove()
      return actions
    })

    expect(actual.some(({ el }) => el === 'div.scroller')).toBe(true)
    expect(actual.some(({ el }) => el === 'div.visible')).toBe(false)
  })
})
