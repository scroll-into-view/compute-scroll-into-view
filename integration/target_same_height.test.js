beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/target_same_height')
})

describe('the "nearest" option works with target and frame having equal dimensions', () => {
  test('block: "nearest"', async () => {
    expect.assertions(3)
    const actual = await page.evaluate(() => {
      return window
        .computeScrollIntoView(document.querySelector('.target'), {
          block: 'nearest',
        })
        .map(window.mapActions)
    })
    expect(actual).toHaveLength(2)
    expect(actual[0]).toMatchObject({ el: 'div.container', left: 0, top: 100 })
    expect(actual).toMatchSnapshot()
  })
})
