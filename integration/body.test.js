beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/body')
})

describe('document.body !== document.scrollingElement edge cases', () => {
  test('should not attempt scrolling body', async () => {
    expect.assertions(4)
    const actual = await page.evaluate(() => {
      return window
        .computeScrollIntoView(document.querySelector('.target'), {
          scrollMode: 'always',
        })
        .map(window.mapActions)
    })
    expect(actual).toHaveLength(1)
    expect(actual[0]).toMatchObject({ el: 'html' })
    expect(actual).toMatchSnapshot()
    const nativeTop = await page.evaluate(() => {
      document.querySelector('.target').scrollIntoView({ block: 'center' })
      return window.scrollY
    })
    expect(actual[0].top).toBe(nativeTop)
  })
})
