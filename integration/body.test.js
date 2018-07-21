beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/body')
})

describe('document.body !== document.scrollingElement edge cases', () => {
  test('should not attempt scrolling body', async () => {
    expect.assertions(3)
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
  })
})
