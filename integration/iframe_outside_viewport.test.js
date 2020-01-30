beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/iframe_outside_viewport')
})

describe('target in iframe is outside viewport', () => {
  test('should scroll top window', async () => {
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
})
