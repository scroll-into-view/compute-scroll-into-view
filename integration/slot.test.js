// Slotted targets are laid out in their slot, so the scroll containers in the shadow tree around the slot are scrolled
import { beforeEach, describe, expect, test } from 'vite-plus/test'

const scroller = (id, content) => `
  <div id="${id}" style="height: 200px; width: 200px; overflow: auto">
    <div style="height: 300px; width: 400px"></div>
    ${content}
    <div style="height: 300px"></div>
  </div>`

describe('slotted elements', () => {
  beforeEach(async () => {
    await page.goto('/integration/issues.html')
  })

  test('a named slot in a scroll container in the shadow tree, inside a scroll container in the document', async () => {
    const results = await page.evaluate(
      (light, shadow) => {
        document.body.innerHTML = `
          <div style="height: 1000px"></div>
          ${light}
          <div style="height: 2000px"></div>`
        document
          .querySelector('#host')
          .attachShadow({ mode: 'open' }).innerHTML = shadow
        const target = document.querySelector('#target')
        return ['start', 'center', 'end', 'nearest'].map((block) =>
          window.compareWithNative(target, { block, inline: block })
        )
      },
      scroller(
        'light',
        '<div id="host"><div slot="item" id="target" style="height: 50px; width: 50px; margin-left: 300px"></div></div>'
      ),
      scroller('shadow', '<slot></slot><slot name="item"></slot>')
    )
    for (const { native, computed } of results) {
      expect(native).toHaveProperty(['#host #shadow'])
      expect(native).toHaveProperty(['#light'])
      expect(computed).toEqual(native)
    }
  })

  test('a slot that is itself slotted into another shadow tree', async () => {
    const { native, computed } = await page.evaluate(
      (outerShadow, innerShadow) => {
        document.body.innerHTML = `
          <div style="height: 1000px"></div>
          <div id="outer-host"><div id="target" style="height: 50px">target</div></div>
          <div style="height: 2000px"></div>`
        const outer = document
          .querySelector('#outer-host')
          .attachShadow({ mode: 'open' })
        outer.innerHTML = outerShadow
        outer
          .querySelector('#inner-host')
          .attachShadow({ mode: 'open' }).innerHTML = innerShadow
        return window.compareWithNative(document.querySelector('#target'), {
          block: 'start',
          inline: 'nearest',
        })
      },
      scroller('outer', '<div id="inner-host"><slot></slot></div>'),
      scroller('inner', '<slot></slot>')
    )
    expect(native).toHaveProperty(['#outer-host #outer'])
    expect(native).toHaveProperty(['#outer-host #inner-host #inner'])
    expect(computed).toEqual(native)
  })
})
