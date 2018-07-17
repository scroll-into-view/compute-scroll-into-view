beforeAll(async () => {
  await page.goto('http://localhost:3000/integration/viewport')
})

const ScrollLogicalPosition = ['start', 'center', 'end', 'nearest']

describe('scrollMode: always', () => {
  ScrollLogicalPosition.forEach(block => {
    ScrollLogicalPosition.forEach(inline => {
      test(`block: ${block}, inline: ${inline}`, async () => {
        const expected = await page.evaluate(
          options => {
            window.scrollTo(0, 0)
            document.querySelector('.target').scrollIntoView(options)
            const { scrollLeft, scrollTop } = document.scrollingElement
            return { left: scrollLeft, top: scrollTop }
          },
          { block, inline }
        )
        const actual = await page.evaluate(
          options => {
            window.scrollTo(0, 0)
            const [{ left, top }] = window.computeScrollIntoView(
              document.querySelector('.target'),
              options
            )
            return { left, top }
          },
          { block, inline }
        )
        expect(expected).toEqual(actual)

        if (block === 'nearest' || inline === 'nearest') {
          const expected = await page.evaluate(
            options => {
              window.scrollTo(window.innerWidth * 3, window.innerHeight * 3)
              document.querySelector('.target').scrollIntoView(options)
              const { scrollLeft, scrollTop } = document.scrollingElement
              return { left: scrollLeft, top: scrollTop }
            },
            { block, inline }
          )
          const actual = await page.evaluate(
            options => {
              window.scrollTo(window.innerWidth * 3, window.innerHeight * 3)
              const [{ left, top }] = window.computeScrollIntoView(
                document.querySelector('.target'),
                options
              )
              return { left, top }
            },
            { block, inline }
          )
          expect(expected).toEqual(actual)
        }
      })
    })
  })
})
