beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/deeply_nested_overflow')
})

describe('scrollMode: if-needed', () => {
  const instructions = [
    [0, 'start', 'start'],
    [1, 'start', 'center'],
    [2, 'start', 'end'],
    [3, 'center', 'start'],
    [4, 'center', 'center'],
    [5, 'center', 'end'],
    [6, 'end', 'start'],
    [7, 'end', 'center'],
    [8, 'end', 'end'],
  ]
  instructions.forEach(([step, block, inline]) => {
    test(`test ${step}, block ${block}, inline ${inline}`, async () => {
      const actual = await page.evaluate(
        (i, block, inline) => {
          return window
            .computeScrollIntoView(
              document.querySelectorAll('.scroll-tile')[i],
              {
                scrollMode: 'if-needed',
                block,
                inline,
              }
            )
            .map(window.mapActions)
        },
        step,
        block,
        inline
      )
      expect(actual).toHaveLength(3)
      expect(actual).toMatchSnapshot()
    })
  })
})
