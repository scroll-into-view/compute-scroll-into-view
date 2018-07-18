beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/nested_overflow')
})

describe('scrollMode: if-needed', () => {
  test('target in view, container out of view', async () => {
    const actual = await page.evaluate(() => {
      const container = document.querySelector('.container')
      window.scrollTo(0, 0)
      container.scrollTo(250, 250)
      return window.computeScrollIntoView(document.querySelector('.target'), {
        scrollMode: 'if-needed',
      })
    })
    expect(actual).toHaveLength(2)
    expect(actual).toMatchSnapshot()
  })
})
