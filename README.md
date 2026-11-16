[![npm stat](https://img.shields.io/npm/dm/compute-scroll-into-view.svg?style=flat-square)](https://npm-stat.com/charts.html?package=compute-scroll-into-view)
[![npm version](https://img.shields.io/npm/v/compute-scroll-into-view.svg?style=flat-square)](https://www.npmjs.com/package/compute-scroll-into-view)
[![gzip size][gzip-badge]][unpkg-dist]
[![size][size-badge]][unpkg-dist]

![compute-scroll-into-view](https://user-images.githubusercontent.com/81981/43024153-a2cc212c-8c6d-11e8-913b-b4d62efcf105.png)

Lower level API that is used by the [ponyfill](https://ponyfill.com) [scroll-into-view-if-needed](https://github.com/scroll-into-view/scroll-into-view-if-needed) to compute where (if needed) elements should scroll based on [options defined in the spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView). The [`if-needed` draft spec proposal](https://github.com/w3c/csswg-drafts/pull/1805) and other additions are [middleware](#middleware-1).
Use this if you want the smallest possible bundlesize and is ok with implementing the actual scrolling yourself.

Scrolling SVG elements are supported, as well as Shadow DOM elements. The [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) API is also supported, ensuring scrolling works properly on modern devices. Quirksmode is also supported as long as you polyfill [`document.scrollingElement`](https://developer.mozilla.org/en-US/docs/Web/API/document/scrollingElement).

- [Install](#install)
- [Usage](#usage)
- [Migrating from v3](#migrating-from-v3)
- [API](#api)
  - [compute(target, options)](#computetarget-options)
  - [options](#options)
    - [block](#block)
    - [inline](#inline)
    - [container](#container)
    - [middleware](#middleware)
  - [Middleware](#middleware-1)
    - [onlyIfNeeded()](#onlyifneeded)
    - [boundary(boundary)](#boundaryboundary)
    - [skipOverflowHiddenElements()](#skipoverflowhiddenelements)
    - [selection(selection, options)](#selectionselection-options)
    - [Writing middleware](#writing-middleware)
- [Development](#development)

# Install

```bash
npm i compute-scroll-into-view
```

You can also use it from a CDN:

```js
const { compute } = await import('https://esm.sh/compute-scroll-into-view')
```

The published code supports [Baseline 2019](https://web.dev/baseline) browsers (Chrome 66, Edge 18, Firefox 65 and Safari 13, and newer), as declared in the `browserslist` field of `package.json`. It's compiled to ES2017 syntax, without optional chaining or nullish coalescing, so it works in older bundlers like Webpack 4 without transpiling it.

# Usage

```js
import { compute } from 'compute-scroll-into-view'
import { onlyIfNeeded } from 'compute-scroll-into-view/middleware'

const node = document.getElementById('hero')

// same behavior as Element.scrollIntoView({block: "nearest", inline: "nearest"})
// see: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
const actions = compute(node, { block: 'nearest', inline: 'nearest' })

// same behavior as Element.scrollIntoViewIfNeeded(true)
// see: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoViewIfNeeded
const actions = compute(node, {
  block: 'center',
  inline: 'center',
  middleware: [onlyIfNeeded()],
})

// Then perform the scrolling, use scroll-into-view-if-needed if you don't want to implement this part
actions.forEach(({ el, top, left }) => {
  el.scrollTop = top
  el.scrollLeft = left
})
```

# Migrating from v3

v4 keeps `compute` spec-only. Move `scrollMode`, `boundary`, and `skipOverflowHiddenElements` to `compute-scroll-into-view/middleware`, and use the ESM build.

```js
// v3
import { compute } from 'compute-scroll-into-view'

compute(node, {
  scrollMode: 'if-needed',
  boundary: list,
  skipOverflowHiddenElements: true,
})

// v4
import { compute } from 'compute-scroll-into-view'
import {
  boundary,
  skipOverflowHiddenElements,
  onlyIfNeeded,
} from 'compute-scroll-into-view/middleware'

compute(node, {
  middleware: [boundary(list), skipOverflowHiddenElements(), onlyIfNeeded()],
})
```

- `scrollMode: 'if-needed'` is `onlyIfNeeded()`. `scrollMode: 'always'`, the v3 default, is `compute` with no middleware.
- `boundary: list` is `boundary(list)`. An element, a function, or `null` is passed through the same way.
- `skipOverflowHiddenElements: true` is `skipOverflowHiddenElements()`.
- Put `onlyIfNeeded()` after middleware that change which scroll containers are scrolled or how they are measured.
- The `ScrollMode` type is removed. `Middleware`, `MiddlewareState`, `MiddlewareReturn`, `Rects`, and `SideObject` are exported from `compute-scroll-into-view`. `ComputeOptions` is an alias of `Options`.

The CommonJS build (`dist/index.cjs`) is removed. On Node.js 20.19+ and 22.12+, `require('compute-scroll-into-view')` still works through `require(esm)` and returns `{ compute }`. TypeScript projects with CommonJS files need `"module": "nodenext"`. With `"module": "node16"`, TypeScript reports TS1479 when a CommonJS file imports this package. ESM files and `"moduleResolution": "bundler"` are unchanged.

`exports` maps `"."` to `./dist/index.js` and `"./middleware"` to `./dist/middleware.js`. The `source` export condition and the `source` and `typings` fields are removed. `types` replaces `typings`. The published package is `dist` only.

# API

## compute(target, options)

## options

Type: `Object`, optional

### [block](https://scroll-into-view.dev/#scroll-alignment)

Type: `'start' | 'center' | 'end' | 'nearest'`<br> Default: `'center'`

Control the scroll position in the block direction of the target's [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode).
In `horizontal-tb` (the default) `block: 'start'` aligns to the top edge and `block: 'end'` to the bottom, in `vertical-rl` they align to the right and left edges.

### [inline](https://scroll-into-view.dev/#scroll-alignment)

Type: `'start' | 'center' | 'end' | 'nearest'`<br> Default: `'nearest'`

Control the scroll position in the inline direction of the target's [writing-mode](https://developer.mozilla.org/en-US/docs/Web/CSS/writing-mode) and [direction](https://developer.mozilla.org/en-US/docs/Web/CSS/direction). In left-to-right text `inline: 'start'` aligns to the left edge, in right-to-left text to the right edge. Scroll containers that overflow to the left or top get negative `left` or `top` values, like `scrollLeft` in right-to-left scroll containers.

### container

Type: `'all' | 'nearest'`<br> Default: `'all'`

Like the [`container`](https://drafts.csswg.org/cssom-view/#dom-scrollintoviewoptions-container) option of `Element.scrollIntoView()`. `'all'` scrolls every scroll container of the target, up to and including the viewport. `'nearest'` only scrolls the target's nearest scroll container, or the viewport if it has none.

### middleware

Type: `Middleware[]`<br> Default: `[]`

Change which ancestors are scrolled, and how they are measured. See [Middleware](#middleware-1).

## Middleware

Like [Floating UI's middleware](https://floating-ui.com/docs/middleware). The built-in ones are exported from `compute-scroll-into-view/middleware`, so `compute-scroll-into-view` stays as small as the spec needs:

```js
import { compute } from 'compute-scroll-into-view'
import {
  boundary,
  skipOverflowHiddenElements,
  onlyIfNeeded,
} from 'compute-scroll-into-view/middleware'

const actions = compute(node, {
  block: 'center',
  middleware: [boundary(list), skipOverflowHiddenElements(), onlyIfNeeded()],
})
```

They run in order, so put `onlyIfNeeded()` after the middleware that change which scroll containers are scrolled or how they are measured.

### [onlyIfNeeded()](https://scroll-into-view.dev/#scrolling-if-needed)

Replaces `scrollMode: 'if-needed'`. This is a proposed addition to the spec that you can track here: https://github.com/w3c/csswg-drafts/pull/5677

To be backwards compatible with `Element.scrollIntoViewIfNeeded` if something is not 100% visible it will count as "needs scrolling". It stops at the first scroll container the target is visible in, if the target is visible in the viewport too. The target's `scroll-margin` and the `scroll-padding` of the scroll containers and the viewport are taken into account. If you need a different visibility ratio your best option would be to implement an [Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API).

### [boundary(boundary)](https://scroll-into-view.dev/#limit-propagation)

Replaces the `boundary` option. `boundary` is an `Element`, a `Function` or `null`.

By default there is no boundary. All the parent elements of your target is checked until it reaches the viewport ([`document.scrollingElement`](https://developer.mozilla.org/en-US/docs/Web/API/document/scrollingElement)) when calculating layout and what to scroll.
By passing a boundary you can short-circuit this loop depending on your needs:

- Prevent the browser window from scrolling.
- Scroll elements into view in a list, without scrolling container elements.

The boundary element itself is scrolled if it's a scroll container. You can also pass a function to do more dynamic checks to override the scroll scoping. It's called with the target and then each of its parents, and stops at the first one it returns `false` for:

```js
const actions = compute(target, {
  middleware: [
    boundary((parent) => {
      // By default `overflow: hidden` elements are allowed, only `overflow: visible | clip` is skipped as
      // this is required by the CSSOM spec
      if (getComputedStyle(parent)['overflow'] === 'hidden') {
        return false
      }

      return true
    }),
  ],
})
```

### skipOverflowHiddenElements()

Replaces the `skipOverflowHiddenElements` option.

By default the [spec](https://drafts.csswg.org/cssom-view/#scrolling-box) states that `overflow: hidden` elements should be scrollable because it has [been used to allow programatic scrolling](https://drafts.csswg.org/css-overflow-3/#valdef-overflow-hidden). This behavior can sometimes lead to [scrolling issues](https://github.com/scroll-into-view/scroll-into-view-if-needed/pull/225#issue-186419520) when you have a node that is a child of an `overflow: hidden` node.

This follows the convention [adopted by Firefox](https://hg.mozilla.org/integration/fx-team/rev/c48c3ec05012#l7.18) of _not_ scrolling nodes with `overflow: hidden` set. The target is scrolled into view in the other scroll containers regardless. With `container: 'nearest'`, the nearest scroll container that isn't skipped is scrolled.

### selection(selection, options)

Scrolls a text selection into view instead of the target element, like editors keep the caret in view. `selection` is a [`Selection`](https://developer.mozilla.org/en-US/docs/Web/API/Selection) or a [`Range`](https://developer.mozilla.org/en-US/docs/Web/API/Range) in the target's document, and defaults to the document's own selection (`document.getSelection()`). `options.align` is what to align:

- `'focus'` (default): the end of the selection where the caret is. A collapsed caret has no box of its own in every browser, so it's measured as the character or node next to it, which also covers empty lines (`<p><br></p>`) and carets next to images. A `Range` has no direction, so its focus is its end. Pass the `Selection` for a backward one.
- `'bounds'`: the box around the whole selection, [`range.getBoundingClientRect()`](https://developer.mozilla.org/en-US/docs/Web/API/Range/getBoundingClientRect). With `block: 'nearest'`, a selection taller than the scroll container is aligned to its start.

`compute` still walks the target's ancestors, so pass an element inside the editor, such as the parent element of the focus node. Passing the editor itself does not scroll it, as elements don't scroll themselves into view. The scroll containers' `scroll-padding` keeps the caret away from their edges, and the target's `scroll-margin` still grows the box. Put it before `onlyIfNeeded()`, which then checks the selection instead of the element. When there is nothing to measure, the target is aligned as usual. A caret inside a same-origin iframe is mapped into the parent document with the scrolling inside the frame.

```js
import { compute } from 'compute-scroll-into-view'
import { onlyIfNeeded, selection } from 'compute-scroll-into-view/middleware'

// The caret's parent element is inside the editor, so the editor is one of the scroll containers
const { focusNode } = document.getSelection()
const actions = compute(focusNode.parentElement, {
  block: 'nearest',
  inline: 'nearest',
  middleware: [selection(), onlyIfNeeded()],
})

// A range built by the editor, aligning the whole selection
compute(range.startContainer.parentElement, {
  block: 'nearest',
  inline: 'nearest',
  middleware: [selection(range, { align: 'bounds' })],
})
```

### Writing middleware

A middleware is an object with a `name` and an `fn`, and its types are exported from `compute-scroll-into-view`. `compute` calls `fn` for every ancestor of the target, innermost first, up to the viewport, with what it knows about it. `fn` returns `{}` to change nothing, or what to change:

```ts
interface Middleware {
  name: string
  fn: (state: MiddlewareState) => MiddlewareReturn
}

interface MiddlewareState {
  readonly target: Element
  /** The ancestor of the target that is considered */
  readonly container: Element
  /** Whether `container` is the scrolling element of the document, which scrolls the viewport. It's the last one */
  readonly viewport: boolean
  /** Whether `container` gets scrolled: it's a scroll container, and no middleware so far returned `scrollable: false` */
  readonly scrollable: boolean
  readonly options: {
    block: ScrollLogicalPosition
    inline: ScrollLogicalPosition
    container: 'all' | 'nearest'
  }
  /** Measured the first time it's read, and with what earlier middleware returned in `rects` */
  readonly rects: Rects
  /**
   * The viewport's `rects`, with what earlier middleware return in `rects` for the viewport. Reading it before the
   * viewport is reached calls the earlier middleware for the viewport, so keep them free of side effects
   */
  readonly viewportRects: Rects
}

interface MiddlewareReturn {
  /** Whether `container` gets scrolled. `false` leaves it alone, the target is aligned in the outer ones regardless */
  scrollable?: boolean
  /** Don't consider the ancestors of `container`. Together with `scrollable: false`, not `container` either */
  stop?: boolean
  /** Use these measurements instead, for the middleware after this one and for aligning the target */
  rects?: Partial<Rects>
}

/** Edges in viewport coordinates, like `getBoundingClientRect()`, or the lengths of the sides of a box in pixels */
interface SideObject {
  top: number
  right: number
  bottom: number
  left: number
}

/** Measured before anything is scrolled */
interface Rects {
  /** The scroll container's padding box without scrollbars. For the viewport, the visual viewport */
  scrollport: SideObject
  /** The target's border box, unless middleware replaced it. Inner scrolling is added when it's aligned */
  target: SideObject
  /** The scroll container's `scroll-padding`. For the viewport, the root element's */
  scrollPadding: SideObject
  /** The target's `scroll-margin` */
  scrollMargin: SideObject
}
```

The target's scroll-margin box (`target` grown by `scrollMargin`) is aligned with the scroll container's optimal viewing region (`scrollport` shrunk by `scrollPadding`).

For example, this middleware reads `--scroll-margin-top`, `--scroll-padding-left` and the like where they're set, as a fallback for browsers without `scroll-margin` and `scroll-padding`, or to override them:

```js
import { compute } from 'compute-scroll-into-view'

const sides = ['top', 'right', 'bottom', 'left']
const read = (el, property, fallback) => {
  const style = getComputedStyle(el)
  return Object.fromEntries(
    sides.map((side) => {
      const value = style.getPropertyValue(`--${property}-${side}`)
      return [side, value ? parseFloat(value) : fallback[side]]
    })
  )
}

const customScrollSpacing = {
  name: 'customScrollSpacing',
  fn: ({ target, container, viewport, rects }) => ({
    rects: {
      scrollMargin: read(target, 'scroll-margin', rects.scrollMargin),
      // The viewport's scroll-padding is set on the root element
      scrollPadding: read(
        viewport ? document.documentElement : container,
        'scroll-padding',
        rects.scrollPadding
      ),
    },
  }),
}

const actions = compute(node, { middleware: [customScrollSpacing] })
```

To only use them where `scroll-margin` isn't supported, return `{}` when `CSS.supports('scroll-margin: 0')`.

# Development

This project uses [Vite+](https://viteplus.dev). With the [`vp` CLI](https://viteplus.dev/guide/) installed (or through `pnpm exec vp`):

- `vp dev` serves the integration fixtures. Open `/integration/` for a list of them. They run `src/` directly and reload when it changes, and the DevTools console has `computeScrollIntoView` and `mapActions` for experiments.
- `vp test` runs the integration tests in Chromium with Playwright (run `vp exec playwright install chromium` once first).
  This includes the [web-platform-tests](https://github.com/web-platform-tests/wpt) for `scrollIntoView`, which measure conformance with the [CSSOM View spec](https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view) (see [`integration/wpt`](./integration/wpt/README.md)), and reproductions of reported bugs in `integration/issues.test.js`.
- `vp check` formats, lints, and type checks, and `vp exec knip` reports unused files, exports, and dependencies.
- `vp pack` builds the package into `dist`.

[gzip-badge]: https://img.shields.io/bundlephobia/minzip/compute-scroll-into-view?label=gzip%20size&style=flat-square
[size-badge]: https://img.shields.io/bundlephobia/min/compute-scroll-into-view?label=size&style=flat-square
[unpkg-dist]: https://unpkg.com/compute-scroll-into-view/dist/
