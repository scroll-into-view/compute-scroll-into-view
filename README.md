[![CircleCI Status](https://img.shields.io/circleci/project/github/stipsan/compute-scroll-into-view.svg?style=flat-square)](https://circleci.com/gh/stipsan/compute-scroll-into-view)
[![npm stat](https://img.shields.io/npm/dm/compute-scroll-into-view.svg?style=flat-square)](https://npm-stat.com/charts.html?package=compute-scroll-into-view)
[![npm version](https://img.shields.io/npm/v/compute-scroll-into-view.svg?style=flat-square)](https://www.npmjs.com/package/compute-scroll-into-view)
[![gzip size][gzip-badge]][unpkg-dist]
[![size][size-badge]][unpkg-dist]
[![module formats: umd, cjs, and es][module-formats-badge]][unpkg-dist]
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg?style=flat-square)](https://github.com/semantic-release/semantic-release)

Lower level API that is used by the [ponyfill](https://ponyfill.com) [scroll-into-view-if-needed](https://github.com/stipsan/scroll-into-view-if-needed) and others to compute where (if needed) elements should scroll based on [options defined in the spec](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView).
Use this if you want the smallest possible bundlesize and is ok with implementing the actual scrolling yourself.

## Install

```bash
yarn add compute-scroll-into-view
```

The UMD build is also available on [unpkg](https://unpkg.com/compute-scroll-into-view/umd/):

```html
<script src="https://unpkg.com/compute-scroll-into-view/umd/compute-scroll-into-view.min.js"></script>
```

You can find the library on `window.computeScrollIntoView`.

## Usage

```js
// es6 import
import computeScrollIntoView from 'compute-scroll-into-view'
// or es5
const computeScrollIntoView = require('compute-scroll-into-view')

const node = document.getElementById('hero')

// same behavior as Element.scrollIntoView({block: "nearest", inline: "nearest"})
// see: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
const actions = computeScrollIntoView(node, {
  scrollMode: 'if-needed',
  block: 'nearest',
  inline: 'nearest',
})

// same behavior as Element.scrollIntoViewIfNeeded(true)
// see: https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoViewIfNeeded
const actions = computeScrollIntoView(node, { scrollMode: 'if-needed' block: 'center', inline: 'center' })

// Then perform the scrolling, use scroll-into-view-if-needed if you don't want to implement this part
actions.forEach(({ el, top, left }) => {
  el.scrollTop = top
  el.scrollLeft = left
})
```

[gzip-badge]: http://img.badgesize.io/https://unpkg.com/compute-scroll-into-view/umd/compute-scroll-into-view.min.js?compression=gzip&label=gzip%20size&style=flat-square
[size-badge]: http://img.badgesize.io/https://unpkg.com/compute-scroll-into-view/umd/compute-scroll-into-view.min.js?label=size&style=flat-square
[unpkg-dist]: https://unpkg.com/compute-scroll-into-view/umd/
[module-formats-badge]: https://img.shields.io/badge/module%20formats-umd%2C%20cjs%2C%20es-green.svg?style=flat-square
