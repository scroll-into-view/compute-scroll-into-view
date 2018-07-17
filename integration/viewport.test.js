describe('app', () => {
  beforeEach(async () => {
    await page.goto('http://localhost:3000/integration/viewport')
  })

  it('should display a react logo', async () => {
    const result = await page.evaluate(() => {
      return window.computeScrollIntoView()
    })
    console.log(result)
    await expect(page).toMatch('Learn more')
  })
})
